"""Stateless schedule API endpoint - directly uses scheduler_core engine."""
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Tuple, AsyncGenerator
import json
import asyncio
from app.schemas import (
    TournamentConfig, PlayerDTO, MatchDTO, ScheduleDTO,
    ScheduleAssignment, SoftViolation, SolverStatus,
    PreviousAssignmentDTO, ProposedMoveDTO, ValidationResponseDTO,
)
import sys
import os

# Add project root to path to import scheduler_core
backend_dir = os.path.dirname(os.path.dirname(__file__))
project_root = os.path.dirname(backend_dir)
scheduler_core_path = os.path.join(project_root, 'src')
if scheduler_core_path not in sys.path:
    sys.path.insert(0, scheduler_core_path)

# Import directly from scheduler_core domain models and engine
try:
    from scheduler_core.domain.models import (
        ScheduleRequest, ScheduleConfig, Player, Match,
        PreviousAssignment, SolverOptions
    )
    from scheduler_core.engine import CPSATBackend
    from scheduler_core.engine.cpsat_backend import CPSATScheduler
except ImportError as e:
    raise ImportError(
        f"Could not import scheduler_core: {e}. "
        "Make sure src/scheduler_core is accessible."
    )

router = APIRouter(prefix="", tags=["schedule"])

log = logging.getLogger("scheduler.schedule")

# Upper bound on the progress queue: the solver emits one event per new
# solution and per phase transition. 512 is generous for a 30 s solve,
# and bounds memory if a client stops draining (see the SSE
# disconnect handling in ``event_generator`` below).
_SSE_QUEUE_MAX = 512


class GenerateScheduleRequest(BaseModel):
    """Request to generate a schedule - includes all data needed."""
    config: TournamentConfig
    players: List[PlayerDTO]
    matches: List[MatchDTO]
    # Accept both typed and untyped for back-compat; legacy clients sent raw dicts.
    previousAssignments: Optional[List[PreviousAssignmentDTO]] = None


class ValidateMoveRequest(BaseModel):
    """Request to validate a single drag target without invoking CP-SAT."""
    config: TournamentConfig
    players: List[PlayerDTO]
    matches: List[MatchDTO]
    assignments: List[ScheduleAssignment]
    proposedMove: ProposedMoveDTO
    previousAssignments: Optional[List[PreviousAssignmentDTO]] = None


@router.post("/schedule", response_model=ScheduleDTO)
async def generate_schedule(request: GenerateScheduleRequest):
    """
    Generate optimized schedule for matches.

    This is a stateless endpoint - all data is provided in the request,
    and the schedule is returned without persistence.

    Args:
        request: Contains tournament config, players, and matches

    Returns:
        Optimized schedule with match assignments
    """
    try:
        # Convert to scheduler_core format
        schedule_config = _convert_to_schedule_config(request.config)
        players = _convert_players(request.players, request.config)
        matches = _convert_matches(request.matches)
        previous_assignments = _convert_previous_assignments(request.previousAssignments)

        # Create schedule request for solver
        solver_request = ScheduleRequest(
            config=schedule_config,
            players=players,
            matches=matches,
            previous_assignments=previous_assignments,
            solver_options=SolverOptions(
                time_limit_seconds=30,
                num_workers=4,
                log_progress=False
            )
        )

        # Call CP-SAT solver directly
        backend = CPSATBackend(solver_options=solver_request.solver_options)
        result = backend.solve(solver_request)

        # Convert result to ScheduleDTO and return
        return _convert_result_to_dto(result)

    except Exception as e:
        log.exception("schedule generation failed")
        raise HTTPException(status_code=500, detail="schedule generation failed")


@router.post("/schedule/stream")
async def generate_schedule_stream(request: GenerateScheduleRequest, http_request: Request):
    """
    Generate schedule with real-time progress updates via Server-Sent Events.

    Event types streamed (JSON after ``data:`` prefix):

    - ``{type: 'model_built', numMatches, numIntervals, numNoOverlap, numVariables, ...}``
      emitted once, after ``scheduler.build()`` completes.
    - ``{type: 'phase', phase: 'presolve' | 'search' | 'proving'}``
      emitted on phase transitions (see below).
    - ``{type: 'progress', ...}`` — each intermediate solution.
    - ``{type: 'complete', result: ScheduleDTO}`` — final result.
    - ``{type: 'error', message: str}`` — on solver exception.
    - ``{type: 'done'}`` — always the last event; stream terminator.

    Phase state machine: presolve → search (on first solution) → proving
    (on optimal final status).
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate Server-Sent Events for progress updates.

        Safety properties:
          - The progress queue is bounded (``_SSE_QUEUE_MAX``) so a
            slow/absent consumer can't grow memory without bound.
          - Each iteration polls ``http_request.is_disconnected()`` with
            a 1 s timeout so a closed browser tab is noticed within
            ~1 s. On disconnect we set ``cancel_event`` and return.
          - The solver worker checks ``cancel_event`` before emitting
            new events so dropped events don't accumulate after the
            client is gone.
        """
        progress_queue: asyncio.Queue = asyncio.Queue(maxsize=_SSE_QUEUE_MAX)
        cancel_event = asyncio.Event()
        result_holder: dict = {}
        error_holder: dict = {}
        state = {"phase": None, "solutions": 0}

        loop = asyncio.get_running_loop()

        def emit(event: dict, *, critical: bool = False) -> None:
            """Enqueue an event from the worker thread.

            Critical events (phase/model_built/done) bypass the bounded
            queue's backpressure — we'd rather grow by a few entries
            than drop a terminator. Non-critical events (per-solution
            ``progress``) are dropped when the queue is full.
            """
            if cancel_event.is_set():
                return
            if critical:
                loop.call_soon_threadsafe(progress_queue.put_nowait, event)
                return
            try:
                loop.call_soon_threadsafe(progress_queue.put_nowait, event)
            except asyncio.QueueFull:
                # Drop this progress event rather than block the worker
                # or leak memory. The client still gets terminators.
                pass

        def set_phase(phase: str) -> None:
            if state["phase"] != phase:
                state["phase"] = phase
                emit({"type": "phase", "phase": phase}, critical=True)

        def progress_callback(progress_data: dict):
            """Called by solver when a new solution is found (worker thread)."""
            state["solutions"] += 1
            if state["solutions"] == 1:
                set_phase("search")
            emit({"type": "progress", **progress_data})

        def solve_in_thread():
            """Run solver in thread pool to avoid blocking event loop."""
            try:
                schedule_config = _convert_to_schedule_config(request.config)
                players = _convert_players(request.players, request.config)
                matches = _convert_matches(request.matches)
                previous_assignments = _convert_previous_assignments(request.previousAssignments)

                scheduler = CPSATScheduler(
                    config=schedule_config,
                    solver_options=SolverOptions(
                        time_limit_seconds=30,
                        num_workers=4,
                        log_progress=False,
                    ),
                )
                scheduler.add_players(players)
                scheduler.add_matches(matches)
                scheduler.set_previous_assignments(previous_assignments)
                scheduler.build()

                stats = scheduler._compute_model_stats()
                emit(
                    {
                        "type": "model_built",
                        "numMatches": stats["num_matches"],
                        "numPlayers": stats["num_players"],
                        "numIntervals": stats["num_intervals"],
                        "numNoOverlap": stats["num_no_overlap"],
                        "numVariables": stats["num_variables"],
                        "multiMatchPlayers": stats["multi_match_players"],
                        "totalSlots": stats["total_slots"],
                        "courtCount": stats["court_count"],
                    },
                    critical=True,
                )
                set_phase("presolve")

                result = scheduler.solve(progress_callback=progress_callback)
                result_holder["result"] = result

            except Exception as e:
                log.exception("SSE solver worker failed")
                error_holder["error"] = str(e)

            emit({"type": "done"}, critical=True)

        executor_future = loop.run_in_executor(None, solve_in_thread)

        try:
            while True:
                # Poll for disconnect with a 1 s timeout on queue.get.
                try:
                    event = await asyncio.wait_for(progress_queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    if await http_request.is_disconnected():
                        log.info("SSE client disconnected; cancelling solver")
                        cancel_event.set()
                        return
                    continue

                if event["type"] == "done":
                    if "error" in error_holder:
                        # Server-side log has the detail (see solve_in_thread);
                        # client gets a generic message.
                        yield f"data: {json.dumps({'type': 'error', 'message': 'solver failed'})}\n\n"
                    elif "result" in result_holder:
                        result = result_holder["result"]
                        if getattr(result.status, "value", None) == "optimal":
                            yield f"data: {json.dumps({'type': 'phase', 'phase': 'proving'})}\n\n"
                        result_dto = _convert_result_to_dto(result)
                        yield f"data: {json.dumps({'type': 'complete', 'result': result_dto.model_dump()})}\n\n"
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    break
                else:
                    yield f"data: {json.dumps(event)}\n\n"
        finally:
            cancel_event.set()
            # Best-effort cancellation of the executor future; the solver
            # itself can't be preempted mid-solve (OR-Tools is C++), so
            # the worker runs to completion but its emits become no-ops.
            executor_future.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/schedule/validate", response_model=ValidationResponseDTO)
async def validate_schedule_move(request: ValidateMoveRequest) -> ValidationResponseDTO:
    """Cheap (pure-Python) feasibility check for a drag-to-reschedule move.

    No CP-SAT invocation. Used by the frontend during a drag to paint a red
    ring on the target cell when the proposed (slot, court) would violate a
    hard constraint. Target latency: <50 ms.
    """
    # Import lazily to keep the /validate helper out of the /schedule cold path.
    from api._validate import validate_move

    return validate_move(
        config=request.config,
        players=request.players,
        matches=request.matches,
        assignments=request.assignments,
        proposed_move=request.proposedMove,
        previous_assignments=request.previousAssignments,
    )


def _convert_to_schedule_config(config: TournamentConfig) -> ScheduleConfig:
    """Convert TournamentConfig to scheduler_core ScheduleConfig."""
    # Calculate total slots (handle overnight schedules)
    start_minutes = _time_to_minutes(config.dayStart)
    end_minutes = _time_to_minutes(config.dayEnd)

    # If end time is before start time, it's an overnight schedule (crosses midnight)
    if end_minutes <= start_minutes:
        end_minutes += 24 * 60  # Add 24 hours

    total_minutes = end_minutes - start_minutes
    total_slots = total_minutes // config.intervalMinutes

    # Calculate default rest slots
    default_rest_slots = config.defaultRestMinutes // config.intervalMinutes

    # Convert break windows (HH:mm) to half-open [start_slot, end_slot) ranges.
    break_slots: List[Tuple[int, int]] = []
    for b in (config.breaks or []):
        s = _time_to_slot(b.start, config.dayStart, config.intervalMinutes)
        e = _time_to_slot(b.end, config.dayStart, config.intervalMinutes)
        if e > s:
            break_slots.append((s, e))

    return ScheduleConfig(
        total_slots=total_slots,
        court_count=config.courtCount,
        interval_minutes=config.intervalMinutes,
        default_rest_slots=default_rest_slots,
        freeze_horizon_slots=config.freezeHorizonSlots,
        current_slot=0,
        soft_rest_enabled=False,
        rest_slack_penalty=10.0,
        disruption_penalty=5.0,
        late_finish_penalty=1.0,
        court_change_penalty=2.0,
        # Court utilization
        enable_court_utilization=config.enableCourtUtilization if config.enableCourtUtilization is not None else True,
        court_utilization_penalty=config.courtUtilizationPenalty if config.courtUtilizationPenalty is not None else 50.0,
        # Game proximity
        enable_game_proximity=config.enableGameProximity if config.enableGameProximity is not None else False,
        min_game_spacing_slots=config.minGameSpacingSlots,
        max_game_spacing_slots=config.maxGameSpacingSlots,
        game_proximity_penalty=config.gameProximityPenalty if config.gameProximityPenalty is not None else 5.0,
        # Compact schedule
        enable_compact_schedule=config.enableCompactSchedule if config.enableCompactSchedule is not None else False,
        compact_schedule_mode=config.compactScheduleMode if config.compactScheduleMode is not None else "minimize_makespan",
        compact_schedule_penalty=config.compactSchedulePenalty if config.compactSchedulePenalty is not None else 100.0,
        target_finish_slot=config.targetFinishSlot,
        # Player overlap
        allow_player_overlap=config.allowPlayerOverlap if config.allowPlayerOverlap is not None else False,
        player_overlap_penalty=config.playerOverlapPenalty if config.playerOverlapPenalty is not None else 50.0,
        # Break windows
        break_slots=break_slots,
    )


def _convert_players(players: List[PlayerDTO], config: TournamentConfig) -> List[Player]:
    """Convert PlayerDTOs to scheduler_core Player objects."""
    player_list = []
    for player in players:
        # Convert availability windows to slot ranges
        availability_slots = []
        for window in player.availability:
            start_slot = _time_to_slot(window.start, config.dayStart, config.intervalMinutes)
            end_slot = _time_to_slot(window.end, config.dayStart, config.intervalMinutes)
            availability_slots.append((start_slot, end_slot))

        # Calculate rest slots from rest minutes (use config default if not specified)
        rest_minutes = player.minRestMinutes if player.minRestMinutes is not None else config.defaultRestMinutes
        rest_slots = rest_minutes // config.intervalMinutes

        player_list.append(Player(
            id=player.id,
            name=player.name,
            availability=availability_slots,  # Empty list means available all day
            rest_slots=rest_slots,
            rest_is_hard=True,  # Always enforce rest as hard constraint
            rest_penalty=10.0,
        ))

    return player_list


def _convert_matches(matches: List[MatchDTO]) -> List[Match]:
    """Convert MatchDTOs to scheduler_core Match objects."""
    match_list = []
    for match in matches:
        # Use eventRank if available, otherwise generate from match ID
        event_code = match.eventRank if match.eventRank else f"MATCH-{match.id[:8]}"

        match_list.append(Match(
            id=match.id,
            event_code=event_code,
            duration_slots=match.durationSlots,
            side_a=match.sideA if match.sideA else [],
            side_b=match.sideB if match.sideB else [],
        ))

    return match_list


def _convert_previous_assignments(
    assignments_data: Optional[List] = None,
) -> List[PreviousAssignment]:
    """Convert previous assignments to core ``PreviousAssignment`` objects.

    Accepts either a list of ``PreviousAssignmentDTO`` (typed) or a list of raw
    dicts — legacy clients before the DTO was introduced send dicts.
    """
    if not assignments_data:
        return []

    previous_assignments: List[PreviousAssignment] = []
    for pa in assignments_data:
        if hasattr(pa, 'model_dump'):
            pa = pa.model_dump()
        previous_assignments.append(PreviousAssignment(
            match_id=pa.get('matchId', ''),
            slot_id=pa.get('slotId', 0),
            court_id=pa.get('courtId', 0),
            locked=pa.get('locked', False),
            pinned_slot_id=pa.get('pinnedSlotId'),
            pinned_court_id=pa.get('pinnedCourtId'),
        ))

    return previous_assignments


def _convert_result_to_dto(result) -> ScheduleDTO:
    """Convert scheduler_core ScheduleResult to API ScheduleDTO."""
    # Convert assignments
    assignments = [
        ScheduleAssignment(
            matchId=a.match_id,
            slotId=a.slot_id,
            courtId=a.court_id,
            durationSlots=a.duration_slots,
        )
        for a in result.assignments
    ]

    # Convert soft violations
    soft_violations = [
        SoftViolation(
            type=v.type,
            matchId=v.match_id if v.match_id else None,
            playerId=v.player_id if v.player_id else None,
            description=v.description,
            penaltyIncurred=v.penalty_incurred,
        )
        for v in result.soft_violations
    ]

    # Map solver status
    status_map = {
        'optimal': SolverStatus.OPTIMAL,
        'feasible': SolverStatus.FEASIBLE,
        'infeasible': SolverStatus.INFEASIBLE,
        'unknown': SolverStatus.UNKNOWN,
        'model_invalid': SolverStatus.UNKNOWN,
    }
    status = status_map.get(result.status.value.lower(), SolverStatus.UNKNOWN)

    return ScheduleDTO(
        assignments=assignments,
        unscheduledMatches=result.unscheduled_matches,
        softViolations=soft_violations,
        objectiveScore=result.objective_score,
        infeasibleReasons=result.infeasible_reasons,
        status=status,
    )


def _time_to_minutes(time: str) -> int:
    """Convert HH:mm to minutes since midnight.

    Pydantic's HHMMTime validator on TournamentConfig already guarantees
    shape, but this is called with user-authored BreakWindow strings and
    the occasional test fixture — keep a defensive guard so a malformed
    value becomes a 422 rather than an unhandled 500.
    """
    try:
        hours, minutes = map(int, time.split(":"))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=422, detail=f"invalid time string: {time!r}")
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise HTTPException(status_code=422, detail=f"time out of range: {time!r}")
    return hours * 60 + minutes


def _time_to_slot(time: str, day_start: str, interval_minutes: int) -> int:
    """Convert time to slot number relative to day start.

    Handles overnight schedules where times after midnight are still
    part of the schedule (e.g., start 22:00, availability until 02:00).
    """
    start_minutes = _time_to_minutes(day_start)
    time_minutes = _time_to_minutes(time)

    # If time is before day_start, it's the next day (overnight schedule)
    if time_minutes < start_minutes:
        time_minutes += 24 * 60  # Add 24 hours

    return (time_minutes - start_minutes) // interval_minutes
