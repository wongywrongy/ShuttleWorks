"""Pydantic schemas for API requests/responses - simplified for school sparring.

Input bounds (SP-SEC-1 Phase 1): every model here that parses request
input inherits ``StrictModel`` from ``core.limits`` — unknown fields are
rejected and every string is bounded. The size vocabulary
(``Name``/``Identifier``/``Notes``/…) lives there so the numbers are
decided once rather than per field.

Several models in this file are both a request shape and a response
shape (``ScheduleDTO`` and everything under it). Their bounds are set
generously enough for solver-authored content, because a bound that
rejects our own output is an outage, not a control.
"""
import uuid
from typing import Annotated, List, Literal, Optional, Dict, Any
from pydantic import BaseModel, Field, StringConstraints, model_validator
from enum import Enum
from core.limits import (
    MAX_ASSIGNMENTS,
    MAX_CANDIDATES,
    MAX_COURT_CLOSURES,
    MAX_COURTS,
    MAX_GROUPS,
    MAX_HISTORY,
    MAX_MATCHES,
    MAX_PLAYERS,
    MAX_RANKS,
    MAX_REASONS,
    MAX_SIDE_MEMBERS,
    MAX_TAGS,
    MAX_VIOLATIONS,
    MAX_WINDOWS,
    Code,
    Description,
    HexColor,
    Identifier,
    Name,
    Notes,
    Regulations,
    StrictModel,
    Timestamp,
)
from core.time_utils import now_iso


# Reusable constrained types
HHMMTime = Annotated[
    str,
    StringConstraints(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$"),
]

# Upper bounds for the abstract solver grid. The grid is slots x courts,
# both small by construction — a day divided into intervals, and a venue's
# courts. These ceilings exist so a payload cannot describe a grid the
# solver would spend the afternoon on; they are not domain rules.
MAX_SLOT_INDEX = 10_000
MAX_DURATION_SLOTS = 1_000
MAX_MATCH_NUMBER = 100_000
MAX_PENALTY = 1_000_000.0
MAX_SEED = 2**31 - 1


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
class BreakWindow(StrictModel):
    start: HHMMTime  # HH:mm format, 00:00–23:59
    end: HHMMTime


class CourtClosure(StrictModel):
    """A court closure window. ``fromTime`` / ``toTime`` are HH:mm
    wall-clock bounds inside the tournament day. Either may be omitted:

    - both omitted → court is closed all day (indefinite)
    - only ``fromTime`` omitted → closed from start of day to ``toTime``
    - only ``toTime`` omitted → closed from ``fromTime`` to end of day

    The solver translates the bounds to slot indices via the same
    rounding ``time_to_slot`` uses for breaks.
    """
    courtId: int = Field(..., ge=1, le=MAX_COURTS)
    fromTime: Optional[HHMMTime] = None
    toTime: Optional[HHMMTime] = None
    reason: Optional[Notes] = None


class TournamentConfig(StrictModel):
    # Human-readable tournament name. Drives backup filenames and the
    # public-display headline. Optional — UI falls back to defaults
    # when unset.
    tournamentName: Optional[Name] = None
    # Per-tournament meet mode (``dual`` = School A vs B, ``tri`` =
    # three-way). The auto-match generator and rendering surfaces
    # branch on this value.
    meetMode: Optional[Literal["dual", "tri"]] = None
    intervalMinutes: int = Field(..., gt=0, le=240)
    dayStart: HHMMTime
    dayEnd: HHMMTime
    tournamentDate: Optional[Timestamp] = None  # ISO date string: "2026-02-15"
    breaks: List[BreakWindow] = Field(default_factory=list, max_length=MAX_WINDOWS)
    courtCount: int = Field(..., ge=1, le=MAX_COURTS)
    defaultRestMinutes: int = Field(..., ge=0, le=240)
    freezeHorizonSlots: int = Field(..., ge=0, le=1000)
    # {"MS": 3, "WS": 3, "MD": 2, "WD": 4, "XD": 2} — keys are event
    # codes, so both the key length and the number of entries are bounded.
    rankCounts: Dict[Code, int] = Field(default_factory=dict, max_length=MAX_RANKS)
    enableCourtUtilization: Optional[bool] = True
    courtUtilizationPenalty: Optional[float] = Field(50.0, ge=0, le=MAX_PENALTY)
    # Game proximity constraint
    enableGameProximity: Optional[bool] = False
    minGameSpacingSlots: Optional[int] = Field(None, ge=0, le=MAX_SLOT_INDEX)
    maxGameSpacingSlots: Optional[int] = Field(None, ge=0, le=MAX_SLOT_INDEX)
    gameProximityPenalty: Optional[float] = Field(5.0, ge=0, le=MAX_PENALTY)
    # Compact schedule
    enableCompactSchedule: Optional[bool] = False
    compactScheduleMode: Optional[Literal["minimize_makespan", "no_gaps", "finish_by_time"]] = (
        "minimize_makespan"
    )
    compactSchedulePenalty: Optional[float] = Field(100.0, ge=0, le=MAX_PENALTY)
    targetFinishSlot: Optional[int] = Field(None, ge=0, le=MAX_SLOT_INDEX)
    # Player overlap
    allowPlayerOverlap: Optional[bool] = False
    playerOverlapPenalty: Optional[float] = Field(50.0, ge=0, le=MAX_PENALTY)
    # Scoring format — UI metadata, not a solver input. Declared here so
    # Pydantic's serializer preserves the fields across PUT round-trips.
    scoringFormat: Optional[Literal["simple", "badminton"]] = None
    setsToWin: Optional[int] = Field(None, ge=1, le=3)
    pointsPerSet: Optional[int] = Field(None, ge=11, le=30)
    deuceEnabled: Optional[bool] = None
    # Public TV display mode (UI-only metadata; preserved across PUT).
    # "strip" is RETIRED as a choice (SP-CONSOLE-2 DC-1) but stays accepted:
    # it was the default, so every workspace that never touched the setting
    # has it stored. The board maps it to "auto" on read — no migration, and
    # a rollback keeps working. New writes only ever send auto/grid/list.
    tvDisplayMode: Optional[Literal["auto", "strip", "grid", "list"]] = None
    # Public-display branding + layout knobs (all UI-only).
    # Hex "#RRGGBB". Validated here as well as in the browser: the
    # frontend's ``resolveTvAccent`` is a client-side control over a
    # server-stored value, which ASVS v5.0.0-2.2.2 says cannot be the
    # only one. The value reaches an inline ``style`` prop on the public
    # display board.
    tvAccent: Optional[HexColor] = None
    tvPreset: Optional[
        Literal[
            "court", "pitch", "midnight", "ash",
            "paper", "chalk", "daylight", "sand",
        ]
    ] = None
    tvGridColumns: Optional[int] = Field(None, ge=1, le=4)
    tvCardSize: Optional[Literal["auto", "compact", "comfortable", "large"]] = None
    tvShowScores: Optional[bool] = None
    # Display layout configuration (UI-only; all optional).
    courtOrder: Optional[List[Annotated[int, Field(ge=1, le=MAX_COURTS)]]] = Field(
        None, max_length=MAX_COURTS
    )
    hiddenCourts: Optional[List[Annotated[int, Field(ge=1, le=MAX_COURTS)]]] = Field(
        None, max_length=MAX_COURTS
    )
    # "side" is retired as a PLACEMENT (SP-CONSOLE-2 TV-5) — the persistent
    # panel took a third of the board's width from the courts — but stays
    # accepted, and "off" still means off. Everything else rotates.
    standingsMode: Optional[Literal["off", "side", "rotate"]] = None
    # Board rotation (TV-7 / DC-3). None = every slide that has data.
    tvRotationSlides: Optional[
        List[Literal["courts", "standings", "upNext"]]
    ] = Field(None, max_length=3)
    tvRotationDwellSeconds: Optional[int] = Field(None, ge=5, le=120)
    # Roster position-grid event-column order + visibility (UI-only).
    eventOrder: Optional[List[Code]] = Field(None, max_length=MAX_RANKS)
    eventVisible: Optional[Dict[Code, bool]] = Field(None, max_length=MAX_RANKS)
    # ---- Engine settings ------------------------------------------
    deterministic: Optional[bool] = None
    randomSeed: Optional[int] = Field(None, ge=0, le=MAX_SEED)
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
    # Court policy (SP-COURT-1, ADR 0015). "pinned" (default) = the solver
    # promises a specific court per match; "queue" = the solver pools the
    # courts and solves for time only, courts assigned by colouring.
    # ``courtOverrides`` maps 1-indexed court ids to "pinned" | "pool" —
    # exceptions to the policy, so a show court stays court-tied inside a
    # queue-mode venue. ``onDeckCount`` is the Run desk's CP5 lookahead.
    courtPolicy: Optional[Literal["pinned", "queue"]] = None
    courtOverrides: Optional[Dict[int, Literal["pinned", "pool"]]] = Field(
        None, max_length=MAX_COURTS
    )
    onDeckCount: Optional[int] = Field(None, ge=1, le=5)
    # ``closedCourts`` is the legacy "closed all day" shape; new
    # closures with explicit time bounds go in ``courtClosures``. The
    # solver merges both — every entry in ``closedCourts`` is treated
    # as an indefinite all-day closure.
    closedCourts: List[Annotated[int, Field(ge=1, le=MAX_COURTS)]] = Field(
        default_factory=list, max_length=MAX_COURTS
    )
    courtClosures: List[CourtClosure] = Field(
        default_factory=list, max_length=MAX_COURT_CLOSURES
    )
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
    restBetweenRounds: int = Field(default=1, ge=0, le=MAX_SLOT_INDEX)


# Availability
class AvailabilityWindow(StrictModel):
    start: HHMMTime
    end: HHMMTime


# Roster Group (for school grouping)
class RosterGroupDTO(StrictModel):
    id: Identifier
    name: Name
    metadata: Optional[Dict[str, Any]] = None


# Player
class PlayerDTO(StrictModel):
    id: Identifier  # Auto-generated UUID
    name: Name
    groupId: Identifier  # School group ID (REQUIRED - this is school vs school scheduling)
    # [MS1, MD1, XD1] - Player can play multiple events
    ranks: List[Code] = Field(default_factory=list, max_length=MAX_RANKS)
    availability: List[AvailabilityWindow] = Field(
        default_factory=list, max_length=MAX_WINDOWS
    )
    # If not provided, uses config.defaultRestMinutes
    minRestMinutes: Optional[int] = Field(None, ge=0, le=1440)
    notes: Optional[Notes] = None
    # ---- Entries provenance (SP-E1-1, spec §5 Seam A) ----------------
    # Half of the commit seam's back-reference pair: the ``entries.id``
    # this player was materialized from. ``entries.committed_player_id``
    # is the other half, and its presence is what makes re-running the
    # seam idempotent. Optional because almost no player has one — a
    # hand-added roster player never came from an entry, and requiring it
    # would fail every existing payload on the next autosave.
    sourceEntryId: Optional[Identifier] = None
    # The entrant's own free-text availability sentence, carried verbatim
    # from ``entries.remarks``. Kept distinct from ``notes`` (the
    # operator's own field) so the seam never overwrites what an operator
    # wrote, and so "what the entrant said" stays attributable. Never
    # parsed, never inferred from, never fed to the solver.
    remarks: Optional[Notes] = None


class BracketPlayerDTO(StrictModel):
    """Roster entry for bracket-kind tournaments.

    ``id`` is the stable slug produced by the frontend ``playerSlug()``
    helper; matches ``bracket_participants.member_ids`` after migration.

    ``availability`` holds POSITIVE (allowed) HH:mm windows — empty
    means available all day. ``restSlots`` overrides the session's
    ``defaultRestSlots`` for this player. Both feed the CP-SAT solve
    path via ``bracket.player_constraints`` (SP-D7 S2).
    """
    id: Identifier
    name: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    notes: Optional[Notes] = None
    restSlots: Optional[int] = Field(default=None, ge=0, le=MAX_SLOT_INDEX)
    availability: List[AvailabilityWindow] = Field(
        default_factory=list, max_length=MAX_WINDOWS
    )
    # Entries provenance — mirrors PlayerDTO. The Bracket half of Seam A
    # writes the participant row *and* this blob entry, because
    # ``bracket_participants`` has nowhere to put a remark and the
    # availability controls the operator uses read from here.
    sourceEntryId: Optional[Identifier] = None
    remarks: Optional[Notes] = None


# Match - simplified for school sparring (supports dual and tri-meets)
class MatchDTO(StrictModel):
    id: Identifier
    # Display ordinal (frontend-authored sequence)
    matchNumber: Optional[int] = Field(None, ge=0, le=MAX_MATCH_NUMBER)
    # Lists of player IDs (School A / B, and C for tri-meets)
    sideA: List[Identifier] = Field(default_factory=list, max_length=MAX_SIDE_MEMBERS)
    sideB: List[Identifier] = Field(default_factory=list, max_length=MAX_SIDE_MEMBERS)
    sideC: Optional[List[Identifier]] = Field(None, max_length=MAX_SIDE_MEMBERS)
    matchType: Code = "dual"  # "dual" or "tri"
    # MS1, MS2, WS1, WS2, etc. - the rank/event this match represents
    eventRank: Optional[Code] = None
    durationSlots: int = Field(1, ge=0, le=MAX_DURATION_SLOTS)
    preferredCourt: Optional[int] = Field(None, ge=1, le=MAX_COURTS)
    # Optional tags like ["School A", "School B"]
    tags: Optional[List[Name]] = Field(None, max_length=MAX_TAGS)


# Schedule
class ScheduleAssignment(StrictModel):
    matchId: Identifier
    slotId: int = Field(..., ge=0, le=MAX_SLOT_INDEX)
    courtId: int = Field(..., ge=0, le=MAX_COURTS)
    durationSlots: int = Field(..., ge=0, le=MAX_DURATION_SLOTS)


class PreviousAssignmentDTO(StrictModel):
    """Typed previous assignment used by /schedule re-solve and drag pin-and-resolve."""
    matchId: Identifier
    slotId: int = Field(..., ge=0, le=MAX_SLOT_INDEX)
    courtId: int = Field(..., ge=0, le=MAX_COURTS)
    locked: bool = False
    pinnedSlotId: Optional[int] = Field(None, ge=0, le=MAX_SLOT_INDEX)
    pinnedCourtId: Optional[int] = Field(None, ge=0, le=MAX_COURTS)


class ProposedMoveDTO(StrictModel):
    """A single drag target evaluated by /schedule/validate."""
    matchId: Identifier
    slotId: int = Field(..., ge=0, le=MAX_SLOT_INDEX)
    courtId: int = Field(..., ge=0, le=MAX_COURTS)


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


class SoftViolation(StrictModel):
    type: Code
    matchId: Optional[Identifier] = None
    playerId: Optional[Identifier] = None
    description: Description
    penaltyIncurred: float = Field(..., ge=-MAX_PENALTY, le=MAX_PENALTY)


class ScheduleCandidate(BaseModel):
    """One alternative schedule the solver found while improving.

    The pool is captured during the initial solve; operator can swap
    the active candidate without a re-solve. ``solutionId`` is a stable
    id for React keys; ``objectiveScore`` lets the UI show how each
    candidate ranks; ``foundAtSeconds`` is wall-clock seconds since
    solve start (lower = solver's earlier guess, often more disrupted).
    """
    solutionId: Identifier
    assignments: List[ScheduleAssignment] = Field(
        default_factory=list, max_length=MAX_ASSIGNMENTS
    )
    objectiveScore: float = 0.0
    foundAtSeconds: float = 0.0


class ScheduleDTO(StrictModel):
    assignments: List[ScheduleAssignment] = Field(
        default_factory=list, max_length=MAX_ASSIGNMENTS
    )
    unscheduledMatches: List[Identifier] = Field(
        default_factory=list, max_length=MAX_MATCHES
    )
    softViolations: List[SoftViolation] = Field(
        default_factory=list, max_length=MAX_VIOLATIONS
    )
    objectiveScore: Optional[float] = None
    # Engine-authored prose, so bounded generously rather than tightly.
    infeasibleReasons: List[Description] = Field(
        default_factory=list, max_length=MAX_REASONS
    )
    status: SolverStatus
    # The seed the solver actually used. Pair with ``deterministic`` to
    # reproduce a schedule byte-for-byte from the same input.
    solverSeed: Optional[int] = Field(None, ge=0, le=MAX_SEED)
    # What the engine actually did (SP-COURT-1 CP8-v1): a queue-mode solve
    # with closed-court windows falls back to "pinned" and says so here.
    # Optional so pre-policy stored schedules keep round-tripping.
    effectivePolicy: Optional[Literal["pinned", "queue"]] = None
    # Top-N near-optimal alternatives. ``assignments`` above always
    # equals ``candidates[activeCandidateIndex].assignments`` when the
    # pool is non-empty; older clients ignore both fields.
    candidates: List[ScheduleCandidate] = Field(
        default_factory=list, max_length=MAX_CANDIDATES
    )
    activeCandidateIndex: Optional[int] = Field(None, ge=0, le=MAX_CANDIDATES)


# ---- Solve jobs (SP-CLOUD-1 long-running-operation resource) ----------

class SolveJobErrorDTO(BaseModel):
    """Structured run-time error carried INSIDE the job resource.

    Errors that prevent a job from *starting* are normal HTTP errors at
    submit; anything after 202 lives here (AIP-151's dividing line)."""
    code: str
    message: str = ""
    detail: Optional[dict] = None


class SolveJobDTO(BaseModel):
    """One asynchronous solve — submit returns it, the client polls it.

    ``status`` vocabulary: queued | claimed | running | succeeded |
    failed | infeasible | cancelled. ``infeasible`` is a domain outcome
    with its detail in ``result`` (a ScheduleDTO whose status is
    ``infeasible``), never in ``error``."""
    id: str
    tournamentId: str
    type: str
    status: str
    attempts: int
    maxAttempts: int
    # Worker-written coarse progress (phase/heartbeat metadata); best-
    # effort, absent until the first heartbeat.
    progress: Optional[dict] = None
    result: Optional[ScheduleDTO] = None
    error: Optional[SolveJobErrorDTO] = None
    # Persisted solver params — lets an operator reproduce the solve.
    params: dict = Field(default_factory=dict)
    createdAt: str
    startedAt: Optional[str] = None
    finishedAt: Optional[str] = None


class SolveJobListDTO(BaseModel):
    jobs: List[SolveJobDTO] = Field(default_factory=list)


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
    # (solve_rail/suggestions_worker.py) overlaps on "optimize" and
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


# NOTE: The canonical MatchStateDTO lives in operations/match_state_routes.py — that
# module owns persistence and field-validation. Importing it from there
# everywhere ensures Pydantic's class-identity validation doesn't reject
# instances flowing across the proposal pipeline (e.g., director-action
# → warm-restart). A 3-line stub used to live here; it caused 422s on
# /schedule/director-action when the real instance was passed into a
# WarmRestartRequest typed against the stub.


# ---- Workspace modules (workspace-modules program, sub-project #1) -----


class WorkspaceModuleDTO(BaseModel):
    """Wire shape for one persisted per-workspace module row.

    ``moduleId`` is one of ``meet`` / ``bracket`` / ``display``;
    ``status`` is one of ``enabled`` / ``available`` / ``disabled``. (The legacy
    ``coming_soon`` is retired — all modules are built; migrations convert any
    existing such rows to ``available`` and seeding it is rejected.) ``config`` is
    the module's catch-all settings blob (``None`` until set).
    """
    moduleId: str
    status: str
    config: Optional[Dict[str, Any]] = None
    #: Whether this module owns operational data (matches, draws). Disabling
    #: such a module is refused with a 409, and the catalog could not know
    #: that until it had already asked — so the operator learned the rule from
    #: a failure toast rather than from a control that was plainly unavailable
    #: (SP-CONSOLE-2 WSMOD-2). Server-computed, because "has data" is a
    #: question about rows the client does not hold.
    hasData: bool = False

    @classmethod
    def from_row(cls, row, has_data: bool = False) -> "WorkspaceModuleDTO":
        """Build the DTO from a ``WorkspaceModule`` ORM row (duck-typed)."""
        return cls(
            moduleId=row.module_id,
            status=row.status,
            config=row.config,
            hasData=has_data,
        )


# ---- Entries (SP-E1-1) -----------------------------------------------

class EntrySubmissionDTO(BaseModel):
    """The act an entry belongs to, as much of it as a desk needs (R13).

    Four fields, and the restraint is the point. ``id`` is the **grouping
    key** — the desk shows "these four entries arrived on one form" by
    reading it, not by grouping on a repeated email string, which is what
    an operator had to do by eye before R13. The account's address is who
    to write to. The fee total belongs to the act rather than to any entry
    under it, because tiered pricing prices the *person*, not the event.

    What is deliberately not here: the idempotency key (a retry mechanism,
    not information), and anything at all from the account beyond a name
    and an address — a password hash and a session token are the material
    this projection exists to keep off an operator screen (a colocated test
    greps the serialized row for it).
    """
    id: str
    accountEmail: Optional[str] = None
    accountName: Optional[str] = None
    feeTotalCents: Optional[int] = None
    submittedAt: Optional[str] = None

    @classmethod
    def from_row(cls, row) -> Optional["EntrySubmissionDTO"]:
        """``None`` for an entry with no act behind it.

        Nothing the writer produces looks like that — ``create_submission``
        writes the submission first and every entry under it. It stays
        possible in the type because the column is nullable and a desk that
        500s on a row it cannot fully explain is worse than one that shows
        the row.
        """
        if row is None:
            return None
        account = getattr(row, "account", None)
        return cls(
            id=str(row.id),
            accountEmail=getattr(account, "email", None),
            accountName=getattr(account, "display_name", None),
            feeTotalCents=row.fee_total_cents,
            submittedAt=row.submitted_at.isoformat() if row.submitted_at else None,
        )


class EntryDeskRowDTO(BaseModel):
    """One row of the operator's entries desk.

    A **projection**, not the table. The doubles columns are deliberately
    absent: they exist in the schema (created now to avoid migration churn)
    but mean nothing until E3 and would read as broken features.

    **The credential material this projection used to exclude no longer
    exists.** E1 carried ``Entry.manage_token_hash`` and this docstring
    named it as the field kept off an operator screen; ruling R10 deleted
    the column, and managing an entry is login-gated "my entries" against
    an entrant account (E2). The claim survives its column, one level out:
    the account's password hash and its session token are what must never
    reach here now, which is why nothing below reaches through
    ``submission.account`` for anything but a name and an address.

    ``eventCode`` is denormalized from ``entry_events`` so the desk can
    render a row without a second lookup per entry — it is the same string
    the commit seam turns into ``ranks[]``.
    """
    id: str
    entryEventId: str
    eventCode: Optional[str] = None
    state: str
    pendingReasons: List[str] = Field(default_factory=list)
    # R13: the contact block became a level. ``contactName`` /
    # ``contactEmail`` were columns on this row and are now one hop out,
    # under the act that carried them — because "who to write to about this"
    # is a property of the submission, and a desk that shows it per entry
    # shows the same address three times for one form.
    submission: Optional[EntrySubmissionDTO] = None
    playerName: str
    # R-P7c resolved the person; F-DM-16 was the wire not carrying it. The
    # desk groups one human's entries across submissions by this, not by
    # eye. Null only for rows minted before the person spine existed.
    entryPlayerId: Optional[str] = None
    remarks: Optional[str] = None
    listOptOut: bool = False
    committedPlayerId: Optional[str] = None
    submittedAt: Optional[str] = None
    withdrawnAt: Optional[str] = None

    @classmethod
    def from_row(cls, row, *, event_code: Optional[str] = None) -> "EntryDeskRowDTO":
        return cls(
            id=str(row.id),
            entryEventId=str(row.entry_event_id),
            eventCode=event_code,
            state=row.state,
            pendingReasons=list(row.pending_reasons or []),
            submission=EntrySubmissionDTO.from_row(row.submission),
            playerName=row.player_name,
            entryPlayerId=str(row.entry_player_id) if row.entry_player_id else None,
            remarks=row.remarks,
            listOptOut=bool(row.list_opt_out),
            committedPlayerId=row.committed_player_id,
            submittedAt=row.submitted_at.isoformat() if row.submitted_at else None,
            withdrawnAt=row.withdrawn_at.isoformat() if row.withdrawn_at else None,
        )


class EntryCommitOutcomeDTO(BaseModel):
    """One committed entry: which entry, which roster player it became."""
    id: str
    playerId: str


class EntrySkipDTO(BaseModel):
    """One skipped entry and the stable reason code for the skip.

    Spec §5: partial success is reported per-entry, not rolled back
    wholesale — so this list is a normal outcome, not an error body.
    """
    id: str
    reason: str


class EntryCommitResultDTO(BaseModel):
    committed: List[EntryCommitOutcomeDTO] = Field(default_factory=list)
    skipped: List[EntrySkipDTO] = Field(default_factory=list)


class EntryPageUpsertDTO(StrictModel):
    """The operator's entry-page configuration, whole.

    A PUT body, so it is the complete desired state and an omitted optional
    field means "clear it" — the alternative (omission means "keep") gives
    a route with no way to erase an intro paragraph.

    ``regulationsVersion`` is deliberately **not** here. It is derived: the
    server bumps it when ``regulationsText`` actually changes (Q11.4), so
    an entry's recorded ``regulations_version_accepted`` refers to words
    that really were on the page. A client-settable version is a client
    that can rewrite the terms without invalidating consent to the old ones.
    """
    slug: Identifier
    isOpen: bool = False
    introText: Optional[Notes] = None
    regulationsText: Optional[Regulations] = None
    waiverRequired: bool = False

    # ---- R14 money & payment -------------------------------------------
    # CUMULATIVE totals in cents by event count — ``{"1": 4000, "2": 5500}``
    # — the price list a director copies, not increments. Typed as a bare
    # dict and validated in the route rather than by a Pydantic shape,
    # because the rule is not "these types" but "every tier this route
    # accepts is a tier the pricing will honour", which only
    # ``entries.entry_fees.normalize_fee_schedule`` can answer.
    feeSchedule: Optional[dict] = None
    paymentInstructions: Optional[Notes] = None

    # ---- R14 §4 entry policy -------------------------------------------
    # Form-enforced with the rule stated, operator-overridable at the desk
    # (I4). ``ge=1``: a cap of zero is an entry page nobody may enter, and
    # ``isOpen=False`` already says that without the confusion.
    maxEventsPerPerson: Optional[int] = Field(None, ge=1, le=MAX_PLAYERS)
    disciplineCaps: Optional[dict] = None

    # ---- R12 field policy ----------------------------------------------
    collectPhone: bool = False

    # ---- R14 §6 public page identity -----------------------------------
    venueName: Optional[Name] = None
    venueAddress: Optional[Notes] = None


class EntryPagePublicationPatchDTO(StrictModel):
    """PATCH body for the publication card (SP-P7 §4).

    Every field optional and independent — patch semantics: only the flags
    the card actually toggled travel, so two operators flipping different
    switches near-simultaneously cannot clobber each other through a
    whole-state PUT. Strict, so a typoed flag name is a 422 rather than a
    silently ignored no-op that leaves the operator believing they
    published.
    """

    entrantsPublished: Optional[bool] = None
    drawsPublished: Optional[bool] = None
    resultsPublished: Optional[bool] = None


class EntryPageDTO(BaseModel):
    """The stored entry page as the operator sees it back."""
    slug: str
    isOpen: bool
    introText: Optional[str] = None
    regulationsText: Optional[str] = None
    waiverRequired: bool
    regulationsVersion: int
    regulationsUpdatedAt: Optional[str] = None
    feeSchedule: Optional[dict] = None
    paymentInstructions: Optional[str] = None
    maxEventsPerPerson: Optional[int] = None
    disciplineCaps: Optional[dict] = None
    collectPhone: bool = False
    venueName: Optional[str] = None
    venueAddress: Optional[str] = None
    # SP-P7 §4 publication gates, default-off. Read by the Sharing tab's
    # publication card; the public tier reads them off its own projection,
    # never this operator DTO.
    entrantsPublished: bool = False
    drawsPublished: bool = False
    resultsPublished: bool = False

    @classmethod
    def from_row(cls, row) -> "EntryPageDTO":
        return cls(
            slug=row.slug,
            isOpen=bool(row.is_open),
            introText=row.intro_text,
            regulationsText=row.regulations_text,
            waiverRequired=bool(row.waiver_required),
            regulationsVersion=row.regulations_version,
            regulationsUpdatedAt=(
                row.regulations_updated_at.isoformat()
                if row.regulations_updated_at is not None
                else None
            ),
            entrantsPublished=bool(row.entrants_published),
            drawsPublished=bool(row.draws_published),
            resultsPublished=bool(row.results_published),
            feeSchedule=row.fee_schedule,
            paymentInstructions=row.payment_instructions,
            maxEventsPerPerson=row.max_events_per_person,
            disciplineCaps=row.discipline_caps,
            collectPhone=bool(row.collect_phone),
            venueName=row.venue_name,
            venueAddress=row.venue_address,
        )


class EntryEventCreateDTO(StrictModel):
    """One entry-facing event (spec Q2/§4).

    ``entryType`` is a ``Literal`` rather than a validated string so an
    unknown value is refused by the schema, before the route: E1 is
    singles-only and doubles is E3, and anything else would reach the
    commit seam as an event it cannot map.

    ``bracketEventId`` stays a plain string, matching the column's
    deliberately unconstrained pointer — the seam skips-and-reports an
    unmappable code rather than guessing, so a dangling pointer is a
    handled state and not one worth a foreign key that would cascade.
    """
    code: Code
    discipline: Name
    entryType: Literal["singles", "doubles"] = "singles"
    bracketEventId: Optional[Identifier] = None
    cap: Optional[int] = Field(None, ge=1, le=MAX_PLAYERS)
    feeCents: Optional[int] = Field(None, ge=0, le=100_000_000)
    # R12: the form's default event filter. A ``Literal`` for
    # ``entryType``'s reason — the vocabulary is closed
    # (``entries.entry_policy`` folds onto 'M' / 'F' / 'mixed'), and an
    # unrecognised constraint would not refuse anything, it would silently
    # flag every entrant who chose the event. ``None`` is open, and is the
    # default because most events are.
    genderConstraint: Optional[Literal["M", "F", "mixed"]] = None
    opensAt: Optional[Timestamp] = None
    closesAt: Optional[Timestamp] = None
    # R14 §3: separate from ``closesAt`` on purpose — organisers use the
    # gap between closing entries and closing withdrawals.
    withdrawsUntil: Optional[Timestamp] = None


class EntryEventDTO(BaseModel):
    id: str
    code: str
    discipline: str
    entryType: str
    bracketEventId: Optional[str] = None
    cap: Optional[int] = None
    feeCents: Optional[int] = None
    genderConstraint: Optional[str] = None
    opensAt: Optional[str] = None
    closesAt: Optional[str] = None
    withdrawsUntil: Optional[str] = None

    @classmethod
    def from_row(cls, row) -> "EntryEventDTO":
        return cls(
            id=str(row.id),
            code=row.code,
            discipline=row.discipline,
            entryType=row.entry_type,
            bracketEventId=row.bracket_event_id,
            cap=row.cap,
            feeCents=row.fee_cents,
            genderConstraint=row.gender_constraint,
            opensAt=row.opens_at.isoformat() if row.opens_at else None,
            closesAt=row.closes_at.isoformat() if row.closes_at else None,
            withdrawsUntil=(
                row.withdraws_until.isoformat() if row.withdraws_until else None
            ),
        )


# Health
class HealthResponse(BaseModel):
    status: str
    version: str


# ---- Tournament state (whole-document persistence) --------------------

class ScheduleHistoryEntry(StrictModel):
    """Snapshot of a prior committed schedule, kept for revert + audit.

    Appended whenever a proposal is committed; the entry captures the
    schedule that was *replaced*, not the new one. Capped at 5 entries
    server-side (oldest dropped first) so the persisted state file stays
    bounded.
    """
    version: int = Field(..., ge=0)                 # the version this entry replaced
    committedAt: Timestamp                          # ISO timestamp of the swap
    trigger: Optional[Code] = None                  # "warm_restart" | "repair" | "manual_edit" | "director_action" | "initial"
    summary: Optional[Description] = None           # short human-readable impact summary
    schedule: Optional[ScheduleDTO] = None          # full snapshot so the entry can be restored


class MeetStandingRowDTO(StrictModel):
    """One group's school-vs-school pool record.

    Computed fresh on every ``GET /tournaments/{id}/state`` by
    ``meet.standings.compute_meet_standings`` from the
    already-loaded ``matches``/``groups``/``players`` plus a
    ``match_states`` read — never persisted, so this is NOT written back
    on PUT (see ``workspaces/tournaments.py`` — the route excludes it from the
    blob it commits). Empty when the Meet module isn't enabled for the
    workspace or there's no finished, scored pool play yet.
    """
    groupId: Identifier
    groupName: Name
    matchesPlayed: int = Field(..., ge=0)
    wins: int = Field(..., ge=0)
    losses: int = Field(..., ge=0)


class TournamentStateDTO(StrictModel):
    """Authoritative persisted state for one tournament.

    Writes come as a single blob: frontend Zustand state snapshotted and
    PUT to /tournament/state. Server stamps `updatedAt` on write; the
    client's value is ignored.
    """
    version: int = Field(1, ge=0, le=1000)
    updatedAt: Optional[Timestamp] = None
    config: Optional[TournamentConfig] = None
    groups: List[RosterGroupDTO] = Field(default_factory=list, max_length=MAX_GROUPS)
    players: List[PlayerDTO] = Field(default_factory=list, max_length=MAX_PLAYERS)
    matches: List[MatchDTO] = Field(default_factory=list, max_length=MAX_MATCHES)
    schedule: Optional[ScheduleDTO] = None
    scheduleStats: Optional[dict] = None
    scheduleIsStale: bool = False
    # Versioned-commit support (schema v2). ``scheduleVersion`` increments
    # on every successful commit through the proposal pipeline; clients
    # use it for optimistic-concurrency rejection of stale proposals.
    # ``scheduleHistory`` is the rolling-revert pool, capped at 5.
    scheduleVersion: int = Field(0, ge=0)
    scheduleHistory: List[ScheduleHistoryEntry] = Field(
        default_factory=list, max_length=MAX_HISTORY
    )
    bracketPlayers: List[BracketPlayerDTO] = Field(
        default_factory=list, max_length=MAX_PLAYERS
    )
    bracketRosterMigrated: Optional[bool] = None
    # SP-G1 Plan→Run handoff: operator marks plan as ready before running.
    # Stored in the tournament.data JSON blob; no Alembic migration needed.
    planFinalized: bool = False
    # Authoritative Meet pool standings (Display redesign, Task 2). Derived,
    # never persisted — GET computes it fresh from live match_states each
    # time; PUT strips it before committing (see workspaces/tournaments.py).
    standings: List[MeetStandingRowDTO] = Field(
        default_factory=list, max_length=MAX_GROUPS
    )


def state_dto_from_document(data: dict) -> "TournamentStateDTO":
    """Project a stored ``tournaments.data`` document onto the wire DTO.

    The stored document is a **superset** of this DTO. It carries
    server-managed sections the client never sends and the DTO does not
    declare — ``bracket_session`` (the bracket engine's persisted state,
    merged back in by ``commit_tournament_state``) and the legacy
    ``_integrity`` field. Constructing the model straight from the row
    therefore fails now that request models forbid unknown fields
    (SP-SEC-1 Phase 1), and it failed *loudly*, in seven tests, which is
    how this projection came to exist.

    Keeping ``extra="forbid"`` on the request side and filtering here is
    the right way round: an unknown key arriving from a client is an
    error, while an unknown key arriving from our own storage is just a
    section this shape does not cover. Three call sites each had their
    own partial version of this filter (two of which only knew about
    ``_integrity``); this is the one they now share.
    """
    return TournamentStateDTO(
        **{k: v for k, v in data.items() if k in TournamentStateDTO.model_fields}
    )


class SolverOptionsDTO(StrictModel):
    """Optional per-request override of solver parameters (no UI yet)."""
    timeLimitSeconds: Optional[float] = None
    numWorkers: Optional[int] = None
    randomSeed: Optional[int] = None


# ---- Commands (Step C) ------------------------------------------------


class CommandRequest(StrictModel):
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
# ``core.constants`` which itself imports ``MatchStatus`` from
# ``db.models``. Importing it at the top of this module would
# create a cycle (schemas → constants → database → schemas via
# Pydantic introspection of forward refs). Resolving here keeps the
# import order clean.
from core.constants import MatchAction  # noqa: E402
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


class BracketCommandRequest(StrictModel):
    """Body of ``POST /tournaments/{tournament_id}/bracket/commands``.

    ``id`` is the client-generated UUID used as the idempotency key.
    Resubmitting the same id always returns 200 with the current bracket
    snapshot — advancement is NOT re-run (SP-G1 Seam C).

    ``kind`` is the operation type; currently only ``"record_result"`` is
    supported. ``seen_version`` is an optional optimistic-concurrency token
    mirroring ``RecordResultIn.seen_version`` (SP-F3): the server rejects
    with 409 ``stale_version`` when present and stale.  The replay check
    always runs BEFORE the version guard so a re-delivered command whose
    version has advanced is still accepted.
    ``reason`` annotates contingency results (walkover/retired/forfeit).
    """

    id: uuid.UUID
    kind: Literal["record_result"]
    play_unit_id: Identifier
    winner_side: Literal["A", "B"]
    seen_version: Optional[int] = Field(None, ge=0)
    finished_at_slot: Optional[int] = Field(None, ge=0, le=MAX_SLOT_INDEX)
    walkover: bool = False
    score: Optional[Dict[str, Any]] = None
    # Contingency annotation (spec 2026-07-14 §1): why the result was
    # awarded without (full) play. ``walkover`` keeps its existing BYE
    # routing; ``retired``/``forfeit`` currently ride the same result
    # path — distinct routing semantics are deferred (debt-log).
    reason: Optional[Literal["walkover", "retired", "forfeit"]] = None

    @model_validator(mode="after")
    def _walkover_reason_implies_flag(self) -> "BracketCommandRequest":
        if self.reason == "walkover":
            self.walkover = True
        return self


class MatchStateOut(BaseModel):
    """Operational state of a match from the ``matches`` table.

    Used by the Run surface to render the court grid and the match queue.
    Mirrors the ``matches`` row columns with camelCase names so the
    frontend can consume the shape directly.

    ``actualCourtId`` and ``actualSlotId`` are the *live* court/slot as
    mutated by ``assign_court`` / ``postpone_match`` commands — they may
    differ from the solver-committed assignment when an operator has
    manually moved a match since the last solve.

    NOTE (Task 5): This DTO is defined here but not yet wired to a GET
    endpoint.  The serialisation site will be added in a follow-up task
    (Run-surface match-state stream).  Defined now so Task-6 frontend
    work can reference a stable shape.
    """

    matchId: str
    status: str
    version: int
    actualCourtId: Optional[int] = None    # matches.court_id
    actualSlotId: Optional[int] = None     # matches.time_slot — NEW (Task 5)
