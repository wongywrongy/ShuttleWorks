"""Competition/format-layer domain models.

Framework-grade types for the modular tournament model. These live in the
Competition/Format layer; the scheduling layer consumes PlayUnits via the Bridge.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

# Type aliases
PlayUnitId = str
EventId = str
ParticipantId = str

# Side: list[participant_id]. Supports singles (1), doubles (2), mixed (2).
Side = List[ParticipantId]


class ParticipantType(str, Enum):
    """Participant entity type."""

    PLAYER = "player"
    TEAM = "team"


@dataclass
class Participant:
    """Player or team with eligibility/seed metadata.

    Referenced by Generation and Advancement policies; Bridge maps to
    scheduling-layer Player for availability, rest, etc.
    """

    id: ParticipantId
    name: str
    type: ParticipantType = ParticipantType.PLAYER
    member_ids: List[ParticipantId] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.type == ParticipantType.TEAM and not self.member_ids:
            self.member_ids = []


class PlayUnitKind(str, Enum):
    """Kind of play unit."""

    MATCH = "match"
    TIE = "tie"
    BLOCK = "block"


@dataclass
class PlayUnit:
    """Unit of play: match, tie, or block.

    The scheduling layer schedules PlayUnits (as Match) only; it does not
    generate brackets, pools, or pairings.
    """

    id: PlayUnitId
    event_id: EventId
    side_a: Optional[Side] = None
    side_b: Optional[Side] = None
    expected_duration_slots: int = 1
    duration_variance_slots: int = 0
    dependencies: List[PlayUnitId] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    kind: PlayUnitKind = PlayUnitKind.MATCH
    child_unit_ids: List[PlayUnitId] = field(default_factory=list)


class WinnerSide(str, Enum):
    """Which side won (or N/A)."""

    A = "A"
    B = "B"
    NONE = "none"  # draw / N/A


@dataclass
class Result:
    """Result of a PlayUnit."""

    winner_side: WinnerSide = WinnerSide.NONE
    score: Optional[Dict[str, Any]] = None
    finished_at_slot: Optional[int] = None
    walkover: bool = False


@dataclass
class Event:
    """Event within a tournament."""

    id: EventId
    type_tags: List[str] = field(default_factory=list)
    format_plugin_name: str = ""
    parameters: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TournamentState:
    """Full competition state: participants, events, graph, results, assignments."""

    participants: Dict[ParticipantId, Participant] = field(default_factory=dict)
    events: Dict[EventId, Event] = field(default_factory=dict)
    play_units: Dict[PlayUnitId, PlayUnit] = field(default_factory=dict)
    results: Dict[PlayUnitId, Result] = field(default_factory=dict)
    assignments: Dict[PlayUnitId, "TournamentAssignment"] = field(default_factory=dict)


@dataclass
class TournamentAssignment:
    """Scheduled assignment for a PlayUnit (slot, court).

    Maps to scheduling-layer Assignment when bridging. Uses slot (not timeslot),
    locked, pinned, freeze per plan terminology.
    """

    play_unit_id: PlayUnitId
    slot_id: int
    court_id: int
    duration_slots: int = 1
    locked: bool = False
    pinned_slot_id: Optional[int] = None
    pinned_court_id: Optional[int] = None
    actual_start_slot: Optional[int] = None
    actual_end_slot: Optional[int] = None
