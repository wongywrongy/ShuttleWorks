"""Draw types: bracket slots and the Draw container.

A Draw is the structural output of format generation. It owns:

- The list of PlayUnits making up every round.
- A `slots` map: PlayUnitId -> (slot_a, slot_b), where each slot is
  either a concrete participant id or a pointer to a feeder PlayUnit
  whose winner takes the slot.

The Draw is independent of any specific tournament state — schedules
and results live on TournamentState.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from scheduler_core.domain.tournament import (
    Event,
    Participant,
    ParticipantId,
    PlayUnit,
    PlayUnitId,
)

# Sentinel participant id for bye padding. Any draw with a `BYE`
# participant_id on either side auto-walks-over at result-recording
# time.
BYE: ParticipantId = "__BYE__"


@dataclass
class BracketSlot:
    """One side of a PlayUnit.

    Exactly one of `participant_id` and `feeder_play_unit_id` is set.
    `participant_id == BYE` means a bye placeholder.

    ``feeder_take`` says WHICH participant of the feeder fills this slot:
    ``"winner"`` (the historical default — main-draw advancement) or
    ``"loser"`` (consolation routing: double elimination losers brackets,
    Monrad plates, compass segments). Meaningful only while
    ``feeder_play_unit_id`` is set; resolved slots normalize to "winner".
    """

    participant_id: Optional[ParticipantId] = None
    feeder_play_unit_id: Optional[PlayUnitId] = None
    feeder_take: str = "winner"

    def __post_init__(self) -> None:
        has_pid = self.participant_id is not None
        has_feeder = self.feeder_play_unit_id is not None
        if has_pid == has_feeder:
            raise ValueError(
                "BracketSlot must have exactly one of participant_id or "
                "feeder_play_unit_id"
            )
        if self.feeder_take not in ("winner", "loser"):
            raise ValueError(
                f"feeder_take must be 'winner' or 'loser', got {self.feeder_take!r}"
            )
        if has_pid:
            # A concrete participant has no feeder semantics — normalize
            # so equality/serialization never depend on a stale take.
            self.feeder_take = "winner"

    @classmethod
    def of_participant(cls, participant_id: ParticipantId) -> "BracketSlot":
        return cls(participant_id=participant_id)

    @classmethod
    def of_feeder(
        cls, play_unit_id: PlayUnitId, take: str = "winner"
    ) -> "BracketSlot":
        return cls(feeder_play_unit_id=play_unit_id, feeder_take=take)

    @property
    def is_resolved(self) -> bool:
        return self.participant_id is not None and self.participant_id != BYE

    @property
    def is_bye(self) -> bool:
        return self.participant_id == BYE


@dataclass
class DrawSegment:
    """One named sub-bracket of a multi-segment draw.

    Segment formats (double elimination, Monrad, compass) structure a
    draw as several small brackets: ``id`` is the wire id (``'W'``,
    ``'L'``, ``'GF'``, ``'M'``, ``'PLATE'``, ``'P5_8'``, ``'E'``, …),
    ``label`` the display name ("Main draw", "Losers bracket", "5–8"),
    ``order`` the display/stacking order, and ``rounds`` the
    SEGMENT-LOCAL round-major play-unit ids. ``metadata`` carries
    format extras — e.g. ``{'positions': [5, 8]}`` for a Monrad
    classification bracket.

    ``Draw.rounds`` stays the GLOBAL scheduling axis (dependency
    waves); segments are purely structural/presentational.
    """

    id: str
    label: str
    order: int
    rounds: List[List[PlayUnitId]]
    metadata: dict = field(default_factory=dict)


@dataclass
class Draw:
    """Generated draw structure for one event.

    Holds the PlayUnits, the participant pool, and the slot map. The
    PlayUnits' `dependencies` field already encodes the bracket DAG;
    `slots` records which side each dependency feeds.

    ``segments`` is populated only by multi-segment formats (DE /
    Monrad / compass); single-bracket formats (se / rr) leave it
    ``None``.
    """

    event: Event
    participants: Dict[ParticipantId, Participant]
    play_units: Dict[PlayUnitId, PlayUnit]
    slots: Dict[PlayUnitId, Tuple[BracketSlot, BracketSlot]]
    rounds: List[List[PlayUnitId]] = field(default_factory=list)
    segments: Optional[List[DrawSegment]] = None

    def play_units_in_round(self, round_index: int) -> List[PlayUnit]:
        return [self.play_units[pu_id] for pu_id in self.rounds[round_index]]

    @property
    def round_count(self) -> int:
        return len(self.rounds)
