"""Pydantic schemas for API requests/responses - simplified for school sparring."""
import uuid
from typing import Annotated, List, Literal, Optional, Dict, Any
from pydantic import BaseModel, Field, StringConstraints
from enum import Enum
from app.time_utils import now_iso


# Reusable constrained types
HHMMTime = Annotated[
    str,
    StringConstraints(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$"),
]


# Enums
class SolverStatus(str, Enum):
    OPTIMAL = "optimal"
    FEASIBLE = "feasible"
    INFEASIBLE = "infeasible"
    UNKNOWN = "unknown"


class ScheduleView(str, Enum):
    TIMESLOT = "timeslot"
    COURT = "court"


# Tournament Configuration
class BreakWindow(BaseModel):
    start: HHMMTime  # HH:mm format, 00:00–23:59
    end: HHMMTime


class CourtClosure(BaseModel):
    """A court closure window. ``fromTime`` / ``toTime`` are HH:mm
    wall-clock bounds inside the tournament day. Either may be omitted:

    - both omitted → court is closed all day (indefinite)
    - only ``fromTime`` omitted → closed from start of day to ``toTime``
    - only ``toTime`` omitted → closed from ``fromTime`` to end of day

    The solver translates the bounds to slot indices via the same
    rounding ``time_to_slot`` uses for breaks.
    """
    courtId: int = Field(..., ge=1, le=64)
    fromTime: Optional[HHMMTime] = None
    toTime: Optional[HHMMTime] = None
    reason: Optional[str] = None


class TournamentConfig(BaseModel):
    # Human-readable tournament name. Drives backup filenames and the
    # public-display headline. Optional — UI falls back to defaults
    # when unset.
    tournamentName: Optional[str] = None
    # Per-tournament meet mode (``dual`` = School A vs B, ``tri`` =
    # three-way). The auto-match generator and rendering surfaces
    # branch on this value.
    meetMode: Optional[Literal["dual", "tri"]] = None
    intervalMinutes: int = Field(..., gt=0, le=240)
    dayStart: HHMMTime
    dayEnd: HHMMTime
    tournamentDate: Optional[str] = None  # ISO date string: "2026-02-15"
    breaks: List[BreakWindow] = Field(default_factory=list)
    courtCount: int = Field(..., ge=1, le=64)
    defaultRestMinutes: int = Field(..., ge=0, le=240)
    freezeHorizonSlots: int = Field(..., ge=0, le=1000)
    rankCounts: Dict[str, int] = Field(default_factory=dict)  # {"MS": 3, "WS": 3, "MD": 2, "WD": 4, "XD": 2}
    enableCourtUtilization: Optional[bool] = True
    courtUtilizationPenalty: Optional[float] = Field(50.0, ge=0)
    # Game proximity constraint
    enableGameProximity: Optional[bool] = False
    minGameSpacingSlots: Optional[int] = Field(None, ge=0)
    maxGameSpacingSlots: Optional[int] = Field(None, ge=0)
    gameProximityPenalty: Optional[float] = Field(5.0, ge=0)
    # Compact schedule
    enableCompactSchedule: Optional[bool] = False
    compactScheduleMode: Optional[Literal["minimize_makespan", "no_gaps", "finish_by_time"]] = (
        "minimize_makespan"
    )
    compactSchedulePenalty: Optional[float] = Field(100.0, ge=0)
    targetFinishSlot: Optional[int] = Field(None, ge=0)
    # Player overlap
    allowPlayerOverlap: Optional[bool] = False
    playerOverlapPenalty: Optional[float] = Field(50.0, ge=0)
    # Scoring format — UI metadata, not a solver input. Declared here so
    # Pydantic's serializer preserves the fields across PUT round-trips.
    scoringFormat: Optional[Literal["simple", "badminton"]] = None
    setsToWin: Optional[int] = Field(None, ge=1, le=3)
    pointsPerSet: Optional[int] = Field(None, ge=11, le=30)
    deuceEnabled: Optional[bool] = None
    # Public TV display mode (UI-only metadata; preserved across PUT).
    tvDisplayMode: Optional[Literal["strip", "grid", "list"]] = None
    # Public-display branding + layout knobs (all UI-only).
    tvAccent: Optional[str] = None  # hex "#RRGGBB"
    tvPreset: Optional[
        Literal[
            "court", "pitch", "midnight", "ash",
            "paper", "chalk", "daylight", "sand",
        ]
    ] = None
    tvGridColumns: Optional[int] = Field(None, ge=1, le=4)
    tvCardSize: Optional[Literal["auto", "compact", "comfortable", "large"]] = None
    tvShowScores: Optional[bool] = None
    # Roster position-grid event-column order + visibility (UI-only).
    eventOrder: Optional[List[str]] = None
    eventVisible: Optional[Dict[str, bool]] = None
    # ---- Engine settings ------------------------------------------
    deterministic: Optional[bool] = None
    randomSeed: Optional[int] = None
    # Solver wall-clock cap; higher = closer to optimal at the cost
    # of operator wait time. Default 30s (DEFAULT_SOLVER_OPTIONS).
    solverTimeLimitSeconds: Optional[float] = Field(None, gt=0, le=300)
    # Top-N near-optimal alternatives the solver keeps. Default 5.
    candidatePoolSize: Optional[int] = Field(None, ge=1, le=20)
    # Court IDs (1-indexed) that the solver must avoid in every solve
    # — generate, warm-restart, and repair all read this list. Closures
    # are persisted by committing a court_closed disruption proposal,
    # and reopened via the director "Reopen court" action.
    #
    # ``closedCourts`` is the legacy "closed all day" shape; new
    # closures with explicit time bounds go in ``courtClosures``. The
    # solver merges both — every entry in ``closedCourts`` is treated
    # as an indefinite all-day closure.
    closedCourts: List[int] = Field(default_factory=list)
    courtClosures: List[CourtClosure] = Field(default_factory=list)
    # ---- Time-axis (director tools) -------------------------------
    # Wall-clock minutes added to every unstarted match's displayed
    # start time. Mutated by `POST /schedule/director-action` with
    # `kind="delay_start"`. The solver still plans on the abstract
    # slot grid; this offset is purely a display concern, so a delay
    # of 30 min costs no re-solve. Cleared back to 0 on schedule
    # reset.
    clockShiftMinutes: Optional[int] = Field(0, ge=0, le=24 * 60)
    # ---- Bracket-kind settings -----------------------------------
    # Slots of forced rest between bracket rounds. Bracket-side only.
    restBetweenRounds: int = Field(default=1, ge=0)


# Availability
class AvailabilityWindow(BaseModel):
    start: HHMMTime
    end: HHMMTime


# Roster Group (for school grouping)
class RosterGroupDTO(BaseModel):
    id: str
    name: str
    metadata: Optional[Dict[str, Any]] = None


# Player
class PlayerDTO(BaseModel):
    id: str  # Auto-generated UUID
    name: str
    groupId: str  # School group ID (REQUIRED - this is school vs school scheduling)
    ranks: List[str] = Field(default_factory=list)  # [MS1, MD1, XD1] - Player can play multiple events
    availability: List[AvailabilityWindow] = Field(default_factory=list)
    minRestMinutes: Optional[int] = None  # If not provided, uses config.defaultRestMinutes
    notes: Optional[str] = None


class BracketPlayerDTO(BaseModel):
    """Roster entry for bracket-kind tournaments.

    ``id`` is the stable slug produced by the frontend ``playerSlug()``
    helper; matches ``bracket_participants.member_ids`` after migration.
    """
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    notes: Optional[str] = None
    restSlots: Optional[int] = Field(default=None, ge=0)


class RosterImportDTO(BaseModel):
    csv: str


# Match - simplified for school sparring (supports dual and tri-meets)
class MatchDTO(BaseModel):
    id: str
    matchNumber: Optional[int] = None  # Display ordinal (frontend-authored sequence)
    sideA: List[str] = Field(default_factory=list)  # List of player IDs (School A)
    sideB: List[str] = Field(default_factory=list)  # List of player IDs (School B)
    sideC: Optional[List[str]] = None  # List of player IDs (School C) - for tri-meets
    matchType: str = "dual"  # "dual" or "tri"
    eventRank: Optional[str] = None  # MS1, MS2, WS1, WS2, etc. - the rank/event this match represents
    durationSlots: int = 1
    preferredCourt: Optional[int] = None
    tags: Optional[List[str]] = None  # Optional tags like ["School A", "School B"]


# Schedule
class ScheduleAssignment(BaseModel):
    matchId: str
    slotId: int
    courtId: int
    durationSlots: int


class PreviousAssignmentDTO(BaseModel):
    """Typed previous assignment used by /schedule re-solve and drag pin-and-resolve."""
    matchId: str
    slotId: int
    courtId: int
    locked: bool = False
    pinnedSlotId: Optional[int] = None
    pinnedCourtId: Optional[int] = None


class ProposedMoveDTO(BaseModel):
    """A single drag target evaluated by /schedule/validate."""
    matchId: str
    slotId: int
    courtId: int


class ValidationConflict(BaseModel):
    """One reason a proposed move or a full schedule is infeasible."""
    type: str  # court_conflict | player_overlap | availability | rest | break | out_of_day | invalid_court | ...
    description: str
    matchId: Optional[str] = None
    otherMatchId: Optional[str] = None
    playerId: Optional[str] = None
    courtId: Optional[int] = None
    slotId: Optional[int] = None


class ValidationResponseDTO(BaseModel):
    feasible: bool
    conflicts: List[ValidationConflict] = Field(default_factory=list)


class SoftViolation(BaseModel):
    type: str
    matchId: Optional[str] = None
    playerId: Optional[str] = None
    description: str
    penaltyIncurred: float


class ScheduleCandidate(BaseModel):
    """One alternative schedule the solver found while improving.

    The pool is captured during the initial solve; operator can swap
    the active candidate without a re-solve. ``solutionId`` is a stable
    id for React keys; ``objectiveScore`` lets the UI show how each
    candidate ranks; ``foundAtSeconds`` is wall-clock seconds since
    solve start (lower = solver's earlier guess, often more disrupted).
    """
    solutionId: str
    assignments: List[ScheduleAssignment] = Field(default_factory=list)
    objectiveScore: float = 0.0
    foundAtSeconds: float = 0.0


class ScheduleDTO(BaseModel):
    assignments: List[ScheduleAssignment] = Field(default_factory=list)
    unscheduledMatches: List[str] = Field(default_factory=list)
    softViolations: List[SoftViolation] = Field(default_factory=list)
    objectiveScore: Optional[float] = None
    infeasibleReasons: List[str] = Field(default_factory=list)
    status: SolverStatus
    # The seed the solver actually used. Pair with ``deterministic`` to
    # reproduce a schedule byte-for-byte from the same input.
    solverSeed: Optional[int] = None
    # Top-N near-optimal alternatives. ``assignments`` above always
    # equals ``candidates[activeCandidateIndex].assignments`` when the
    # pool is non-empty; older clients ignore both fields.
    candidates: List[ScheduleCandidate] = Field(default_factory=list)
    activeCandidateIndex: Optional[int] = None


# ---- Schedule impact (proposal pipeline) ------------------------------

class MatchMove(BaseModel):
    """One match's slot/court change between committed and proposed schedules."""
    matchId: str
    fromSlotId: Optional[int] = None    # None when match was previously unscheduled
    toSlotId: Optional[int] = None      # None when match becomes unscheduled
    fromCourtId: Optional[int] = None
    toCourtId: Optional[int] = None
    matchNumber: Optional[int] = None   # display ordinal, surfaced for UI
    eventRank: Optional[str] = None


class PlayerImpact(BaseModel):
    """Aggregate of how a single player's day changes."""
    playerId: str
    playerName: Optional[str] = None
    matchCount: int                     # # of their matches that move
    earliestSlotDelta: int              # signed slot delta of earliest move (negative = earlier)


class SchoolImpact(BaseModel):
    """Aggregate of how a single roster group's day changes."""
    groupId: str
    groupName: Optional[str] = None
    matchCount: int                     # # of matches involving this school that move


class MetricDelta(BaseModel):
    """Signed differences between proposed and committed schedules.

    Positive = proposed is *worse* on that axis (more violations / higher
    penalty). UI surfaces these with conventional improvement-is-good
    coloring: `restViolationsDelta < 0` is green, `> 0` is red.
    """
    objectiveDelta: Optional[float] = None      # proposed.objectiveScore - committed.objectiveScore
    softViolationCountDelta: int = 0
    restViolationsDelta: int = 0
    proximityViolationsDelta: int = 0
    totalPenaltyDelta: float = 0.0
    unscheduledMatchesDelta: int = 0


class Impact(BaseModel):
    """Pre-commit diff produced by the proposal pipeline.

    Computed once when a proposal is created and stashed alongside it,
    so reviewing the same proposal later doesn't re-run the diff.

    ``clockShiftMinutesDelta`` is non-zero only for director ``delay_start``
    proposals — those don't move any matches in slot-space but do shift
    the displayed wall-clock for every unstarted match.
    """
    movedMatches: List[MatchMove] = Field(default_factory=list)
    affectedPlayers: List[PlayerImpact] = Field(default_factory=list)
    affectedSchools: List[SchoolImpact] = Field(default_factory=list)
    metricDelta: MetricDelta = Field(default_factory=MetricDelta)
    infeasibilityWarnings: List[str] = Field(default_factory=list)
    clockShiftMinutesDelta: int = 0


class ProposalKind(str, Enum):
    WARM_RESTART = "warm_restart"
    REPAIR = "repair"
    MANUAL_EDIT = "manual_edit"
    DIRECTOR_ACTION = "director_action"


class Proposal(BaseModel):
    """A pending schedule change awaiting operator confirmation.

    Created by `POST /schedule/proposals/...`, kept in memory with a TTL,
    and applied to the persisted tournament state via the commit endpoint.
    The `fromScheduleVersion` snapshot is what the optimistic-concurrency
    check at commit time compares against — if the committed schedule
    has advanced since proposal creation, the commit is rejected with 409.

    ``proposedConfig`` is non-None only for director-action proposals —
    those mutate ``TournamentConfig`` (clockShiftMinutes, breaks, ...)
    in addition to the schedule. Commit applies both atomically.
    """
    id: str
    kind: ProposalKind
    proposedSchedule: ScheduleDTO
    proposedConfig: Optional[TournamentConfig] = None
    impact: Impact
    summary: Optional[str] = None
    fromScheduleVersion: int
    createdAt: str
    expiresAt: str


class Suggestion(BaseModel):
    """A pre-computed re-optimization proposal surfaced in the inbox.

    Wraps a (still-live) ``Proposal`` with display copy and a dedup
    fingerprint. The frontend reads these from
    ``GET /schedule/suggestions``; ``apply`` commits the underlying
    proposal; ``dismiss`` cancels it.

    ``fingerprint`` is the worker's idempotency key — re-running the
    same trigger against the same state yields the same fingerprint,
    so the worker can skip stamping a duplicate suggestion.
    """
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    # Output vocabulary for the inbox. The worker's TriggerKind
    # (services/suggestions_worker.py) overlaps on "optimize" and
    # "repair"; "director" and "candidate" are surfaced via paths that
    # don't go through the worker queue.
    kind: Literal["repair", "optimize", "director", "candidate"]
    title: str
    metric: str
    proposalId: str
    fingerprint: str
    fromScheduleVersion: int
    createdAt: str = Field(default_factory=now_iso)
    expiresAt: str


# Default suggestion TTL. Shorter than proposal TTL (30 min) because
# suggestions go stale faster (state moves under them).
SUGGESTION_TTL_MINUTES = 10


# ---- Advisories (live operations) -------------------------------------

class SuggestedAction(BaseModel):
    """A pre-filled action the UI can offer as a one-click resolve."""
    kind: Literal[
        "warm_restart",
        "repair",
        "delay_start",
        "insert_blackout",
        "compress_remaining",
        "remove_blackout",
    ]
    payload: Dict[str, Any] = Field(default_factory=dict)


class Advisory(BaseModel):
    """A live-operations recommendation surfaced to the operator.

    Produced by `GET /schedule/advisories` from the current match-state +
    tournament-state snapshot. Stable `id` lets clients dedupe across
    polling cycles even as `summary` drifts (e.g., overrun gets worse).
    """
    id: str
    kind: Literal[
        "overrun",
        "no_show",
        "running_behind",
        "infeasibility_risk",
        "start_delay_detected",
        "approaching_blackout",
    ]
    severity: Literal["info", "warn", "critical"]
    summary: str
    detail: Optional[str] = None
    matchId: Optional[str] = None
    courtId: Optional[int] = None
    suggestedAction: Optional[SuggestedAction] = None
    suggestionId: Optional[str] = None  # set when worker has stamped a pre-baked Suggestion for this advisory
    detectedAt: str                                  # ISO timestamp


# Match State (for Match Desk)
class MatchScore(BaseModel):
    sideA: int
    sideB: int


# NOTE: The canonical MatchStateDTO lives in api/match_state.py — that
# module owns persistence and field-validation. Importing it from there
# everywhere ensures Pydantic's class-identity validation doesn't reject
# instances flowing across the proposal pipeline (e.g., director-action
# → warm-restart). A 3-line stub used to live here; it caused 422s on
# /schedule/director-action when the real instance was passed into a
# WarmRestartRequest typed against the stub.


# Health
class HealthResponse(BaseModel):
    status: str
    version: str


# ---- Tournament state (whole-document persistence) --------------------

class ScheduleHistoryEntry(BaseModel):
    """Snapshot of a prior committed schedule, kept for revert + audit.

    Appended whenever a proposal is committed; the entry captures the
    schedule that was *replaced*, not the new one. Capped at 5 entries
    server-side (oldest dropped first) so the persisted state file stays
    bounded.
    """
    version: int                                    # the version this entry replaced
    committedAt: str                                # ISO timestamp of the swap
    trigger: Optional[str] = None                   # "warm_restart" | "repair" | "manual_edit" | "director_action" | "initial"
    summary: Optional[str] = None                   # short human-readable impact summary
    schedule: Optional[ScheduleDTO] = None          # full snapshot so the entry can be restored


class TournamentStateDTO(BaseModel):
    """Authoritative persisted state for one tournament.

    Writes come as a single blob: frontend Zustand state snapshotted and
    PUT to /tournament/state. Server stamps `updatedAt` on write; the
    client's value is ignored.
    """
    version: int = 1
    updatedAt: Optional[str] = None
    config: Optional[TournamentConfig] = None
    groups: List[RosterGroupDTO] = Field(default_factory=list)
    players: List[PlayerDTO] = Field(default_factory=list)
    matches: List[MatchDTO] = Field(default_factory=list)
    schedule: Optional[ScheduleDTO] = None
    scheduleStats: Optional[dict] = None
    scheduleIsStale: bool = False
    # Versioned-commit support (schema v2). ``scheduleVersion`` increments
    # on every successful commit through the proposal pipeline; clients
    # use it for optimistic-concurrency rejection of stale proposals.
    # ``scheduleHistory`` is the rolling-revert pool, capped at 5.
    scheduleVersion: int = 0
    scheduleHistory: List[ScheduleHistoryEntry] = Field(default_factory=list)
    bracketPlayers: List[BracketPlayerDTO] = Field(default_factory=list)
    bracketRosterMigrated: Optional[bool] = None


class SolverOptionsDTO(BaseModel):
    """Optional per-request override of solver parameters (no UI yet)."""
    timeLimitSeconds: Optional[float] = None
    numWorkers: Optional[int] = None
    randomSeed: Optional[int] = None


# ---- Commands (Step C) ------------------------------------------------


class CommandRequest(BaseModel):
    """Body of ``POST /tournaments/{tournament_id}/commands``.

    ``id`` is the *client-generated* UUID used as the idempotency key.
    The same id resubmitted gets the original outcome (200 on a
    previously-applied command, 409 on a previously-rejected one).
    ``seen_version`` is the ``matches.version`` the client observed
    when it composed the command — the processor rejects with 409
    ``stale_version`` if the row has moved on.

    ``action`` is typed as ``MatchAction`` so Pydantic validates the
    string at the parse boundary; unknown values yield a 422 before
    the route handler runs.
    """

    id: uuid.UUID
    match_id: str = Field(..., min_length=1, max_length=100)
    action: "MatchAction"
    payload: Optional[Dict[str, Any]] = None
    seen_version: int = Field(..., ge=0)


# Forward reference resolution — ``MatchAction`` is defined in
# ``app.constants`` which itself imports ``MatchStatus`` from
# ``database.models``. Importing it at the top of this module would
# create a cycle (schemas → constants → database → schemas via
# Pydantic introspection of forward refs). Resolving here keeps the
# import order clean.
from app.constants import MatchAction  # noqa: E402
CommandRequest.model_rebuild()


class CommandResponse(BaseModel):
    """200 body for a successful apply or an idempotent replay.

    Carries the *current* match state, not the post-original-apply
    state. On a replay where another operator moved the match in the
    interim, the response reflects current reality — that's the
    contract the operator UX wants ("here's the canonical state
    after your action; render from this").
    """

    command_id: uuid.UUID
    match_id: str
    status: str
    version: int
    court_id: Optional[int] = None
    time_slot: Optional[int] = None
    applied_at: str   # ISO-8601 UTC
    replay: bool      # True on idempotent replay, False on fresh apply
