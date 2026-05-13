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

from app.dependencies import (
    AuthUser,
    get_current_user,
    require_tournament_access,
)
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
    the full payload.

    Step 6 added ``role`` (the requesting user's role on this
    tournament; always non-null in the list response because the list
    is filtered to memberships) and ``ownerName`` (the owner's email,
    denormalised at create time — see ``Tournament.owner_email``).
    """
    id: str
    name: Optional[str] = None
    status: TournamentStatus = "draft"
    tournamentDate: Optional[str] = None
    createdAt: str
    updatedAt: str
    role: Optional[str] = None
    ownerName: Optional[str] = None


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


def _to_summary(
    row: Tournament,
    *,
    role: Optional[str] = None,
) -> TournamentSummaryDTO:
    return TournamentSummaryDTO(
        id=str(row.id),
        name=row.name,
        status=row.status,  # type: ignore[arg-type]
        tournamentDate=row.tournament_date,
        createdAt=row.created_at.isoformat() if row.created_at else "",
        updatedAt=row.updated_at.isoformat() if row.updated_at else "",
        role=role,
        ownerName=row.owner_email,
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
def list_tournaments(
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Newest-first list, filtered to tournaments the caller is a member
    of. Each row carries the caller's role on that tournament so the
    Step 6 dashboard can split owned vs shared without an extra
    request.
    """
    user_uuid = user.as_uuid()
    if user_uuid is None:
        return []
    # Resolve every (tournament_id, role) pair for the caller up front
    # so the list response can carry the role per row without an N+1
    # lookup. ``list_all`` is already newest-first.
    role_by_tournament: dict = {}
    for tid in repo.members.list_tournament_ids_for_user(user_uuid):
        role = repo.members.get_role(tid, user_uuid)
        if role is not None:
            role_by_tournament[tid] = role
    return [
        _to_summary(t, role=role_by_tournament[t.id])
        for t in repo.tournaments.list_all()
        if t.id in role_by_tournament
    ]


@router.post("", response_model=TournamentSummaryDTO, status_code=201)
def create_tournament(
    body: TournamentCreateDTO,
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Create an empty tournament. The current user is stamped as the
    owner — both on the ``tournaments.owner_id`` column and as a
    ``tournament_members`` row with ``role='owner'`` — so the same
    user can immediately read / write / delete the new tournament via
    the role-checked endpoints. ``owner_email`` is denormalised here
    so Step 6's "Shared with You" dashboard rows can show who the
    tournament belongs to without a Supabase auth join.
    """
    user_uuid = user.as_uuid()
    row = repo.tournaments.create(
        name=body.name,
        tournament_date=body.tournamentDate,
        owner_id=user_uuid,
        owner_email=user.email,
    )
    if user_uuid is not None:
        repo.members.add_member(row.id, user_uuid, role="owner")
    return _to_summary(row, role="owner")


@router.get(
    "/{tournament_id}",
    response_model=TournamentSummaryDTO,
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def get_tournament(
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Return the summary row (id + denormalised metadata).

    The full ``TournamentStateDTO`` payload is served by
    ``GET /tournaments/{id}/state`` to keep this endpoint cheap for
    dashboard polling. ``role`` is included so the frontend can hide
    owner-only affordances without a separate request.
    """
    row = _resolve_tournament(tournament_id, repo)
    role: Optional[str] = None
    user_uuid = user.as_uuid()
    if user_uuid is not None:
        role = repo.members.get_role(tournament_id, user_uuid)
    return _to_summary(row, role=role)


@router.patch(
    "/{tournament_id}",
    response_model=TournamentSummaryDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def update_tournament(
    body: TournamentUpdateDTO,
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
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
    role: Optional[str] = None
    user_uuid = user.as_uuid()
    if user_uuid is not None:
        role = repo.members.get_role(tournament_id, user_uuid)
    return _to_summary(row, role=role)


@router.delete(
    "/{tournament_id}",
    status_code=204,
    dependencies=[Depends(require_tournament_access("owner"))],
)
def delete_tournament(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Delete the tournament and CASCADE its match_states + backups +
    members + invite_links."""
    if not repo.tournaments.delete(tournament_id):
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    return Response(status_code=204)


# ---- Scoped state routes -----------------------------------------------


@router.get(
    "/{tournament_id}/state",
    dependencies=[Depends(require_tournament_access("viewer"))],
)
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


@router.put(
    "/{tournament_id}/state",
    response_model=TournamentStateDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
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
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    except Exception as e:
        log.error("tournament-state write failed: %s", e)
        raise http_error(
            500,
            ErrorCode.STATE_WRITE_FAILED,
            "could not persist tournament state",
        )
    return TournamentStateDTO(**row.data)


@router.get(
    "/{tournament_id}/state/backups",
    response_model=BackupListDTO,
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def list_tournament_backups(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    _resolve_tournament(tournament_id, repo)
    rows = repo.backups.list_for_tournament(tournament_id)
    return BackupListDTO(backups=[_backup_entry(r) for r in rows])


@router.post(
    "/{tournament_id}/state/backup",
    response_model=BackupCreatedDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
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


@router.post(
    "/{tournament_id}/state/restore/{filename}",
    dependencies=[Depends(require_tournament_access("owner"))],
)
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
