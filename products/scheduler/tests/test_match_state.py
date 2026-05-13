"""Tests for /tournaments/{id}/match-states endpoints (SQLite-backed)."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


def _detail_msg(r) -> str:
    detail = r.json().get("detail", "")
    if isinstance(detail, dict):
        return str(detail.get("message", ""))
    return str(detail)


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import match_state, tournaments

    app_ = FastAPI()
    app_.include_router(tournaments.router)
    app_.include_router(match_state.router)
    return TestClient(app_)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Test")


def _ok_state(match_id: str = "m1", status: str = "called") -> dict:
    return {
        "matchId": match_id,
        "status": status,
        "actualStartTime": None,
        "actualEndTime": None,
        "score": None,
        "notes": None,
    }


def _base(tid: str) -> str:
    return f"/tournaments/{tid}/match-states"


def test_put_then_get_round_trip(client, tid):
    r = client.put(f"{_base(tid)}/m1", json=_ok_state("m1", "called"))
    assert r.status_code == 200
    assert r.json()["status"] == "called"
    r = client.get(_base(tid))
    assert r.status_code == 200
    assert "m1" in r.json()


def test_unknown_status_coerced_to_scheduled(client, tid):
    """The pre-validator on MatchStateDTO rewrites unknown status values."""
    payload = _ok_state("m1", "definitely-not-real")
    r = client.put(f"{_base(tid)}/m1", json=payload)
    assert r.status_code == 200
    assert r.json()["status"] == "scheduled"


def test_put_against_missing_tournament_403(client):
    """Step 5: role check fires before route handler can 404; a tournament
    you can't access returns 403 rather than 404 so its existence isn't
    a probe oracle."""
    bad_tid = "00000000-0000-0000-0000-000000000099"
    r = client.put(f"{_base(bad_tid)}/m1", json=_ok_state())
    assert r.status_code == 403


def test_import_upload_rejects_oversize(client, tid):
    """Multi-MB uploads must 413 before the server reads them all."""
    blob = b"x" * (20 * 1024 * 1024 + 1024)  # just over 20 MB
    r = client.post(
        f"{_base(tid)}/import/upload",
        files={"file": ("big.json", blob, "application/json")},
    )
    assert r.status_code == 413


def test_import_upload_rejects_invalid_json(client, tid):
    blob = b"{ not json }"
    r = client.post(
        f"{_base(tid)}/import/upload",
        files={"file": ("bad.json", blob, "application/json")},
    )
    assert r.status_code == 400
    assert "json" in _detail_msg(r).lower()


def test_reset_empties_all_match_states(client, tid):
    client.put(f"{_base(tid)}/m1", json=_ok_state("m1", "called"))
    r = client.post(f"{_base(tid)}/reset")
    assert r.status_code == 200
    assert client.get(_base(tid)).json() == {}


def test_called_at_and_original_slot_court_roundtrip(client, tid):
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
    r = client.put(f"{_base(tid)}/m1", json=payload)
    assert r.status_code == 200
    got = client.get(f"{_base(tid)}/m1").json()
    assert got["calledAt"] == "2026-04-19T18:30:00.000Z"
    assert got["originalSlotId"] == 5
    assert got["originalCourtId"] == 3


def test_delete_removes_match(client, tid):
    client.put(f"{_base(tid)}/m1", json=_ok_state("m1", "called"))
    r = client.delete(f"{_base(tid)}/m1")
    assert r.status_code == 200
    assert "m1" not in client.get(_base(tid)).json()


def test_default_state_when_match_unseen(client, tid):
    """GET on a match_id with no row returns a synthetic 'scheduled' state."""
    r = client.get(f"{_base(tid)}/never-saved")
    assert r.status_code == 200
    body = r.json()
    assert body["matchId"] == "never-saved"
    assert body["status"] == "scheduled"


def test_score_roundtrip(client, tid):
    payload = {
        "matchId": "m1",
        "status": "finished",
        "score": {"sideA": 21, "sideB": 18},
    }
    r = client.put(f"{_base(tid)}/m1", json=payload)
    assert r.status_code == 200
    body = client.get(f"{_base(tid)}/m1").json()
    assert body["score"] == {"sideA": 21, "sideB": 18}


def test_import_bulk_merges(client, tid):
    payload = {
        "m1": {"matchId": "m1", "status": "called"},
        "m2": {"matchId": "m2", "status": "started"},
    }
    r = client.post(f"{_base(tid)}/import-bulk", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["importedCount"] == 2
    assert body["totalStates"] == 2
    listing = client.get(_base(tid)).json()
    assert set(listing.keys()) == {"m1", "m2"}


def test_match_states_isolated_across_tournaments(client):
    a = seed_tournament(client, "A")
    b = seed_tournament(client, "B")
    client.put(f"{_base(a)}/m1", json=_ok_state("m1", "called"))
    assert "m1" in client.get(_base(a)).json()
    # Tournament B sees nothing.
    assert client.get(_base(b)).json() == {}
