"""Core domain models for the scheduling engine.

These models are sport-agnostic and form the core of the scheduling library.
They mirror the API schemas but are independent of FastAPI.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Tuple, Union


class SolverStatus(str, Enum):
    """Solver result status."""
    OPTIMAL = "optimal"
    FEASIBLE = "feasible"
    INFEASIBLE = "infeasible"
    UNKNOWN = "unknown"
    MODEL_INVALID = "model_invalid"


@dataclass
class Player:
    """Player with constraints."""
    id: str
    name: str
    availability: List[Tuple[int, int]] = field(default_factory=list)
    rest_slots: int = 1
    rest_is_hard: bool = True
    rest_penalty: float = 10.0


@dataclass
class Match:
    """Match to be scheduled."""
    id: str
    event_code: str
    duration_slots: int = 1
    side_a: List[str] = field(default_factory=list)
    side_b: List[str] = field(default_factory=list)


@dataclass
class PreviousAssignment:
    """Previous assignment for re-optimization."""
    match_id: str
    slot_id: int
    court_id: int
    locked: bool = False
    pinned_slot_id: Optional[int] = None
    pinned_court_id: Optional[int] = None


@dataclass
class LockedAssignment:
    """Hard-pin a match at a known court + time slot.

    Introduced by the architecture-adjustment arc (Step B). Mirrors
    the rows in the new ``matches`` SQL table whose ``status`` is in
    ``LOCKED_STATUSES`` (called / playing / finished / retired). The
    solver must never reassign these matches.

    Distinct from :class:`PreviousAssignment`: the latter can be a
    hint (locked=False) or a lock (locked=True), and it carries
    legacy fields for the older constraint plugin. A
    ``LockedAssignment`` is unambiguously a hard pin.

    ``court_id`` is an integer to match the rest of the codebase
    (``Match.court_id``, ``MatchDTO.preferredCourt``, the CP-SAT
    ``court`` variable's ``[1, C]`` domain). The prompt's pseudocode
    uses ``str``; ``int`` is the deviation that matches the data
    model and avoids a redundant ``_court_index`` translation.
    """
    match_id: str
    court_id: int
    time_slot: int


@dataclass
class ScheduleConfig:
    """Tournament/schedule configuration."""
    total_slots: int
    court_count: int
    interval_minutes: int = 30
    default_rest_slots: int = 1
    freeze_horizon_slots: int = 0
    current_slot: int = 0

    # Objective weights
    soft_rest_enabled: bool = False
    rest_slack_penalty: float = 10.0
    disruption_penalty: float = 1.0
    late_finish_penalty: float = 0.5
    court_change_penalty: float = 0.5
    enable_court_utilization: bool = True
    court_utilization_penalty: float = 50.0

    # Game proximity constraint
    enable_game_proximity: bool = False
    min_game_spacing_slots: Optional[int] = None
    max_game_spacing_slots: Optional[int] = None
    game_proximity_penalty: float = 5.0

    # Compact schedule - minimize makespan or eliminate gaps
    enable_compact_schedule: bool = False
    compact_schedule_mode: str = "minimize_makespan"  # "minimize_makespan" | "no_gaps" | "finish_by_time"
    compact_schedule_penalty: float = 100.0
    target_finish_slot: Optional[int] = None  # For "finish_by_time" mode

    # Allow player overlap - makes player non-overlap a soft constraint
    allow_player_overlap: bool = False
    player_overlap_penalty: float = 50.0

    # Break windows (lunch, etc.) — half-open [start_slot, end_slot) ranges
    # during which no match may occupy any slot. Applied as a hard constraint.
    break_slots: List[Tuple[int, int]] = field(default_factory=list)

    # Closed-court windows: list of (court_id, from_slot, to_slot)
    # where the half-open ``[from_slot, to_slot)`` range is forbidden
    # on that court. An indefinite/full-day closure is stored as
    # ``(court_id, 0, total_slots)``. Applied as fixed blocker
    # intervals on each affected court so the existing court-capacity
    # NoOverlap mechanism keeps matches out of the closed window.
    closed_court_windows: List[Tuple[int, int, int]] = field(default_factory=list)

    # Backward-compat alias: the legacy shape was a flat list of court
    # ids meaning "closed all day". Translated into ``closed_court_windows``
    # by the adapter. Kept here so existing tests + callers that
    # construct ``ScheduleConfig`` directly continue to work.
    closed_court_ids: List[int] = field(default_factory=list)


@dataclass
class SolverOptions:
    """Solver execution options."""
    time_limit_seconds: float = 5.0
    num_workers: int = 1
    random_seed: int = 42
    log_progress: bool = False
    # When True, force ``num_workers = 1`` regardless of the value above.
    # CP-SAT only guarantees deterministic output (same input + same seed
    # → byte-identical schedule) under a single search worker.
    deterministic: bool = False


@dataclass
class Assignment:
    """Scheduled assignment output."""
    match_id: str
    slot_id: int
    court_id: int
    duration_slots: int
    moved: bool = False
    previous_slot_id: Optional[int] = None
    previous_court_id: Optional[int] = None


@dataclass
class SoftViolation:
    """Soft constraint violation."""
    type: str
    match_id: Optional[str] = None
    player_id: Optional[str] = None
    description: str = ""
    penalty_incurred: float = 0.0


@dataclass
class ScheduleSnapshot:
    """One alternative schedule found mid-solve.

    CP-SAT calls ``on_solution_callback`` for every improving solution
    while it climbs toward the optimum. The legacy code threw all but
    the final one away; the candidate collector keeps the top-N here.

    The operator can swap the active schedule to a different snapshot
    in a click — useful when reality (overrun, withdrawal, court
    closure) makes the chosen schedule no longer fit.
    """
    assignments: List[Assignment] = field(default_factory=list)
    objective_value: float = 0.0
    found_at_seconds: float = 0.0
    solution_id: str = ""


@dataclass
class ScheduleResult:
    """Complete scheduling result."""
    status: SolverStatus
    objective_score: Optional[float] = None
    runtime_ms: float = 0.0
    assignments: List[Assignment] = field(default_factory=list)
    soft_violations: List[SoftViolation] = field(default_factory=list)
    infeasible_reasons: List[str] = field(default_factory=list)
    unscheduled_matches: List[str] = field(default_factory=list)
    moved_count: int = 0
    locked_count: int = 0
    # The random seed the solver actually used. Lets the operator (or a
    # test) reproduce a schedule byte-for-byte by re-running with the
    # same seed + deterministic mode.
    solver_seed: Optional[int] = None
    # Top-N near-optimal alternatives the solver found while improving.
    # ``assignments`` above is always equivalent to ``candidates[0]``
    # when the pool is non-empty; older callers ignore this field.
    candidates: List[ScheduleSnapshot] = field(default_factory=list)


@dataclass
class ScheduleRequest:
    """Complete scheduling request (core domain)."""
    config: ScheduleConfig
    players: List[Player]
    matches: List[Match]
    previous_assignments: List[PreviousAssignment] = field(default_factory=list)
    solver_options: Optional[SolverOptions] = None
    # Step B: matches the solver MUST keep pinned at (court_id, time_slot).
    # Empty by default — callers without state-machine context (the
    # stateless ``POST /schedule`` route, legacy tests) leave it empty
    # and rely on the legacy ``PreviousAssignment.locked`` mechanism.
    locked_assignments: List[LockedAssignment] = field(default_factory=list)
