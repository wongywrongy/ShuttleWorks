"""Pydantic DTOs for the prototype API."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class ParticipantIn(BaseModel):
    id: str = Field(..., description="Stable id, used as player id in solver")
    name: str


class CreateTournamentIn(BaseModel):
    format: Literal["se", "rr"] = "se"
    participants: List[ParticipantIn]
    courts: int = Field(2, ge=1, le=64)
    total_slots: int = Field(128, ge=1)
    duration_slots: int = Field(1, ge=1)
    rest_between_rounds: int = Field(1, ge=0)
    rr_rounds: int = Field(1, ge=1, description="Round robin cycles")
    interval_minutes: int = Field(30, ge=1)
    time_limit_seconds: float = Field(5.0, gt=0)


class ParticipantOut(BaseModel):
    id: str
    name: str


class BracketSlotOut(BaseModel):
    participant_id: Optional[str] = None
    feeder_play_unit_id: Optional[str] = None


class PlayUnitOut(BaseModel):
    id: str
    event_id: str
    round_index: int
    match_index: int
    side_a: Optional[List[str]] = None
    side_b: Optional[List[str]] = None
    duration_slots: int
    dependencies: List[str] = []
    slot_a: BracketSlotOut
    slot_b: BracketSlotOut


class AssignmentOut(BaseModel):
    play_unit_id: str
    slot_id: int
    court_id: int
    duration_slots: int
    actual_start_slot: Optional[int] = None
    actual_end_slot: Optional[int] = None
    started: bool = False
    finished: bool = False


class ResultOut(BaseModel):
    play_unit_id: str
    winner_side: str  # "A" | "B" | "none"
    walkover: bool = False
    finished_at_slot: Optional[int] = None


class TournamentOut(BaseModel):
    format: str
    courts: int
    total_slots: int
    duration_slots: int
    rest_between_rounds: int
    interval_minutes: int
    participants: List[ParticipantOut]
    play_units: List[PlayUnitOut]
    rounds: List[List[str]]
    assignments: List[AssignmentOut]
    results: List[ResultOut]


class ScheduleNextRoundOut(BaseModel):
    status: str
    play_unit_ids: List[str]
    started_at_current_slot: int
    runtime_ms: float = 0.0
    infeasible_reasons: List[str] = []


class RecordResultIn(BaseModel):
    play_unit_id: str
    winner_side: Literal["A", "B"]
    finished_at_slot: Optional[int] = None
    walkover: bool = False


class MatchActionIn(BaseModel):
    play_unit_id: str
    action: Literal["start", "finish", "reset"]
    slot: Optional[int] = Field(
        None,
        description="Slot to mark as actual_start or actual_end. Defaults to "
        "the assigned slot for start, slot+duration for finish.",
    )
