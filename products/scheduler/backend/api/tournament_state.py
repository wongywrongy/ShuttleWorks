"""Whole-tournament state persistence (server-side JSON file).

GET returns 204 when no file yet, PUT overwrites atomically via temp-file
rename, stamping ``updatedAt`` server-side. Every PUT also rotates a
backup (last ``KEEP`` kept per stem).

All filesystem I/O is delegated to ``services.persistence.PersistenceService``;
the routes are thin adapters that translate HTTP errors and call the
service.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response

from app.error_codes import ErrorCode, http_error
from app.schemas import TournamentStateDTO
from pydantic import BaseModel

from services.persistence import (
    CURRENT_TOURNAMENT_SCHEMA_VERSION as CURRENT_SCHEMA_VERSION,
    PersistenceService,
    get_persistence,
)

router = APIRouter(prefix="/tournament", tags=["tournament-state"])
log = logging.getLogger("scheduler.tournament_state")


@router.get("/state")
async def get_tournament_state(svc: PersistenceService = Depends(get_persistence)):
    """Return the persisted tournament state.

    204 No Content when no state has been saved yet. Payload gains a
    ``recoveredFromBackup`` field when a corrupt file was auto-repaired.
    """
    try:
        data, recovered_from = await svc.read_tournament_state()
    except HTTPException:
        raise
    except OSError as e:
        log.error("tournament-state read failed: %s", e)
        raise http_error(500, ErrorCode.STATE_CORRUPT, "could not read tournament state")
    except ValueError as e:
        log.error("tournament-state recovery failed: %s", e)
        raise http_error(
            500, ErrorCode.STATE_CORRUPT, "tournament state unreadable; reset via Setup"
        )

    if data is None:
        return Response(status_code=204)
    if recovered_from is not None:
        data["recoveredFromBackup"] = recovered_from
    return data


@router.put("/state", response_model=TournamentStateDTO)
async def put_tournament_state(
    state: TournamentStateDTO,
    svc: PersistenceService = Depends(get_persistence),
):
    """Overwrite the tournament state atomically.

    Backup of the previous live file is rotated before the new state is
    written. The server stamps ``updatedAt`` so two tabs can agree on
    ordering.
    """
    try:
        stamped = await svc.write_tournament_state(state.model_dump())
    except OSError as e:
        log.error("tournament-state write failed: %s", e)
        raise http_error(
            500, ErrorCode.STATE_WRITE_FAILED, "could not persist tournament state"
        )
    return TournamentStateDTO(**{k: v for k, v in stamped.items() if k != "_integrity"})


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
async def list_tournament_backups(
    svc: PersistenceService = Depends(get_persistence),
) -> BackupListDTO:
    """Return the rolling-backup list, newest first."""
    entries = await svc.list_tournament_backups()
    return BackupListDTO(backups=[BackupEntryDTO(**e) for e in entries])


@router.post("/state/backup", response_model=BackupCreatedDTO)
async def create_tournament_backup(
    svc: PersistenceService = Depends(get_persistence),
) -> BackupCreatedDTO:
    """Manually snapshot the current live file into the backup pool."""
    created = await svc.create_tournament_backup()
    return BackupCreatedDTO(
        created=created is not None,
        filename=created.name if created else None,
    )


@router.post("/state/restore/{filename}")
async def restore_tournament_backup(
    filename: str,
    svc: PersistenceService = Depends(get_persistence),
):
    """Replace the live file with the chosen backup, atomically."""
    try:
        await svc.restore_tournament_backup(filename)
    except FileNotFoundError:
        raise http_error(404, ErrorCode.BACKUP_NOT_FOUND, f"backup not found: {filename}")
    except OSError as e:
        raise http_error(500, ErrorCode.BACKUP_RESTORE_FAILED, f"restore failed: {e}")
    # Return the newly-current state so the client can rehydrate in one round trip.
    return await get_tournament_state(svc)
