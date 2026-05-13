"""Match state management API (SQLAlchemy-backed).

Live tournament-day match status — called / started / finished, plus
score and timing stamps. Backed by the ``match_states`` table, scoped to
the singleton tournament for Step 1 (Step 2 will introduce explicit
``tournament_id`` in the route URL).
"""
from __future__ import annotations

import json
import logging
from typing import Dict, Iterable, Literal, Optional

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from app.error_codes import ErrorCode, http_error
from app.time_utils import now_iso
from database.models import MatchState
from repositories import LocalRepository, get_repository

router = APIRouter(prefix="/match-states", tags=["match-states"])
log = logging.getLogger("scheduler.match_state")

# 20 MB import cap — anything larger isn't a legitimate match_states
# payload.
MAX_IMPORT_BYTES = 20 * 1024 * 1024


# DTOs
MatchStatus = Literal["scheduled", "called", "started", "finished"]


class MatchScore(BaseModel):
    sideA: int = Field(..., ge=0, le=99)
    sideB: int = Field(..., ge=0, le=99)


class MatchStateDTO(BaseModel):
    matchId: str
    status: MatchStatus = "scheduled"
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


def _require_tournament_id(repo: LocalRepository):
    """Resolve the singleton tournament id, auto-creating an empty row
    on first write.

    Legacy parity: the JSON-file backend let ``PUT /match-states/...``
    succeed before a tournament had been saved. We preserve that by
    creating an empty placeholder tournament. Step 2 makes
    ``tournament_id`` explicit in the URL and this fallback retires.
    """
    current = repo.tournaments.get_singleton()
    if current is None:
        current = repo.tournaments.upsert_singleton({})
    return current.id


# ---------- API endpoints -------------------------------------------------


@router.get("", response_model=Dict[str, MatchStateDTO])
def get_all_match_states(repo: LocalRepository = Depends(get_repository)):
    """Get all match states. Empty dict when no tournament exists yet."""
    current = repo.tournaments.get_singleton()
    if current is None:
        return {}
    rows = repo.match_states.list_for_tournament(current.id)
    return {row.match_id: _row_to_dto(row) for row in rows}


@router.get("/{match_id}", response_model=MatchStateDTO)
def get_match_state(
    match_id: str,
    repo: LocalRepository = Depends(get_repository),
):
    """Get a single match state, or a default `scheduled` if unseen."""
    current = repo.tournaments.get_singleton()
    if current is None:
        return MatchStateDTO(matchId=match_id, status="scheduled")
    row = repo.match_states.get(current.id, match_id)
    if row is None:
        return MatchStateDTO(matchId=match_id, status="scheduled")
    return _row_to_dto(row)


@router.put("/{match_id}", response_model=MatchStateDTO)
def update_match_state(
    match_id: str,
    update: MatchStateDTO,
    repo: LocalRepository = Depends(get_repository),
):
    """Update a match state."""
    tid = _require_tournament_id(repo)
    update.matchId = match_id
    update.updatedAt = now_iso()
    try:
        row = repo.match_states.upsert(tid, match_id, _dto_to_fields(update))
    except Exception as e:
        log.error("match-state write failed: %s", e)
        raise http_error(
            500,
            ErrorCode.MATCH_STATE_WRITE_FAILED,
            "could not persist match state",
        )
    return _row_to_dto(row)


@router.delete("/{match_id}")
def delete_match_state(
    match_id: str,
    repo: LocalRepository = Depends(get_repository),
):
    """Remove a match state (reset to default)."""
    tid = _require_tournament_id(repo)
    repo.match_states.delete(tid, match_id)
    return {"message": f"Match state for {match_id} deleted successfully"}


@router.post("/reset")
def reset_all_match_states(repo: LocalRepository = Depends(get_repository)):
    """Clear all match states for the singleton tournament."""
    current = repo.tournaments.get_singleton()
    if current is None:
        return {"message": "All match states reset successfully"}
    repo.match_states.reset_all(current.id)
    return {"message": "All match states reset successfully"}


@router.get("/export/download")
def export_match_states(repo: LocalRepository = Depends(get_repository)):
    """Download the match states as a JSON file in the legacy shape."""
    current = repo.tournaments.get_singleton()
    rows: Iterable[MatchState] = []
    if current is not None:
        rows = repo.match_states.list_for_tournament(current.id)
    payload = {
        "matchStates": {
            row.match_id: _row_to_dto(row).model_dump() for row in rows
        },
        "lastUpdated": now_iso(),
        "version": "1.0",
    }
    headers = {"Content-Disposition": 'attachment; filename="match_states.json"'}
    return JSONResponse(content=payload, headers=headers)


@router.post("/import/upload")
async def import_match_states(
    request: Request,
    file: UploadFile = File(...),
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

    tid = _require_tournament_id(repo)
    repo.match_states.reset_all(tid)
    repo.match_states.bulk_upsert(
        tid,
        {mid: _dto_to_fields(dto) for mid, dto in match_states.items()},
    )
    return {
        "message": "Tournament state imported successfully",
        "matchCount": len(match_states),
        "lastUpdated": data.get("lastUpdated", now_iso()),
    }


@router.post("/import-bulk")
def import_match_states_bulk(
    match_states: Dict[str, MatchStateDTO],
    repo: LocalRepository = Depends(get_repository),
):
    """Merge a dict of match states into the current set."""
    if not match_states:
        return {"message": "No match states to import", "importedCount": 0}

    tid = _require_tournament_id(repo)
    fields_map: dict[str, dict] = {}
    for match_id, ms in match_states.items():
        ms.matchId = match_id
        ms.updatedAt = now_iso()
        fields_map[match_id] = _dto_to_fields(ms)
    repo.match_states.bulk_upsert(tid, fields_map)
    total = len(repo.match_states.list_for_tournament(tid))
    return {
        "message": "Match states imported successfully",
        "importedCount": len(match_states),
        "totalStates": total,
    }
