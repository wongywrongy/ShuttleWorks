"""Invite-token existence oracle (SP-CLOUD-3, audit finding 0.C).

``GET /invites/{token}`` used to 404 for a token that never existed but
answer 200 with ``valid: false`` for one that was revoked or expired —
directly contradicting its own docstring, which claimed the opposite.
``POST /invites/{token}/accept`` leaked the same distinction on a second
axis, 404 vs 410.

Tokens are UUIDv4, so blind enumeration was never the threat. The
exposure is a *leaked* link: its holder could tell whether a workspace
still exists and whether their access was deliberately revoked as
opposed to merely expired — and, on a live token, read the workspace
name without authenticating.

These tests pin one uniform response across every non-acceptable state,
on both endpoints, and pin the public DTO's field set so the flags that
carried the leak cannot quietly return.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests._helpers import isolate_test_database, seed_tournament

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def _owner_workspace(client):
    """A workspace owned by the local bootstrap identity."""
    return seed_tournament(client)


def _mint(client, tournament_id, role="viewer"):
    r = client.post(
        f"/tournaments/{tournament_id}/invites", json={"role": role}, headers=CSRF
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["token"]


def _expire(token: str):
    """Age an invite out of its TTL, directly in the DB."""
    from database.models import InviteLink
    from database.session import SessionLocal

    s = SessionLocal()
    try:
        row = s.get(InviteLink, uuid.UUID(token))
        row.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        s.commit()
    finally:
        s.close()


# ---- GET /invites/{token} -------------------------------------------


def test_all_non_acceptable_states_are_indistinguishable_on_resolve(client):
    """Nonexistent, revoked, and expired must produce byte-identical
    responses. If any pair differs, the oracle is back."""
    tid = _owner_workspace(client)

    revoked = _mint(client, tid)
    client.delete(f"/invites/{revoked}", headers=CSRF)

    expired = _mint(client, tid)
    _expire(expired)

    nonexistent = str(uuid.uuid4())

    responses = {
        "nonexistent": client.get(f"/invites/{nonexistent}"),
        "revoked": client.get(f"/invites/{revoked}"),
        "expired": client.get(f"/invites/{expired}"),
    }

    statuses = {k: r.status_code for k, r in responses.items()}
    bodies = {k: r.json() for k, r in responses.items()}

    assert set(statuses.values()) == {404}, statuses
    # One distinct body across all three states.
    assert len({repr(b) for b in bodies.values()}) == 1, bodies


def test_valid_invite_still_resolves(client):
    """The uniform 404 must not break the happy path."""
    tid = _owner_workspace(client)
    token = _mint(client, tid, role="operator")

    r = client.get(f"/invites/{token}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "operator"
    assert body["tournamentId"] == str(tid)


def test_public_resolve_dto_leaks_no_lifecycle_flags(client):
    """A 200 now *means* valid, so ``valid`` / ``expiresAt`` /
    ``revokedAt`` are redundant — and they were the leak. ``email`` was
    already withheld and must stay withheld."""
    tid = _owner_workspace(client)
    token = _mint(client, tid)

    body = client.get(f"/invites/{token}").json()
    for leaked in ("valid", "expiresAt", "revokedAt", "email"):
        assert leaked not in body, f"public invite DTO still exposes {leaked!r}"


# ---- POST /invites/{token}/accept ------------------------------------


def test_accept_collapses_404_and_410(client):
    """Accept previously answered 404 for nonexistent and 410 for
    revoked/expired — the same oracle on a second axis."""
    tid = _owner_workspace(client)

    revoked = _mint(client, tid)
    client.delete(f"/invites/{revoked}", headers=CSRF)

    expired = _mint(client, tid)
    _expire(expired)

    nonexistent = str(uuid.uuid4())

    responses = {
        "nonexistent": client.post(f"/invites/{nonexistent}/accept", headers=CSRF),
        "revoked": client.post(f"/invites/{revoked}/accept", headers=CSRF),
        "expired": client.post(f"/invites/{expired}/accept", headers=CSRF),
    }

    assert {r.status_code for r in responses.values()} == {404}, {
        k: r.status_code for k, r in responses.items()
    }
    assert len({repr(r.json()) for r in responses.values()}) == 1, {
        k: r.json() for k, r in responses.items()
    }


def test_accept_still_works_for_a_valid_invite(client):
    tid = _owner_workspace(client)
    token = _mint(client, tid, role="viewer")

    r = client.post(f"/invites/{token}/accept", headers=CSRF)
    assert r.status_code == 200, r.text
    assert r.json()["tournamentId"] == str(tid)


# ---- Timing ----------------------------------------------------------


def test_missing_and_revoked_do_the_same_database_work(client):
    """Structural timing equalization.

    Rather than assert on wall-clock (which flakes on shared CI), assert
    the property that *causes* equal timing: both branches issue the same
    number of queries. The nonexistent path would otherwise skip the
    tournament lookup and return measurably sooner.
    """
    from sqlalchemy import event
    from database.session import engine

    tid = _owner_workspace(client)
    revoked = _mint(client, tid)
    client.delete(f"/invites/{revoked}", headers=CSRF)

    counts: list[int] = []

    def _count_for(path: str) -> int:
        n = 0

        def _before(conn, cursor, statement, params, context, executemany):
            nonlocal n
            n += 1

        event.listen(engine, "before_cursor_execute", _before)
        try:
            client.get(path)
        finally:
            event.remove(engine, "before_cursor_execute", _before)
        return n

    counts.append(_count_for(f"/invites/{uuid.uuid4()}"))  # nonexistent
    counts.append(_count_for(f"/invites/{revoked}"))  # revoked

    assert counts[0] == counts[1], (
        f"nonexistent issued {counts[0]} queries, revoked issued {counts[1]} — "
        "the branches are distinguishable by timing"
    )
