"""Match state management API.

Tournament-day match states (called / started / finished + scores) are
persisted to ``./data/match_states.json``. All filesystem I/O is
delegated to ``services.persistence.PersistenceService``, which owns the
single write lock shared with ``/tournament/state``.
"""
from __future__ import annotations

import json
import logging
from typing import Dict, Literal, Optional

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from app.error_codes import ErrorCode, http_error
from app.time_utils import now_iso
from services.persistence import PersistenceService, get_persistence

router = APIRouter(prefix="/match-states", tags=["match-states"])
log = logging.getLogger("scheduler.match_state")

# Import payload cap. Anything larger is almost certainly not a
# legitimate match_states.json — cap at 20 MB to bound memory.
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
    # Persisted so Undo survives a page reload.
    originalSlotId: Optional[int] = None
    originalCourtId: Optional[int] = None

    @field_validator("status", mode="before")
    @classmethod
    def coerce_unknown_status(cls, v):
        if v in ("scheduled", "called", "started", "finished"):
            return v
        return "scheduled"

    model_config = {"extra": "allow"}


class TournamentStateFile(BaseModel):
    matchStates: Dict[str, MatchStateDTO]
    lastUpdated: str
    version: str = "1.0"


def _parse_file(data: dict) -> TournamentStateFile:
    try:
        return TournamentStateFile(**data)
    except Exception as e:
        log.error("match-state schema mismatch: %s", e)
        raise http_error(
            500,
            ErrorCode.STATE_SCHEMA_MISMATCH,
            "match state schema mismatch; reset via Setup",
        )


# ---------- API endpoints -------------------------------------------------


@router.get("", response_model=Dict[str, MatchStateDTO])
async def get_all_match_states(svc: PersistenceService = Depends(get_persistence)):
    """Get all match states."""
    data = await svc.read_match_states()
    return _parse_file(data).matchStates


@router.get("/{match_id}", response_model=MatchStateDTO)
async def get_match_state(
    match_id: str, svc: PersistenceService = Depends(get_persistence)
):
    """Get a single match state, or a default `scheduled` if unseen."""
    data = await svc.read_match_states()
    state = _parse_file(data)
    if match_id not in state.matchStates:
        return MatchStateDTO(matchId=match_id, status="scheduled")
    return state.matchStates[match_id]


@router.put("/{match_id}", response_model=MatchStateDTO)
async def update_match_state(
    match_id: str,
    update: MatchStateDTO,
    svc: PersistenceService = Depends(get_persistence),
):
    """Update a match state."""
    update.matchId = match_id
    update.updatedAt = now_iso()

    def mutate(data: dict) -> dict:
        state = _parse_file(data)
        state.matchStates[match_id] = update
        return state.model_dump()

    try:
        await svc.update_match_states(mutate)
    except OSError as e:
        log.error("match-state write failed: %s", e)
        raise http_error(
            500,
            ErrorCode.MATCH_STATE_WRITE_FAILED,
            "could not persist match state",
        )
    return update


@router.delete("/{match_id}")
async def delete_match_state(
    match_id: str, svc: PersistenceService = Depends(get_persistence)
):
    """Remove a match state (reset to default)."""
    def mutate(data: dict) -> dict:
        state = _parse_file(data)
        state.matchStates.pop(match_id, None)
        return state.model_dump()

    await svc.update_match_states(mutate)
    return {"message": f"Match state for {match_id} deleted successfully"}


@router.post("/reset")
async def reset_all_match_states(svc: PersistenceService = Depends(get_persistence)):
    """Clear all match states (empty the file)."""
    await svc.write_match_states(
        {"matchStates": {}, "lastUpdated": now_iso(), "version": "1.0"}
    )
    return {"message": "All match states reset successfully"}


@router.get("/export/download")
async def export_match_states(svc: PersistenceService = Depends(get_persistence)):
    """Download the match_states.json file."""
    path = svc.match_states_path
    if not path.exists():
        # Make sure a baseline file exists so FileResponse has something to serve.
        await svc.write_match_states(
            {"matchStates": {}, "lastUpdated": now_iso(), "version": "1.0"}
        )
    return FileResponse(
        path=path,
        filename="match_states.json",
        media_type="application/json",
    )


@router.post("/import/upload")
async def import_match_states(
    request: Request,
    file: UploadFile = File(...),
    svc: PersistenceService = Depends(get_persistence),
):
    """Upload and import a match_states.json file."""
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
        state = TournamentStateFile(**data)
    except Exception as e:
        log.warning("match-state import validation failed: %s", e)
        raise http_error(
            400, ErrorCode.UPLOAD_SCHEMA_MISMATCH, "payload does not match schema"
        )

    await svc.write_match_states(state.model_dump())
    return {
        "message": "Tournament state imported successfully",
        "matchCount": len(state.matchStates),
        "lastUpdated": state.lastUpdated,
    }


@router.post("/import-bulk")
async def import_match_states_bulk(
    match_states: Dict[str, MatchStateDTO],
    svc: PersistenceService = Depends(get_persistence),
):
    """Merge a dict of match states into the existing file."""
    if not match_states:
        return {"message": "No match states to import", "importedCount": 0}

    def mutate(data: dict) -> dict:
        state = _parse_file(data)
        for match_id, ms in match_states.items():
            ms.matchId = match_id
            ms.updatedAt = now_iso()
            state.matchStates[match_id] = ms
        return state.model_dump()

    result = await svc.update_match_states(mutate)
    return {
        "message": "Match states imported successfully",
        "importedCount": len(match_states),
        "totalStates": len(result["matchStates"]),
    }
