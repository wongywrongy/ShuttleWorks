"""Tests for /tournament/state persistence endpoints.

Step 1 of the cloud-prep migration replaced the on-disk JSON file with
SQLite via SQLAlchemy. These tests exercise the HTTP contract that the
frontend depends on; implementation-detail tests (SHA-256 integrity,
file-level corruption recovery, backup-file rotation counts on disk)
were removed because the underlying behaviours don't exist in the SQL
model. Backup *semantics* — list / create / restore / rotation count —
are preserved and tested below.
"""
from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import isolate_test_database


def _detail_msg(r) -> str:
    detail = r.json().get("detail", "")
    if isinstance(detail, dict):
        return str(detail.get("message", ""))
    return str(detail)


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Per-test client with an isolated SQLite database."""
    isolate_test_database(tmp_path, monkeypatch)
    import api.tournament_state as ts_module

    app_ = FastAPI()
    app_.include_router(ts_module.router)
    return TestClient(app_)


def test_get_missing_returns_204(client):
    r = client.get("/tournament/state")
    assert r.status_code == 204
    assert r.content == b""


def test_put_creates_and_get_returns_it(client):
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


# ---- Backup management ------------------------------------------------


def test_backup_rotation_keeps_last_10(client):
    """Twelve PUTs should leave exactly ten backup rows.

    The first PUT has no prior state to back up, so 11 backups are
    created across 12 PUTs; the rotation policy then prunes to 10.
    """
    for i in range(12):
        payload = {"version": 1,
                   "groups": [{"id": f"g{i}", "name": f"S{i}"}],
                   "players": [], "matches": [], "scheduleIsStale": False}
        client.put("/tournament/state", json=payload)
    entries = client.get("/tournament/state/backups").json()["backups"]
    assert len(entries) == 10, f"expected 10 backups, got {len(entries)}"


def test_list_backups_returns_newest_first(client):
    for i in range(3):
        payload = {"version": 1,
                   "groups": [{"id": f"g{i}", "name": f"S{i}"}],
                   "players": [], "matches": [], "scheduleIsStale": False}
        client.put("/tournament/state", json=payload)
    r = client.get("/tournament/state/backups")
    assert r.status_code == 200
    entries = r.json()["backups"]
    # PUT #1 backs up nothing; PUT #2 backs up #1; PUT #3 backs up #2.
    assert len(entries) == 2
    assert entries[0]["modifiedAt"] >= entries[1]["modifiedAt"]


def test_restore_backup_replaces_live_state(client):
    first = {"version": 1, "groups": [{"id": "g1", "name": "FIRST"}],
             "players": [], "matches": [], "scheduleIsStale": False}
    second = {"version": 1, "groups": [{"id": "g2", "name": "SECOND"}],
              "players": [], "matches": [], "scheduleIsStale": False}
    client.put("/tournament/state", json=first)
    client.put("/tournament/state", json=second)
    backups = client.get("/tournament/state/backups").json()["backups"]
    assert backups
    target = backups[-1]["filename"]  # the oldest one (snapshot of `first`)

    r = client.post(f"/tournament/state/restore/{target}")
    assert r.status_code == 200
    assert r.json()["groups"][0]["name"] == "FIRST"
    live = client.get("/tournament/state").json()
    assert live["groups"][0]["name"] == "FIRST"


def test_restore_unknown_backup_404(client):
    # No tournament exists yet — restore should 404.
    r = client.post("/tournament/state/restore/no-such-file.json")
    assert r.status_code == 404

    # With a tournament present, missing filename still 404s.
    payload = {"version": 1, "groups": [], "players": [], "matches": [],
               "scheduleIsStale": False}
    client.put("/tournament/state", json=payload)
    r = client.post("/tournament/state/restore/still-no-such-file.json")
    assert r.status_code == 404


def test_create_backup_endpoint_snapshots_on_demand(client):
    payload = {"version": 1, "groups": [{"id": "g1", "name": "UCSC"}],
               "players": [], "matches": [], "scheduleIsStale": False}
    client.put("/tournament/state", json=payload)
    before = client.get("/tournament/state/backups").json()["backups"]
    r = client.post("/tournament/state/backup")
    assert r.status_code == 200
    assert r.json()["created"] is True
    after = client.get("/tournament/state/backups").json()["backups"]
    assert len(after) == len(before) + 1


def test_backups_listed_empty_with_no_tournament(client):
    """``/state/backups`` returns an empty list (not 500) on a fresh DB."""
    r = client.get("/tournament/state/backups")
    assert r.status_code == 200
    assert r.json()["backups"] == []


# ---- Pydantic validation guards (preserved from legacy suite) ----------


def test_put_rejects_zero_interval(client):
    """Pydantic config validators must reject pathological numbers."""
    payload = {
        "version": 1,
        "config": {
            "intervalMinutes": 0,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "groups": [], "players": [], "matches": [], "scheduleIsStale": False,
    }
    r = client.put("/tournament/state", json=payload)
    assert r.status_code == 422
    assert "intervalMinutes" in json.dumps(r.json())


def test_put_rejects_malformed_time(client):
    payload = {
        "version": 1,
        "config": {
            "intervalMinutes": 30,
            "dayStart": "25:99",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "groups": [], "players": [], "matches": [], "scheduleIsStale": False,
    }
    r = client.put("/tournament/state", json=payload)
    assert r.status_code == 422


def test_put_rejects_bad_scoring_format(client):
    payload = {
        "version": 1,
        "config": {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
            "scoringFormat": "definitely-not-real",
        },
        "groups": [], "players": [], "matches": [], "scheduleIsStale": False,
    }
    r = client.put("/tournament/state", json=payload)
    assert r.status_code == 422
