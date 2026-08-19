"""Core domain models for the scheduling engine."""
from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
    ScheduleResult,
    SoftViolation,
    SolverOptions,
    SolverStatus,
)
from scheduler_core.domain.errors import (
    FrameworkError,
    InfeasibleScheduleError,
    InvalidRequestError,
    SchedulingError,
    ValidationError,
    InfeasibleError,
)
from scheduler_core.domain.tournament import (
    Event,
    EventId,
    Participant,
    ParticipantId,
    ParticipantType,
    PlayUnit,
    PlayUnitId,
    PlayUnitKind,
    Result,
    Side,
    TournamentAssignment,
    TournamentState,
    WinnerSide,
)

__all__ = [
    "Assignment",
    "Match",
    "Player",
    "PreviousAssignment",
    "ScheduleConfig",
    "ScheduleRequest",
    "ScheduleResult",
    "SoftViolation",
    "SolverOptions",
    "SolverStatus",
    "SchedulingError",
    "FrameworkError",
    "ValidationError",
    "InfeasibleError",
    "InfeasibleScheduleError",
    "InvalidRequestError",
    "SchedulingProblem",
    "SchedulingResult",
    "Event",
    "EventId",
    "Participant",
    "ParticipantId",
    "ParticipantType",
    "PlayUnit",
    "PlayUnitId",
    "PlayUnitKind",
    "Result",
    "Side",
    "TournamentAssignment",
    "TournamentState",
    "WinnerSide",
]

# Canonical aliases (use in public API)
SchedulingProblem = ScheduleRequest
SchedulingResult = ScheduleResult
