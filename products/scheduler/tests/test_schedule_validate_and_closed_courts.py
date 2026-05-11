"""Regression tests for two recent bugs:

1. ``/schedule/validate`` was 500-ing because `_validate.py` imported
   four ``_convert_*`` helpers that don't exist on `api.schedule`. Any
   drag-hover on the Gantt fired the bug. Now uses ``prepare_solver_input``.

2. Closed courts must persist across solves. Committing a
   ``court_closed`` disruption proposal now writes the courtId into
   ``config.closedCourts`` so subsequent generate / warm-restart /
   repair calls all route around the closed court.
"""
from __future__ import annotations

import sys
from pathlib import Path


_BACKEND_ROOT = str(Path(__file__).resolve().parents[1] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [
    k for k in list(sys.modules)
    if k == "app" or k.startswith("app.")
    or k == "services" or k.startswith("services.")
    or k == "adapters" or k.startswith("adapters.")
    or k.startswith("api.")
]:
    del sys.modules[_cached]

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    backend_root = str(Path(__file__).resolve().parents[1] / "backend")
    sys.path[:] = [backend_root] + [p for p in sys.path if p != backend_root]
    for _cached in [
        k for k in list(sys.modules)
        if k == "app" or k.startswith("app.")
        or k == "services" or k.startswith("services.")
        or k == "adapters" or k.startswith("adapters.")
        or k.startswith("api.")
    ]:
        del sys.modules[_cached]
    from api import (
        match_state,
        schedule,
        schedule_advisories,
        schedule_director,
        schedule_proposals,
        schedule_repair,
        schedule_warm_restart,
        tournament_state,
    )

    app_ = FastAPI()
    app_.include_router(schedule.router)
    app_.include_router(schedule_warm_restart.router)
    app_.include_router(schedule_repair.router)
    app_.include_router(schedule_proposals.router)
    app_.include_router(schedule_director.router)
    app_.include_router(schedule_advisories.router)
    app_.include_router(match_state.router)
    app_.include_router(tournament_state.router)
    return TestClient(app_)


def _basic_state(closed: list[int] | None = None) -> dict:
    return {
        "version": 2,
        "config": {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 4,
            "defaultRestMinutes": 0,
            "freezeHorizonSlots": 0,
            "tournamentDate": "2026-04-28",
            "rankCounts": {},
            "clockShiftMinutes": 0,
            "closedCourts": closed or [],
        },
        "groups": [
            {"id": "schoolA", "name": "School A"},
            {"id": "schoolB", "name": "School B"},
        ],
        "players": [
            {"id": "p1", "name": "P1", "groupId": "schoolA", "ranks": ["MS"], "availability": []},
            {"id": "p2", "name": "P2", "groupId": "schoolB", "ranks": ["MS"], "availability": []},
            {"id": "p3", "name": "P3", "groupId": "schoolA", "ranks": ["MS"], "availability": []},
            {"id": "p4", "name": "P4", "groupId": "schoolB", "ranks": ["MS"], "availability": []},
        ],
        "matches": [
            {"id": "m1", "matchNumber": 1, "sideA": ["p1"], "sideB": ["p2"], "matchType": "dual", "durationSlots": 1},
            {"id": "m2", "matchNumber": 2, "sideA": ["p3"], "sideB": ["p4"], "matchType": "dual", "durationSlots": 1},
        ],
        "schedule": {
            "assignments": [
                {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 1},
                {"matchId": "m2", "slotId": 1, "courtId": 1, "durationSlots": 1},
            ],
            "unscheduledMatches": [],
            "softViolations": [],
            "objectiveScore": 1000,
            "infeasibleReasons": [],
            "status": "feasible",
        },
        "scheduleStats": None,
        "scheduleIsStale": False,
        "scheduleVersion": 0,
        "scheduleHistory": [],
    }


# ---- /schedule/validate doesn't 500 anymore -------------------------------


def test_validate_endpoint_returns_200_not_500(client):
    state = _basic_state()
    body = {
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "assignments": state["schedule"]["assignments"],
        "proposedMove": {"matchId": "m1", "slotId": 2, "courtId": 2},
        "previousAssignments": [],
    }
    r = client.post("/schedule/validate", json=body)
    assert r.status_code == 200, r.text
    body_out = r.json()
    assert "feasible" in body_out
    assert "conflicts" in body_out


def test_validate_flags_drop_onto_closed_court(client):
    state = _basic_state(closed=[3])
    body = {
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "assignments": state["schedule"]["assignments"],
        # Try to drop m1 onto court 3, which is closed.
        "proposedMove": {"matchId": "m1", "slotId": 2, "courtId": 3},
        "previousAssignments": [],
    }
    r = client.post("/schedule/validate", json=body)
    assert r.status_code == 200
    body_out = r.json()
    assert body_out["feasible"] is False
    assert any(c["type"] == "court_closed" for c in body_out["conflicts"])


# ---- court_closed disruption commits update config.closedCourts ----------


def test_court_closed_disruption_commit_persists_closure(client):
    state = _basic_state()
    assert client.put("/tournament/state", json=state).status_code == 200

    repair_body = {
        "originalSchedule": state["schedule"],
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "matchStates": {},
        "disruption": {"type": "court_closed", "courtId": 1},
    }
    proposal = client.post("/schedule/proposals/repair", json=repair_body).json()
    assert proposal["proposedConfig"]["closedCourts"] == [1]

    commit = client.post(f"/schedule/proposals/{proposal['id']}/commit")
    assert commit.status_code == 200
    persisted = client.get("/tournament/state").json()
    assert persisted["config"]["closedCourts"] == [1]


def test_reopen_court_director_action_clears_closure(client):
    state = _basic_state(closed=[1, 2])
    assert client.put("/tournament/state", json=state).status_code == 200

    body = {
        "action": {"kind": "reopen_court", "courtId": 1},
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "originalSchedule": state["schedule"],
        "matchStates": {},
    }
    r = client.post("/schedule/director-action", json=body)
    assert r.status_code == 200, r.text
    proposal = r.json()
    assert proposal["proposedConfig"]["closedCourts"] == [2]

    commit = client.post(f"/schedule/proposals/{proposal['id']}/commit")
    assert commit.status_code == 200
    persisted = client.get("/tournament/state").json()
    assert persisted["config"]["closedCourts"] == [2]


def test_reopen_unclosed_court_returns_404(client):
    state = _basic_state()
    body = {
        "action": {"kind": "reopen_court", "courtId": 1},
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "originalSchedule": state["schedule"],
        "matchStates": {},
    }
    r = client.post("/schedule/director-action", json=body)
    assert r.status_code == 404


# ---- time-bounded courtClosures -----------------------------------------


def test_court_closed_disruption_with_time_bounds_persists_window(client):
    """A disruption with fromTime/toTime stores a CourtClosure entry
    in ``courtClosures`` rather than the legacy all-day list."""
    state = _basic_state()
    assert client.put("/tournament/state", json=state).status_code == 200

    repair_body = {
        "originalSchedule": state["schedule"],
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "matchStates": {},
        "disruption": {
            "type": "court_closed",
            "courtId": 1,
            "fromTime": "12:00",
            "toTime": "13:00",
            "reason": "Equipment swap",
        },
    }
    proposal = client.post("/schedule/proposals/repair", json=repair_body).json()
    cfg = proposal["proposedConfig"]
    # Time-bounded closures don't pollute the legacy list.
    assert cfg["closedCourts"] == []
    assert len(cfg["courtClosures"]) == 1
    closure = cfg["courtClosures"][0]
    assert closure["courtId"] == 1
    assert closure["fromTime"] == "12:00"
    assert closure["toTime"] == "13:00"
    assert closure["reason"] == "Equipment swap"

    # Commit persists; subsequent GET reflects the windowed closure.
    client.post(f"/schedule/proposals/{proposal['id']}/commit")
    persisted = client.get("/tournament/state").json()
    assert persisted["config"]["courtClosures"][0]["fromTime"] == "12:00"


def test_validate_flags_drop_inside_time_bounded_closure(client):
    state = _basic_state()
    state["config"]["courtClosures"] = [
        {"courtId": 1, "fromTime": "10:00", "toTime": "11:00"}
    ]
    body = {
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "assignments": state["schedule"]["assignments"],
        # 10:00 with 30-min slots from 09:00 = slot 2; court 1; falls
        # inside the 10:00–11:00 closure window.
        "proposedMove": {"matchId": "m1", "slotId": 2, "courtId": 1},
        "previousAssignments": [],
    }
    r = client.post("/schedule/validate", json=body)
    assert r.status_code == 200
    body_out = r.json()
    assert body_out["feasible"] is False
    assert any(c["type"] == "court_closed" for c in body_out["conflicts"])


def test_validate_passes_drop_outside_time_bounded_closure(client):
    state = _basic_state()
    state["config"]["courtClosures"] = [
        {"courtId": 1, "fromTime": "10:00", "toTime": "11:00"}
    ]
    body = {
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "assignments": state["schedule"]["assignments"],
        # slot 0 (09:00) on court 1 — before the closure window.
        "proposedMove": {"matchId": "m1", "slotId": 0, "courtId": 1},
        "previousAssignments": [],
    }
    r = client.post("/schedule/validate", json=body)
    assert r.status_code == 200
    body_out = r.json()
    # No court_closed conflict for an out-of-window slot.
    assert not any(c["type"] == "court_closed" for c in body_out["conflicts"])


def test_reopen_court_clears_both_legacy_and_windowed_closures(client):
    state = _basic_state(closed=[1])
    state["config"]["courtClosures"] = [
        {"courtId": 1, "fromTime": "12:00", "toTime": "13:00"},
        {"courtId": 2, "fromTime": "14:00", "toTime": "15:00"},
    ]
    assert client.put("/tournament/state", json=state).status_code == 200

    body = {
        "action": {"kind": "reopen_court", "courtId": 1},
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "originalSchedule": state["schedule"],
        "matchStates": {},
    }
    r = client.post("/schedule/director-action", json=body)
    assert r.status_code == 200, r.text
    proposed = r.json()["proposedConfig"]
    assert proposed["closedCourts"] == []
    # Court 2's closure is preserved; only court 1's are cleared.
    assert len(proposed["courtClosures"]) == 1
    assert proposed["courtClosures"][0]["courtId"] == 2
