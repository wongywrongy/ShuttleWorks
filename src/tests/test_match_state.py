"""Tests for /match-states persistence: atomic writes, rolling backups,
recovery, upload caps, status literal, and validation."""
import json
import sys
from pathlib import Path

# Same backend-path shuffle as test_tournament_state — pytest prepends
# ``src/`` which shadows the production ``app`` package in ``backend/``.
_BACKEND_ROOT = str(Path(__file__).resolve().parents[2] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [k for k in list(sys.modules) if k == "app" or k.startswith("app.")]:
    del sys.modules[_cached]

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    backend_root = str(Path(__file__).resolve().parents[2] / "backend")
    sys.path[:] = [backend_root] + [p for p in sys.path if p != backend_root]
    for _cached in [
        k for k in list(sys.modules)
        if k == "app"
        or k.startswith("app.")
        or "match_state" in k
        or k == "api._backups"
    ]:
        del sys.modules[_cached]

    import api.match_state as ms_module  # noqa: WPS433

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


def test_unknown_status_is_coerced_not_rejected(client, tmp_path):
    """Legacy payloads with freeform status must not break the whole file.

    The pre-validator on MatchStateDTO rewrites unknown status values to
    'scheduled' so a corrupt row stays readable.
    """
    (tmp_path / "match_states.json").write_text(json.dumps({
        "matchStates": {
            "legacy": {
                "matchId": "legacy",
                "status": "definitely-not-real",
            }
        },
        "lastUpdated": "2026-04-19T00:00:00Z",
        "version": "1.0",
    }))
    r = client.get("/match-states")
    assert r.status_code == 200
    assert r.json()["legacy"]["status"] == "scheduled"


def test_corrupt_live_recovers_from_backup(client, tmp_path):
    """match_state auto-recovers from the most recent parseable backup."""
    client.put("/match-states/m1", json=_ok_state("m1", "called"))
    client.put("/match-states/m1", json=_ok_state("m1", "started"))

    # A snapshot of the freshly-written file exists in backups/.
    backups = list((tmp_path / "backups").iterdir())
    assert backups, "expected at least one backup to have rotated"

    # Corrupt the live file.
    (tmp_path / "match_states.json").write_text("{ garbage }")

    r = client.get("/match-states")
    assert r.status_code == 200
    # Auto-recovery promoted a backup back into place.
    assert r.json()["m1"]["status"] in {"called", "started"}


def test_rolling_backups_keep_last_ten(client, tmp_path):
    """After 12 writes, only the newest 10 backups should remain."""
    for i in range(12):
        client.put("/match-states/m1", json=_ok_state("m1", "called"))
    backup_dir = tmp_path / "backups"
    match_backups = sorted(
        p.name for p in backup_dir.iterdir() if p.name.startswith("match_states-")
    )
    # 12 writes -> 12 backups rotated; KEEP=10 drops the two oldest.
    assert len(match_backups) == 10


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
    assert "json" in r.json().get("detail", "").lower()


def test_reset_empties_the_file(client):
    client.put("/match-states/m1", json=_ok_state("m1", "called"))
    r = client.post("/match-states/reset")
    assert r.status_code == 200
    assert client.get("/match-states").json() == {}


def test_match_state_file_is_integrity_stamped(client, tmp_path):
    """Writes go through the shared atomic_write_json helper, which
    injects a SHA-256 _integrity field into every payload."""
    client.put("/match-states/m1", json=_ok_state("m1", "called"))
    with open(tmp_path / "match_states.json") as f:
        raw = json.load(f)
    assert "_integrity" in raw
    assert len(raw["_integrity"]) == 64


def test_match_state_tamper_recovers_from_backup(client, tmp_path):
    """A hand-edit that doesn't update the checksum triggers recovery
    of the prior snapshot."""
    client.put("/match-states/m1", json=_ok_state("m1", "called"))
    client.put("/match-states/m1", json=_ok_state("m1", "started"))

    # Tamper with the live file.
    with open(tmp_path / "match_states.json") as f:
        raw = json.load(f)
    raw["matchStates"]["m1"]["status"] = "finished"  # desync vs checksum
    with open(tmp_path / "match_states.json", "w") as f:
        json.dump(raw, f)

    # Read recovers from the most recent un-tampered backup.
    r = client.get("/match-states")
    assert r.status_code == 200
    # 'started' was the last clean state before the tamper.
    assert r.json()["m1"]["status"] in {"called", "started"}


def test_delete_removes_match(client):
    client.put("/match-states/m1", json=_ok_state("m1", "called"))
    r = client.delete("/match-states/m1")
    assert r.status_code == 200
    assert "m1" not in client.get("/match-states").json()
