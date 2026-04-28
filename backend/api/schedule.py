"""Stateless schedule API endpoint - directly uses scheduler_core engine.

DTO ↔ engine conversion lives in ``backend/adapters/badminton.py``.
This module is a thin route surface around it.
"""
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
import json
import asyncio
from app.schemas import (
    TournamentConfig, PlayerDTO, MatchDTO, ScheduleDTO,
    ScheduleAssignment, SolverStatus,
    PreviousAssignmentDTO, ProposedMoveDTO, ValidationResponseDTO,
)
import app.scheduler_core_path  # noqa: F401  -- side effect: sys.path setup

# Import directly from scheduler_core domain models and engine
try:
    from scheduler_core.domain.models import ScheduleRequest
    from scheduler_core.engine import CPSATBackend
    from scheduler_core.engine.cpsat_backend import CPSATScheduler
except ImportError as e:
    raise ImportError(
        f"Could not import scheduler_core: {e}. "
        "Make sure src/scheduler_core is accessible."
    )

from adapters.badminton import (
    CANDIDATE_POOL_SIZE,
    DEFAULT_SOLVER_OPTIONS,
    prepare_solver_input,
    result_to_dto,
    solver_options_for,
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
        schedule_config, players, matches, previous_assignments = prepare_solver_input(request.config, request.players, request.matches, request.previousAssignments)
        solver_options = solver_options_for(request.config)
        solver_request = ScheduleRequest(
            config=schedule_config,
            players=players,
            matches=matches,
            previous_assignments=previous_assignments,
            solver_options=solver_options,
        )
        result = CPSATBackend(
            solver_options=solver_request.solver_options,
            candidate_pool_size=CANDIDATE_POOL_SIZE,
        ).solve(solver_request)
        return result_to_dto(result)

    except Exception:
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
                schedule_config, players, matches, previous_assignments = prepare_solver_input(request.config, request.players, request.matches, request.previousAssignments)

                scheduler = CPSATScheduler(
                    config=schedule_config,
                    solver_options=solver_options_for(request.config),
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

                result = scheduler.solve(
                    progress_callback=progress_callback,
                    candidate_pool_size=CANDIDATE_POOL_SIZE,
                )
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
                        result_dto = result_to_dto(result)
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

