"""Match state management API.

Tournament-day match states (called / started / finished + scores) are
persisted to ``./data/match_states.json`` using the same atomic-write +
rolling-backup discipline that ``tournament_state.py`` uses for the
main tournament file:

  1. write new payload to ``match_states.json.tmp``
  2. ``os.replace`` atomically onto ``match_states.json``
  3. snapshot the new live file into ``./data/backups/match_states-<iso>.json``
     and prune to ``_backups.KEEP`` newest

Reads auto-recover from the most recent *parseable* backup if the live
file is corrupted (via ``_backups.read_with_recovery``) so a crash mid-
write never takes a tournament offline.
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, Literal, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Request

from app.error_codes import ErrorCode, http_error
from app.paths import data_dir, ensure_data_dir
from app.time_utils import now_iso
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from api import _backups

router = APIRouter(prefix="/match-states", tags=["match-states"])

log = logging.getLogger("scheduler.match_state")

# Import payload cap. Anything larger is almost certainly not a
# legitimate match_states.json — cap at 20 MB to bound memory.
MAX_IMPORT_BYTES = 20 * 1024 * 1024

# Serialise read-modify-write cycles. Every mutating endpoint reads the
# current state from disk, mutates it in memory, then writes it back —
# without this lock, two concurrent PUTs on different match IDs would
# race and one update would be lost (last writer wins on the full
# dict). Single-process FastAPI + a single uvicorn worker means an
# asyncio.Lock is sufficient; if we ever scale to multiple workers,
# replace with a file-system lock or move state into a real DB.
_state_lock = asyncio.Lock()


def _state_path() -> Path:
    return data_dir() / "match_states.json"


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
    # Persisted so Undo survives a page reload. Frontend records these
    # whenever a match is shifted from its scheduled slot/court; they
    # are not part of any solver input.
    originalSlotId: Optional[int] = None
    originalCourtId: Optional[int] = None

    @field_validator("status", mode="before")
    @classmethod
    def coerce_unknown_status(cls, v):
        """Legacy payloads may carry freeform status strings. Coerce any
        unrecognised value back to ``scheduled`` so a corrupt row doesn't
        break the whole file read.
        """
        if v in ("scheduled", "called", "started", "finished"):
            return v
        return "scheduled"

    # Permit extra fields (client may send playerConfirmations, sets, etc.);
    # we deliberately don't persist them here — match_state.py is focused on
    # the status/timestamp/score core.
    model_config = {"extra": "allow"}


class TournamentStateFile(BaseModel):
    matchStates: Dict[str, MatchStateDTO]
    lastUpdated: str
    version: str = "1.0"


def _read_state_file() -> TournamentStateFile:
    """Load the match-state file, auto-recovering from backup on corruption.

    Returns an empty state when neither the live file nor any backup exists.
    """
    path = _state_path()
    if not path.exists():
        # Check for a viable backup — the live file may have been deleted
        # but a snapshot could still carry the previous tournament day's
        # state.
        if _backups.latest_backup(data_dir(), path.stem) is None:
            return TournamentStateFile(
                matchStates={}, lastUpdated=now_iso(), version="1.0"
            )

    try:
        data, recovered_from = _backups.read_with_recovery(data_dir(), path)
    except FileNotFoundError:
        return TournamentStateFile(
            matchStates={}, lastUpdated=now_iso(), version="1.0"
        )
    except ValueError as e:
        log.error("match-state recovery failed: %s", e)
        raise http_error(
            500,
            ErrorCode.MATCH_STATE_UNREADABLE,
            "match state unreadable; reset via Setup",
        )

    if recovered_from is not None:
        log.warning("match-state recovered from %s", recovered_from)
    try:
        return TournamentStateFile(**data)
    except Exception as e:
        log.error("match-state schema mismatch after recovery: %s", e)
        raise http_error(
            500,
            ErrorCode.STATE_SCHEMA_MISMATCH,
            "match state schema mismatch; reset via Setup",
        )


def _write_state_file(state: TournamentStateFile) -> None:
    """Atomic write + rolling backup.

    Delegates to ``_backups.atomic_write_json`` which: stamps a SHA-256
    integrity field, writes to ``.tmp``, ``fsync()``s the fd, ``os.replace``
    atomically onto the live file, then ``fsync()``s the containing
    directory for full durability across power loss. Rolling backup
    rotation happens AFTER the successful replace so the previous
    state only disappears once the new one is durable.
    """
    ensure_data_dir()
    state.lastUpdated = now_iso()
    path = _state_path()

    try:
        _backups.atomic_write_json(path, state.model_dump())
    except OSError as e:
        log.error("match-state write failed: %s", e)
        raise http_error(
            500,
            ErrorCode.MATCH_STATE_WRITE_FAILED,
            "could not persist match state",
        )

    # Rotate a snapshot of the freshly-written live file. Best-effort —
    # a failure here doesn't invalidate the save.
    try:
        _backups.create_backup(data_dir(), path)
    except OSError as e:
        log.warning("match-state backup rotation failed: %s", e)


# ---------- API endpoints -------------------------------------------------


@router.get("", response_model=Dict[str, MatchStateDTO])
async def get_all_match_states():
    """Get all match states from the JSON file."""
    state = _read_state_file()
    return state.matchStates


@router.get("/{match_id}", response_model=MatchStateDTO)
async def get_match_state(match_id: str):
    """Get a single match state, or a default `scheduled` if unseen."""
    state = _read_state_file()
    if match_id not in state.matchStates:
        return MatchStateDTO(matchId=match_id, status="scheduled")
    return state.matchStates[match_id]


@router.put("/{match_id}", response_model=MatchStateDTO)
async def update_match_state(match_id: str, update: MatchStateDTO):
    """Update a match state in the file."""
    async with _state_lock:
        state = _read_state_file()
        update.updatedAt = now_iso()
        update.matchId = match_id
        state.matchStates[match_id] = update
        _write_state_file(state)
    return update


@router.delete("/{match_id}")
async def delete_match_state(match_id: str):
    """Remove a match state from the file (reset to default)."""
    async with _state_lock:
        state = _read_state_file()
        if match_id in state.matchStates:
            del state.matchStates[match_id]
            _write_state_file(state)
    return {"message": f"Match state for {match_id} deleted successfully"}


@router.post("/reset")
async def reset_all_match_states():
    """Clear all match states (empty the file)."""
    async with _state_lock:
        state = TournamentStateFile(
            matchStates={}, lastUpdated=now_iso(), version="1.0"
        )
        _write_state_file(state)
    return {"message": "All match states reset successfully"}


@router.get("/export/download")
async def export_match_states():
    """Download the match_states.json file."""
    path = _state_path()
    if not path.exists():
        state = TournamentStateFile(
            matchStates={}, lastUpdated=now_iso(), version="1.0"
        )
        _write_state_file(state)
    return FileResponse(
        path=path,
        filename="match_states.json",
        media_type="application/json",
    )


@router.post("/import/upload")
async def import_match_states(request: Request, file: UploadFile = File(...)):
    """Upload and import a match_states.json file.

    - Rejects non-JSON uploads and files larger than MAX_IMPORT_BYTES.
    - Validates the payload against TournamentStateFile before persisting.
    """
    if not (file.filename or "").endswith(".json"):
        raise http_error(400, ErrorCode.UPLOAD_WRONG_TYPE, "file must be a .json file")

    # Enforce a Content-Length cap when the header is set so we never
    # drain an attacker's multi-GB upload into memory.
    declared_length = request.headers.get("content-length")
    if declared_length and declared_length.isdigit():
        if int(declared_length) > MAX_IMPORT_BYTES:
            raise http_error(413, ErrorCode.UPLOAD_TOO_LARGE, "upload too large")

    # Read with an explicit cap even when Content-Length is missing.
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

    async with _state_lock:
        _write_state_file(state)
    return {
        "message": "Tournament state imported successfully",
        "matchCount": len(state.matchStates),
        "lastUpdated": state.lastUpdated,
    }


@router.post("/import-bulk")
async def import_match_states_bulk(match_states: Dict[str, MatchStateDTO]):
    """Merge a dict of match states into the existing file.

    Used by the v2.0 tournament-export flow: imports existing states and
    augments them with the incoming payload without wiping others.
    """
    if not match_states:
        return {"message": "No match states to import", "importedCount": 0}

    async with _state_lock:
        state = _read_state_file()
        for match_id, match_state in match_states.items():
            match_state.matchId = match_id
            match_state.updatedAt = now_iso()
            state.matchStates[match_id] = match_state

        _write_state_file(state)
    return {
        "message": "Match states imported successfully",
        "importedCount": len(match_states),
        "totalStates": len(state.matchStates),
    }
