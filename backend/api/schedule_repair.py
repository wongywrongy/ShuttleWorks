"""Targeted disruption repair endpoint.

Wires the existing CP-SAT engine's ``solve_repair`` to a FastAPI route.
Translates a disruption (withdrawal / court_closed / overrun /
cancellation) into a slice rule (``RepairSpec``), invokes the engine,
and returns a fresh ``ScheduleDTO`` whose ``repairedMatchIds`` field
tells the UI which matches actually moved.

Solve time target: < 5 s for tournaments up to 40 matches. The repair
problem is small (only the affected slice is free) and warm-started
via ``model.AddHint``, so it converges much faster than a full solve.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Literal, Optional, Set

from fastapi import APIRouter, HTTPException

from app.error_codes import ErrorCode, http_error
from pydantic import BaseModel

import app.scheduler_core_path  # noqa: F401
from app.schemas import (  # noqa: E402
    MatchDTO,
    MatchStateDTO,
    PlayerDTO,
    ScheduleAssignment,
    ScheduleDTO,
    TournamentConfig,
)
# These imports rely on the sys.path bootstrap above.
from scheduler_core.domain.models import Assignment  # noqa: E402
from scheduler_core.engine.repair import RepairSpec, solve_repair  # noqa: E402

from adapters.badminton import (  # noqa: E402
    matches_from_dto,
    players_from_dto,
    result_to_dto,
    schedule_config_from_dto,
    solver_options_for,
)

router = APIRouter(prefix="", tags=["schedule"])
log = logging.getLogger("scheduler.repair")


class Disruption(BaseModel):
    """One disruption that triggers a repair.

    Fields are optional individually but the *combination* is
    determined by ``type``:
      - ``withdrawal``  → ``playerId`` required
      - ``court_closed`` → ``courtId`` required; ``fromTime`` /
        ``toTime`` optional (omit both for an indefinite all-day
        closure, supply both for a temporary window)
      - ``overrun``     → ``matchId`` required, ``extraMinutes`` optional
      - ``cancellation`` → ``matchId`` required
    """
    type: Literal["withdrawal", "court_closed", "overrun", "cancellation"]
    playerId: Optional[str] = None
    courtId: Optional[int] = None
    matchId: Optional[str] = None
    extraMinutes: Optional[int] = None
    # Optional time bounds for ``court_closed``. HH:mm in tournament
    # local time. Either or both may be omitted; see Disruption docstring.
    fromTime: Optional[str] = None
    toTime: Optional[str] = None
    reason: Optional[str] = None


class RepairRequest(BaseModel):
    originalSchedule: ScheduleDTO
    config: TournamentConfig
    players: List[PlayerDTO]
    matches: List[MatchDTO]
    matchStates: Dict[str, MatchStateDTO] = {}
    disruption: Disruption
    nowIso: Optional[str] = None  # accepted for future "now slot" math
    # Optional override for the solver's wall-clock budget. The
    # proposal pipeline uses this to request fast (~3 s) "quick look"
    # solves vs. the default 5 s for slice-based repair.
    timeBudgetSec: Optional[float] = None


class RepairResponse(BaseModel):
    schedule: ScheduleDTO
    repairedMatchIds: List[str]


def _is_finished(states: Dict[str, MatchStateDTO], match_id: str) -> bool:
    state = states.get(match_id)
    return state is not None and state.status == "finished"


def _player_ids_for(match: MatchDTO) -> Set[str]:
    """Pull every player id involved in a match across both sides."""
    return set(match.sideA or []) | set(match.sideB or [])


def _slice_for(
    request: RepairRequest,
    assignments_by_match: Dict[str, ScheduleAssignment],
) -> RepairSpec:
    """Translate a disruption into the slice rule the engine consumes.

    The badminton-specific knowledge lives here (which matches are
    "successors", what "involved players" means). The engine's
    ``solve_repair`` only sees the resulting frozensets.
    """
    d = request.disruption
    states = request.matchStates
    matches_by_id = {m.id: m for m in request.matches}

    free: Set[str] = set()
    forbid_matches: Set[str] = set()
    forbid_courts: Set[int] = set()

    if d.type == "withdrawal":
        if not d.playerId:
            raise http_error(400, ErrorCode.DISRUPTION_INVALID, "withdrawal disruption requires playerId")
        # Forfeit every unfinished match the withdrawn player is in.
        # The repair just removes them from the schedule; the operator
        # can re-add later via the matches editor (after substitution).
        for m in request.matches:
            if _is_finished(states, m.id):
                continue
            if d.playerId in _player_ids_for(m):
                forbid_matches.add(m.id)

    elif d.type == "court_closed":
        if d.courtId is None:
            raise http_error(400, ErrorCode.DISRUPTION_INVALID, "court_closed disruption requires courtId")
        forbid_courts.add(d.courtId)
        # Free every unfinished match currently on that court so the
        # solver can re-route them to other courts.
        for m in request.matches:
            if _is_finished(states, m.id):
                continue
            a = assignments_by_match.get(m.id)
            if a and a.courtId == d.courtId:
                free.add(m.id)

    elif d.type == "overrun":
        if not d.matchId:
            raise http_error(400, ErrorCode.DISRUPTION_INVALID, "overrun disruption requires matchId")
        target = matches_by_id.get(d.matchId)
        if target is None:
            raise http_error(400, ErrorCode.DISRUPTION_INVALID, f"unknown matchId: {d.matchId}")
        target_assignment = assignments_by_match.get(d.matchId)
        if target_assignment is None:
            raise http_error(400, ErrorCode.DISRUPTION_INVALID, f"matchId {d.matchId} is not in the schedule")

        # Successors = unfinished matches involving any of the
        # target's players whose start slot >= target's start slot.
        # (The target itself stays pinned at its actual position.)
        target_players = _player_ids_for(target)
        target_slot = target_assignment.slotId
        for m in request.matches:
            if m.id == d.matchId:
                continue
            if _is_finished(states, m.id):
                continue
            if not (_player_ids_for(m) & target_players):
                continue
            a = assignments_by_match.get(m.id)
            if a and a.slotId >= target_slot:
                free.add(m.id)

    elif d.type == "cancellation":
        if not d.matchId:
            raise http_error(400, ErrorCode.DISRUPTION_INVALID, "cancellation disruption requires matchId")
        target_assignment = assignments_by_match.get(d.matchId)
        forbid_matches.add(d.matchId)
        # Free a small window so a later match can pull forward into
        # the gap. 30 min ≈ ``30 / interval_minutes`` slots.
        if target_assignment is not None:
            window_slots = max(1, 30 // request.config.intervalMinutes)
            cutoff = target_assignment.slotId + window_slots
            for m in request.matches:
                if m.id == d.matchId or _is_finished(states, m.id):
                    continue
                a = assignments_by_match.get(m.id)
                if a and a.courtId == target_assignment.courtId and a.slotId <= cutoff:
                    free.add(m.id)

    # Hint every surviving match at its original assignment so the
    # warm-start kicks in.
    hints: Dict[str, Assignment] = {}
    for m in request.matches:
        if m.id in forbid_matches:
            continue
        a = assignments_by_match.get(m.id)
        if a is None:
            continue
        hints[m.id] = Assignment(
            match_id=m.id,
            slot_id=a.slotId,
            court_id=a.courtId,
            duration_slots=a.durationSlots,
        )

    return RepairSpec(
        free_match_ids=frozenset(free),
        forbid_match_ids=frozenset(forbid_matches),
        forbid_court_ids=frozenset(forbid_courts),
        hint_assignments=hints,
    )


def _run_repair(request: RepairRequest) -> tuple[ScheduleDTO, List[str]]:
    """Pure solver-call body for the repair endpoint.

    Extracted so internal callers (proposal pipeline, director-action)
    can invoke the repair without going through FastAPI's response-model
    Pydantic round-trip — that round-trip can fail under sys.modules
    churn when ``ScheduleDTO`` ends up with two distinct class
    identities at validation time.
    """
    assignments_by_match = {
        a.matchId: a for a in request.originalSchedule.assignments
    }

    repair = _slice_for(request, assignments_by_match)

    schedule_config = schedule_config_from_dto(request.config)
    players = players_from_dto(request.players, request.config)
    matches = matches_from_dto(request.matches)
    solver_options = solver_options_for(
        request.config, time_limit_override=request.timeBudgetSec,
    )

    try:
        result = solve_repair(
            schedule_config,
            players,
            matches,
            repair,
            solver_options=solver_options,
        )
    except Exception:
        log.exception("schedule repair failed")
        raise http_error(500, ErrorCode.REPAIR_FAILED, "schedule repair failed")

    new_schedule = result_to_dto(result)

    repaired_ids: List[str] = []
    new_by_match = {a.matchId: a for a in new_schedule.assignments}
    for match_id, prev in assignments_by_match.items():
        if match_id in repair.forbid_match_ids:
            repaired_ids.append(match_id)
            continue
        new = new_by_match.get(match_id)
        if new is None:
            continue
        if new.slotId != prev.slotId or new.courtId != prev.courtId:
            repaired_ids.append(match_id)
    return new_schedule, repaired_ids


@router.post("/schedule/repair", response_model=RepairResponse)
async def repair_schedule(request: RepairRequest) -> RepairResponse:
    """Re-solve the affected slice; everything else stays put."""
    new_schedule, repaired_ids = _run_repair(request)
    return RepairResponse(schedule=new_schedule, repairedMatchIds=repaired_ids)
