"""Explicit spectator projections. Never reuse operator input models here.

Extra stored fields are discarded at every level. Adding a private field to an
operator DTO therefore cannot publish it on a venue board accidentally.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from bracket.brackets import AssignmentOut, BracketSlotOut, SegmentOut
from bracket.standings import StandingRow
from shared.sides import MatchSideDTO


class PublicModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class DisplayClosureDTO(PublicModel):
    courtId: int
    fromTime: str | None = None
    toTime: str | None = None


class DisplayConfigDTO(PublicModel):
    tournamentName: str | None = None
    meetMode: Literal["dual", "tri"] | None = None
    intervalMinutes: int = 15
    dayStart: str = "08:00"
    dayEnd: str = "18:00"
    tournamentDate: str | None = None
    courtCount: int = 1
    scoringFormat: Literal["simple", "badminton"] | None = None
    setsToWin: int | None = None
    pointsPerSet: int | None = None
    deuceEnabled: bool | None = None
    pointCap: int | None = None
    tvDisplayMode: Literal["auto", "strip", "grid", "list"] | None = None
    tvAccent: str | None = None
    tvPreset: str | None = None
    tvGridColumns: int | None = None
    tvCardSize: Literal["auto", "compact", "comfortable", "large"] | None = None
    tvShowScores: bool | None = None
    courtOrder: list[int] | None = None
    hiddenCourts: list[int] | None = None
    standingsMode: Literal["off", "side", "rotate"] | None = None
    tvRotationSlides: list[Literal["courts", "standings", "upNext"]] | None = None
    tvRotationDwellSeconds: int | None = None
    courtPolicy: Literal["pinned", "queue"] | None = None
    courtOverrides: dict[int, Literal["pinned", "pool"]] | None = None
    onDeckCount: int | None = None
    closedCourts: list[int] = Field(default_factory=list)
    courtClosures: list[DisplayClosureDTO] = Field(default_factory=list)
    clockShiftMinutes: int | None = None


class DisplayGroupDTO(PublicModel):
    id: str
    name: str


class DisplayPlayerDTO(PublicModel):
    id: str
    name: str
    groupId: str = ""
    ranks: list[str] = Field(default_factory=list)
    representation: str | None = None


class DisplayMatchDTO(PublicModel):
    id: str
    matchNumber: int | None = None
    sideA: list[str] = Field(default_factory=list)
    sideB: list[str] = Field(default_factory=list)
    sideC: list[str] | None = None
    matchType: str = "dual"
    eventRank: str | None = None
    durationSlots: int = 1


class DisplayAssignmentDTO(PublicModel):
    matchId: str
    slotId: int
    courtId: int
    durationSlots: int = 1


class DisplayScheduleDTO(PublicModel):
    assignments: list[DisplayAssignmentDTO] = Field(default_factory=list)
    unscheduledMatches: list[str] = Field(default_factory=list)
    status: str | None = None
    effectivePolicy: Literal["pinned", "queue"] | None = None


class DisplayBracketConfigDTO(PublicModel):
    scoringFormat: Literal["simple", "badminton"] | None = None
    setsToWin: int | None = None
    pointsPerSet: int | None = None
    deuceEnabled: bool | None = None
    pointCap: int | None = None
    grand_final_reset: bool | None = None
    consolation: str | None = None
    swiss_rounds: int | None = None


class DisplayParticipantDTO(PublicModel):
    id: str
    name: str
    members: list[str] | None = None
    seed: int | None = None
    representation: str | None = None


class DisplayPlayUnitDTO(PublicModel):
    id: str
    event_id: str
    round_index: int
    match_index: int
    side_a: list[str] | None = None
    side_b: list[str] | None = None
    duration_slots: int
    dependencies: list[str] = Field(default_factory=list)
    slot_a: BracketSlotOut
    slot_b: BracketSlotOut
    sides: list[MatchSideDTO] = Field(default_factory=list)
    segment: str | None = None


class DisplayGameDTO(PublicModel):
    sideA: int
    sideB: int


class DisplayBracketScoreDTO(PublicModel):
    sets: list[DisplayGameDTO] = Field(default_factory=list)


class DisplayResultDTO(PublicModel):
    play_unit_id: str
    winner_side: str
    walkover: bool = False
    finished_at_slot: int | None = None
    score: DisplayBracketScoreDTO | None = None
    reason: Literal["walkover", "retired", "forfeit"] | None = None

    @field_validator("reason", mode="before")
    @classmethod
    def public_reason(cls, value: object) -> str | None:
        return value if isinstance(value, str) and value in {"walkover", "retired", "forfeit"} else None


class DisplayEventDTO(PublicModel):
    id: str
    discipline: str
    format: str
    bracket_size: int | None = None
    participant_count: int
    rounds: list[list[str]]
    segments: list[SegmentOut] | None = None
    standings: list[StandingRow] | None = None
    status: str | None = None
    seeded_count: int | None = None
    rr_rounds: int | None = None
    config: DisplayBracketConfigDTO = Field(default_factory=DisplayBracketConfigDTO)
    participants: list[DisplayParticipantDTO] = Field(default_factory=list)


class DisplayBracketDTO(PublicModel):
    courts: int
    total_slots: int
    rest_between_rounds: int
    interval_minutes: int
    start_time: datetime | None = None
    events: list[DisplayEventDTO]
    participants: list[DisplayParticipantDTO]
    play_units: list[DisplayPlayUnitDTO]
    assignments: list[AssignmentOut]
    results: list[DisplayResultDTO]
