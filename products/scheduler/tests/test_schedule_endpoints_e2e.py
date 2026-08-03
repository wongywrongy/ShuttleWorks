"""End-to-end tests for the schedule surface after SP-CLOUD-1.

The meet batch solve is a JOB now: submit via
``POST /tournaments/{id}/solve-jobs`` (202 + job DTO), execute via the
worker (real subprocess, real CP-SAT), poll to a terminal status. The
legacy synchronous routes answer 410. Repair / warm-restart remain
request-shaped (Phase 0 decision C3) and must keep accepting the
schedule a job produced.
"""
from __future__ import annotations

import uuid as uuid_mod

import pytest

from tests._helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def _run_worker_once() -> bool:
    """Drive the embedded worker loop synchronously (no thread)."""
    from services.solve_worker import SolveWorker

    return SolveWorker(worker_id="pytest-worker").run_once()


def _minimal_problem():
    config = {
        "intervalMinutes": 30,
        "dayStart": "09:00",
        "dayEnd": "12:00",
        "breaks": [],
        "courtCount": 2,
        "defaultRestMinutes": 30,
        "freezeHorizonSlots": 0,
        "deterministic": True,
        "randomSeed": 42,
    }
    players = [
        {"id": f"p{i}", "name": f"P{i}", "groupId": "g1", "availability": [],
         "ranks": [], "minRestMinutes": None, "notes": None}
        for i in range(4)
    ]
    matches = [
        {"id": "m0", "eventRank": "MS",
         "sideA": ["p0"], "sideB": ["p1"],
         "durationSlots": 1, "matchType": "dual", "matchNumber": 1,
         "sideC": None},
        {"id": "m1", "eventRank": "WS",
         "sideA": ["p2"], "sideB": ["p3"],
         "durationSlots": 1, "matchType": "dual", "matchNumber": 2,
         "sideC": None},
    ]
    return config, players, matches


def _submit(client, tid, *, key=None, extra=None):
    config, players, matches = _minimal_problem()
    body = {"config": config, "players": players, "matches": matches}
    if extra:
        body.update(extra)
    headers = {"Idempotency-Key": key} if key else {}
    return client.post(f"/tournaments/{tid}/solve-jobs", json=body, headers=headers)


def _solve_to_completion(client, tid, *, extra=None):
    r = _submit(client, tid, key=str(uuid_mod.uuid4()), extra=extra)
    assert r.status_code == 202, r.text
    job_id = r.json()["id"]
    assert _run_worker_once() is True
    r = client.get(f"/tournaments/{tid}/solve-jobs/{job_id}")
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["status"] == "succeeded", job.get("error")
    return job


def test_routes_registered(client):
    paths = client.app.openapi()["paths"]
    # New job rail.
    assert "/tournaments/{tournament_id}/solve-jobs" in paths
    assert "/tournaments/{tournament_id}/solve-jobs/{job_id}" in paths
    assert "/tournaments/{tournament_id}/solve-jobs/{job_id}/cancel" in paths
    # Retired sync routes still answer (as 410), and the pure-Python
    # validator stays.
    assert "/schedule" in paths
    assert "/schedule/stream" in paths
    assert "/schedule/validate" in paths
    assert "/schedule/repair" in paths
    assert "/schedule/warm-restart" in paths


def test_synchronous_solve_routes_are_gone(client):
    config, players, matches = _minimal_problem()
    body = {"config": config, "players": players, "matches": matches}
    for path in ("/schedule", "/schedule/stream"):
        r = client.post(path, json=body)
        assert r.status_code == 410, f"{path}: {r.status_code}"
        assert r.json()["detail"]["code"] == "SOLVE_ENDPOINT_GONE"
        assert "solve-jobs" in r.json()["detail"]["message"]


def test_solve_job_full_flow_honours_closed_windows(client):
    """Submit → worker → poll. The solve must honour cross-engine
    closedCourtWindows exactly as the sync endpoint did."""
    tid = seed_tournament(client, "jobs-e2e")
    config, _, _ = _minimal_problem()
    block = [[c, 0, 1] for c in range(1, config["courtCount"] + 1)]
    job = _solve_to_completion(client, tid, extra={"closedCourtWindows": block})

    schedule = job["result"]
    assert schedule["status"] in ("optimal", "feasible")
    on_slot_zero = [a for a in schedule["assignments"] if a["slotId"] == 0]
    assert on_slot_zero == [], f"matches placed on a closed slot: {on_slot_zero}"
    # Determinism params persisted on the job (Rule 5a).
    assert job["params"]["random_seed"] == 42
    assert job["params"]["num_workers"] == 1
    assert job["startedAt"] is not None and job["finishedAt"] is not None


def test_job_schedule_feeds_repair_and_warm_restart(client):
    """The job-produced ScheduleDTO keeps flowing through the (still
    request-shaped) repair and warm-restart endpoints unchanged."""
    tid = seed_tournament(client, "jobs-repair")
    config, players, matches = _minimal_problem()
    job = _solve_to_completion(client, tid)
    schedule = job["result"]
    assert len(schedule["assignments"]) == len(matches)
    assert schedule["solverSeed"] == 42
    assert schedule["assignments"] == schedule["candidates"][0]["assignments"]

    closed_court = schedule["assignments"][0]["courtId"]
    r = client.post("/schedule/repair", json={
        "originalSchedule": schedule,
        "config": config,
        "players": players,
        "matches": matches,
        "matchStates": {},
        "disruption": {"type": "court_closed", "courtId": closed_court},
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert "schedule" in body and "repairedMatchIds" in body
    for a in body["schedule"]["assignments"]:
        assert a["courtId"] != closed_court

    r = client.post("/schedule/warm-restart", json={
        "originalSchedule": body["schedule"],
        "config": config,
        "players": players,
        "matches": matches,
        "matchStates": {},
        "stayCloseWeight": 10,
    })
    assert r.status_code == 200, r.text
    assert "schedule" in r.json() and "movedMatchIds" in r.json()


def test_idempotency_key_replays_the_same_job(client):
    tid = seed_tournament(client, "jobs-idem")
    key = str(uuid_mod.uuid4())
    first = _submit(client, tid, key=key)
    assert first.status_code == 202
    replay = _submit(client, tid, key=key)
    assert replay.status_code == 202
    assert replay.json()["id"] == first.json()["id"]
    # Replay after completion returns the finished job, not a new solve.
    assert _run_worker_once() is True
    done = _submit(client, tid, key=key)
    assert done.json()["id"] == first.json()["id"]
    assert done.json()["status"] == "succeeded"


def test_second_submit_conflicts_while_active(client):
    tid = seed_tournament(client, "jobs-conflict")
    first = _submit(client, tid, key=str(uuid_mod.uuid4()))
    assert first.status_code == 202
    second = _submit(client, tid, key=str(uuid_mod.uuid4()))
    assert second.status_code == 409
    detail = second.json()["detail"]
    assert detail["code"] == "SOLVE_JOB_ACTIVE"
    assert detail["activeJobId"] == first.json()["id"]


def test_cancel_queued_job_and_resubmit(client):
    tid = seed_tournament(client, "jobs-cancel")
    job_id = _submit(client, tid, key=str(uuid_mod.uuid4())).json()["id"]
    r = client.post(f"/tournaments/{tid}/solve-jobs/{job_id}/cancel")
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"
    # Idempotent cancel.
    r = client.post(f"/tournaments/{tid}/solve-jobs/{job_id}/cancel")
    assert r.json()["status"] == "cancelled"
    # The cancelled job no longer blocks a fresh submit.
    assert _submit(client, tid, key=str(uuid_mod.uuid4())).status_code == 202


def test_job_list_and_scoping(client):
    tid = seed_tournament(client, "jobs-list")
    other_tid = seed_tournament(client, "jobs-other")
    job_id = _submit(client, tid, key=str(uuid_mod.uuid4())).json()["id"]
    r = client.get(f"/tournaments/{tid}/solve-jobs")
    assert r.status_code == 200
    assert [j["id"] for j in r.json()["jobs"]] == [job_id]
    # Cross-tournament access to the job id 404s.
    r = client.get(f"/tournaments/{other_tid}/solve-jobs/{job_id}")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "SOLVE_JOB_NOT_FOUND"


def test_repair_validates_disruption_payload(client):
    """Bad disruption payload returns 400, not 500."""
    config, players, matches = _minimal_problem()
    r = client.post("/schedule/repair", json={
        "originalSchedule": {"assignments": [], "unscheduledMatches": [],
                             "softViolations": [], "objectiveScore": None,
                             "infeasibleReasons": [], "status": "optimal"},
        "config": config,
        "players": players,
        "matches": matches,
        "matchStates": {},
        "disruption": {"type": "withdrawal"},  # missing playerId
    })
    assert r.status_code == 400
