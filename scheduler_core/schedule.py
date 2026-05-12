"""Public scheduling API. One entry point for core, one for API-compat."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from scheduler_core.domain.models import (
    ScheduleRequest,
    ScheduleResult,
    SolverOptions,
)
from scheduler_core.engine.backends import CPSATBackend

if TYPE_CHECKING:
    from app.schemas import ScheduleRequest as ScheduleRequestAPI
    from app.schemas import ScheduleResponse as ScheduleResponseAPI


def schedule(
    problem: ScheduleRequest,
    *,
    options: Optional[SolverOptions] = None,
) -> ScheduleResult:
    """
    Solve a scheduling problem. Single entry point for core usage.

    Use this when you have core domain types (SchedulingProblem = ScheduleRequest).
    No FastAPI or app schemas required.

    Args:
        problem: SchedulingProblem (config, players, matches, previous_assignments, solver_options).
        options: Optional solver options override.

    Returns:
        SchedulingResult (status, assignments, soft_violations, infeasible_reasons, etc.).
    """
    backend = CPSATBackend(solver_options=options or problem.solver_options)
    return backend.solve(problem)


def schedule_from_api(request: "ScheduleRequestAPI") -> "ScheduleResponseAPI":
    """
    Solve from API request, return API response. Convenience wrapper for API usage.

    Imports app schemas only when called, so core remains usable without FastAPI.

    Args:
        request: API ScheduleRequest (camelCase, Pydantic).

    Returns:
        API ScheduleResponse (camelCase, Pydantic).
    """
    from scheduler_core.api_compat import to_core_request, to_api_response

    core = to_core_request(request)
    result = schedule(core, options=core.solver_options)
    return to_api_response(result)
