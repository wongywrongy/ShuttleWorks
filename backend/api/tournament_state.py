"""Whole-tournament state persistence (server-side JSON file).

GET returns 204 when no file yet, PUT overwrites atomically via temp-file
rename, stamping ``updatedAt`` server-side. Every PUT also rotates a
backup into ``./data/backups`` (last ``KEEP`` kept per stem).

If the live file is unreadable, GET auto-restores the most recent backup
and surfaces ``recoveredFromBackup: true`` in the payload so the UI can
notify the operator.
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.schemas import TournamentStateDTO
from api import _backups

router = APIRouter(prefix="/tournament", tags=["tournament-state"])
log = logging.getLogger("scheduler.tournament_state")

CURRENT_SCHEMA_VERSION = 1


def _data_dir() -> Path:
    return Path(os.environ.get("BACKEND_DATA_DIR", "/app/data"))


def _state_path() -> Path:
    return _data_dir() / "tournament.json"


def _ensure_dir() -> None:
    _data_dir().mkdir(parents=True, exist_ok=True)


def _migrate(raw: dict) -> dict:
    """Upgrade an older payload to ``CURRENT_SCHEMA_VERSION`` in place.

    Rejects payloads from a *newer* app version — the user must re-run the
    newer build. Legacy payloads with no ``version`` field default to 1
    (the initial shipping schema).
    """
    version = int(raw.get("version") or 1)
    if version > CURRENT_SCHEMA_VERSION:
        raise HTTPException(
            status_code=409,
            detail=(
                f"state file schema version {version} is newer than this "
                f"app's {CURRENT_SCHEMA_VERSION}; upgrade the app or "
                f"restore an older backup"
            ),
        )
    # No migration needed at v1 — added here for future upgrades.
    raw["version"] = CURRENT_SCHEMA_VERSION
    return raw


def _read_with_recovery(path: Path) -> tuple[dict, Optional[str]]:
    """Load ``path`` or auto-recover from the most recent backup.

    Returns ``(payload, recovered_from_filename_or_None)``. Raises
    ``HTTPException`` with a readable detail if nothing is salvageable.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f), None
    except json.JSONDecodeError:
        log.warning("tournament.json is unreadable; attempting backup recovery")
        latest = _backups.latest_backup(_data_dir(), path.stem)
        if latest is None:
            raise HTTPException(
                status_code=500,
                detail="tournament.json is corrupt and no backup exists; reset via Setup",
            )
        try:
            with open(latest, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except (json.JSONDecodeError, OSError) as inner:
            raise HTTPException(
                status_code=500,
                detail=f"backup {latest.name} is also unreadable ({inner}); reset via Setup",
            )
        # Promote the backup to the live file so subsequent requests hit it.
        _backups.restore_backup(_data_dir(), path, latest.name)
        log.warning("recovered tournament.json from backup %s", latest.name)
        return payload, latest.name


@router.get("/state")
async def get_tournament_state():
    """Return the persisted tournament state.

    204 No Content when no state has been saved yet. Payload gains a
    ``recoveredFromBackup`` field when a corrupt file was auto-repaired.
    """
    path = _state_path()
    if not path.exists():
        return Response(status_code=204)
    try:
        data, recovered_from = _read_with_recovery(path)
    except HTTPException:
        raise
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"read failed: {e}")

    data = _migrate(data)
    if recovered_from is not None:
        data["recoveredFromBackup"] = recovered_from
    return data


@router.put("/state", response_model=TournamentStateDTO)
async def put_tournament_state(state: TournamentStateDTO):
    """Overwrite the tournament state atomically.

    Before the atomic replace we copy the current file into
    ``./data/backups/tournament-<iso>.json`` so the previous content is
    always recoverable. The server stamps ``updatedAt`` so two tabs can
    agree on ordering.
    """
    _ensure_dir()
    stamped = state.model_copy(
        update={
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "version": CURRENT_SCHEMA_VERSION,
        }
    )
    path = _state_path()

    # Rotate a backup of the *previous* live file (if any) before stomping it.
    try:
        _backups.create_backup(_data_dir(), path)
    except OSError as e:
        # Backups are best-effort — don't block saving because of them.
        log.warning("backup rotation failed: %s", e)

    tmp = path.with_suffix(".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(stamped.model_dump(), f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)  # atomic on POSIX
    except OSError as e:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        raise HTTPException(status_code=500, detail=f"write failed: {e}")
    return stamped


# ---- Backup management endpoints --------------------------------------


class BackupEntryDTO(BaseModel):
    filename: str
    sizeBytes: int
    modifiedAt: str


class BackupListDTO(BaseModel):
    backups: List[BackupEntryDTO]


class BackupCreatedDTO(BaseModel):
    filename: Optional[str] = None
    created: bool


@router.get("/state/backups", response_model=BackupListDTO)
async def list_tournament_backups() -> BackupListDTO:
    """Return the rolling-backup list, newest first."""
    entries = _backups.list_backups(_data_dir(), _state_path().stem)
    return BackupListDTO(backups=[BackupEntryDTO(**e) for e in entries])


@router.post("/state/backup", response_model=BackupCreatedDTO)
async def create_tournament_backup() -> BackupCreatedDTO:
    """Manually snapshot the current live file into the backup pool."""
    path = _state_path()
    if not path.exists():
        return BackupCreatedDTO(created=False, filename=None)
    created = _backups.create_backup(_data_dir(), path)
    return BackupCreatedDTO(
        created=created is not None,
        filename=created.name if created else None,
    )


@router.post("/state/restore/{filename}")
async def restore_tournament_backup(filename: str):
    """Replace the live file with the chosen backup, atomically."""
    path = _state_path()
    try:
        _backups.restore_backup(_data_dir(), path, filename)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"backup not found: {filename}")
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"restore failed: {e}")
    # Return the newly-current state so the client can rehydrate in one round trip.
    return await get_tournament_state()
