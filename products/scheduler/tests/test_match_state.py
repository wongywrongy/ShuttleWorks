"""Tests for /match-states persistence endpoints (SQLite-backed)."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


def _detail_msg(r) -> str:
    detail = r.json().get("detail", "")
    if isinstance(detail, dict):
        return str(detail.get("message", ""))
    return str(detail)


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    import api.match_state as ms_module

    app_ = FastAPI()
    app_.include_router(ms_module.router)
    return TestClient(app_)


def _ok_state(match_id: str = "m1", status: str = "called") -> dict:
    return {
        "matchId": match_id,
        "status": status,
        "actualStartTime": None,
        "actualEndTime": None,
        "score": None,
        "notes": None,
    }


def test_put_then_get_round_trip(client):
    r = client.put("/match-states/m1", json=_ok_state("m1", "called"))
    assert r.status_code == 200
    assert r.json()["status"] == "called"
    r = client.get("/match-states")
    assert r.status_code == 200
    assert "m1" in r.json()


def test_unknown_status_coerced_to_scheduled(client):
    """The pre-validator on MatchStateDTO rewrites unknown status values."""
    payload = _ok_state("m1", "definitely-not-real")
    r = client.put("/match-states/m1", json=payload)
    assert r.status_code == 200
    assert r.json()["status"] == "scheduled"


def test_import_upload_rejects_oversize(client):
    """Multi-MB uploads must 413 before the server reads them all."""
    blob = b"x" * (20 * 1024 * 1024 + 1024)  # just over 20 MB
    r = client.post(
        "/match-states/import/upload",
        files={"file": ("big.json", blob, "application/json")},
    )
    assert r.status_code == 413


def test_import_upload_rejects_invalid_json(client):
    blob = b"{ not json }"
    r = client.post(
        "/match-states/import/upload",
        files={"file": ("bad.json", blob, "application/json")},
    )
    assert r.status_code == 400
    assert "json" in _detail_msg(r).lower()


def test_reset_empties_all_match_states(client):
    client.put("/match-states/m1", json=_ok_state("m1", "called"))
    r = client.post("/match-states/reset")
    assert r.status_code == 200
    assert client.get("/match-states").json() == {}


def test_called_at_and_original_slot_court_roundtrip(client):
    """``calledAt`` and ``originalSlotId/originalCourtId`` must survive
    PUT → GET."""
    payload = {
        "matchId": "m1",
        "status": "called",
        "calledAt": "2026-04-19T18:30:00.000Z",
        "actualStartTime": None,
        "actualEndTime": None,
        "score": None,
        "notes": None,
        "originalSlotId": 5,
        "originalCourtId": 3,
    }
    r = client.put("/match-states/m1", json=payload)
    assert r.status_code == 200
    got = client.get("/match-states/m1").json()
    assert got["calledAt"] == "2026-04-19T18:30:00.000Z"
    assert got["originalSlotId"] == 5
    assert got["originalCourtId"] == 3


def test_delete_removes_match(client):
    client.put("/match-states/m1", json=_ok_state("m1", "called"))
    r = client.delete("/match-states/m1")
    assert r.status_code == 200
    assert "m1" not in client.get("/match-states").json()


def test_default_state_when_match_unseen(client):
    """GET on a match_id with no row returns a synthetic 'scheduled' state."""
    r = client.get("/match-states/never-saved")
    assert r.status_code == 200
    body = r.json()
    assert body["matchId"] == "never-saved"
    assert body["status"] == "scheduled"


def test_score_roundtrip(client):
    payload = {
        "matchId": "m1",
        "status": "finished",
        "score": {"sideA": 21, "sideB": 18},
    }
    r = client.put("/match-states/m1", json=payload)
    assert r.status_code == 200
    body = client.get("/match-states/m1").json()
    assert body["score"] == {"sideA": 21, "sideB": 18}


def test_import_bulk_merges(client):
    """``/match-states/import-bulk`` accepts a dict and upserts every entry."""
    payload = {
        "m1": {"matchId": "m1", "status": "called"},
        "m2": {"matchId": "m2", "status": "started"},
    }
    r = client.post("/match-states/import-bulk", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["importedCount"] == 2
    assert body["totalStates"] == 2
    listing = client.get("/match-states").json()
    assert set(listing.keys()) == {"m1", "m2"}
