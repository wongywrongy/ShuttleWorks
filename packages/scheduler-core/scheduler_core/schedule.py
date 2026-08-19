"""Public scheduling API."""

from __future__ import annotations

from typing import Optional

from scheduler_core.domain.models import (
    ScheduleRequest,
    ScheduleResult,
    SolverOptions,
)
from scheduler_core.engine.backends import CPSATBackend


def schedule(
    problem: ScheduleRequest,
    *,
    options: Optional[SolverOptions] = None,
    candidate_pool_size: int = 0,
) -> ScheduleResult:
    """Solve a scheduling problem. Single batch entry point for core usage.

    Both product modules invoke CP-SAT through this function — the
    Bracket driver and the Meet ``POST /schedule`` handler. ``options``
    overrides the request's own ``solver_options`` (used by repair /
    warm-restart paths); ``candidate_pool_size`` asks the solver to keep
    that many near-optimal alternatives (the Meet candidate collector).
    The streaming Meet path drives ``CPSATScheduler`` directly instead —
    it needs per-solution progress callbacks, which is a streaming
    concern, not a separate solver.
    """
    backend = CPSATBackend(
        solver_options=options or problem.solver_options,
        candidate_pool_size=candidate_pool_size,
    )
    return backend.solve(problem)
