"""Core exceptions for the scheduling engine.

Canonical framework exceptions:
- FrameworkError: base for all framework errors
- ValidationError: invalid input / request
- InfeasibleError: no feasible schedule exists
"""


class SchedulingError(Exception):
    """Base exception for scheduling errors. Prefer FrameworkError for new code."""
    pass


class FrameworkError(SchedulingError):
    """Base exception for framework errors. Use for validation, infeasibility, etc."""
    pass


class InvalidRequestError(FrameworkError):
    """Raised when a request is invalid."""
    pass


class InfeasibleScheduleError(FrameworkError):
    """Raised when a schedule is infeasible."""
    pass


# Canonical aliases (use these in public API and docs)
ValidationError = InvalidRequestError
InfeasibleError = InfeasibleScheduleError
