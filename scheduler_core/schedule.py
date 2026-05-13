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
) -> ScheduleResult:
    """Solve a scheduling problem. Single entry point for core usage."""
    backend = CPSATBackend(solver_options=options or problem.solver_options)
    return backend.solve(problem)
