"""Tests for /tournament/state persistence endpoints."""
import json
import os
import sys
from pathlib import Path

# pytest prepends `src/` to sys.path as its rootdir, which makes the router's
# `from app.schemas import TournamentStateDTO` resolve to `src/app/schemas.py`
# (the legacy standalone module with no TournamentStateDTO). Force the
# production `backend/` to the very front of sys.path and purge any cached
# `app` entries so Python re-resolves the import fresh against backend/.
_BACKEND_ROOT = str(Path(__file__).resolve().parents[2] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [k for k in list(sys.modules) if k == "app" or k.startswith("app.")]:
    del sys.modules[_cached]

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Point the backend at a fresh empty data dir for each test.

    We have to re-apply the sys.path shuffle at fixture time: pytest's
    rootdir injection re-prepends `src/` between module load and fixture
    run, so a module-level sys.path tweak gets overwritten by the time
    the fixture executes.
    """
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    backend_root = str(Path(__file__).resolve().parents[2] / "backend")
    sys.path[:] = [backend_root] + [p for p in sys.path if p != backend_root]
    # Purge any cached `app.*` or router modules so the next import resolves
    # fresh against backend/.
    for _cached in [
        k for k in list(sys.modules)
        if k == "app" or k.startswith("app.") or "tournament_state" in k
    ]:
        del sys.modules[_cached]

    import api.tournament_state as ts_module  # backend/api

    from fastapi import FastAPI
    app_ = FastAPI()
    app_.include_router(ts_module.router)
    return TestClient(app_)


def test_get_missing_file_returns_204(client):
    r = client.get("/tournament/state")
    assert r.status_code == 204
    assert r.content == b""


def test_put_creates_file_and_get_returns_it(client, tmp_path):
    payload = {
        "version": 1,
        "config": None,
        "groups": [{"id": "g1", "name": "UCSC"}],
        "players": [],
        "matches": [],
        "schedule": None,
        "scheduleStats": None,
        "scheduleIsStale": False,
    }
    put_r = client.put("/tournament/state", json=payload)
    assert put_r.status_code == 200
    # File exists on disk.
    assert (tmp_path / "tournament.json").exists()

    get_r = client.get("/tournament/state")
    assert get_r.status_code == 200
    body = get_r.json()
    assert body["groups"][0]["name"] == "UCSC"
    # Server stamps updatedAt.
    assert body["updatedAt"] is not None


def test_put_overwrites_previous(client):
    first = {"version": 1, "groups": [{"id": "g1", "name": "A"}],
             "players": [], "matches": [], "scheduleIsStale": False}
    second = {"version": 1, "groups": [{"id": "g2", "name": "B"}],
              "players": [], "matches": [], "scheduleIsStale": False}
    client.put("/tournament/state", json=first)
    client.put("/tournament/state", json=second)
    body = client.get("/tournament/state").json()
    assert body["groups"][0]["name"] == "B"


def test_updated_at_stamped_server_side_ignores_client_value(client):
    payload = {"version": 1, "groups": [], "players": [], "matches": [],
               "scheduleIsStale": False,
               "updatedAt": "1999-01-01T00:00:00Z"}
    client.put("/tournament/state", json=payload)
    body = client.get("/tournament/state").json()
    assert body["updatedAt"] != "1999-01-01T00:00:00Z"


def test_corrupt_file_returns_500_with_reset_hint(client, tmp_path):
    (tmp_path / "tournament.json").write_text("{ not json }")
    r = client.get("/tournament/state")
    assert r.status_code == 500
    assert "corrupt" in r.json().get("detail", "").lower()
