"""Abuse + resource limits — SP-SEC-1 Phase 3 (SEC-03).

Two controls, both about volume rather than correctness:

- ``TestRegistrationVolume`` — account creation is bounded per client IP.
  Before this, ``POST /auth/register`` recorded a throttle failure only in
  the ``except AuthError`` branch, so the *successful* path — the one that
  writes a user, an org, and a membership row — counted nothing at all.
- ``TestSolveQuotaHTTP`` — the per-user concurrent-solve cap surfaces as a
  429 with its own error code. The counting logic itself is covered
  dual-dialect in ``tests/unit/test_solve_jobs.py``; what is pinned here is
  the HTTP contract.

Negative controls are recorded in ``SEC_PROGRESS.md``. A control whose test
still passes once the control is removed is not a control (CODE_HEALTH 3b).
"""
from __future__ import annotations

import uuid

import pytest

from tests._helpers import isolate_test_database

GOOD_PW = "a perfectly fine passphrase"


def _valid_config() -> dict:
    return {
        "intervalMinutes": 30,
        "dayStart": "09:00",
        "dayEnd": "17:00",
        "breaks": [],
        "courtCount": 4,
        "defaultRestMinutes": 30,
        "freezeHorizonSlots": 0,
    }


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def _register(client, n: int):
    """One signup, from a session-less client.

    Cookies are cleared first because a registration that carries the
    previous one's session cookie trips the CSRF header requirement and
    answers 403 — which would make these tests pass for the wrong reason.
    Separate signups from one IP is also the shape of the abuse being
    bounded here.
    """
    client.cookies.clear()
    return client.post(
        "/auth/register",
        json={"email": f"user{n}@example.com", "password": GOOD_PW},
    )


class TestRegistrationVolume:
    def test_successful_registrations_are_counted_and_eventually_refused(
        self, client, monkeypatch
    ):
        """The point of SEC-03: success must cost budget, not just failure."""
        from app.config import settings

        monkeypatch.setattr(settings, "registration_max_per_ip", 3)

        for n in range(3):
            assert _register(client, n).status_code == 201, f"registration {n}"

        blocked = _register(client, 99)
        assert blocked.status_code == 429
        body = blocked.json()
        assert body["detail"]["code"] == "AUTH_THROTTLED"
        # The client is told when to come back rather than left guessing.
        assert body["detail"]["retryAfterSeconds"] > 0

    def test_failed_registrations_also_count(self, client, monkeypatch):
        """Otherwise EMAIL_TAKEN probing is an unbounded enumeration oracle."""
        from app.config import settings

        monkeypatch.setattr(settings, "registration_max_per_ip", 2)

        # Two rejected attempts (password below the policy minimum).
        for n in range(2):
            client.cookies.clear()
            r = client.post(
                "/auth/register",
                json={"email": f"weak{n}@example.com", "password": "short"},
            )
            assert r.status_code == 400

        assert _register(client, 50).status_code == 429

    def test_registration_lockout_does_not_block_logging_in(
        self, client, monkeypatch
    ):
        """Why the registration bucket is a separate namespace from ``ip:``.

        A venue that has just signed up its directors must still be able to
        log in. Sharing one bucket would mean a burst of signups locks the
        same IP out of the credential endpoints it needs next.
        """
        from app.config import settings

        monkeypatch.setattr(settings, "registration_max_per_ip", 1)

        assert _register(client, 0).status_code == 201
        assert _register(client, 1).status_code == 429  # registration closed

        client.cookies.clear()
        login = client.post(
            "/auth/login",
            json={"email": "user0@example.com", "password": GOOD_PW},
        )
        assert login.status_code == 200, "credential path must stay open"


class TestSolveQuotaHTTP:
    def test_submitting_over_the_cap_is_429_with_its_own_code(
        self, client, monkeypatch
    ):
        from app.config import settings
        from database.models import SolveJob, Tournament, TournamentMember
        from database.session import SessionLocal
        from services import solve_jobs

        monkeypatch.setattr(settings, "max_active_solve_jobs_per_user", 1)

        assert _register(client, 0).status_code == 201
        me = client.get("/auth/me").json()  # cookie from the registration
        user_id = uuid.UUID(me["id"])

        # One active job in another workspace of the same user consumes the
        # single slot. Seeded directly: what is under test is the cap, not
        # the solver.
        session = SessionLocal()
        try:
            held = Tournament(name="held")
            target = Tournament(name="target")
            session.add_all([held, target])
            session.commit()
            session.add_all(
                [
                    TournamentMember(
                        tournament_id=held.id, user_id=user_id, role="owner"
                    ),
                    TournamentMember(
                        tournament_id=target.id, user_id=user_id, role="owner"
                    ),
                    SolveJob(
                        tournament_id=held.id,
                        type=solve_jobs.MEET_SCHEDULE_SOLVE,
                        status="queued",
                        params={},
                        input_snapshot={},
                        max_attempts=2,
                    ),
                ]
            )
            session.commit()
            target_id = str(target.id)
        finally:
            session.close()

        r = client.post(
            f"/tournaments/{target_id}/solve-jobs",
            json={"players": [], "config": _valid_config(), "matches": []},
            headers={"X-ShuttleWorks-CSRF": "1"},
        )
        assert r.status_code == 429, r.text
        body = r.json()
        assert body["detail"]["code"] == "SOLVE_QUOTA_EXCEEDED"
        assert body["detail"]["activeJobs"] == 1
        assert body["detail"]["limit"] == 1
