"""Scheduler core library — competition layer + scheduling layer.

Public API (stable, minimal):
- schedule(problem, *, options?) -> SchedulingResult
- schedule_from_api(request) -> ScheduleResponse  (lazy app import; use from API layer)

Core usable without FastAPI and without importing app schemas.
"""
from scheduler_core.domain import (
    Assignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
    ScheduleResult,
    SchedulingProblem,
    SchedulingResult,
    SoftViolation,
    SolverOptions,
    SolverStatus,
    FrameworkError,
    ValidationError,
    InfeasibleError,
)
from scheduler_core.schedule import schedule, schedule_from_api

# Backend + competition (for extension and advanced usage)
from scheduler_core.engine import (
    CPSATBackend,
    CPSATScheduler,
    GreedyBackend,
    SchedulingBackend,
    SchedulingProblemBuilder,
    BridgeOptions,
    LiveOpsConfig,
    reschedule,
    update_actuals,
    apply_freeze_horizon,
    result_from_schedule,
    handle_overrun,
    handle_no_show,
    handle_court_outage,
)
# Advanced tournament features (competition, plugins, tournament) are commented out
# because these modules don't exist or aren't needed for the stateless backend.
#
# from scheduler_core.competition import (...)  # Module doesn't exist
# from scheduler_core.plugins import (...)  # Not needed for stateless
# from scheduler_core.domain.tournament import (...)  # Not needed for stateless

__all__ = [
    "schedule",
    "schedule_from_api",
    "SchedulingProblem",
    "SchedulingResult",
    "ScheduleRequest",
    "ScheduleResult",
    "ScheduleConfig",
    "SolverOptions",
    "SolverStatus",
    "Assignment",
    "Match",
    "Player",
    "PreviousAssignment",
    "SoftViolation",
    "FrameworkError",
    "ValidationError",
    "InfeasibleError",
    "CPSATScheduler",
    "CPSATBackend",
    "GreedyBackend",
    "SchedulingBackend",
    "SchedulingProblemBuilder",
    "BridgeOptions",
    "LiveOpsConfig",
    "reschedule",
    "update_actuals",
    "apply_freeze_horizon",
    "result_from_schedule",
    "handle_overrun",
    "handle_no_show",
    "handle_court_outage",
    # Advanced tournament features removed (competition, plugins, tournament modules)
]
