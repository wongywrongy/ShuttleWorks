"""Whole-tournament state persistence (server-side, SQLite/Postgres-backed).

GET returns 204 when the ``tournaments`` table is empty. PUT upserts the
singleton row; the prior state is snapshotted into ``tournament_backups``
first. Backup management endpoints list / create / restore those rows
under the same paths the legacy JSON-file API exposed, so the frontend
contract is unchanged.

All persistence flows through ``repositories.LocalRepository``; the
route handlers stay thin.
"""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app.error_codes import ErrorCode, http_error
from app.schemas import TournamentStateDTO
from repositories import LocalRepository, get_repository
from repositories.local import CURRENT_TOURNAMENT_SCHEMA_VERSION as _CURRENT_SCHEMA_VERSION

# Re-exported so ``app/main.py``'s ``/health/deep`` keeps working without
# importing from the repositories layer directly.
CURRENT_SCHEMA_VERSION = _CURRENT_SCHEMA_VERSION

router = APIRouter(prefix="/tournament", tags=["tournament-state"])
log = logging.getLogger("scheduler.tournament_state")


@router.get("/state")
def get_tournament_state(repo: LocalRepository = Depends(get_repository)):
    """Return the persisted tournament state.

    204 No Content when no tournament row exists yet.
    """
    try:
        tournament = repo.tournaments.get_singleton()
    except HTTPException:
        raise
    except Exception as e:  # broad catch — SQLAlchemy raises many types
        log.error("tournament-state read failed: %s", e)
        raise http_error(500, ErrorCode.STATE_CORRUPT, "could not read tournament state")

    if tournament is None:
        return Response(status_code=204)
    return tournament.data


@router.put("/state", response_model=TournamentStateDTO)
def put_tournament_state(
    state: TournamentStateDTO,
    repo: LocalRepository = Depends(get_repository),
):
    """Overwrite the tournament state atomically.

    The prior content is snapshotted into ``tournament_backups`` before
    the new content is written. ``updatedAt`` and ``version`` are
    stamped server-side.
    """
    try:
        row = repo.commit_tournament_state(state.model_dump())
    except Exception as e:
        log.error("tournament-state write failed: %s", e)
        raise http_error(
            500, ErrorCode.STATE_WRITE_FAILED, "could not persist tournament state"
        )
    return TournamentStateDTO(**row.data)


# ---- Backup management endpoints --------------------------------------


class BackupEntryDTO(BaseModel):
    filename: str
    sizeBytes: int
    modifiedAt: str


class BackupListDTO(BaseModel):
    backups: List[BackupEntryDTO]


class BackupCreatedDTO(BaseModel):
    filename: str | None = None
    created: bool


def _to_entry(row) -> BackupEntryDTO:
    return BackupEntryDTO(
        filename=row.filename,
        sizeBytes=row.size_bytes,
        modifiedAt=row.created_at.isoformat(),
    )


@router.get("/state/backups", response_model=BackupListDTO)
def list_tournament_backups(
    repo: LocalRepository = Depends(get_repository),
) -> BackupListDTO:
    """Return the rolling-backup list, newest first."""
    current = repo.tournaments.get_singleton()
    if current is None:
        return BackupListDTO(backups=[])
    return BackupListDTO(
        backups=[_to_entry(b) for b in repo.backups.list_for_tournament(current.id)]
    )


@router.post("/state/backup", response_model=BackupCreatedDTO)
def create_tournament_backup(
    repo: LocalRepository = Depends(get_repository),
) -> BackupCreatedDTO:
    """Manually snapshot the current state into the backup pool."""
    backup = repo.snapshot_current_tournament()
    return BackupCreatedDTO(
        created=backup is not None,
        filename=backup.filename if backup else None,
    )


@router.post("/state/restore/{filename}")
def restore_tournament_backup(
    filename: str,
    repo: LocalRepository = Depends(get_repository),
):
    """Replace the live state with the chosen backup."""
    try:
        repo.restore_tournament_from_backup(filename)
    except FileNotFoundError:
        raise http_error(404, ErrorCode.BACKUP_NOT_FOUND, f"backup not found: {filename}")
    except Exception as e:
        log.error("restore failed: %s", e)
        raise http_error(500, ErrorCode.BACKUP_RESTORE_FAILED, f"restore failed: {e}")
    # Return the newly-current state so the client can rehydrate in one round trip.
    return get_tournament_state(repo)
