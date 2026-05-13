"""Match state management API (SQLAlchemy-backed, tournament-scoped).

Live tournament-day match status — called / started / finished, plus
score and timing stamps. Backed by the legacy ``match_states`` table;
routes take ``tournament_id`` as a path parameter so multiple
tournaments stay isolated.

State-machine integration
-------------------------

The architecture-adjustment arc adds a typed ``MatchStatus`` enum on
the new ``matches`` table and a transition guard
(``services.match_state.assert_valid_transition``). The PUT/DELETE
routes here dual-write: they enforce the guard against the canonical
``matches.status``, then update both ``matches`` and ``match_states``
in a single request. The legacy enum carries a free-string ``started``
value which is translated to the new enum's ``playing`` at the route
boundary so neither side of the table pair drifts.

ETag / If-Match (Step D)
------------------------

Single-match mutation routes (PUT, DELETE) require an ``If-Match``
header whose value matches the current ``matches.version``. Missing
or stale headers return HTTP 412 Precondition Failed. The GET on a
single match returns the current version as an ``ETag`` response
header so the frontend always has the value to send back. A match
that hasn't been written yet has implicit version 0 — the first
successful write transitions to version 1.

Bulk / admin routes (``reset_all``, the two ``import_*`` handlers)
intentionally bypass both the transition guard *and* the If-Match
check — they're operator escape hatches for restore / re-seed flows
where per-resource versioning doesn't fit (one header can't carry
N match versions). The bulk routes still synchronise the
``matches`` table so the new state machine surface stays consistent.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Dict, Iterable, Literal, Optional

from fastapi import APIRouter, Depends, File, Path, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from app.dependencies import require_tournament_access
from app.error_codes import ErrorCode, http_error
from app.exceptions import PreconditionFailedError
from app.time_utils import now_iso
from database.models import MatchState, MatchStatus
from repositories import LocalRepository, get_repository
from services.match_state import assert_valid_transition


# Map the legacy free-string enum (also used in ``MatchStateDTO``) onto
# the typed ``MatchStatus`` the state machine speaks. ``started`` is
# the historical wire-format spelling for what the new model calls
# ``playing``; the table is single-direction (legacy → new) because the
# legacy DTO can't accept the new ``retired`` value.
_LEGACY_TO_CANONICAL = {
    "scheduled": MatchStatus.SCHEDULED,
    "called": MatchStatus.CALLED,
    "started": MatchStatus.PLAYING,
    "finished": MatchStatus.FINISHED,
}

router = APIRouter(
    prefix="/tournaments/{tournament_id}/match-states",
    tags=["match-states"],
)

# Convenience aliases so route decorators read cleanly. Step 5 spec:
# GET routes → viewer; writes → operator; tournament-level destructive
# (handled in api/tournaments.py) → owner.
_VIEWER = Depends(require_tournament_access("viewer"))
_OPERATOR = Depends(require_tournament_access("operator"))
log = logging.getLogger("scheduler.match_state")

# 20 MB import cap — anything larger isn't a legitimate match_states
# payload.
MAX_IMPORT_BYTES = 20 * 1024 * 1024


# DTOs — ``MatchStateStatusLiteral`` is the on-the-wire shape of the
# legacy enum (still used by the frontend); the canonical
# ``MatchStatus`` from ``database.models`` is the typed enum the new
# arc speaks internally.
MatchStateStatusLiteral = Literal["scheduled", "called", "started", "finished"]


class MatchScore(BaseModel):
    sideA: int = Field(..., ge=0, le=99)
    sideB: int = Field(..., ge=0, le=99)


class MatchStateDTO(BaseModel):
    matchId: str
    status: MatchStateStatusLiteral = "scheduled"
    calledAt: Optional[str] = None  # ISO-8601 UTC
    actualStartTime: Optional[str] = None  # ISO-8601 UTC
    actualEndTime: Optional[str] = None  # ISO-8601 UTC
    score: Optional[MatchScore] = None
    notes: Optional[str] = None
    updatedAt: Optional[str] = None
    originalSlotId: Optional[int] = None
    originalCourtId: Optional[int] = None

    @field_validator("status", mode="before")
    @classmethod
    def coerce_unknown_status(cls, v):
        if v in ("scheduled", "called", "started", "finished"):
            return v
        return "scheduled"

    model_config = {"extra": "allow"}


# ---- DTO <-> ORM translation -------------------------------------------


def _dto_to_fields(update: MatchStateDTO) -> dict:
    """Convert a wire-format DTO into ORM column kwargs."""
    fields: dict = {
        "status": update.status,
        "called_at": update.calledAt,
        "actual_start_time": update.actualStartTime,
        "actual_end_time": update.actualEndTime,
        "notes": update.notes,
        "original_slot_id": update.originalSlotId,
        "original_court_id": update.originalCourtId,
    }
    if update.score is not None:
        fields["score_side_a"] = update.score.sideA
        fields["score_side_b"] = update.score.sideB
    else:
        fields["score_side_a"] = None
        fields["score_side_b"] = None
    return fields


def _row_to_dto(row: MatchState) -> MatchStateDTO:
    score = None
    if row.score_side_a is not None and row.score_side_b is not None:
        score = MatchScore(sideA=row.score_side_a, sideB=row.score_side_b)
    return MatchStateDTO(
        matchId=row.match_id,
        status=row.status,  # type: ignore[arg-type]
        calledAt=row.called_at,
        actualStartTime=row.actual_start_time,
        actualEndTime=row.actual_end_time,
        score=score,
        notes=row.notes,
        updatedAt=row.updated_at.isoformat() if row.updated_at else None,
        originalSlotId=row.original_slot_id,
        originalCourtId=row.original_court_id,
    )


def _ensure_tournament(repo: LocalRepository, tournament_id: uuid.UUID) -> uuid.UUID:
    """404 if the tournament doesn't exist; otherwise return its id."""
    if repo.tournaments.get_by_id(tournament_id) is None:
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    return tournament_id


def _current_match_status(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    match_id: str,
) -> MatchStatus:
    """Read the canonical ``matches.status`` for the transition guard.

    Falls back to ``SCHEDULED`` when no row exists yet — that's the
    default state for any match the schedule-commit projection hasn't
    touched. The fallback matches the existing route behaviour where
    an un-seen match_id was implicitly ``scheduled``.
    """
    row = repo.matches.get(tournament_id, match_id)
    if row is None:
        return MatchStatus.SCHEDULED
    try:
        return MatchStatus(row.status)
    except ValueError:
        # Defensive: an unexpected value in the column shouldn't crash
        # the route. Treat it as ``SCHEDULED`` so the guard at least
        # blocks terminal-state writes.
        log.warning(
            "match %s in tournament %s has unknown status %r; defaulting to SCHEDULED",
            match_id,
            tournament_id,
            row.status,
        )
        return MatchStatus.SCHEDULED


def _sync_canonical_status(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    match_id: str,
    target: MatchStatus,
) -> None:
    """Mirror the operator's status change into the new ``matches`` row.

    The route-level transition guard and (Step D) If-Match check have
    already run by this point; the repo write doesn't re-check
    expected_version because that would double-count the version
    semantics.
    """
    repo.matches.set_status(tournament_id, match_id, target)


def _current_match_version(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    match_id: str,
) -> int:
    """Return ``matches.version`` for the row, or ``0`` if no row exists yet.

    Version ``0`` is the implicit pre-write state; the first
    successful write through ``repo.matches.upsert`` creates the row
    at version ``1``. A client sending ``If-Match: "0"`` is correctly
    asserting "I expect no prior row" and is allowed to create.
    """
    row = repo.matches.get(tournament_id, match_id)
    return row.version if row is not None else 0


def _precondition_failed(match_id: str, message: str) -> PreconditionFailedError:
    """Build the domain exception the 412 handler in app.main translates.

    Routed through ``PreconditionFailedError`` rather than a raw
    ``HTTPException`` so the response body is flat
    (``{"error": "precondition_failed", ...}``) — same shape as the 409
    ``ConflictError`` handler emits. Frontend has one parser.
    """
    return PreconditionFailedError(match_id=match_id, message=message)


def _parse_if_match_header(raw: Optional[str]) -> Optional[int]:
    """Parse an If-Match header value into an integer version.

    Accepts the RFC 7232 quoted form (``"5"``) plus the unquoted
    ``5`` form. Returns ``None`` for an unparseable value so the
    caller can surface a 412 with a precise message; returns the
    integer on success.
    """
    if raw is None:
        return None
    value = raw.strip()
    if value.startswith("W/"):
        value = value[2:].strip()
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        value = value[1:-1]
    try:
        return int(value)
    except ValueError:
        return None


def _enforce_if_match(
    request: Request,
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    match_id: str,
) -> int:
    """Verify the request's ``If-Match`` header against the current
    ``matches.version``. Raises 412 on missing or stale. Returns the
    current version (the value the response ``ETag`` will carry on
    success — incremented after the write).
    """
    raw = request.headers.get("If-Match")
    if raw is None:
        raise _precondition_failed(
            match_id,
            "If-Match header required for match mutations",
        )
    parsed = _parse_if_match_header(raw)
    if parsed is None:
        raise _precondition_failed(
            match_id,
            f"If-Match header is not a valid version: {raw!r}",
        )
    current = _current_match_version(repo, tournament_id, match_id)
    if parsed != current:
        raise _precondition_failed(
            match_id,
            (
                f"Match version is {current}; If-Match sent {parsed}. "
                "Reload and retry."
            ),
        )
    return current


# ---------- API endpoints -------------------------------------------------


@router.get("", response_model=Dict[str, MatchStateDTO], dependencies=[_VIEWER])
def get_all_match_states(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Get all match states for the tournament."""
    tid = _ensure_tournament(repo, tournament_id)
    rows = repo.match_states.list_for_tournament(tid)
    return {row.match_id: _row_to_dto(row) for row in rows}


@router.get("/{match_id}", response_model=MatchStateDTO, dependencies=[_VIEWER])
def get_match_state(
    match_id: str,
    response: Response,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Get a single match state, or a default `scheduled` if unseen.

    Step D: the response carries ``ETag: "<matches.version>"`` so the
    client has the current version to send back on its next write.
    Unseen matches return ``ETag: "0"`` — the implicit pre-write
    version that the first ``If-Match`` write should reference.
    """
    tid = _ensure_tournament(repo, tournament_id)
    version = _current_match_version(repo, tid, match_id)
    response.headers["ETag"] = f'"{version}"'
    row = repo.match_states.get(tid, match_id)
    if row is None:
        return MatchStateDTO(matchId=match_id, status="scheduled")
    return _row_to_dto(row)


@router.put("/{match_id}", response_model=MatchStateDTO, dependencies=[_OPERATOR])
def update_match_state(
    match_id: str,
    update: MatchStateDTO,
    request: Request,
    response: Response,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Update a match state.

    Step D: the request must carry an ``If-Match`` header whose value
    matches the current ``matches.version`` (``"0"`` for a brand-new
    match). Missing or stale headers return 412 Precondition Failed.

    Enforces the state-machine transition guard against the canonical
    ``matches.status`` before writing. A ``ConflictError`` bubbles up
    to the FastAPI handler in ``app.main`` and surfaces as HTTP 409.
    The legacy ``match_states`` table and the new ``matches`` row are
    updated together so neither side drifts. The response carries
    ``ETag: "<new_version>"`` so the client has the value to send
    back on the next write.
    """
    tid = _ensure_tournament(repo, tournament_id)
    _enforce_if_match(request, repo, tid, match_id)

    update.matchId = match_id
    update.updatedAt = now_iso()

    target = _LEGACY_TO_CANONICAL.get(update.status, MatchStatus.SCHEDULED)
    current = _current_match_status(repo, tid, match_id)
    # Same-state writes (PUT that re-asserts the current status) are
    # legitimate no-ops in the live-ops UX and short-circuit before the
    # strict transition guard. The guard itself raises on any
    # ``current → current`` per the prompt's specification, so this
    # carve-out lives at the route boundary, not in the service.
    if target != current:
        assert_valid_transition(match_id, current, target)

    try:
        row = repo.match_states.upsert(tid, match_id, _dto_to_fields(update))
        _sync_canonical_status(repo, tid, match_id, target)
    except Exception as e:
        log.error("match-state write failed: %s", e)
        raise http_error(
            500,
            ErrorCode.MATCH_STATE_WRITE_FAILED,
            "could not persist match state",
        )

    new_version = _current_match_version(repo, tid, match_id)
    response.headers["ETag"] = f'"{new_version}"'
    return _row_to_dto(row)


@router.delete("/{match_id}", dependencies=[_OPERATOR])
def delete_match_state(
    match_id: str,
    request: Request,
    response: Response,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Remove a match state (reset to default).

    Step D: the request must carry an ``If-Match`` header whose
    value matches the current ``matches.version``. This stops a
    stale client from rolling a match it didn't observe back to
    ``scheduled``.

    Admin override on the transition side: bypasses the transition
    guard so an operator can unblock a stuck terminal state. Also
    resets the canonical ``matches.status`` to ``scheduled`` so
    subsequent transitions start from a clean baseline. The
    response's ``ETag`` reflects the post-reset version.
    """
    tid = _ensure_tournament(repo, tournament_id)
    _enforce_if_match(request, repo, tid, match_id)

    repo.match_states.delete(tid, match_id)
    # Same-state writes are no-ops in set_status; if matches.status was
    # already 'scheduled' nothing changes (no version bump).
    repo.matches.set_status(tid, match_id, MatchStatus.SCHEDULED)

    new_version = _current_match_version(repo, tid, match_id)
    response.headers["ETag"] = f'"{new_version}"'
    return {"message": f"Match state for {match_id} deleted successfully"}


@router.post("/reset", dependencies=[_OPERATOR])
def reset_all_match_states(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Clear all match states for the tournament.

    Admin override: bypasses the transition guard. Every canonical
    ``matches.status`` resets to ``scheduled`` (the new arc's default).
    """
    tid = _ensure_tournament(repo, tournament_id)
    repo.match_states.reset_all(tid)
    for row in repo.matches.list_for_tournament(tid):
        if row.status != MatchStatus.SCHEDULED.value:
            repo.matches.set_status(tid, row.id, MatchStatus.SCHEDULED)
    return {"message": "All match states reset successfully"}


@router.get("/export/download", dependencies=[_VIEWER])
def export_match_states(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Download the match states as a JSON file in the legacy shape."""
    tid = _ensure_tournament(repo, tournament_id)
    rows: Iterable[MatchState] = repo.match_states.list_for_tournament(tid)
    payload = {
        "matchStates": {
            row.match_id: _row_to_dto(row).model_dump() for row in rows
        },
        "lastUpdated": now_iso(),
        "version": "1.0",
    }
    headers = {"Content-Disposition": 'attachment; filename="match_states.json"'}
    return JSONResponse(content=payload, headers=headers)


@router.post("/import/upload", dependencies=[_OPERATOR])
async def import_match_states(
    request: Request,
    file: UploadFile = File(...),
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Upload a match_states.json file and replace the current contents."""
    if not (file.filename or "").endswith(".json"):
        raise http_error(400, ErrorCode.UPLOAD_WRONG_TYPE, "file must be a .json file")

    declared_length = request.headers.get("content-length")
    if declared_length and declared_length.isdigit():
        if int(declared_length) > MAX_IMPORT_BYTES:
            raise http_error(413, ErrorCode.UPLOAD_TOO_LARGE, "upload too large")

    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise http_error(413, ErrorCode.UPLOAD_TOO_LARGE, "upload too large")

    try:
        data = json.loads(content.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise http_error(400, ErrorCode.UPLOAD_INVALID_JSON, "invalid JSON file")

    try:
        match_states_raw = data.get("matchStates", {})
        match_states = {
            mid: MatchStateDTO(**(payload | {"matchId": mid}))
            for mid, payload in match_states_raw.items()
        }
    except Exception as e:
        log.warning("match-state import validation failed: %s", e)
        raise http_error(
            400, ErrorCode.UPLOAD_SCHEMA_MISMATCH, "payload does not match schema"
        )

    tid = _ensure_tournament(repo, tournament_id)
    repo.match_states.reset_all(tid)
    repo.match_states.bulk_upsert(
        tid,
        {mid: _dto_to_fields(dto) for mid, dto in match_states.items()},
    )
    _bulk_sync_canonical_statuses(repo, tid, match_states)
    return {
        "message": "Tournament state imported successfully",
        "matchCount": len(match_states),
        "lastUpdated": data.get("lastUpdated", now_iso()),
    }


@router.post("/import-bulk", dependencies=[_OPERATOR])
def import_match_states_bulk(
    match_states: Dict[str, MatchStateDTO],
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Merge a dict of match states into the current set."""
    if not match_states:
        return {"message": "No match states to import", "importedCount": 0}

    tid = _ensure_tournament(repo, tournament_id)
    fields_map: dict[str, dict] = {}
    for match_id, ms in match_states.items():
        ms.matchId = match_id
        ms.updatedAt = now_iso()
        fields_map[match_id] = _dto_to_fields(ms)
    repo.match_states.bulk_upsert(tid, fields_map)
    _bulk_sync_canonical_statuses(repo, tid, match_states)
    total = len(repo.match_states.list_for_tournament(tid))
    return {
        "message": "Match states imported successfully",
        "importedCount": len(match_states),
        "totalStates": total,
    }


def _bulk_sync_canonical_statuses(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    match_states: Dict[str, "MatchStateDTO"],
) -> None:
    """Mirror a bulk match-state import into the canonical ``matches`` table.

    Bypasses the transition guard intentionally — bulk imports are the
    admin restore path, not a runtime transition. Each row's
    ``MatchStateDTO.status`` is translated through ``_LEGACY_TO_CANONICAL``
    and applied via ``set_status`` so the new arc's table stays
    consistent with what the operator just imported.
    """
    for match_id, dto in match_states.items():
        target = _LEGACY_TO_CANONICAL.get(dto.status, MatchStatus.SCHEDULED)
        repo.matches.set_status(tournament_id, match_id, target)
