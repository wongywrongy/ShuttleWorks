"""Warm-start full re-solve endpoint.

The escape hatch for when targeted repair (``/schedule/repair``)
isn't enough — the operator wants the solver to consider the whole
problem again, but with a strong bias to keep the existing schedule
intact. Finished + in-progress matches are hard-pinned; everything
else is hinted at its current slot+court and a per-match move
penalty is added to the objective.

Conservative / Balanced / Aggressive map to weights 10 / 5 / 1.
Higher weight = fewer moves, even at the cost of a worse
makespan/rest objective.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import app.scheduler_core_path  # noqa: F401
from app.schemas import (  # noqa: E402
    MatchDTO,
    MatchStateDTO,
    PlayerDTO,
    ScheduleDTO,
    TournamentConfig,
)
from scheduler_core.domain.models import Assignment  # noqa: E402
from scheduler_core.engine.warm_start import solve_warm_start  # noqa: E402

from adapters.badminton import (  # noqa: E402
    matches_from_dto,
    players_from_dto,
    result_to_dto,
    schedule_config_from_dto,
    solver_options_for,
)

router = APIRouter(prefix="", tags=["schedule"])
log = logging.getLogger("scheduler.warm_restart")


class WarmRestartRequest(BaseModel):
    originalSchedule: ScheduleDTO
    config: TournamentConfig
    players: List[PlayerDTO]
    matches: List[MatchDTO]
    matchStates: Dict[str, MatchStateDTO] = {}
    # 10 = Conservative (default), 5 = Balanced, 1 = Aggressive.
    stayCloseWeight: int = 10
    nowIso: Optional[str] = None


class WarmRestartResponse(BaseModel):
    schedule: ScheduleDTO
    movedMatchIds: List[str]


@router.post("/schedule/warm-restart", response_model=WarmRestartResponse)
async def warm_restart_schedule(request: WarmRestartRequest) -> WarmRestartResponse:
    """Re-solve the whole problem with a stay-close bias."""
    # Hard-pin finished and in-progress matches; everything else is
    # only hinted (free to move under the stay-close penalty).
    finished: set[str] = set()
    for m_id, state in request.matchStates.items():
        if state.status in ("finished", "started"):
            finished.add(m_id)

    reference: Dict[str, Assignment] = {}
    for a in request.originalSchedule.assignments:
        reference[a.matchId] = Assignment(
            match_id=a.matchId,
            slot_id=a.slotId,
            court_id=a.courtId,
            duration_slots=a.durationSlots,
        )

    schedule_config = schedule_config_from_dto(request.config)
    players = players_from_dto(request.players, request.config)
    matches = matches_from_dto(request.matches)
    solver_options = solver_options_for(request.config)

    try:
        result = solve_warm_start(
            schedule_config,
            players,
            matches,
            reference,
            finished_match_ids=finished,
            stay_close_weight=request.stayCloseWeight,
            solver_options=solver_options,
        )
    except Exception:
        log.exception("warm-restart failed")
        raise HTTPException(500, "warm-restart failed")

    new_schedule = result_to_dto(result)

    moved: List[str] = []
    new_by_match = {a.matchId: a for a in new_schedule.assignments}
    for m_id, ref in reference.items():
        new = new_by_match.get(m_id)
        if new is None:
            continue
        if new.slotId != ref.slot_id or new.courtId != ref.court_id:
            moved.append(m_id)

    return WarmRestartResponse(schedule=new_schedule, movedMatchIds=moved)
