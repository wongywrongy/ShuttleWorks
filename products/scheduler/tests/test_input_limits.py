"""Boundary input bounds — SP-SEC-1 Phase 1 (SEC-01, SEC-12, SEC-14, SEC-15).

Every test here asserts that an *attack-shaped* payload is refused, not
merely that a well-formed one is accepted. The negative controls each
test carries are recorded in ``SEC_PROGRESS.md``: for each control,
which line to break and how many tests fail when you break it. A control
whose test still passes with the control removed is not a control
(CODE_HEALTH rule 3b).

Three groups:

- ``TestBodySizeLimit``   — the transport ceiling (``app/body_limit.py``)
- ``TestFieldBounds``     — per-field limits and ``extra="forbid"``
- ``TestServerManagedFields`` — the mass-assignment closure (SEC-12)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    """The real app, so the middleware stack under test is the shipped one.

    Deliberately not a bare router: the body limit *is* middleware, and a
    router-only app would exercise none of it.
    """
    isolate_test_database(tmp_path, monkeypatch)
    from app.main import app

    return TestClient(app)


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


def _state(**overrides) -> dict:
    base = {"version": 2, "config": _valid_config(), "players": [], "matches": []}
    base.update(overrides)
    return base


def _make_tournament(client: TestClient, name: str = "Limits") -> str:
    res = client.post("/tournaments", json={"name": name})
    assert res.status_code == 201, res.text
    return res.json()["id"]


# --------------------------------------------------------------------
# SEC-01 — transport ceiling
# --------------------------------------------------------------------


class TestBodySizeLimit:
    """``BodyLimitMiddleware``. Negative control: raise ``max_bytes`` to a
    huge value in ``app/main.py`` (or delete the ``add_middleware`` call)
    and every test in this class fails."""

    def test_oversized_body_is_refused_with_413(self, client):
        from app.limits import MAX_REQUEST_BODY_BYTES

        # One byte over, as raw bytes: this must be refused on the
        # declared Content-Length alone, before any JSON parsing.
        payload = b"x" * (MAX_REQUEST_BODY_BYTES + 1)
        res = client.post(
            "/tournaments",
            content=payload,
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 413, res.status_code
        assert res.json()["detail"]["code"] == "REQUEST_TOO_LARGE"

    def test_oversized_body_is_refused_without_a_content_length(self, client):
        """The header is the attacker's to omit.

        A chunked request declares no length, so a middleware that only
        read ``Content-Length`` would wave this straight through. httpx
        sends a generator body with ``Transfer-Encoding: chunked``.
        """
        from app.limits import MAX_REQUEST_BODY_BYTES

        def chunks():
            sent = 0
            while sent <= MAX_REQUEST_BODY_BYTES:
                block = b"x" * 65536
                sent += len(block)
                yield block

        res = client.post(
            "/tournaments",
            content=chunks(),
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 413, res.status_code

    def test_a_normal_request_is_unaffected(self, client):
        """The guard must not be a ceiling on ordinary traffic.

        The largest real state blob observed when this limit was sized
        was ~20 KB; this asserts the everyday path still answers.
        """
        res = client.post("/tournaments", json={"name": "Ordinary"})
        assert res.status_code == 201, res.text


# --------------------------------------------------------------------
# SEC-01 / SEC-14 / SEC-15 — field bounds and unknown-field rejection
# --------------------------------------------------------------------


class TestFieldBounds:
    """Per-field limits from ``app/limits.py``. Negative control: change
    ``StrictModel``'s config to ``extra="ignore"`` and the unknown-field
    tests fail; drop a field's ``max_length`` and its test fails."""

    def test_unknown_field_on_the_state_put_is_rejected(self, client):
        tid = _make_tournament(client)
        res = client.put(
            f"/tournaments/{tid}/state",
            json=_state(somethingUnexpected="x"),
        )
        assert res.status_code == 422, res.text
        assert any(
            e["type"] == "extra_forbidden" for e in res.json()["detail"]
        ), res.text

    def test_unknown_field_on_registration_is_rejected(self, client):
        """The registration model is where a stray field would matter
        most — it is the one unauthenticated write that creates a row."""
        res = client.post(
            "/auth/register",
            json={
                "email": "someone@example.test",
                "password": "a-perfectly-fine-password",
                "isAdmin": True,
            },
        )
        assert res.status_code == 422, res.text

    def test_overlong_player_name_is_rejected(self, client):
        from app.limits import MAX_NAME

        tid = _make_tournament(client)
        player = {
            "id": "p1",
            "name": "A" * (MAX_NAME + 1),
            "groupId": "g1",
        }
        res = client.put(f"/tournaments/{tid}/state", json=_state(players=[player]))
        assert res.status_code == 422, res.text

    def test_player_list_beyond_the_cap_is_rejected(self, client):
        """A payload that is individually valid but collectively absurd.

        Every element here passes its own field validation; only the
        collection bound stops it. This is the shape that reaches CP-SAT.
        """
        from app.limits import MAX_PLAYERS

        tid = _make_tournament(client)
        players = [
            {"id": f"p{i}", "name": f"P{i}", "groupId": "g1"}
            for i in range(MAX_PLAYERS + 1)
        ]
        res = client.put(f"/tournaments/{tid}/state", json=_state(players=players))
        assert res.status_code == 422, res.status_code

    def test_overlong_display_name_is_rejected(self, client):
        """SEC-15."""
        from app.limits import MAX_NAME

        res = client.post(
            "/auth/register",
            json={
                "email": "long@example.test",
                "password": "a-perfectly-fine-password",
                "displayName": "D" * (MAX_NAME + 1),
            },
        )
        assert res.status_code == 422, res.text

    @pytest.mark.parametrize(
        "accent",
        [
            "red; background: url(https://evil.test/x)",
            "javascript:alert(1)",
            "#12345",          # too short to be #RRGGBB
            "#GGGGGG",         # not hex
        ],
    )
    def test_non_hex_tv_accent_is_rejected(self, client, accent):
        """SEC-14 — the accent reaches an inline ``style`` prop on the
        public display board. The browser also validates it; that is not
        a reason for the server not to."""
        tid = _make_tournament(client)
        config = {**_valid_config(), "tvAccent": accent}
        res = client.put(f"/tournaments/{tid}/state", json=_state(config=config))
        assert res.status_code == 422, res.text

    def test_a_real_hex_accent_still_works(self, client):
        tid = _make_tournament(client)
        config = {**_valid_config(), "tvAccent": "#10b981"}
        res = client.put(f"/tournaments/{tid}/state", json=_state(config=config))
        assert res.status_code == 200, res.text
        assert res.json()["config"]["tvAccent"] == "#10b981"


# --------------------------------------------------------------------
# SEC-12 — server-managed fields are not client-writable
# --------------------------------------------------------------------


class TestServerManagedFields:
    """``_SERVER_MANAGED_STATE_FIELDS`` in ``api/tournaments.py``.
    Negative control: delete the preserve loop in ``put_tournament_state``
    and ``test_client_cannot_forge_schedule_version`` fails."""

    def test_client_cannot_forge_schedule_version(self, client):
        """``scheduleVersion`` is the optimistic-concurrency token the
        proposal-commit path compares ``fromScheduleVersion`` against.
        A client able to set it can defeat the stale-proposal check."""
        tid = _make_tournament(client)
        client.put(f"/tournaments/{tid}/state", json=_state())

        res = client.put(
            f"/tournaments/{tid}/state",
            json=_state(scheduleVersion=9999),
        )
        assert res.status_code == 200, res.text
        assert res.json()["scheduleVersion"] == 0

        # And it did not merely fail to echo it — it was not stored.
        stored = client.get(f"/tournaments/{tid}/state").json()
        assert stored["scheduleVersion"] == 0

    def test_client_cannot_forge_schedule_history(self, client):
        """``scheduleHistory`` is the revert pool: forging an entry
        plants a schedule an operator can restore."""
        tid = _make_tournament(client)
        client.put(f"/tournaments/{tid}/state", json=_state())

        forged = [
            {
                "version": 1,
                "committedAt": "2026-01-01T00:00:00Z",
                "trigger": "forged",
                "summary": "planted by a client",
            }
        ]
        res = client.put(
            f"/tournaments/{tid}/state", json=_state(scheduleHistory=forged)
        )
        assert res.status_code == 200, res.text
        assert res.json()["scheduleHistory"] == []

    def test_an_ordinary_save_does_not_wipe_the_version(self, client):
        """The counterpart risk to the control itself.

        Stripping these fields instead of preserving them would let the
        DTO defaults (0 / []) win, and every ordinary save would erase
        the commit history — the exact bug the frontend's ``snapshot()``
        echoes both fields to avoid. This pins that preserving is what
        happens.
        """
        tid = _make_tournament(client)
        client.put(f"/tournaments/{tid}/state", json=_state())

        # Advance the stored version the way the commit path does.
        from database.session import SessionLocal
        from database.models import Tournament
        import uuid as _uuid

        with SessionLocal() as s:
            row = s.get(Tournament, _uuid.UUID(tid))
            data = dict(row.data)
            data["scheduleVersion"] = 7
            row.data = data
            s.commit()

        # An ordinary save that omits the field entirely must not reset it.
        payload = _state()
        payload.pop("scheduleVersion", None)
        res = client.put(f"/tournaments/{tid}/state", json=payload)
        assert res.status_code == 200, res.text
        assert res.json()["scheduleVersion"] == 7


# --------------------------------------------------------------------
# Regression pin for the GET/PUT round-trip
# --------------------------------------------------------------------


def test_state_get_output_is_accepted_by_state_put(client):
    """An API whose own output its input rejects is a broken API.

    ``extra="forbid"`` on the state PUT made this break: the GET used to
    return the raw stored document, including the server-managed
    ``bracket_session`` section that the wire DTO does not declare, so
    reading the state and writing it back 422'd. The GET now projects
    onto the DTO's fields. Seven existing tests caught this; this one
    states the property directly.
    """
    tid = _make_tournament(client)
    assert client.put(f"/tournaments/{tid}/state", json=_state()).status_code == 200

    fetched = client.get(f"/tournaments/{tid}/state").json()
    res = client.put(f"/tournaments/{tid}/state", json=fetched)
    assert res.status_code == 200, res.text
