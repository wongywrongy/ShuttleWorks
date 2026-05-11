"""End-to-end smoke test for the three schedule endpoints.

Confirms that the routes are registered, accept the documented
payload shapes, and return the expected response shapes — without
relying on any frontend code or running uvicorn.

Path collision note: ``src/app/`` and ``backend/app/`` both exist as
packages. We mirror the dance ``test_match_state.py`` does (put
``backend/`` first on ``sys.path`` and clear cached ``app.*``
modules) so ``from app.main import app`` resolves to the
production FastAPI app, not the stub in ``src/``.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest


def _import_fastapi_app():
    """Re-import the production FastAPI app under the right sys.path.

    Both ``app`` (FastAPI app) and ``adapters`` (badminton adapter)
    have shadow packages in ``src/`` (legacy). When pytest runs from
    the project root, ``src/`` is on the path first and Python
    resolves ``app`` and ``adapters`` to the wrong directories. We
    fix the path order, then clear cached entries for both so the
    next import goes through the production paths.
    """
    backend_root = str(Path(__file__).resolve().parents[1] / "backend")
    sys.path[:] = [backend_root] + [p for p in sys.path if p != backend_root]
    for k in [m for m in list(sys.modules)
              if m in ("app", "adapters")
              or m.startswith("app.") or m.startswith("adapters.")
              or m.startswith("api.")]:
        del sys.modules[k]
    from app.main import app
    return app


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    return TestClient(_import_fastapi_app())


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


def test_routes_registered(client):
    """The three schedule endpoints all exist."""
    routes = {r.path for r in client.app.routes if hasattr(r, "path")}
    assert "/schedule" in routes
    assert "/schedule/repair" in routes
    assert "/schedule/warm-restart" in routes


def test_generate_then_repair_then_warm_restart(client):
    """One operator flow: generate a schedule, repair after a court
    closure, then warm-restart. All three endpoints accept the
    documented payloads and return the documented shapes."""
    config, players, matches = _minimal_problem()

    # 1) Initial solve.
    r = client.post("/schedule", json={
        "config": config,
        "players": players,
        "matches": matches,
    })
    assert r.status_code == 200, r.text
    schedule = r.json()
    assert schedule["status"] in ("optimal", "feasible")
    assert len(schedule["assignments"]) == len(matches)
    # Determinism mode threads the seed through.
    assert schedule["solverSeed"] == 42
    # Candidate pool should have at least the final solution.
    assert isinstance(schedule.get("candidates"), list)
    assert schedule.get("activeCandidateIndex") == 0
    # Top-level assignments must mirror candidates[0] (helper does this).
    assert schedule["assignments"] == schedule["candidates"][0]["assignments"]

    # 2) Repair after closing whichever court the first match is on.
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
    new_schedule = body["schedule"]
    # No surviving match may be on the closed court.
    for a in new_schedule["assignments"]:
        assert a["courtId"] != closed_court

    # 3) Warm-restart: re-plan from here with conservative weight.
    r = client.post("/schedule/warm-restart", json={
        "originalSchedule": new_schedule,
        "config": config,
        "players": players,
        "matches": matches,
        "matchStates": {},
        "stayCloseWeight": 10,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert "schedule" in body and "movedMatchIds" in body


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
