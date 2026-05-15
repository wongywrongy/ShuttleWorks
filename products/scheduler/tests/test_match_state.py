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
    from app.exceptions import PreconditionFailedError
    from app.main import _precondition_failed_handler

    app_ = FastAPI()
    app_.include_router(tournaments.router)
    app_.include_router(match_state.router)
    # Step D: register the 412 handler so PreconditionFailedError
    # surfaces as a flat ``{"error": "precondition_failed", ...}``
    # body instead of FastAPI's default 500 unhandled-exception path.
    app_.add_exception_handler(PreconditionFailedError, _precondition_failed_handler)
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


def _if_match(version: int) -> dict:
    """Step D: every single-match PUT/DELETE needs an If-Match header.

    Brand-new matches have implicit version 0; subsequent writes use
    the value of the ETag returned by the prior response.
    """
    return {"If-Match": f'"{version}"'}


def test_put_then_get_round_trip(client, tid):
    r = client.put(
        f"{_base(tid)}/m1", json=_ok_state("m1", "called"), headers=_if_match(0)
    )
    assert r.status_code == 200
    assert r.json()["status"] == "called"
    r = client.get(_base(tid))
    assert r.status_code == 200
    assert "m1" in r.json()


def test_unknown_status_coerced_to_scheduled(client, tid):
    """The pre-validator on MatchStateDTO rewrites unknown status values."""
    payload = _ok_state("m1", "definitely-not-real")
    r = client.put(f"{_base(tid)}/m1", json=payload, headers=_if_match(0))
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
    # /reset is an admin override and bypasses If-Match by design.
    client.put(
        f"{_base(tid)}/m1", json=_ok_state("m1", "called"), headers=_if_match(0)
    )
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
    r = client.put(f"{_base(tid)}/m1", json=payload, headers=_if_match(0))
    assert r.status_code == 200
    got = client.get(f"{_base(tid)}/m1").json()
    assert got["calledAt"] == "2026-04-19T18:30:00.000Z"
    assert got["originalSlotId"] == 5
    assert got["originalCourtId"] == 3


def test_delete_removes_match(client, tid):
    put = client.put(
        f"{_base(tid)}/m1", json=_ok_state("m1", "called"), headers=_if_match(0)
    )
    # ETag carries the post-write version for the subsequent DELETE.
    etag = put.headers["ETag"].strip('"')
    r = client.delete(f"{_base(tid)}/m1", headers={"If-Match": f'"{etag}"'})
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
    """The state machine added in Step A of the architecture-adjustment
    arc requires going through called → started before a match can be
    marked finished. The test walks the transition sequence so the
    final ``finished`` PUT is legal — and threads the ETag through
    each step per Step D's If-Match contract."""
    r1 = client.put(
        f"{_base(tid)}/m1", json=_ok_state("m1", "called"), headers=_if_match(0)
    )
    assert r1.status_code == 200
    v1 = int(r1.headers["ETag"].strip('"'))
    r2 = client.put(
        f"{_base(tid)}/m1", json=_ok_state("m1", "started"), headers=_if_match(v1)
    )
    assert r2.status_code == 200
    v2 = int(r2.headers["ETag"].strip('"'))
    payload = {
        "matchId": "m1",
        "status": "finished",
        "score": {"sideA": 21, "sideB": 18},
    }
    r = client.put(f"{_base(tid)}/m1", json=payload, headers=_if_match(v2))
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


# ---- Step D — ETag + If-Match ---------------------------------------------


def test_get_returns_etag_zero_for_unseen_match(client, tid):
    """A match with no row in the canonical ``matches`` table reports
    implicit version 0 — the first write should use ``If-Match: "0"``."""
    r = client.get(f"{_base(tid)}/never-seen")
    assert r.status_code == 200
    assert r.headers["ETag"] == '"0"'


def test_put_without_if_match_returns_412(client, tid):
    r = client.put(f"{_base(tid)}/m1", json=_ok_state("m1", "called"))
    assert r.status_code == 412
    body = r.json()
    assert body["error"] == "precondition_failed"
    assert body["match_id"] == "m1"
    assert "If-Match header required" in body["message"]


def test_put_with_stale_if_match_returns_412(client, tid):
    # First write moves the version 0 → 1.
    r1 = client.put(
        f"{_base(tid)}/m1", json=_ok_state("m1", "called"), headers=_if_match(0)
    )
    assert r1.status_code == 200
    # Second write with a stale If-Match (still 0) should 412.
    r2 = client.put(
        f"{_base(tid)}/m1",
        json=_ok_state("m1", "started"),
        headers=_if_match(0),
    )
    assert r2.status_code == 412
    body = r2.json()
    assert body["error"] == "precondition_failed"
    assert "Match version is 1" in body["message"]
    assert "If-Match sent 0" in body["message"]


def test_put_with_correct_if_match_succeeds_and_etag_increments(client, tid):
    r1 = client.put(
        f"{_base(tid)}/m1", json=_ok_state("m1", "called"), headers=_if_match(0)
    )
    assert r1.status_code == 200
    assert r1.headers["ETag"] == '"1"'

    r2 = client.put(
        f"{_base(tid)}/m1",
        json=_ok_state("m1", "started"),
        headers=_if_match(1),
    )
    assert r2.status_code == 200
    assert r2.headers["ETag"] == '"2"'


def test_get_etag_after_write_reflects_current_version(client, tid):
    client.put(
        f"{_base(tid)}/m1", json=_ok_state("m1", "called"), headers=_if_match(0)
    )
    r = client.get(f"{_base(tid)}/m1")
    assert r.status_code == 200
    assert r.headers["ETag"] == '"1"'


def test_delete_without_if_match_returns_412(client, tid):
    client.put(
        f"{_base(tid)}/m1", json=_ok_state("m1", "called"), headers=_if_match(0)
    )
    r = client.delete(f"{_base(tid)}/m1")
    assert r.status_code == 412


def test_delete_with_stale_if_match_returns_412(client, tid):
    client.put(
        f"{_base(tid)}/m1", json=_ok_state("m1", "called"), headers=_if_match(0)
    )
    # Current version is 1; sending If-Match: 0 is stale.
    r = client.delete(f"{_base(tid)}/m1", headers=_if_match(0))
    assert r.status_code == 412


def test_if_match_accepts_unquoted_value(client, tid):
    """RFC 7232 wants quoted ETag values, but accept unquoted as a
    convenience for clients that strip quotes (the contract is more
    forgiving than the spec)."""
    r = client.put(
        f"{_base(tid)}/m1",
        json=_ok_state("m1", "called"),
        headers={"If-Match": "0"},  # unquoted
    )
    assert r.status_code == 200


def test_if_match_with_malformed_value_returns_412(client, tid):
    r = client.put(
        f"{_base(tid)}/m1",
        json=_ok_state("m1", "called"),
        headers={"If-Match": '"abc"'},
    )
    assert r.status_code == 412
    body = r.json()
    assert body["error"] == "precondition_failed"
    assert "not a valid version" in body["message"]


def test_if_match_accepts_weak_etag_prefix(client, tid):
    """RFC 7232 distinguishes strong (``"5"``) from weak (``W/"5"``)
    ETags. The backend never emits weak ETags, but accepting them on
    write is silently tolerant of buggy proxies / clients. Pinned
    here so the behaviour is intentional — not an accident of the
    parser's quote-stripping. The integer match is what enforces
    correctness regardless of which prefix the client sent."""
    r = client.put(
        f"{_base(tid)}/m1",
        json=_ok_state("m1", "called"),
        headers={"If-Match": 'W/"0"'},
    )
    assert r.status_code == 200


def test_match_states_isolated_across_tournaments(client):
    a = seed_tournament(client, "A")
    b = seed_tournament(client, "B")
    client.put(
        f"{_base(a)}/m1", json=_ok_state("m1", "called"), headers=_if_match(0)
    )
    assert "m1" in client.get(_base(a)).json()
    # Tournament B sees nothing.
    assert client.get(_base(b)).json() == {}
