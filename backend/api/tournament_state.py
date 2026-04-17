"""Whole-tournament state persistence (server-side JSON file).

Single endpoint pair — GET returns 204 when no file yet, PUT overwrites
the file atomically via a temp-file rename. Server stamps `updatedAt`.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response

from app.schemas import TournamentStateDTO

router = APIRouter(prefix="/tournament", tags=["tournament-state"])


def _data_dir() -> Path:
    return Path(os.environ.get("BACKEND_DATA_DIR", "/app/data"))


def _state_path() -> Path:
    return _data_dir() / "tournament.json"


def _ensure_dir() -> None:
    _data_dir().mkdir(parents=True, exist_ok=True)


@router.get("/state")
async def get_tournament_state():
    """Return the persisted tournament state.

    204 No Content when no state has been saved yet — the frontend uses
    that signal to fall back to localStorage migration / defaults.
    """
    path = _state_path()
    if not path.exists():
        return Response(status_code=204)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="tournament.json is corrupt; reset or restore from backup",
        )
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"read failed: {e}")
    return data


@router.put("/state", response_model=TournamentStateDTO)
async def put_tournament_state(state: TournamentStateDTO):
    """Overwrite the tournament state atomically.

    Client-supplied `updatedAt` is ignored; we stamp our own so two tabs
    can agree on ordering.
    """
    _ensure_dir()
    stamped = state.model_copy(
        update={"updatedAt": datetime.now(timezone.utc).isoformat()}
    )
    path = _state_path()
    tmp = path.with_suffix(".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(stamped.model_dump(), f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)  # atomic on POSIX
    except OSError as e:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        raise HTTPException(status_code=500, detail=f"write failed: {e}")
    return stamped
