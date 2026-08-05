"""Warm-start full re-solve.

The escape hatch for when targeted repair isn't enough — the operator
wants the solver to consider the whole problem again, but with a strong
bias to keep the existing schedule intact. Finished + in-progress
matches are hard-pinned; everything else is hinted at its current
slot+court and a per-match move penalty is added to the objective.

Conservative / Balanced / Aggressive map to weights 10 / 5 / 1.
Higher weight = fewer moves, even at the cost of a worse
makespan/rest objective.

**The route here is a 410 tombstone; the engine is not.**
``_run_warm_restart`` and ``_run_warm_restart_with_cancel`` are the live
implementation, consumed by the tenant-scoped proposal pipeline
(``api/schedule_proposals.py``, ``schedule_director.py``,
``schedule_suggestions.py``).

The retired ``POST /schedule/warm-restart`` took an entire tournament in
its body and named no workspace, so it carried no ``tournament_id`` path
param and no ``require_tournament_access`` — the last compute surface
outside the tenancy seam the rest of the API is held to. It had no
frontend caller. Retired 2026-08-04 alongside ``/schedule/repair``,
following the 410-with-a-pointer pattern in ``api/schedule.py``.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter

from app.error_codes import ErrorCode, http_error
from pydantic import BaseModel, Field

from app.limits import (
    MAX_MATCHES,
    MAX_PLAYERS,
    Identifier,
    StrictModel,
)
from app.schemas import (
    MatchDTO,
    PlayerDTO,
    ScheduleDTO,
    TournamentConfig,
)
from api.match_state import MatchStateDTO
from scheduler_core.domain.models import Assignment, LockedAssignment
from scheduler_core.engine.cancel_token import CancelToken
from scheduler_core.engine.warm_start import solve_warm_start

from typing import Sequence

from adapters.badminton import (
    matches_from_dto,
    players_from_dto,
    result_to_dto,
    schedule_config_from_dto,
    solver_options_for,
)

router = APIRouter(prefix="", tags=["schedule"])
log = logging.getLogger("scheduler.warm_restart")

_GONE_MESSAGE = (
    "the untenanted warm-restart route was removed; warm restart now "
    "flows through the tenant-scoped proposal pipeline: "
    "POST /tournaments/{tournament_id}/schedule/proposals/warm-restart"
)


class WarmRestartRequest(StrictModel):
    originalSchedule: ScheduleDTO
    config: TournamentConfig
    players: List[PlayerDTO] = Field(..., max_length=MAX_PLAYERS)
    matches: List[MatchDTO] = Field(..., max_length=MAX_MATCHES)
    matchStates: Dict[Identifier, MatchStateDTO] = Field(default_factory=dict, max_length=MAX_MATCHES)
    # 10 = Conservative (default), 5 = Balanced, 1 = Aggressive.
    stayCloseWeight: int = 10
    nowIso: Optional[str] = None
    # Optional override for the solver's wall-clock budget. The
    # proposal pipeline uses this to request fast (~3 s) "quick look"
    # solves for advisor-driven recommendations vs. the default
    # 30 s for operator-initiated replans. Capped at 300 s.
    timeBudgetSec: Optional[float] = None


class WarmRestartResponse(BaseModel):
    schedule: ScheduleDTO
    movedMatchIds: List[str]


def _run_warm_restart(
    request: WarmRestartRequest,
    *,
    locked_assignments: Optional[Sequence[LockedAssignment]] = None,
) -> tuple[ScheduleDTO, List[str]]:
    """Pure solver-call body: returns (new schedule, movedMatchIds).

    Extracted from the endpoint so callers (director-action proposals,
    tests, etc.) can invoke it without going through FastAPI's
    response-model Pydantic round-trip — that round-trip otherwise
    fails when sys.modules churn results in `ScheduleDTO` having
    different class identities at validation time.

    Tournament-scoped callers populate ``locked_assignments`` via
    ``services.match_state.build_locked_assignments(repo, tid)`` so
    state-machine-locked matches stay pinned regardless of the stay-
    close weight; the public stateless ``POST /schedule/warm-restart``
    route leaves it None.
    """
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
    solver_options = solver_options_for(
        request.config, time_limit_override=request.timeBudgetSec,
    )

    try:
        result = solve_warm_start(
            schedule_config,
            players,
            matches,
            reference,
            finished_match_ids=finished,
            stay_close_weight=request.stayCloseWeight,
            solver_options=solver_options,
            locked_assignments=locked_assignments,
        )
    except Exception:
        log.exception("warm-restart failed")
        raise http_error(500, ErrorCode.WARM_RESTART_FAILED, "warm-restart failed")

    new_schedule = result_to_dto(result)

    moved: List[str] = []
    new_by_match = {a.matchId: a for a in new_schedule.assignments}
    for m_id, ref in reference.items():
        new = new_by_match.get(m_id)
        if new is None:
            continue
        if new.slotId != ref.slot_id or new.courtId != ref.court_id:
            moved.append(m_id)
    return new_schedule, moved


@router.post("/schedule/warm-restart", deprecated=True)
async def warm_restart_schedule_gone():
    """410 — warm restart flows through the tenant-scoped proposal
    pipeline. See the module docstring; the engine below is unchanged."""
    raise http_error(410, ErrorCode.SOLVE_ENDPOINT_GONE, _GONE_MESSAGE)


def _run_warm_restart_with_cancel(
    request: WarmRestartRequest,
    *,
    cancel_token: CancelToken,
    locked_assignments: Optional[Sequence[LockedAssignment]] = None,
) -> tuple[ScheduleDTO, List[str]]:
    """Cancel-aware variant of `_run_warm_restart` for speculative solves.

    Same as `_run_warm_restart` but threads a CancelToken into the
    solver so a stale speculative solve aborts cleanly when newer
    state arrives. Used by the SuggestionsWorker's optimize handler.
    """
    finished: set[str] = set()
    for m_id, state in request.matchStates.items():
        if state.status in ("finished", "started"):
            finished.add(m_id)

    reference: Dict[str, Assignment] = {}
    for a in request.originalSchedule.assignments:
        reference[a.matchId] = Assignment(
            match_id=a.matchId, slot_id=a.slotId,
            court_id=a.courtId, duration_slots=a.durationSlots,
        )

    schedule_config = schedule_config_from_dto(request.config)
    players = players_from_dto(request.players, request.config)
    matches = matches_from_dto(request.matches)
    solver_options = solver_options_for(
        request.config, time_limit_override=request.timeBudgetSec,
    )

    result = solve_warm_start(
        schedule_config,
        players,
        matches,
        reference,
        finished_match_ids=finished,
        stay_close_weight=request.stayCloseWeight,
        solver_options=solver_options,
        cancel_token=cancel_token,
        locked_assignments=locked_assignments,
    )
    new_schedule = result_to_dto(result)
    moved: List[str] = []
    new_by_match = {a.matchId: a for a in new_schedule.assignments}
    for m_id, ref in reference.items():
        new = new_by_match.get(m_id)
        if new is None:
            continue
        if new.slotId != ref.slot_id or new.courtId != ref.court_id:
            moved.append(m_id)
    return new_schedule, moved
