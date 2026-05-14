"""Pydantic DTOs for the prototype API."""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# ---- Create ---------------------------------------------------------------


class ParticipantIn(BaseModel):
    id: str
    name: str
    members: Optional[List[str]] = Field(
        None,
        description="If present, this participant is a TEAM and these are the "
        "individual player ids (e.g. doubles pair).",
    )
    seed: Optional[int] = Field(
        None,
        description="Optional seed number (1=top seed). Participants are "
        "sorted by ascending seed for placement, with unseeded entries "
        "trailing.",
    )


class EventIn(BaseModel):
    id: str
    discipline: str = Field(
        "GEN", description="MS/WS/MD/WD/XD or any short event code."
    )
    format: Literal["se", "rr"] = "se"
    participants: List[ParticipantIn]
    seeded_count: Optional[int] = Field(
        None,
        description="How many participants are seeded. Defaults to all when "
        "every participant has a seed; otherwise to the count with seeds.",
    )
    bracket_size: Optional[int] = Field(
        None,
        description="Explicit bracket size for SE (power of two). Default: "
        "smallest power of two >= participant count.",
    )
    rr_rounds: int = Field(1, ge=1, description="Round-robin cycles")
    duration_slots: int = Field(1, ge=1)
    randomize: bool = False


class CreateTournamentIn(BaseModel):
    courts: int = Field(2, ge=1, le=64)
    total_slots: int = Field(128, ge=1)
    rest_between_rounds: int = Field(1, ge=0)
    interval_minutes: int = Field(30, ge=1)
    time_limit_seconds: float = Field(5.0, gt=0)
    start_time: Optional[datetime] = Field(
        None,
        description="Wall-clock time of slot 0. Used by export.csv and "
        "export.ics; not used by the solver.",
    )
    events: List[EventIn]


# ---- Out shapes -----------------------------------------------------------


class ParticipantOut(BaseModel):
    id: str
    name: str
    members: Optional[List[str]] = None


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


class EventOut(BaseModel):
    id: str
    discipline: str
    format: str
    bracket_size: Optional[int] = None
    participant_count: int
    rounds: List[List[str]]


class TournamentOut(BaseModel):
    courts: int
    total_slots: int
    rest_between_rounds: int
    interval_minutes: int
    start_time: Optional[datetime] = None
    events: List[EventOut]
    participants: List[ParticipantOut]
    play_units: List[PlayUnitOut]
    assignments: List[AssignmentOut]
    results: List[ResultOut]


# ---- Schedule + result actions -------------------------------------------


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


# ---- Import ---------------------------------------------------------------


class ImportPlayUnitIn(BaseModel):
    id: str
    side_a: Optional[List[str]] = None
    side_b: Optional[List[str]] = None
    feeder_a: Optional[str] = None
    feeder_b: Optional[str] = None
    duration_slots: int = 1


class ImportEventIn(BaseModel):
    id: str
    discipline: str = "GEN"
    format: Literal["se", "rr"] = "se"
    participants: List[ParticipantIn]
    rounds: List[List[ImportPlayUnitIn]]


class ImportTournamentIn(BaseModel):
    courts: int = Field(..., ge=1)
    total_slots: int = Field(..., ge=1)
    rest_between_rounds: int = Field(1, ge=0)
    interval_minutes: int = Field(30, ge=1)
    time_limit_seconds: float = Field(5.0, gt=0)
    start_time: Optional[datetime] = None
    events: List[ImportEventIn]
