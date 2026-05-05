"""scheduler_core — pure-Python CP-SAT tournament scheduling engine.

Canonical entry point:
    schedule(problem, *, options=None) -> ScheduleResult

Lower-level surface for advanced reuse:
    CPSATBackend / CPSATScheduler / GreedyBackend / SchedulingBackend
    SchedulingProblemBuilder, BridgeOptions, LiveOpsConfig
    reschedule, update_actuals, apply_freeze_horizon, result_from_schedule
    handle_overrun, handle_no_show, handle_court_outage

Pure Python — no HTTP, no I/O. Bring your own DTO layer at the boundary.
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
from scheduler_core.schedule import schedule

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

__all__ = [
    "schedule",
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
]
