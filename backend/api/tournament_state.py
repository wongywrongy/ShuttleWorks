"""Whole-tournament state persistence (server-side JSON file).

GET returns 204 when no file yet, PUT overwrites atomically via temp-file
rename, stamping ``updatedAt`` server-side. Every PUT also rotates a
backup into ``./data/backups`` (last ``KEEP`` kept per stem).

If the live file is unreadable, GET auto-restores the most recent backup
and surfaces ``recoveredFromBackup: true`` in the payload so the UI can
notify the operator.
"""
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Response

from app.error_codes import ErrorCode, http_error
from app.paths import data_dir, ensure_data_dir
from app.time_utils import now_iso
from pydantic import BaseModel

from app.schemas import TournamentStateDTO
from api import _backups

router = APIRouter(prefix="/tournament", tags=["tournament-state"])
log = logging.getLogger("scheduler.tournament_state")

CURRENT_SCHEMA_VERSION = 2


def _state_path() -> Path:
    return data_dir() / "tournament.json"


def _migrate(raw: dict) -> dict:
    """Upgrade an older payload to ``CURRENT_SCHEMA_VERSION`` in place.

    Rejects payloads from a *newer* app version — the user must re-run the
    newer build. Legacy payloads with no ``version`` field default to 1
    (the initial shipping schema).
    """
    version = int(raw.get("version") or 1)
    if version > CURRENT_SCHEMA_VERSION:
        raise http_error(
            409,
            ErrorCode.STATE_TOO_NEW,
            f"state file schema version {version} is newer than this "
            f"app's {CURRENT_SCHEMA_VERSION}; upgrade the app or "
            f"restore an older backup",
        )
    # v1 → v2: introduces top-level ``scheduleVersion`` +
    # ``scheduleHistory`` for the proposal/commit pipeline, and three
    # nested TournamentConfig fields (``closedCourts``, ``courtClosures``,
    # ``clockShiftMinutes``) for closures + director time-axis tools.
    # Pydantic Field defaults would also fill these in at parse time,
    # but writing them explicitly here means the on-disk file matches
    # the in-memory shape after migration — easier to debug, easier
    # to back up, easier to diff.
    if version < 2:
        raw.setdefault("scheduleVersion", 0)
        raw.setdefault("scheduleHistory", [])
        cfg = raw.get("config")
        if isinstance(cfg, dict):
            cfg.setdefault("closedCourts", [])
            cfg.setdefault("courtClosures", [])
            cfg.setdefault("clockShiftMinutes", 0)
    raw["version"] = CURRENT_SCHEMA_VERSION
    return raw


def _read_with_recovery(path: Path) -> tuple[dict, Optional[str]]:
    """Load ``path`` or iterate backups newest→oldest until one parses.

    Returns ``(payload, recovered_from_filename_or_None)``. Delegates to
    ``_backups.read_with_recovery`` so tournament_state and match_state
    share one recovery path — a single corrupt backup no longer blocks
    recovery of older snapshots.
    """
    try:
        return _backups.read_with_recovery(data_dir(), path)
    except FileNotFoundError:
        raise http_error(
            500,
            ErrorCode.STATE_MISSING,
            "tournament state is missing and no backup exists; reset via Setup",
        )
    except ValueError as e:
        log.error("tournament-state recovery failed: %s", e)
        raise http_error(
            500,
            ErrorCode.STATE_CORRUPT,
            "tournament state unreadable; reset via Setup",
        )


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
        log.error("tournament-state read failed: %s", e)
        raise http_error(500, ErrorCode.STATE_CORRUPT, "could not read tournament state")

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
    ensure_data_dir()
    stamped = state.model_copy(
        update={
            "updatedAt": now_iso(),
            "version": CURRENT_SCHEMA_VERSION,
        }
    )
    path = _state_path()

    # Rotate a backup of the *previous* live file (if any) before stomping it.
    # The new state's tournament name is threaded through so the backup
    # filename reads as ``tournament-<slug>-<date>.json`` instead of a
    # bare timestamp.
    tournament_name = (stamped.config.tournamentName if stamped.config else None)
    try:
        _backups.create_backup(data_dir(), path, tournament_name)
    except OSError as e:
        # Backups are best-effort — don't block saving because of them.
        log.warning("backup rotation failed: %s", e)

    try:
        _backups.atomic_write_json(path, stamped.model_dump())
    except OSError as e:
        log.error("tournament-state write failed: %s", e)
        raise http_error(500, ErrorCode.STATE_WRITE_FAILED, "could not persist tournament state")
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
    entries = _backups.list_backups(data_dir(), _state_path().stem)
    return BackupListDTO(backups=[BackupEntryDTO(**e) for e in entries])


@router.post("/state/backup", response_model=BackupCreatedDTO)
async def create_tournament_backup() -> BackupCreatedDTO:
    """Manually snapshot the current live file into the backup pool."""
    path = _state_path()
    if not path.exists():
        return BackupCreatedDTO(created=False, filename=None)
    created = _backups.create_backup(data_dir(), path)
    return BackupCreatedDTO(
        created=created is not None,
        filename=created.name if created else None,
    )


@router.post("/state/restore/{filename}")
async def restore_tournament_backup(filename: str):
    """Replace the live file with the chosen backup, atomically."""
    path = _state_path()
    try:
        _backups.restore_backup(data_dir(), path, filename)
    except FileNotFoundError:
        raise http_error(404, ErrorCode.BACKUP_NOT_FOUND, f"backup not found: {filename}")
    except OSError as e:
        raise http_error(500, ErrorCode.BACKUP_RESTORE_FAILED, f"restore failed: {e}")
    # Return the newly-current state so the client can rehydrate in one round trip.
    return await get_tournament_state()
