"""Phase-0a locked-settings guards on ``PUT /tournaments/{id}/state``.

Backend mirrors of the frontend locks (a frontend-only lock is bypassable
by any stale tab or direct API client):

- CONFIG_LOCKED  — structural venue fields (courtCount / intervalMinutes /
  dayStart / dayEnd) may not change in a blob that RETAINS a committed
  schedule. Clearing the schedule in the same PUT (the UnlockModal flow)
  passes; non-structural config stays freely writable.
- ROSTER_LOCKED  — bracketPlayers referenced by a GENERATED draw
  (participants + member_ids of non-draft events) may not be removed.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import brackets, tournaments
    from app.exceptions import ConflictError
    from app.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "State Locks Test")


def _scheduled_blob(court_count: int = 3, day_end: str = "18:00") -> dict:
    return {
        "version": 1,
        "config": {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": day_end,
            "breaks": [],
            "courtCount": court_count,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "players": [{"id": "p1", "name": "A", "groupId": "g1", "ranks": ["MS1"]}],
        "matches": [{"id": "m1", "sideA": ["p1"], "sideB": [], "durationSlots": 1}],
        "schedule": {
            "assignments": [
                {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 1}
            ],
            "status": "optimal",
        },
    }


# ---- CONFIG_LOCKED ---------------------------------------------------------


def test_structural_config_change_under_schedule_409s(client, tid):
    assert client.put(f"/tournaments/{tid}/state", json=_scheduled_blob()).status_code == 200
    resp = client.put(f"/tournaments/{tid}/state", json=_scheduled_blob(court_count=2))
    assert resp.status_code == 409
    body = resp.json()
    assert "CONFIG_LOCKED" in str(body)
    assert "courtCount" in str(body)


def test_unlock_flow_clearing_schedule_passes(client, tid):
    assert client.put(f"/tournaments/{tid}/state", json=_scheduled_blob()).status_code == 200
    unlocked = _scheduled_blob(court_count=2)
    unlocked["schedule"] = None  # the UnlockModal clears the schedule in the same PUT
    assert client.put(f"/tournaments/{tid}/state", json=unlocked).status_code == 200


def test_non_structural_config_change_under_schedule_passes(client, tid):
    assert client.put(f"/tournaments/{tid}/state", json=_scheduled_blob()).status_code == 200
    blob = _scheduled_blob()
    blob["config"]["clockShiftMinutes"] = 30  # director tool — must stay writable
    blob["config"]["closedCourts"] = [2]
    assert client.put(f"/tournaments/{tid}/state", json=blob).status_code == 200


def test_config_change_without_schedule_passes(client, tid):
    blob = _scheduled_blob()
    blob["schedule"] = None
    assert client.put(f"/tournaments/{tid}/state", json=blob).status_code == 200
    blob2 = _scheduled_blob(court_count=2)
    blob2["schedule"] = None
    assert client.put(f"/tournaments/{tid}/state", json=blob2).status_code == 200


# ---- ROSTER_LOCKED ---------------------------------------------------------


def _create_generated_event(client, tid) -> None:
    body = {
        "courts": 2,
        "total_slots": 32,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 5.0,
        "events": [
            {
                "id": "MS",
                "discipline": "MS",
                "format": "se",
                "participants": [
                    {"id": "alice", "name": "Alice"},
                    {"id": "bob", "name": "Bob"},
                    {"id": "cara", "name": "Cara"},
                    {"id": "dave", "name": "Dave"},
                ],
                "rr_rounds": 1,
                "duration_slots": 1,
                "randomize": False,
                "config": {},
            }
        ],
    }
    assert client.post(f"/tournaments/{tid}/bracket", json=body).status_code == 200
    # flip the event out of draft (create leaves events draft)
    assert (
        client.post(
            f"/tournaments/{tid}/bracket/events/MS/generate", json={"wipe": True}
        ).status_code
        == 200
    )


def _roster_blob(ids: list[str]) -> dict:
    return {
        "version": 1,
        "bracketPlayers": [{"id": i, "name": i.title()} for i in ids],
    }


def test_removing_player_referenced_by_generated_draw_409s(client, tid):
    _create_generated_event(client, tid)
    all_ids = ["alice", "bob", "cara", "dave"]
    assert client.put(f"/tournaments/{tid}/state", json=_roster_blob(all_ids)).status_code == 200
    resp = client.put(
        f"/tournaments/{tid}/state", json=_roster_blob(["bob", "cara", "dave"])
    )
    assert resp.status_code == 409
    assert "ROSTER_LOCKED" in str(resp.json())
    assert "alice" in str(resp.json())


def test_removing_unreferenced_player_passes(client, tid):
    _create_generated_event(client, tid)
    ids = ["alice", "bob", "cara", "dave", "spare"]
    assert client.put(f"/tournaments/{tid}/state", json=_roster_blob(ids)).status_code == 200
    assert (
        client.put(
            f"/tournaments/{tid}/state",
            json=_roster_blob(["alice", "bob", "cara", "dave"]),
        ).status_code
        == 200
    )


def test_removing_player_with_only_draft_draws_passes(client, tid):
    # create WITHOUT generate — event stays draft; roster deletion is free
    body = {
        "courts": 2,
        "total_slots": 32,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 5.0,
        "events": [
            {
                "id": "MS",
                "discipline": "MS",
                "format": "se",
                "participants": [
                    {"id": "alice", "name": "Alice"},
                    {"id": "bob", "name": "Bob"},
                ],
                "rr_rounds": 1,
                "duration_slots": 1,
                "randomize": False,
                "config": {},
            }
        ],
    }
    assert client.post(f"/tournaments/{tid}/bracket", json=body).status_code == 200
    assert client.put(f"/tournaments/{tid}/state", json=_roster_blob(["alice", "bob"])).status_code == 200
    assert client.put(f"/tournaments/{tid}/state", json=_roster_blob(["bob"])).status_code == 200
