"""Schedule API surface — validation + the retired synchronous solve routes.

SP-CLOUD-1 moved the meet batch solve onto the job rail:
``POST /tournaments/{id}/solve-jobs`` (submit) + job polling — see
``api/solve_jobs.py``. The old in-request solve endpoints answer
**410 Gone** with a pointer instead of silently 404ing, so any stale
client (or curl muscle memory) learns where the solve went. No hidden
synchronous fallback exists (Rule 4).

Still live here:
- ``POST /schedule/validate`` — cheap pure-Python drag-target check
  (no CP-SAT, request-shaped by design).
- ``GenerateScheduleRequest`` — the solver-input shape, now consumed by
  the solve-job submit route (as the job's ``input_snapshot``) and by
  the solve subprocess (``services/solve_child.py``).
"""
import logging
from dataclasses import replace

from fastapi import APIRouter

from app.error_codes import ErrorCode, http_error
from pydantic import BaseModel
from typing import List, Optional
from app.schemas import (
    TournamentConfig, PlayerDTO, MatchDTO,
    ScheduleAssignment, PreviousAssignmentDTO, ProposedMoveDTO, ValidationResponseDTO,
)

router = APIRouter(prefix="", tags=["schedule"])

log = logging.getLogger("scheduler.schedule")


class GenerateScheduleRequest(BaseModel):
    """The complete solver input — includes all data needed."""
    config: TournamentConfig
    players: List[PlayerDTO]
    matches: List[MatchDTO]
    # Accept both typed and untyped for back-compat; legacy clients sent raw dicts.
    previousAssignments: Optional[List[PreviousAssignmentDTO]] = None
    # Cross-engine court coordination (hybrid workspaces): extra closed
    # ``[court, from_slot, to_slot]`` windows the meet solve must avoid —
    # the bracket's currently-occupied courts. The hybrid Operations
    # surface passes these so a meet re-solve never double-books a court the
    # bracket already owns. Empty/absent for single-engine meet.
    closedCourtWindows: Optional[List[List[int]]] = None


def _merge_closed_windows(schedule_config, extra: Optional[List[List[int]]]):
    """Fold cross-engine closed windows into a built ScheduleConfig."""
    if not extra:
        return schedule_config
    windows = [
        (int(w[0]), int(w[1]), int(w[2]))
        for w in extra
        if isinstance(w, (list, tuple)) and len(w) == 3 and int(w[2]) > int(w[1])
    ]
    if not windows:
        return schedule_config
    return replace(
        schedule_config,
        closed_court_windows=[*schedule_config.closed_court_windows, *windows],
    )


class ValidateMoveRequest(BaseModel):
    """Request to validate a single drag target without invoking CP-SAT."""
    config: TournamentConfig
    players: List[PlayerDTO]
    matches: List[MatchDTO]
    assignments: List[ScheduleAssignment]
    proposedMove: ProposedMoveDTO
    previousAssignments: Optional[List[PreviousAssignmentDTO]] = None


_GONE_MESSAGE = (
    "synchronous solves were removed; submit via "
    "POST /tournaments/{tournament_id}/solve-jobs and poll the job"
)


@router.post("/schedule", deprecated=True)
async def generate_schedule_gone():
    """410 — the solve is a job now (see module docstring)."""
    raise http_error(410, ErrorCode.SOLVE_ENDPOINT_GONE, _GONE_MESSAGE)


@router.post("/schedule/stream", deprecated=True)
async def generate_schedule_stream_gone():
    """410 — SSE solve progress retired with the synchronous path."""
    raise http_error(410, ErrorCode.SOLVE_ENDPOINT_GONE, _GONE_MESSAGE)


@router.post("/schedule/validate", response_model=ValidationResponseDTO)
async def validate_schedule_move(request: ValidateMoveRequest) -> ValidationResponseDTO:
    """Cheap (pure-Python) feasibility check for a drag-to-reschedule move.

    No CP-SAT invocation. Used by the frontend during a drag to paint a red
    ring on the target cell when the proposed (slot, court) would violate a
    hard constraint. Target latency: <50 ms.
    """
    from api._validate import validate_move

    return validate_move(
        config=request.config,
        players=request.players,
        matches=request.matches,
        assignments=request.assignments,
        proposed_move=request.proposedMove,
        previous_assignments=request.previousAssignments,
    )
