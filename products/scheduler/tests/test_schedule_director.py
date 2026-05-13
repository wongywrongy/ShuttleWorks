"""Tests for `/schedule/director-action` (delay_start / insert_blackout
/ remove_blackout). Each action routes through the proposal pipeline,
so the success path mirrors `test_schedule_proposals.py` — the
director-specific assertions are about config mutation + commit
applying both schedule and config atomically.
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
from _helpers import seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    from _helpers import isolate_test_database, seed_tournament
    isolate_test_database(tmp_path, monkeypatch)

    from api import (
        match_state,
        schedule_advisories,
        schedule_director,
        schedule_proposals,
        schedule_repair,
        schedule_warm_restart,
        tournaments,
    )
    app_ = FastAPI()
    app_.include_router(schedule_warm_restart.router)
    app_.include_router(schedule_repair.router)
    app_.include_router(schedule_proposals.router)
    app_.include_router(schedule_director.router)
    app_.include_router(schedule_advisories.router)
    app_.include_router(match_state.router)
    app_.include_router(tournaments.router)
    # Proposal store now lives on app.state — fresh per fixture instance.
    yield TestClient(app_)


def _basic_state() -> dict:
    return {
        "version": 2,
        "config": {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
            "tournamentDate": "2026-04-28",
            "rankCounts": {},
            "clockShiftMinutes": 0,
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


def _action_request(state: dict, action: dict) -> dict:
    return {
        "action": action,
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "originalSchedule": state["schedule"],
        "matchStates": {},
    }


def _seed(client, tid: str) -> dict:
    state = _basic_state()
    r = client.put(f"/tournaments/{tid}/state", json=state)
    assert r.status_code == 200
    return state


# ---------- delay_start ----------------------------------------------------


def test_delay_start_produces_proposal_with_clock_shift_and_no_moves(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    r = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {"kind": "delay_start", "minutes": 25}),
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["kind"] == "director_action"
    assert p["impact"]["clockShiftMinutesDelta"] == 25
    assert p["impact"]["movedMatches"] == []
    assert p["proposedConfig"]["clockShiftMinutes"] == 25
    assert "Delay tournament" in p["summary"]


def test_delay_start_commit_applies_clock_shift(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    create = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {"kind": "delay_start", "minutes": 30}),
    )
    pid = create.json()["id"]
    commit = client.post(f"/tournaments/{tid}/schedule/proposals/{pid}/commit")
    assert commit.status_code == 200, commit.text
    body = client.get(f"/tournaments/{tid}/state").json()
    assert body["config"]["clockShiftMinutes"] == 30
    assert body["scheduleVersion"] == 1
    history = body["scheduleHistory"][-1]
    assert history["trigger"] == "director_action"


def test_delay_start_accumulates_with_existing_shift(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    state["config"]["clockShiftMinutes"] = 15
    client.put(f"/tournaments/{tid}/state", json=state)
    r = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {"kind": "delay_start", "minutes": 20}),
    )
    p = r.json()
    assert p["proposedConfig"]["clockShiftMinutes"] == 35  # 15 + 20


def test_delay_start_rejects_zero_minutes(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    r = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {"kind": "delay_start", "minutes": 0}),
    )
    assert r.status_code == 422


# ---------- insert_blackout ------------------------------------------------


def test_insert_blackout_produces_proposal_with_break_added(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    r = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {
            "kind": "insert_blackout",
            "fromTime": "12:00",
            "toTime": "13:00",
            "reason": "Lunch",
        }),
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["kind"] == "director_action"
    breaks = p["proposedConfig"]["breaks"]
    assert len(breaks) == 1
    assert breaks[0] == {"start": "12:00", "end": "13:00"}
    assert "Lunch" in p["summary"]


def test_insert_blackout_commit_persists_break(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    create = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {
            "kind": "insert_blackout",
            "fromTime": "12:00",
            "toTime": "13:00",
        }),
    )
    pid = create.json()["id"]
    commit = client.post(f"/tournaments/{tid}/schedule/proposals/{pid}/commit")
    assert commit.status_code == 200
    body = client.get(f"/tournaments/{tid}/state").json()
    assert len(body["config"]["breaks"]) == 1
    assert body["config"]["breaks"][0]["start"] == "12:00"


def test_insert_blackout_rejects_inverted_window(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    r = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {
            "kind": "insert_blackout",
            "fromTime": "13:00",
            "toTime": "12:00",
        }),
    )
    assert r.status_code == 422


def test_insert_blackout_rejects_missing_times(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    r = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {
            "kind": "insert_blackout",
            "fromTime": "12:00",
        }),
    )
    assert r.status_code == 422


# ---------- remove_blackout ------------------------------------------------


def test_remove_blackout_drops_indexed_break(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    state["config"]["breaks"] = [
        {"start": "12:00", "end": "13:00"},
        {"start": "15:00", "end": "15:30"},
    ]
    client.put(f"/tournaments/{tid}/state", json=state)
    r = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {
            "kind": "remove_blackout",
            "blackoutIndex": 0,
        }),
    )
    assert r.status_code == 200, r.text
    p = r.json()
    breaks = p["proposedConfig"]["breaks"]
    assert len(breaks) == 1
    assert breaks[0]["start"] == "15:00"  # kept


def test_remove_blackout_rejects_invalid_index(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    r = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {
            "kind": "remove_blackout",
            "blackoutIndex": 5,  # out of range
        }),
    )
    assert r.status_code == 404


# ---------- unknown kind ---------------------------------------------------


def test_unknown_kind_rejected_at_validation(client):
    tid = seed_tournament(client)
    state = _seed(client, tid)
    r = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json=_action_request(state, {"kind": "magic"}),
    )
    # Pydantic's Literal validator catches this at the request layer.
    assert r.status_code == 422
