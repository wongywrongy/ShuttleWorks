"""Schema v1 → v2 migration tests for /tournament/state.

v2 introduces ``scheduleVersion`` and ``scheduleHistory`` to support the
proposal/commit pipeline. v1 files lack both fields; the migration must
default them to 0 / [] without losing any other content.
"""
import json
import sys
from pathlib import Path


# pytest prepends `src/` to sys.path; the same trick used in
# test_tournament_state.py forces backend/ to win for `from app.schemas
# import ...` resolution.
_BACKEND_ROOT = str(Path(__file__).resolve().parents[2] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [k for k in list(sys.modules) if k == "app" or k.startswith("app.")]:
    del sys.modules[_cached]

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    backend_root = str(Path(__file__).resolve().parents[2] / "backend")
    sys.path[:] = [backend_root] + [p for p in sys.path if p != backend_root]
    for _cached in [
        k for k in list(sys.modules)
        if k == "app" or k.startswith("app.") or "tournament_state" in k
    ]:
        del sys.modules[_cached]

    import api.tournament_state as ts_module

    from fastapi import FastAPI
    app_ = FastAPI()
    app_.include_router(ts_module.router)
    return TestClient(app_)


def test_v1_file_loads_with_defaulted_history_fields(client, tmp_path):
    """A pre-v2 file (no scheduleVersion / scheduleHistory) must upgrade
    cleanly to v2 with both fields defaulted, and otherwise round-trip
    its content unchanged."""
    legacy = {
        "version": 1,
        "groups": [{"id": "g1", "name": "UCSC"}],
        "players": [],
        "matches": [],
        "schedule": None,
        "scheduleStats": None,
        "scheduleIsStale": False,
    }
    (tmp_path / "tournament.json").write_text(json.dumps(legacy))

    r = client.get("/tournament/state")
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == 2
    assert body["scheduleVersion"] == 0
    assert body["scheduleHistory"] == []
    assert body["groups"][0]["name"] == "UCSC"


def test_v2_payload_round_trips_history_entry(client):
    """A v2 PUT with a populated scheduleHistory entry comes back intact."""
    history_entry = {
        "version": 3,
        "committedAt": "2026-04-28T12:00:00Z",
        "trigger": "warm_restart",
        "summary": "12 matches moved, fairness +2%",
        "schedule": None,
    }
    payload = {
        "version": 2,
        "groups": [],
        "players": [],
        "matches": [],
        "scheduleIsStale": False,
        "scheduleVersion": 4,
        "scheduleHistory": [history_entry],
    }
    put_r = client.put("/tournament/state", json=payload)
    assert put_r.status_code == 200

    body = client.get("/tournament/state").json()
    assert body["scheduleVersion"] == 4
    assert len(body["scheduleHistory"]) == 1
    assert body["scheduleHistory"][0]["trigger"] == "warm_restart"
    assert body["scheduleHistory"][0]["summary"] == "12 matches moved, fairness +2%"


def test_no_version_field_treated_as_v1(client, tmp_path):
    """Files written by very early builds had no ``version`` key at all;
    the migration must treat them as v1 and still default the new fields."""
    ancient = {
        "groups": [{"id": "g1", "name": "ANCIENT"}],
        "players": [],
        "matches": [],
        "scheduleIsStale": False,
    }
    (tmp_path / "tournament.json").write_text(json.dumps(ancient))

    r = client.get("/tournament/state")
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == 2
    assert body["scheduleVersion"] == 0
    assert body["scheduleHistory"] == []


def test_v2_default_when_omitted_on_put(client):
    """If a client PUTs a payload that omits the new fields entirely,
    Pydantic should default them to 0 / [] rather than 422."""
    payload = {
        "version": 2,
        "groups": [],
        "players": [],
        "matches": [],
        "scheduleIsStale": False,
    }
    r = client.put("/tournament/state", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["scheduleVersion"] == 0
    assert body["scheduleHistory"] == []
