"""Public scheduling API. The single canonical entry point for the engine."""

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
    """Solve a scheduling problem.

    Args:
        problem: ScheduleRequest (config, players, matches, previous_assignments, solver_options).
        options: Optional solver options override; falls back to ``problem.solver_options``.

    Returns:
        ScheduleResult (status, assignments, soft_violations, infeasible_reasons, ...).
    """
    backend = CPSATBackend(solver_options=options or problem.solver_options)
    return backend.solve(problem)
