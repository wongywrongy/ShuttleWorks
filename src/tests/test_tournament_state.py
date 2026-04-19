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


def test_corrupt_file_with_no_backup_returns_500(client, tmp_path):
    (tmp_path / "tournament.json").write_text("{ not json }")
    r = client.get("/tournament/state")
    assert r.status_code == 500
    # Generic user-facing message; stack traces and file paths are
    # deliberately NOT leaked — they go to the server log instead.
    detail = r.json().get("detail", "").lower()
    assert "unreadable" in detail or "reset via setup" in detail


def test_corrupt_file_auto_recovers_from_backup(client, tmp_path):
    """A corrupt live file should silently fall back to the newest backup.

    Backups are snapshots of the *previous* live content taken right before
    each PUT, so after two writes the pool contains the first payload only.
    Recovery therefore rolls back one step.
    """
    first = {"version": 1, "groups": [{"id": "g1", "name": "UCSC"}],
             "players": [], "matches": [], "scheduleIsStale": False}
    client.put("/tournament/state", json=first)
    second = {"version": 1, "groups": [{"id": "g2", "name": "Stanford"}],
              "players": [], "matches": [], "scheduleIsStale": False}
    client.put("/tournament/state", json=second)
    # Corrupt the live (Stanford) file.
    (tmp_path / "tournament.json").write_text("{ not json }")

    r = client.get("/tournament/state")
    assert r.status_code == 200
    body = r.json()
    # The most recent backup snapshots the pre-Stanford content (UCSC).
    assert body["groups"][0]["name"] == "UCSC"
    assert "recoveredFromBackup" in body


def test_backup_rotation_keeps_last_10(client, tmp_path):
    """Eleven writes should leave exactly ten backup files on disk."""
    for i in range(12):
        payload = {"version": 1,
                   "groups": [{"id": f"g{i}", "name": f"S{i}"}],
                   "players": [], "matches": [], "scheduleIsStale": False}
        client.put("/tournament/state", json=payload)
    backups_dir = tmp_path / "backups"
    files = sorted(p.name for p in backups_dir.iterdir() if p.name.startswith("tournament-"))
    assert len(files) == 10, f"expected 10 backups, got {len(files)}: {files}"


def test_list_backups_returns_newest_first(client):
    for i in range(3):
        payload = {"version": 1,
                   "groups": [{"id": f"g{i}", "name": f"S{i}"}],
                   "players": [], "matches": [], "scheduleIsStale": False}
        client.put("/tournament/state", json=payload)
    r = client.get("/tournament/state/backups")
    assert r.status_code == 200
    entries = r.json()["backups"]
    # PUT #1 rotates no backup (no prior file); PUT #2 rotates backup of #1;
    # PUT #3 rotates backup of #2. So we expect exactly 2 entries.
    assert len(entries) == 2
    # Newest first.
    assert entries[0]["modifiedAt"] >= entries[1]["modifiedAt"]


def test_restore_backup_replaces_live_file(client):
    first = {"version": 1, "groups": [{"id": "g1", "name": "FIRST"}],
             "players": [], "matches": [], "scheduleIsStale": False}
    second = {"version": 1, "groups": [{"id": "g2", "name": "SECOND"}],
              "players": [], "matches": [], "scheduleIsStale": False}
    client.put("/tournament/state", json=first)
    client.put("/tournament/state", json=second)
    # The backup pool now contains a copy of `first`.
    backups = client.get("/tournament/state/backups").json()["backups"]
    assert backups
    target = backups[-1]["filename"]  # the oldest one, which is `first`

    r = client.post(f"/tournament/state/restore/{target}")
    assert r.status_code == 200
    assert r.json()["groups"][0]["name"] == "FIRST"
    # The live file now matches `first` too.
    live = client.get("/tournament/state").json()
    assert live["groups"][0]["name"] == "FIRST"


def test_restore_unknown_backup_404(client):
    r = client.post("/tournament/state/restore/no-such-file.json")
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


def test_migration_too_new_version_rejects(client, tmp_path):
    """A payload saved by a newer app version must fail loudly."""
    (tmp_path / "tournament.json").write_text(json.dumps({
        "version": 99,
        "config": None,
        "groups": [],
        "players": [],
        "matches": [],
        "schedule": None,
        "scheduleStats": None,
        "scheduleIsStale": False,
    }))
    r = client.get("/tournament/state")
    assert r.status_code == 409
    assert "newer" in r.json().get("detail", "").lower()


def test_recovery_skips_corrupt_newest_backup(client, tmp_path):
    """A single bad backup must not block recovery of older ones.

    Regression cover for the cascading-recovery fix: prior behaviour
    stopped at the newest backup and returned 500 if it was unreadable
    even when older backups were intact.
    """
    # Three PUTs => 2 rolled backups (each PUT snapshots the prior live).
    good = {"version": 1, "groups": [{"id": "g1", "name": "GOOD"}],
            "players": [], "matches": [], "scheduleIsStale": False}
    client.put("/tournament/state", json=good)
    client.put("/tournament/state", json=good)
    client.put("/tournament/state", json=good)

    backups_dir = tmp_path / "backups"
    backups = sorted(
        [p for p in backups_dir.iterdir() if p.name.startswith("tournament-")],
        key=lambda p: p.stat().st_mtime,
    )
    assert len(backups) >= 2, f"need at least 2 backups, got {len(backups)}"

    # Corrupt the live file AND the newest backup. The older backup
    # remains parseable — cascading recovery should pick it up.
    (tmp_path / "tournament.json").write_text("{ garbage }")
    backups[-1].write_text("{ garbage }")

    r = client.get("/tournament/state")
    assert r.status_code == 200
    body = r.json()
    assert body["groups"][0]["name"] == "GOOD"
    assert "recoveredFromBackup" in body


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
    detail = json.dumps(r.json())
    assert "intervalMinutes" in detail


def test_put_rejects_malformed_time(client):
    """HHMMTime regex guards malformed dayStart/dayEnd strings."""
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
    """scoringFormat is a Literal; unknown values must 422."""
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
