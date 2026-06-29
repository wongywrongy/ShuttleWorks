"""TDD tests for non-solver assign_court + postpone_match commands (Task 5).

Tests drive through the full FastAPI → repository pipeline using the same
harness as test_commands.py. The two new MatchAction values (assign_court,
postpone_match) mutate court_id/time_slot on the matches row without
re-running the solver.

RED: before implementation these fail with 422 (unknown action at the
Pydantic boundary in CommandRequest).
GREEN: after constants.py + local.py changes they return 200 with the
correct court/slot values.

Regression guard: the existing 5 actions must stay strict — same-state
transitions that bypass the guard for assign/postpone must NOT silently
let call_to_court on an already-called match through.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import commands, match_state, tournaments
    from app.exceptions import ConflictError
    from app.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(match_state.router)
    app.include_router(commands.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Assign-Postpone Test")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_unassigned(client, tid: str, match_id: str = "m1") -> None:
    """Seed a match with NO court/slot assignment (court_id=None, time_slot=None)."""
    payload = {
        "config": {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "matches": [{"id": match_id, "sideA": ["p1"], "sideB": ["p2"]}],
        "schedule": {
            "status": "feasible",
            "assignments": [],
        },
    }
    r = client.put(f"/tournaments/{tid}/state", json=payload)
    assert r.status_code == 200, r.text


def _seed_assigned(client, tid: str, match_id: str = "m1") -> None:
    """Seed a match WITH a court+slot assignment (courtId=2, slotId=4)."""
    payload = {
        "config": {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "matches": [{"id": match_id, "sideA": ["p1"], "sideB": ["p2"]}],
        "schedule": {
            "status": "feasible",
            "assignments": [
                {"matchId": match_id, "slotId": 4, "courtId": 2, "durationSlots": 1}
            ],
        },
    }
    r = client.put(f"/tournaments/{tid}/state", json=payload)
    assert r.status_code == 200, r.text


def _cmd(
    client,
    tid: str,
    match_id: str,
    action: str,
    payload: dict,
    seen_version: int,
):
    return client.post(
        f"/tournaments/{tid}/commands",
        json={
            "id": str(uuid.uuid4()),
            "match_id": match_id,
            "action": action,
            "payload": payload,
            "seen_version": seen_version,
        },
    )


# ---------------------------------------------------------------------------
# 1. assign_court
# ---------------------------------------------------------------------------


def test_assign_court_sets_court_and_slot_stays_scheduled(client, tid):
    """assign_court on an unassigned scheduled match sets court+slot, keeps status=scheduled."""
    _seed_unassigned(client, tid)
    # version=1, court=None, slot=None, status=scheduled

    r = _cmd(client, tid, "m1", "assign_court", {"court_id": 3, "time_slot": 7}, 1)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "scheduled"
    assert body["court_id"] == 3
    assert body["time_slot"] == 7
    assert body["version"] == 2
    assert body["replay"] is False


def test_assign_court_overwrites_existing_assignment(client, tid):
    """assign_court can update a match that already has a solver-assigned court+slot."""
    _seed_assigned(client, tid)
    # version=1, court=2, slot=4, status=scheduled

    r = _cmd(client, tid, "m1", "assign_court", {"court_id": 1, "time_slot": 2}, 1)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "scheduled"
    assert body["court_id"] == 1
    assert body["time_slot"] == 2
    assert body["version"] == 2


# ---------------------------------------------------------------------------
# 2. postpone_match
# ---------------------------------------------------------------------------


def test_postpone_match_from_playing_clears_court_slot_returns_scheduled(client, tid):
    """postpone_match from playing clears court+slot and sets status=scheduled."""
    _seed_assigned(client, tid)
    # Advance to playing: scheduled(v1) → called(v2) → playing(v3)
    r1 = _cmd(client, tid, "m1", "call_to_court", {}, 1)
    assert r1.status_code == 200, r1.text
    assert r1.json()["status"] == "called"

    r2 = _cmd(client, tid, "m1", "start_match", {}, 2)
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "playing"

    r3 = _cmd(client, tid, "m1", "postpone_match", {}, 3)
    assert r3.status_code == 200, r3.text
    body = r3.json()
    assert body["status"] == "scheduled"
    assert body["court_id"] is None
    assert body["time_slot"] is None
    assert body["version"] == 4


def test_postpone_match_on_scheduled_self_transition_clears_court_slot(client, tid):
    """postpone_match on a scheduled match (SCHEDULED→SCHEDULED) clears court+slot."""
    _seed_assigned(client, tid)
    # version=1, court=2, slot=4, status=scheduled

    r = _cmd(client, tid, "m1", "postpone_match", {}, 1)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "scheduled"
    assert body["court_id"] is None
    assert body["time_slot"] is None
    assert body["version"] == 2


# ---------------------------------------------------------------------------
# 3. Regression: existing 5 actions must stay strict on same-state transitions
# ---------------------------------------------------------------------------


def test_call_to_court_on_already_called_match_is_still_rejected(client, tid):
    """The self-transition guard bypass must be scoped to assign/postpone ONLY.

    call_to_court on an already-called match must still 409 — not silently
    pass because the target happens to equal the current status.
    """
    _seed_unassigned(client, tid)

    # First call_to_court: SCHEDULED→CALLED (v1→v2) — must succeed.
    r1 = _cmd(client, tid, "m1", "call_to_court", {}, 1)
    assert r1.status_code == 200, r1.text
    assert r1.json()["status"] == "called"

    # Second call_to_court (different command id, current version=2): must 409.
    r2 = _cmd(client, tid, "m1", "call_to_court", {}, 2)
    assert r2.status_code == 409, r2.text
    body = r2.json()
    assert body["error"] == "conflict"
    assert body["current_status"] == "called"
    assert body["attempted_status"] == "called"


# ---------------------------------------------------------------------------
# 4. Guard: assign_court rejected on non-scheduled matches
# ---------------------------------------------------------------------------


def test_assign_court_on_called_match_is_rejected(client, tid):
    """assign_court on a CALLED match must be rejected (409); match stays CALLED.

    Without the precondition guard, CALLED→SCHEDULED is a valid 'uncall' edge
    so assert_valid_transition lets it through and silently demotes the match.
    """
    _seed_assigned(client, tid)
    # Advance to called: scheduled(v1) → called(v2), court+slot preserved from seed
    r1 = _cmd(client, tid, "m1", "call_to_court", {}, 1)
    assert r1.status_code == 200, r1.text
    assert r1.json()["status"] == "called"

    r2 = _cmd(client, tid, "m1", "assign_court", {"court_id": 3, "time_slot": 7}, 2)
    assert r2.status_code == 409, r2.text
    body = r2.json()
    assert body["error"] == "conflict"
    assert body["current_status"] == "called"
    assert body["attempted_status"] == "scheduled"


def test_assign_court_on_playing_match_is_rejected(client, tid):
    """assign_court on a PLAYING match must be rejected (409)."""
    _seed_assigned(client, tid)
    r1 = _cmd(client, tid, "m1", "call_to_court", {}, 1)
    assert r1.status_code == 200, r1.text
    r2 = _cmd(client, tid, "m1", "start_match", {}, 2)
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "playing"

    r3 = _cmd(client, tid, "m1", "assign_court", {"court_id": 3, "time_slot": 7}, 3)
    assert r3.status_code == 409, r3.text
    body = r3.json()
    assert body["error"] == "conflict"
    assert body["current_status"] == "playing"
    assert body["attempted_status"] == "scheduled"


# ---------------------------------------------------------------------------
# 5. Guard: assign_court requires both court_id and time_slot in payload
# ---------------------------------------------------------------------------


def test_assign_court_missing_time_slot_is_rejected(client, tid):
    """assign_court without time_slot in payload must be rejected (409); no mutation."""
    _seed_unassigned(client, tid)

    r = _cmd(client, tid, "m1", "assign_court", {"court_id": 3}, 1)
    assert r.status_code == 409, r.text
    body = r.json()
    assert body["error"] == "conflict"


def test_assign_court_missing_court_id_is_rejected(client, tid):
    """assign_court without court_id in payload must be rejected (409); no mutation."""
    _seed_unassigned(client, tid)

    r = _cmd(client, tid, "m1", "assign_court", {"time_slot": 7}, 1)
    assert r.status_code == 409, r.text
    body = r.json()
    assert body["error"] == "conflict"
