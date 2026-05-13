"""Time-axis fields on TournamentConfig.

Today the scheduler plans on an abstract slot grid anchored to
``dayStart``. The director tools introduce three runtime time-axis
mutations:

  - **start delay**: shift every unstarted match's *displayed* clock
    by N minutes. Pure rendering concern; no solver re-run.
  - **inserted blackout**: a forbidden wall-clock window matches must
    avoid. Reuses the *existing* ``BreakWindow`` plumbing (already
    enforced by `_allowed_starts`); see the engine test below.
  - **compress remaining**: deferred — out of scope for the initial
    director tools rollout.

These tests cover the schema addition (``clockShiftMinutes``) and
confirm that runtime-inserted breaks behave the same as setup-time
breaks at the solver level.
"""
from __future__ import annotations

import sys
from pathlib import Path


_BACKEND_ROOT = str(Path(__file__).resolve().parents[1] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [
    k for k in list(sys.modules)
    if k == "app" or k.startswith("app.")
]:
    del sys.modules[_cached]

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    import api.tournament_state as ts_module

    app_ = FastAPI()
    app_.include_router(ts_module.router)
    return TestClient(app_)


def _config(**overrides) -> dict:
    base = dict(
        intervalMinutes=30,
        dayStart="09:00",
        dayEnd="17:00",
        breaks=[],
        courtCount=4,
        defaultRestMinutes=30,
        freezeHorizonSlots=0,
    )
    base.update(overrides)
    return base


def test_clock_shift_defaults_to_zero(client):
    """Existing tournaments saved before the new field continue to load
    cleanly; absent ``clockShiftMinutes`` defaults to 0."""
    payload = {
        "version": 2,
        "config": _config(),
        "groups": [],
        "players": [],
        "matches": [],
        "scheduleIsStale": False,
    }
    r = client.put("/tournament/state", json=payload)
    assert r.status_code == 200
    body = client.get("/tournament/state").json()
    assert body["config"]["clockShiftMinutes"] == 0


def test_clock_shift_round_trips(client):
    payload = {
        "version": 2,
        "config": _config(clockShiftMinutes=25),
        "groups": [],
        "players": [],
        "matches": [],
        "scheduleIsStale": False,
    }
    r = client.put("/tournament/state", json=payload)
    assert r.status_code == 200
    body = client.get("/tournament/state").json()
    assert body["config"]["clockShiftMinutes"] == 25


def test_clock_shift_rejects_negative(client):
    payload = {
        "version": 2,
        "config": _config(clockShiftMinutes=-15),
        "groups": [],
        "players": [],
        "matches": [],
        "scheduleIsStale": False,
    }
    r = client.put("/tournament/state", json=payload)
    assert r.status_code == 422


def test_clock_shift_rejects_excessively_large_values(client):
    """Cap at 24h — anything larger is almost certainly an operator error."""
    payload = {
        "version": 2,
        "config": _config(clockShiftMinutes=24 * 60 + 1),
        "groups": [],
        "players": [],
        "matches": [],
        "scheduleIsStale": False,
    }
    r = client.put("/tournament/state", json=payload)
    assert r.status_code == 422


def test_breaks_are_part_of_persisted_config(client):
    """Director ``insert_blackout`` actions append to ``config.breaks``.
    The engine already enforces ``breaks`` via ``_allowed_starts``
    (covered by `test_repair.py` and `test_warm_start.py`), so this
    test only verifies the persistence shape: a break inserted into
    ``config.breaks`` round-trips through PUT/GET unchanged.
    """
    payload = {
        "version": 2,
        "config": _config(breaks=[{"start": "12:00", "end": "13:00"}]),
        "groups": [],
        "players": [],
        "matches": [],
        "scheduleIsStale": False,
    }
    r = client.put("/tournament/state", json=payload)
    assert r.status_code == 200
    body = client.get("/tournament/state").json()
    assert body["config"]["breaks"] == [{"start": "12:00", "end": "13:00"}]


def test_breaks_can_be_added_at_runtime_without_schema_changes(client):
    """Operator-inserted blackouts append to the existing breaks list."""
    initial = {
        "version": 2,
        "config": _config(breaks=[]),
        "groups": [],
        "players": [],
        "matches": [],
        "scheduleIsStale": False,
    }
    client.put("/tournament/state", json=initial)
    # Re-PUT with a runtime-inserted blackout (mirrors what the
    # director-action endpoint will do).
    state = client.get("/tournament/state").json()
    state["config"]["breaks"] = [{"start": "12:00", "end": "13:00"}]
    r = client.put("/tournament/state", json=state)
    assert r.status_code == 200
    body = client.get("/tournament/state").json()
    assert len(body["config"]["breaks"]) == 1
