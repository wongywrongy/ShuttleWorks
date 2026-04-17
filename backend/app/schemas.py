"""Pydantic schemas for API requests/responses - simplified for school sparring."""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


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
    start: str  # HH:mm format
    end: str  # HH:mm format


class TournamentConfig(BaseModel):
    intervalMinutes: int
    dayStart: str  # HH:mm format
    dayEnd: str  # HH:mm format
    tournamentDate: Optional[str] = None  # ISO date string: "2026-02-15"
    breaks: List[BreakWindow]
    courtCount: int
    defaultRestMinutes: int
    freezeHorizonSlots: int
    rankCounts: Dict[str, int] = Field(default_factory=dict)  # {"MS": 3, "WS": 3, "MD": 2, "WD": 4, "XD": 2}
    enableCourtUtilization: Optional[bool] = True
    courtUtilizationPenalty: Optional[float] = 50.0
    # Game proximity constraint
    enableGameProximity: Optional[bool] = False
    minGameSpacingSlots: Optional[int] = None
    maxGameSpacingSlots: Optional[int] = None
    gameProximityPenalty: Optional[float] = 5.0
    # Compact schedule
    enableCompactSchedule: Optional[bool] = False
    compactScheduleMode: Optional[str] = "minimize_makespan"
    compactSchedulePenalty: Optional[float] = 100.0
    targetFinishSlot: Optional[int] = None
    # Player overlap
    allowPlayerOverlap: Optional[bool] = False
    playerOverlapPenalty: Optional[float] = 50.0


# Availability
class AvailabilityWindow(BaseModel):
    start: str  # HH:mm format
    end: str  # HH:mm format


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
    type: str  # court_conflict | player_overlap | availability | rest | out_of_day | invalid_court | ...
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


class ScheduleDTO(BaseModel):
    assignments: List[ScheduleAssignment] = Field(default_factory=list)
    unscheduledMatches: List[str] = Field(default_factory=list)
    softViolations: List[SoftViolation] = Field(default_factory=list)
    objectiveScore: Optional[float] = None
    infeasibleReasons: List[str] = Field(default_factory=list)
    status: SolverStatus


# Match State (for Match Desk)
class MatchScore(BaseModel):
    sideA: int
    sideB: int


class MatchStateDTO(BaseModel):
    status: str  # 'scheduled' | 'called' | 'started' | 'finished'
    score: Optional[MatchScore] = None


# Health
class HealthResponse(BaseModel):
    status: str
    version: str


# ---- Tournament state (whole-document persistence) --------------------

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


class SolverOptionsDTO(BaseModel):
    """Optional per-request override of solver parameters (no UI yet)."""
    timeLimitSeconds: Optional[float] = None
    numWorkers: Optional[int] = None
    randomSeed: Optional[int] = None
