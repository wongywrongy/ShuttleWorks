"""TDD test for the planFinalized readiness flag (Task 7 — SP-G1).

POST /tournaments/{tid}/plan-finalized toggles a boolean flag stored in the
tournament data blob.  GET /tournaments/{tid}/state must round-trip it, and
the rest of the state blob must survive the toggle unchanged.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import tournaments

    app_ = FastAPI()
    app_.include_router(tournaments.router)
    return TestClient(app_)


@pytest.fixture
def seeded_meet_tid(client):
    """Create a tournament with a name so the state blob is auto-seeded."""
    r = client.post("/tournaments", json={"name": "Plan Test Meet", "tournamentDate": "2026-09-01"})
    assert r.status_code == 201
    return r.json()["id"]


# ---- core round-trip -------------------------------------------------------


def test_plan_finalized_round_trips(client, seeded_meet_tid):
    """Default absent/False → toggle True → GET shows True."""
    tid = seeded_meet_tid
    assert client.get(f"/tournaments/{tid}/state").json().get("planFinalized") in (False, None)
    r = client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": True})
    assert r.status_code == 200, r.text
    assert client.get(f"/tournaments/{tid}/state").json()["planFinalized"] is True


def test_plan_finalized_can_be_toggled_back(client, seeded_meet_tid):
    """Once set True it can be cleared back to False."""
    tid = seeded_meet_tid
    client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": True})
    client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": False})
    assert client.get(f"/tournaments/{tid}/state").json()["planFinalized"] is False


def test_plan_finalized_toggle_preserves_rest_of_blob(client, seeded_meet_tid):
    """Toggling the flag must NOT wipe the rest of the state (config, players, etc.).

    This catches a naive implementation that writes only {"planFinalized": true}
    instead of read-modify-writing the full blob.
    """
    tid = seeded_meet_tid
    # State blob was seeded at create time — tournamentName should be present.
    state_before = client.get(f"/tournaments/{tid}/state").json()
    assert state_before["config"]["tournamentName"] == "Plan Test Meet"

    client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": True})

    state_after = client.get(f"/tournaments/{tid}/state").json()
    assert state_after["planFinalized"] is True
    assert state_after["config"]["tournamentName"] == "Plan Test Meet", (
        "planFinalized toggle wiped the rest of the blob"
    )
