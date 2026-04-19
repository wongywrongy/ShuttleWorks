"""Match state management API - File-based storage.

Manages tournament match states in a portable JSON file that can be moved between PCs.
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/match-states", tags=["match-states"])

# File path for the match-state JSON. Lives in the writable data dir
# (bind-mounted in docker-compose); /app itself is read-only.
def _data_dir() -> Path:
    return Path(os.environ.get("BACKEND_DATA_DIR", "/app/data"))


def _state_path() -> Path:
    return _data_dir() / "match_states.json"


# Back-compat alias used throughout this module.
STATE_FILE_PATH = _state_path()


# DTOs
class MatchScore(BaseModel):
    sideA: int
    sideB: int


class MatchStateDTO(BaseModel):
    matchId: str
    status: str  # 'scheduled' | 'called' | 'started' | 'finished'
    actualStartTime: Optional[str] = None
    actualEndTime: Optional[str] = None
    score: Optional[MatchScore] = None
    notes: Optional[str] = None
    updatedAt: Optional[str] = None


class TournamentStateFile(BaseModel):
    matchStates: Dict[str, MatchStateDTO]
    lastUpdated: str
    version: str = "1.0"


# File utilities
def _read_state_file() -> TournamentStateFile:
    """Read the tournament state file."""
    if not STATE_FILE_PATH.exists():
        # Initialize empty state file
        return TournamentStateFile(
            matchStates={},
            lastUpdated=datetime.utcnow().isoformat() + "Z",
            version="1.0"
        )

    try:
        with open(STATE_FILE_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return TournamentStateFile(**data)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Tournament state file is corrupted. Please restore from backup or reset."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reading tournament state file: {str(e)}"
        )


def _write_state_file(state: TournamentStateFile) -> None:
    """Write the tournament state file with backup."""
    # Ensure the writable data dir exists (it's bind-mounted in docker).
    STATE_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Create backup before writing
    if STATE_FILE_PATH.exists():
        backup_path = STATE_FILE_PATH.with_suffix('.backup.json')
        try:
            STATE_FILE_PATH.replace(backup_path)
        except Exception:
            pass  # Backup failed, but continue with write

    # Update timestamp
    state.lastUpdated = datetime.utcnow().isoformat() + "Z"

    # Write to temp file first (atomic write)
    temp_path = STATE_FILE_PATH.with_suffix('.tmp')
    try:
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(state.model_dump(), f, indent=2, ensure_ascii=False)

        # Atomic rename
        temp_path.replace(STATE_FILE_PATH)
    except Exception as e:
        # Clean up temp file if it exists
        if temp_path.exists():
            temp_path.unlink()
        raise HTTPException(
            status_code=500,
            detail=f"Error writing tournament state file: {str(e)}"
        )


# API Endpoints

@router.get("", response_model=Dict[str, MatchStateDTO])
async def get_all_match_states():
    """Get all match states from the JSON file."""
    state = _read_state_file()
    return state.matchStates


@router.get("/{match_id}", response_model=MatchStateDTO)
async def get_match_state(match_id: str):
    """Get a single match state."""
    state = _read_state_file()

    if match_id not in state.matchStates:
        # Return default state if not found
        return MatchStateDTO(
            matchId=match_id,
            status="scheduled"
        )

    return state.matchStates[match_id]


@router.put("/{match_id}", response_model=MatchStateDTO)
async def update_match_state(match_id: str, update: MatchStateDTO):
    """Update a match state in the file."""
    state = _read_state_file()

    # Update timestamp
    update.updatedAt = datetime.utcnow().isoformat() + "Z"
    update.matchId = match_id  # Ensure match_id is set correctly

    # Update the state
    state.matchStates[match_id] = update

    # Write to file
    _write_state_file(state)

    return update


@router.delete("/{match_id}")
async def delete_match_state(match_id: str):
    """Remove a match state from the file (reset to default)."""
    state = _read_state_file()

    if match_id in state.matchStates:
        del state.matchStates[match_id]
        _write_state_file(state)

    return {"message": f"Match state for {match_id} deleted successfully"}


@router.post("/reset")
async def reset_all_match_states():
    """Clear all match states (empty the file)."""
    state = TournamentStateFile(
        matchStates={},
        lastUpdated=datetime.utcnow().isoformat() + "Z",
        version="1.0"
    )

    _write_state_file(state)

    return {"message": "All match states reset successfully"}


@router.get("/export/download")
async def export_match_states():
    """Download the tournament_state.json file."""
    if not STATE_FILE_PATH.exists():
        # Create empty file if it doesn't exist
        state = TournamentStateFile(
            matchStates={},
            lastUpdated=datetime.utcnow().isoformat() + "Z",
            version="1.0"
        )
        _write_state_file(state)

    return FileResponse(
        path=STATE_FILE_PATH,
        filename="tournament_state.json",
        media_type="application/json"
    )


@router.post("/import/upload")
async def import_match_states(file: UploadFile = File(...)):
    """Upload and import a tournament_state.json file from another PC."""
    if not file.filename.endswith('.json'):
        raise HTTPException(
            status_code=400,
            detail="File must be a JSON file"
        )

    try:
        # Read uploaded file
        content = await file.read()
        data = json.loads(content.decode('utf-8'))

        # Validate structure
        state = TournamentStateFile(**data)

        # Write to file
        _write_state_file(state)

        return {
            "message": "Tournament state imported successfully",
            "matchCount": len(state.matchStates),
            "lastUpdated": state.lastUpdated
        }

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON file"
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error importing file: {str(e)}"
        )


@router.post("/import-bulk")
async def import_match_states_bulk(match_states: Dict[str, MatchStateDTO]):
    """
    Bulk import match states from a dictionary (used for v2.0 tournament export).
    Merges imported states with existing states.
    """
    if not match_states:
        return {
            "message": "No match states to import",
            "importedCount": 0
        }

    try:
        # Read existing state
        state = _read_state_file()

        # Update/add each match state
        imported_count = 0
        for match_id, match_state in match_states.items():
            # Ensure the matchId is set correctly
            match_state.matchId = match_id
            # Update timestamp
            match_state.updatedAt = datetime.utcnow().isoformat() + "Z"
            # Add to state
            state.matchStates[match_id] = match_state
            imported_count += 1

        # Write to file
        _write_state_file(state)

        return {
            "message": "Match states imported successfully",
            "importedCount": imported_count,
            "totalStates": len(state.matchStates)
        }

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error importing match states: {str(e)}"
        )
