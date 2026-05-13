"""HTTP-level tests for the multi-tournament CRUD + scoped state endpoints.

Covers `GET/POST /tournaments`, `GET/PATCH/DELETE /tournaments/{id}`,
plus `GET/PUT /tournaments/{id}/state` and the three backup endpoints.
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


def _basic_state(name: str = "Test", scheduleVersion: int = 0) -> dict:
    return {
        "version": 2,
        "config": {
            "tournamentName": name,
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "groups": [],
        "players": [],
        "matches": [],
        "schedule": None,
        "scheduleStats": None,
        "scheduleIsStale": False,
        "scheduleVersion": scheduleVersion,
        "scheduleHistory": [],
    }


# ---- CRUD --------------------------------------------------------------


def test_list_empty_on_fresh_db(client):
    r = client.get("/tournaments")
    assert r.status_code == 200
    assert r.json() == []


def test_create_returns_summary(client):
    r = client.post("/tournaments", json={"name": "Spring", "tournamentDate": "2026-04-01"})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Spring"
    assert body["tournamentDate"] == "2026-04-01"
    assert body["status"] == "draft"
    assert body["id"]
    assert body["createdAt"]
    assert body["updatedAt"]


def test_create_then_list_returns_row(client):
    client.post("/tournaments", json={"name": "A"})
    r = client.get("/tournaments")
    assert r.status_code == 200
    listing = r.json()
    assert len(listing) == 1
    assert listing[0]["name"] == "A"


def test_list_newest_first(client):
    client.post("/tournaments", json={"name": "A"})
    client.post("/tournaments", json={"name": "B"})
    listing = client.get("/tournaments").json()
    # Newest first.
    assert [t["name"] for t in listing] == ["B", "A"]


def test_get_returns_summary(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.get(f"/tournaments/{created['id']}")
    assert r.status_code == 200
    assert r.json()["name"] == "A"


def test_get_missing_returns_404(client):
    r = client.get("/tournaments/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_patch_updates_name_status_and_date(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.patch(
        f"/tournaments/{created['id']}",
        json={"name": "Renamed", "status": "active", "tournamentDate": "2026-05-01"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Renamed"
    assert body["status"] == "active"
    assert body["tournamentDate"] == "2026-05-01"


def test_patch_partial_keeps_other_fields(client):
    created = client.post(
        "/tournaments",
        json={"name": "A", "tournamentDate": "2026-04-01"},
    ).json()
    r = client.patch(f"/tournaments/{created['id']}", json={"status": "active"})
    body = r.json()
    assert body["name"] == "A"
    assert body["tournamentDate"] == "2026-04-01"
    assert body["status"] == "active"


def test_patch_rejects_unknown_status(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.patch(f"/tournaments/{created['id']}", json={"status": "bogus"})
    assert r.status_code == 422


def test_patch_missing_returns_404(client):
    r = client.patch(
        "/tournaments/00000000-0000-0000-0000-000000000000",
        json={"name": "X"},
    )
    assert r.status_code == 404


def test_delete_returns_204_then_404(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.delete(f"/tournaments/{created['id']}")
    assert r.status_code == 204
    r = client.delete(f"/tournaments/{created['id']}")
    assert r.status_code == 404


# ---- Scoped state ------------------------------------------------------


def test_state_get_returns_204_on_empty(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.get(f"/tournaments/{created['id']}/state")
    assert r.status_code == 204


def test_state_put_then_get_roundtrip(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    payload = _basic_state("A v1")
    put_r = client.put(f"/tournaments/{tid}/state", json=payload)
    assert put_r.status_code == 200
    # Server stamps updatedAt + version.
    assert put_r.json()["updatedAt"] is not None

    get_r = client.get(f"/tournaments/{tid}/state")
    assert get_r.status_code == 200
    assert get_r.json()["config"]["tournamentName"] == "A v1"


def test_state_put_updates_denormalised_name_on_summary(client):
    created = client.post("/tournaments", json={"name": "Old"}).json()
    tid = created["id"]
    payload = _basic_state("Renamed via PUT")
    client.put(f"/tournaments/{tid}/state", json=payload)
    summary = client.get(f"/tournaments/{tid}").json()
    assert summary["name"] == "Renamed via PUT"


def test_state_put_on_missing_tournament_404(client):
    payload = _basic_state("X")
    r = client.put(
        "/tournaments/00000000-0000-0000-0000-000000000000/state",
        json=payload,
    )
    assert r.status_code == 404


def test_state_put_overwrites_previous(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("First"))
    client.put(f"/tournaments/{tid}/state", json=_basic_state("Second"))
    got = client.get(f"/tournaments/{tid}/state").json()
    assert got["config"]["tournamentName"] == "Second"


def test_state_put_rejects_zero_interval(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    bad = _basic_state("A")
    bad["config"]["intervalMinutes"] = 0
    r = client.put(f"/tournaments/{created['id']}/state", json=bad)
    assert r.status_code == 422


# ---- Scoped backups ----------------------------------------------------


def test_backups_empty_on_fresh_tournament(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.get(f"/tournaments/{created['id']}/state/backups")
    assert r.status_code == 200
    assert r.json()["backups"] == []


def test_backup_rotation_after_writes(client):
    """First PUT after create has no prior data → no backup. Subsequent
    PUTs back up the prior payload. Twelve PUTs → 10 backups after rotation."""
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    for i in range(12):
        client.put(f"/tournaments/{tid}/state", json=_basic_state(f"T{i}"))
    entries = client.get(f"/tournaments/{tid}/state/backups").json()["backups"]
    # 11 backups created across 12 PUTs (first is no-op); rotated to 10.
    assert len(entries) == 10


def test_create_backup_endpoint_snapshots(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("A v1"))
    r = client.post(f"/tournaments/{tid}/state/backup")
    assert r.status_code == 200
    assert r.json()["created"] is True


def test_restore_backup_replaces_state(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("FIRST"))
    client.put(f"/tournaments/{tid}/state", json=_basic_state("SECOND"))
    backups = client.get(f"/tournaments/{tid}/state/backups").json()["backups"]
    target = backups[-1]["filename"]  # snapshot of FIRST
    r = client.post(f"/tournaments/{tid}/state/restore/{target}")
    assert r.status_code == 200
    live = client.get(f"/tournaments/{tid}/state").json()
    assert live["config"]["tournamentName"] == "FIRST"


def test_restore_unknown_backup_404(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.post(
        f"/tournaments/{created['id']}/state/restore/missing.json",
    )
    assert r.status_code == 404


# ---- Cross-tournament isolation ----------------------------------------


def test_state_writes_do_not_leak_across_tournaments(client):
    a = client.post("/tournaments", json={"name": "A"}).json()
    b = client.post("/tournaments", json={"name": "B"}).json()
    client.put(f"/tournaments/{a['id']}/state", json=_basic_state("A-state"))
    client.put(f"/tournaments/{b['id']}/state", json=_basic_state("B-state"))

    assert (
        client.get(f"/tournaments/{a['id']}/state").json()["config"]["tournamentName"]
        == "A-state"
    )
    assert (
        client.get(f"/tournaments/{b['id']}/state").json()["config"]["tournamentName"]
        == "B-state"
    )


def test_delete_cascades_backups(client):
    """Deleting a tournament drops its backups (CASCADE on the FK)."""
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("v1"))
    client.put(f"/tournaments/{tid}/state", json=_basic_state("v2"))  # creates a backup
    assert client.get(f"/tournaments/{tid}/state/backups").json()["backups"]

    client.delete(f"/tournaments/{tid}")
    # Backup listing on the now-missing tournament returns 404.
    r = client.get(f"/tournaments/{tid}/state/backups")
    assert r.status_code == 404
