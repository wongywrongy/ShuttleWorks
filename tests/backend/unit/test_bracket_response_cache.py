"""Bounded-staleness cache for ``GET /tournaments/{id}/bracket``.

Covers the cache module in isolation (get/put/invalidate/TTL) and its
wiring into the bracket routes: a cache hit skips ``_hydrate_session``
entirely, and every mutating bracket route (+ ``clearSchedule`` via
``PUT /tournaments/{id}/state``) invalidates so a poll or re-entry right
after a write never serves a stale payload.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


# ---- Module-level unit tests -------------------------------------------------


@pytest.fixture
def cache_module(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from bracket import response_cache

    response_cache.clear_all()
    yield response_cache
    response_cache.clear_all()


def test_get_on_empty_cache_returns_none(cache_module):
    assert cache_module.get(uuid.uuid4()) is None


def test_put_then_get_returns_same_payload(cache_module):
    tid = uuid.uuid4()
    cache_module.put(tid, {"foo": "bar"})
    assert cache_module.get(tid) == {"foo": "bar"}


def test_invalidate_clears_one_entry(cache_module):
    tid = uuid.uuid4()
    cache_module.put(tid, {"foo": "bar"})
    cache_module.invalidate(tid)
    assert cache_module.get(tid) is None


def test_ttl_expiry_returns_none(cache_module, monkeypatch):
    tid = uuid.uuid4()
    monkeypatch.setattr(cache_module, "TTL_SECONDS", 0.01)
    cache_module.put(tid, {"foo": "bar"})
    import time

    time.sleep(0.05)
    assert cache_module.get(tid) is None


def test_clear_all_clears_every_entry(cache_module):
    t1, t2 = uuid.uuid4(), uuid.uuid4()
    cache_module.put(t1, {"a": 1})
    cache_module.put(t2, {"b": 2})
    cache_module.clear_all()
    assert cache_module.get(t1) is None
    assert cache_module.get(t2) is None


# ---- Route-level integration tests ------------------------------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from bracket import brackets
    from workspaces import tournaments
    from core.exceptions import ConflictError
    from core.main import _conflict_error_handler
    from bracket import response_cache

    response_cache.clear_all()

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Bracket Response Cache Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _se_4_body(time_limit: float = 1.0) -> dict:
    return {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": time_limit,
        "events": [
            {
                "id": "MS",
                "discipline": "Men's Singles",
                "format": "se",
                "participants": [
                    {"id": f"P{i}", "name": f"Player {i}", "seed": i}
                    for i in range(1, 5)
                ],
                "duration_slots": 1,
            }
        ],
    }


def _semifinal(state: dict) -> dict:
    return next(
        p
        for p in state["play_units"]
        if p["round_index"] == 0 and p["match_index"] == 0
    )


def _command_body(play_unit_id: str, **overrides) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "kind": "record_result",
        "play_unit_id": play_unit_id,
        "winner_side": "A",
        "finished_at_slot": 0,
    }
    base.update(overrides)
    return base


def _spy_hydrate(monkeypatch):
    """Wrap ``bracket.brackets._hydrate_session`` with a call counter."""
    from bracket import brackets

    calls = {"n": 0}
    original = brackets._hydrate_session

    def wrapped(*args, **kwargs):
        calls["n"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(brackets, "_hydrate_session", wrapped)
    return calls


def test_second_get_within_ttl_is_a_cache_hit(client, tid, monkeypatch):
    client.post(_bracket_url(tid), json=_se_4_body())

    calls = _spy_hydrate(monkeypatch)

    r1 = client.get(_bracket_url(tid))
    r2 = client.get(_bracket_url(tid))
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json() == r2.json()
    # Only the first GET should have rebuilt the session.
    assert calls["n"] == 1


def test_record_result_command_invalidates_cache_for_immediate_get(client, tid):
    """The user-visible case: POST /commands then an immediate GET must
    show the newly-recorded result, not a cached pre-write snapshot."""
    client.post(_bracket_url(tid), json=_se_4_body())

    # Warm the cache with a pre-write GET.
    warm = client.get(_bracket_url(tid)).json()
    sf1 = _semifinal(warm)
    assert not any(
        res["play_unit_id"] == sf1["id"] for res in warm["results"]
    )

    r = client.post(
        _bracket_url(tid, "commands"), json=_command_body(sf1["id"])
    )
    assert r.status_code == 200, r.text

    after = client.get(_bracket_url(tid)).json()
    result = next(
        res for res in after["results"] if res["play_unit_id"] == sf1["id"]
    )
    assert result["winner_side"] == "A"


def test_generate_event_invalidates_cache(client, tid):
    """Another mutating route (draft -> generate) also busts the cache."""
    body = _se_4_body()
    # Create the bracket, but as a draft event so it needs generate.
    r = client.post(_bracket_url(tid), json=body)
    assert r.status_code == 200

    # Delete + re-upsert the event as draft to exercise the generate route.
    client.delete(_bracket_url(tid, "events", "MS"))
    r = client.post(
        _bracket_url(tid, "events", "MS"),
        json={
            "discipline": "Men's Singles",
            "format": "se",
            "participants": [
                {"id": f"P{i}", "name": f"Player {i}", "seed": i}
                for i in range(1, 5)
            ],
            "duration_slots": 1,
        },
    )
    assert r.status_code == 200, r.text

    warm = client.get(_bracket_url(tid)).json()
    assert warm["events"][0]["status"] == "draft"

    r = client.post(_bracket_url(tid, "events", "MS", "generate"), json={})
    assert r.status_code == 200, r.text

    after = client.get(_bracket_url(tid)).json()
    assert after["events"][0]["status"] == "generated"


def test_ttl_expiry_rebuilds_after_cached_window(client, tid, monkeypatch):
    from bracket import response_cache

    client.post(_bracket_url(tid), json=_se_4_body())

    monkeypatch.setattr(response_cache, "TTL_SECONDS", 0.01)
    calls = _spy_hydrate(monkeypatch)

    client.get(_bracket_url(tid))
    import time

    time.sleep(0.05)
    client.get(_bracket_url(tid))

    assert calls["n"] == 2


def test_clear_schedule_via_put_tournament_state_invalidates_cache(
    client, tid
):
    """PUT /tournaments/{id}/state?clearSchedule=true clears bracket
    assignments — the cached GET payload must reflect that immediately."""
    client.post(_bracket_url(tid), json=_se_4_body())

    # Schedule the ready round so there's an assignment to clear.
    client.post(_bracket_url(tid, "schedule-next"))

    warm = client.get(_bracket_url(tid)).json()
    assert len(warm.get("assignments") or []) > 0

    state = client.get(f"/tournaments/{tid}/state").json()
    state.pop("standings", None)
    # A REAL scheduling-field edit. ``?clearSchedule=true`` sanctions an edit
    # the config lock would otherwise refuse, and the clear is gated on there
    # being one (``if clearSchedule and fields``). This used to send the state
    # back UNCHANGED and still clear, because the lock compared a
    # defaults-filled DTO dump against a sparse stored blob and reported 13
    # phantom changes — the same defect that made every Bracket page raise
    # "Discard committed schedule?" on load. The subject here is the cache
    # invalidation, so the edit is the smallest real one.
    state["config"]["courtCount"] = (state["config"]["courtCount"] or 4) + 1
    r = client.put(
        f"/tournaments/{tid}/state?clearSchedule=true", json=state
    )
    assert r.status_code == 200, r.text

    after = client.get(_bracket_url(tid)).json()
    assert not (after.get("assignments") or [])
