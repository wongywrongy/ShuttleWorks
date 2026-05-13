"""Multi-tournament HTTP boundary (Step 2 of the cloud-prep migration).

Replaces the singleton ``/tournament/state`` API with explicit-id CRUD
plus scoped state and backup endpoints under
``/tournaments/{tournament_id}/state``. The frontend dashboard (Step 6
proper, but bootstrapped here) lists rows via ``GET /tournaments`` and
opens one by navigating to ``/tournaments/{id}/...``.
"""
from __future__ import annotations

import logging
import uuid
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Path, Response
from pydantic import BaseModel, Field

from app.error_codes import ErrorCode, http_error
from app.schemas import TournamentStateDTO
from database.models import Tournament
from repositories import LocalRepository, get_repository

router = APIRouter(prefix="/tournaments", tags=["tournaments"])
log = logging.getLogger("scheduler.tournaments")

TournamentStatus = Literal["draft", "active", "archived"]


# ---- DTOs --------------------------------------------------------------


class TournamentSummaryDTO(BaseModel):
    """Dashboard row shape — light enough to render dozens without loading
    the full payload."""
    id: str
    name: Optional[str] = None
    status: TournamentStatus = "draft"
    tournamentDate: Optional[str] = None
    createdAt: str
    updatedAt: str


class TournamentCreateDTO(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    tournamentDate: Optional[str] = Field(default=None, max_length=32)


class TournamentUpdateDTO(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    status: Optional[TournamentStatus] = None
    tournamentDate: Optional[str] = Field(default=None, max_length=32)


class BackupEntryDTO(BaseModel):
    filename: str
    sizeBytes: int
    modifiedAt: str


class BackupListDTO(BaseModel):
    backups: List[BackupEntryDTO]


class BackupCreatedDTO(BaseModel):
    filename: Optional[str] = None
    created: bool


# ---- Helpers -----------------------------------------------------------


def _to_summary(row: Tournament) -> TournamentSummaryDTO:
    return TournamentSummaryDTO(
        id=str(row.id),
        name=row.name,
        status=row.status,  # type: ignore[arg-type]
        tournamentDate=row.tournament_date,
        createdAt=row.created_at.isoformat() if row.created_at else "",
        updatedAt=row.updated_at.isoformat() if row.updated_at else "",
    )


def _backup_entry(row) -> BackupEntryDTO:
    return BackupEntryDTO(
        filename=row.filename,
        sizeBytes=row.size_bytes,
        modifiedAt=row.created_at.isoformat(),
    )


def _resolve_tournament(
    tournament_id: uuid.UUID,
    repo: LocalRepository,
) -> Tournament:
    """Common 404 helper for the scoped routes."""
    row = repo.tournaments.get_by_id(tournament_id)
    if row is None:
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    return row


# ---- Tournament CRUD ---------------------------------------------------


@router.get("", response_model=List[TournamentSummaryDTO])
def list_tournaments(repo: LocalRepository = Depends(get_repository)):
    """Newest-first list. Step 6 layers status filter + ownership on top."""
    return [_to_summary(t) for t in repo.tournaments.list_all()]


@router.post("", response_model=TournamentSummaryDTO, status_code=201)
def create_tournament(
    body: TournamentCreateDTO,
    repo: LocalRepository = Depends(get_repository),
):
    """Create an empty tournament. ``state`` stays an empty blob until the
    first ``PUT /tournaments/{id}/state``."""
    row = repo.tournaments.create(
        name=body.name,
        tournament_date=body.tournamentDate,
    )
    return _to_summary(row)


@router.get("/{tournament_id}", response_model=TournamentSummaryDTO)
def get_tournament(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Return the summary row (id + denormalised metadata).

    The full ``TournamentStateDTO`` payload is served by
    ``GET /tournaments/{id}/state`` to keep this endpoint cheap for
    dashboard polling.
    """
    return _to_summary(_resolve_tournament(tournament_id, repo))


@router.patch("/{tournament_id}", response_model=TournamentSummaryDTO)
def update_tournament(
    body: TournamentUpdateDTO,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Partial update of name / status / tournament_date.

    The wire-format DTO uses camelCase ``tournamentDate``; we translate
    to the snake_case column name here.
    """
    fields: dict = {}
    if body.name is not None:
        fields["name"] = body.name
    if body.status is not None:
        fields["status"] = body.status
    if body.tournamentDate is not None:
        fields["tournament_date"] = body.tournamentDate

    row = repo.tournaments.update(tournament_id, fields)
    if row is None:
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    return _to_summary(row)


@router.delete("/{tournament_id}", status_code=204)
def delete_tournament(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Delete the tournament and CASCADE its match_states + backups."""
    if not repo.tournaments.delete(tournament_id):
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    return Response(status_code=204)


# ---- Scoped state routes -----------------------------------------------


@router.get("/{tournament_id}/state")
def get_tournament_state(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Return the persisted ``TournamentStateDTO`` blob.

    ``204 No Content`` when the tournament exists but its data is still
    empty (newly created, never PUT). 404 when the tournament itself
    doesn't exist.
    """
    row = _resolve_tournament(tournament_id, repo)
    if not row.data:
        return Response(status_code=204)
    return row.data


@router.put("/{tournament_id}/state", response_model=TournamentStateDTO)
def put_tournament_state(
    state: TournamentStateDTO,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Overwrite the tournament data blob.

    Snapshots the prior content to ``tournament_backups`` first (unless
    the row was freshly created with empty data) and rotates the backup
    pool to the configured retention (``LocalRepository.BACKUP_KEEP``).
    """
    _resolve_tournament(tournament_id, repo)  # 404 if missing
    try:
        row = repo.commit_tournament_state(tournament_id, state.model_dump())
    except KeyError:
        # Race: tournament deleted between resolve and commit. Map to 404.
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    except Exception as e:  # broad — SQLAlchemy raises many types
        log.error("tournament-state write failed: %s", e)
        raise http_error(
            500,
            ErrorCode.STATE_WRITE_FAILED,
            "could not persist tournament state",
        )
    return TournamentStateDTO(**row.data)


@router.get("/{tournament_id}/state/backups", response_model=BackupListDTO)
def list_tournament_backups(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    _resolve_tournament(tournament_id, repo)
    rows = repo.backups.list_for_tournament(tournament_id)
    return BackupListDTO(backups=[_backup_entry(r) for r in rows])


@router.post("/{tournament_id}/state/backup", response_model=BackupCreatedDTO)
def create_tournament_backup(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    _resolve_tournament(tournament_id, repo)
    backup = repo.snapshot_tournament(tournament_id)
    return BackupCreatedDTO(
        created=backup is not None,
        filename=backup.filename if backup else None,
    )


@router.post("/{tournament_id}/state/restore/{filename}")
def restore_tournament_backup(
    filename: str,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    _resolve_tournament(tournament_id, repo)
    try:
        repo.restore_tournament_from_backup(tournament_id, filename)
    except FileNotFoundError:
        raise http_error(
            404,
            ErrorCode.BACKUP_NOT_FOUND,
            f"backup not found: {filename}",
        )
    except Exception as e:
        log.error("restore failed: %s", e)
        raise http_error(
            500,
            ErrorCode.BACKUP_RESTORE_FAILED,
            f"restore failed: {e}",
        )
    return get_tournament_state(tournament_id, repo)
