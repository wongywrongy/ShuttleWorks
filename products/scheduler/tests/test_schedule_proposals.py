"""Tests for the two-phase commit pipeline (`/schedule/proposals/...`).

Covers proposal creation, fetch, cancel, commit (success + 409 path),
TTL expiry, and that the existing /schedule/repair + /schedule/warm-restart
endpoints continue to work unchanged.
"""
from __future__ import annotations

import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


_BACKEND_ROOT = str(Path(__file__).resolve().parents[2] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [k for k in list(sys.modules) if k == "app" or k.startswith("app.")]:
    del sys.modules[_cached]

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Build a TestClient pointed at a fresh tmp data dir.

    The whole chain `schedule_proposals → services.schedule_impact →
    app.schemas` must be re-imported together — otherwise `compute_impact`
    returns instances of the *previous* `Impact` class while `Proposal`
    expects the *current* one (Pydantic class identity is strict).
    """
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    backend_root = str(Path(__file__).resolve().parents[2] / "backend")
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
        schedule_advisories,
        schedule_proposals,
        schedule_repair,
        schedule_warm_restart,
        tournament_state,
    )

    app_ = FastAPI()
    app_.include_router(schedule_warm_restart.router)
    app_.include_router(schedule_repair.router)
    app_.include_router(schedule_proposals.router)
    app_.include_router(schedule_advisories.router)
    app_.include_router(match_state.router)
    app_.include_router(tournament_state.router)
    # Proposal store now lives on app.state — fresh per fixture instance.
    yield TestClient(app_)


# ---------- fixtures -------------------------------------------------------


def _basic_state(scheduleVersion: int = 0) -> dict:
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
        "scheduleVersion": scheduleVersion,
        "scheduleHistory": [],
    }


def _warm_restart_request(state: dict, stayCloseWeight: int = 10) -> dict:
    return {
        "originalSchedule": state["schedule"],
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "matchStates": {},
        "stayCloseWeight": stayCloseWeight,
    }


def _seed_state(client, scheduleVersion: int = 0) -> dict:
    state = _basic_state(scheduleVersion)
    r = client.put("/tournament/state", json=state)
    assert r.status_code == 200, r.text
    return state


# ---------- create proposal ------------------------------------------------


def test_warm_restart_proposal_creates_with_impact(client):
    state = _seed_state(client)
    r = client.post(
        "/schedule/proposals/warm-restart",
        json=_warm_restart_request(state),
    )
    assert r.status_code == 200, r.text
    proposal = r.json()
    assert proposal["id"]
    assert proposal["kind"] == "warm_restart"
    assert proposal["fromScheduleVersion"] == 0
    assert "movedMatches" in proposal["impact"]
    assert "metricDelta" in proposal["impact"]
    # The proposed schedule should at least cover the original matches.
    assert {a["matchId"] for a in proposal["proposedSchedule"]["assignments"]} >= {"m1", "m2"}


def test_repair_proposal_with_withdrawal_creates_proposal(client):
    state = _seed_state(client)
    repair_request = {
        "originalSchedule": state["schedule"],
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "matchStates": {},
        "disruption": {"type": "withdrawal", "playerId": "p1"},
    }
    r = client.post("/schedule/proposals/repair", json=repair_request)
    assert r.status_code == 200, r.text
    proposal = r.json()
    assert proposal["kind"] == "repair"
    # m1 involves p1 — it should have been forfeited / removed.
    move_ids = {m["matchId"] for m in proposal["impact"]["movedMatches"]}
    assert "m1" in move_ids


# ---------- get proposal ---------------------------------------------------


def test_get_proposal_returns_stored_record(client):
    state = _seed_state(client)
    create_r = client.post(
        "/schedule/proposals/warm-restart", json=_warm_restart_request(state)
    )
    pid = create_r.json()["id"]
    fetch_r = client.get(f"/schedule/proposals/{pid}")
    assert fetch_r.status_code == 200
    assert fetch_r.json()["id"] == pid


def test_get_unknown_proposal_returns_410(client):
    r = client.get("/schedule/proposals/no-such-id")
    assert r.status_code == 410
    assert r.json()["detail"]["code"] == "PROPOSAL_EXPIRED"


# ---------- cancel proposal ------------------------------------------------


def test_cancel_proposal_drops_from_store(client):
    state = _seed_state(client)
    create_r = client.post(
        "/schedule/proposals/warm-restart", json=_warm_restart_request(state)
    )
    pid = create_r.json()["id"]
    r = client.delete(f"/schedule/proposals/{pid}")
    assert r.status_code == 200
    assert r.json()["cancelled"] is True
    # Now a fetch should 410.
    assert client.get(f"/schedule/proposals/{pid}").status_code == 410


# ---------- commit ---------------------------------------------------------


def test_commit_proposal_atomically_swaps_committed_state(client):
    state = _seed_state(client, scheduleVersion=0)
    create_r = client.post(
        "/schedule/proposals/warm-restart", json=_warm_restart_request(state)
    )
    pid = create_r.json()["id"]

    commit_r = client.post(f"/schedule/proposals/{pid}/commit")
    assert commit_r.status_code == 200, commit_r.text
    body = commit_r.json()

    # Version bumped + history appended.
    assert body["state"]["scheduleVersion"] == 1
    assert len(body["state"]["scheduleHistory"]) == 1
    history = body["state"]["scheduleHistory"][0]
    assert history["trigger"] == "warm_restart"
    assert history["version"] == 0  # the version we replaced
    assert history["schedule"] is not None  # snapshot of the previous schedule

    # The persisted state reflects the swap on the next GET.
    persisted = client.get("/tournament/state").json()
    assert persisted["scheduleVersion"] == 1
    assert len(persisted["scheduleHistory"]) == 1


def test_commit_consumes_proposal(client):
    state = _seed_state(client)
    create_r = client.post(
        "/schedule/proposals/warm-restart", json=_warm_restart_request(state)
    )
    pid = create_r.json()["id"]
    client.post(f"/schedule/proposals/{pid}/commit")
    # Same proposal cannot be committed twice.
    second = client.post(f"/schedule/proposals/{pid}/commit")
    assert second.status_code == 410


def test_commit_409_when_committed_version_advanced(client):
    state = _seed_state(client, scheduleVersion=0)
    # Create proposal A based on version 0.
    create_a = client.post(
        "/schedule/proposals/warm-restart", json=_warm_restart_request(state)
    )
    pid_a = create_a.json()["id"]
    # Create + commit proposal B first → bumps version to 1.
    create_b = client.post(
        "/schedule/proposals/warm-restart", json=_warm_restart_request(state)
    )
    pid_b = create_b.json()["id"]
    commit_b = client.post(f"/schedule/proposals/{pid_b}/commit")
    assert commit_b.status_code == 200
    # Now A's fromScheduleVersion (0) lags the persisted (1).
    commit_a = client.post(f"/schedule/proposals/{pid_a}/commit")
    assert commit_a.status_code == 409
    assert commit_a.json()["detail"]["code"] == "SCHEDULE_VERSION_CONFLICT"


def test_history_capped_at_5(client):
    state = _seed_state(client)
    for _ in range(7):
        # Each commit produces a new history entry.
        create = client.post(
            "/schedule/proposals/warm-restart", json=_warm_restart_request(state)
        )
        pid = create.json()["id"]
        commit = client.post(f"/schedule/proposals/{pid}/commit")
        assert commit.status_code == 200
        # Refresh state for the next iteration so version field tracks.
        state = client.get("/tournament/state").json()
    final = client.get("/tournament/state").json()
    assert final["scheduleVersion"] == 7
    assert len(final["scheduleHistory"]) == 5  # capped


# ---------- TTL ------------------------------------------------------------


def test_proposal_evicted_after_ttl(client):
    state = _seed_state(client)
    create_r = client.post(
        "/schedule/proposals/warm-restart", json=_warm_restart_request(state)
    )
    pid = create_r.json()["id"]

    # The proposal store lives on the FastAPI app's state — backdate the
    # entry directly so the next endpoint call evicts it.
    store = client.app.state.proposals
    proposal = store[pid]
    expired = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat().replace(
        "+00:00", "Z"
    )
    store[pid] = proposal.model_copy(update={"expiresAt": expired})

    # Any subsequent endpoint should evict and 410.
    r = client.get(f"/schedule/proposals/{pid}")
    assert r.status_code == 410


# ---------- backward compat: existing endpoints still work -----------------


def test_existing_warm_restart_endpoint_unaffected(client):
    state = _seed_state(client)
    r = client.post("/schedule/warm-restart", json=_warm_restart_request(state))
    assert r.status_code == 200
    body = r.json()
    assert "schedule" in body
    assert "movedMatchIds" in body


def test_existing_repair_endpoint_unaffected(client):
    state = _seed_state(client)
    r = client.post(
        "/schedule/repair",
        json={
            "originalSchedule": state["schedule"],
            "config": state["config"],
            "players": state["players"],
            "matches": state["matches"],
            "matchStates": {},
            "disruption": {"type": "withdrawal", "playerId": "p1"},
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "schedule" in body
    assert "repairedMatchIds" in body
