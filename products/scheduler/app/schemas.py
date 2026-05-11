"""Input/Output schemas for the scheduling API."""
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class SolverStatus(str, Enum):
    """Solver result status."""
    OPTIMAL = "optimal"
    FEASIBLE = "feasible"
    INFEASIBLE = "infeasible"
    UNKNOWN = "unknown"
    MODEL_INVALID = "model_invalid"


# ============================================================
# INPUT SCHEMAS
# ============================================================

class PlayerInput(BaseModel):
    """Player with constraints."""
    id: str = Field(..., description="Unique player identifier")
    name: str = Field(..., description="Player name for diagnostics")
    availability: List[tuple[int, int]] = Field(
        default_factory=list,
        description="List of (startSlot, endSlot) tuples when player is available. Empty = always available"
    )
    restSlots: int = Field(default=1, ge=0, description="Minimum rest slots between matches")
    restIsHard: bool = Field(default=True, description="If true, rest is a hard constraint")
    restPenalty: float = Field(default=10.0, ge=0, description="Penalty weight for soft rest violations")

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "id": "player-1",
            "name": "John Doe",
            "availability": [[0, 10], [12, 20]],
            "restSlots": 2,
            "restIsHard": True
        }
    })


class MatchInput(BaseModel):
    """Match to be scheduled."""
    id: str = Field(..., description="Unique match identifier")
    eventCode: str = Field(..., description="Event code (e.g., MS-1, MD-2)")
    durationSlots: int = Field(default=1, ge=1, description="Number of slots this match occupies")
    sideA: List[str] = Field(..., description="Player IDs for side A")
    sideB: List[str] = Field(..., description="Player IDs for side B")

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "id": "match-1",
            "eventCode": "MS-1",
            "durationSlots": 1,
            "sideA": ["player-1"],
            "sideB": ["player-2"]
        }
    })


class PreviousAssignment(BaseModel):
    """Previous assignment for re-optimization."""
    matchId: str = Field(..., description="Match ID this assignment belongs to")
    slotId: int = Field(..., ge=0, description="Assigned time slot")
    courtId: int = Field(..., ge=1, description="Assigned court (1-indexed)")
    locked: bool = Field(default=False, description="If true, assignment cannot be changed")
    pinnedSlotId: Optional[int] = Field(default=None, description="Pin to specific slot (optional)")
    pinnedCourtId: Optional[int] = Field(default=None, description="Pin to specific court (optional)")


class ScheduleConfig(BaseModel):
    """Tournament/schedule configuration."""
    totalSlots: int = Field(..., ge=1, description="Total number of time slots available")
    courtCount: int = Field(..., ge=1, description="Number of courts available")
    intervalMinutes: int = Field(default=30, ge=5, description="Minutes per slot (for display only)")
    defaultRestSlots: int = Field(default=1, ge=0, description="Default rest slots between matches")
    freezeHorizonSlots: int = Field(default=0, ge=0, description="Slots from currentSlot that are frozen")
    currentSlot: int = Field(default=0, ge=0, description="Current time as slot ID (for freeze horizon)")

    # Objective weights
    softRestEnabled: bool = Field(default=False, description="Allow rest as soft constraint")
    restSlackPenalty: float = Field(default=10.0, ge=0, description="Penalty for rest violations")
    disruptionPenalty: float = Field(default=1.0, ge=0, description="Penalty for moving from previous schedule")
    lateFinishPenalty: float = Field(default=0.5, ge=0, description="Penalty for late start times")
    courtChangePenalty: float = Field(default=0.5, ge=0, description="Penalty for changing courts")

    # Game proximity constraint
    enableGameProximity: bool = Field(default=False, description="Enable game spacing constraint")
    minGameSpacingSlots: Optional[int] = Field(default=None, ge=0, description="Minimum slots between games for same player")
    maxGameSpacingSlots: Optional[int] = Field(default=None, ge=0, description="Maximum slots between games for same player")
    gameProximityPenalty: float = Field(default=5.0, ge=0, description="Penalty weight for proximity violations")

    # Compact schedule - minimize makespan or eliminate gaps
    enableCompactSchedule: bool = Field(default=False, description="Minimize schedule length by packing matches together")
    compactScheduleMode: str = Field(default="minimize_makespan", description="Mode: minimize_makespan, no_gaps, or finish_by_time")
    compactSchedulePenalty: float = Field(default=100.0, ge=0, description="Penalty weight for compact schedule")
    targetFinishSlot: Optional[int] = Field(default=None, ge=0, description="Target finish slot for finish_by_time mode")

    # Allow player overlap - makes player non-overlap a soft constraint
    allowPlayerOverlap: bool = Field(default=False, description="Allow same player in multiple matches at once (soft constraint)")
    playerOverlapPenalty: float = Field(default=50.0, ge=0, description="Penalty weight for player overlap violations")


class SolverOptions(BaseModel):
    """Solver execution options."""
    timeLimitSeconds: float = Field(default=5.0, ge=0.1, le=300, description="Max solve time in seconds")
    numWorkers: int = Field(default=4, ge=1, le=16, description="Number of parallel workers")
    logProgress: bool = Field(default=False, description="Log solver progress to stdout")


class ScheduleRequest(BaseModel):
    """Complete scheduling request."""
    config: ScheduleConfig
    players: List[PlayerInput]
    matches: List[MatchInput]
    previousAssignments: List[PreviousAssignment] = Field(default_factory=list)
    solverOptions: Optional[SolverOptions] = None

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "config": {
                "totalSlots": 20,
                "courtCount": 4,
                "intervalMinutes": 30,
                "defaultRestSlots": 1
            },
            "players": [
                {"id": "p1", "name": "Player 1", "restSlots": 1},
                {"id": "p2", "name": "Player 2", "restSlots": 1}
            ],
            "matches": [
                {"id": "m1", "eventCode": "MS-1", "durationSlots": 1, "sideA": ["p1"], "sideB": ["p2"]}
            ],
            "previousAssignments": [],
            "solverOptions": {"timeLimitSeconds": 5.0}
        }
    })


# ============================================================
# OUTPUT SCHEMAS
# ============================================================

class Assignment(BaseModel):
    """Scheduled assignment output."""
    matchId: str
    slotId: int
    courtId: int
    durationSlots: int
    moved: bool = False
    previousSlotId: Optional[int] = None
    previousCourtId: Optional[int] = None


class SoftViolation(BaseModel):
    """Soft constraint violation."""
    type: str
    matchId: Optional[str] = None
    playerId: Optional[str] = None
    description: str
    penaltyIncurred: float


class ScheduleResponse(BaseModel):
    """Complete scheduling response."""
    status: SolverStatus
    objectiveScore: Optional[float] = None
    runtimeMs: float
    assignments: List[Assignment] = Field(default_factory=list)
    softViolations: List[SoftViolation] = Field(default_factory=list)
    infeasibleReasons: List[str] = Field(default_factory=list)
    unscheduledMatches: List[str] = Field(default_factory=list)
    movedCount: int = 0
    lockedCount: int = 0

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "status": "optimal",
            "objectiveScore": 15.0,
            "runtimeMs": 123.45,
            "assignments": [
                {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 1, "moved": False}
            ],
            "softViolations": [],
            "infeasibleReasons": [],
            "unscheduledMatches": [],
            "movedCount": 0,
            "lockedCount": 0
        }
    })


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
