"""Compass draw generation.

A non-elimination format: winners go East, first-match losers go West,
and every subsequent loss moves you to another compass-point bracket.
Fixed spawn table (each segment is a plain knockout over the LOSERS of
one specific round of an earlier segment):

    E  = the entrants (exact SE shape — BWF seeding + byes)
    W  = losers(E,  R0)
    N  = losers(E,  R1)
    S  = losers(W,  R0)
    NE = losers(E,  R2)
    NW = losers(N,  R0)
    SE = losers(W,  R1)
    SW = losers(S,  R0)

A segment is generated only when its entry count is >= 2 (a one-loser
source round can't seed a bracket). Size 8 therefore yields E/W/N/S
only — losers(E, R2) is the single final loser — while size 16 yields
all eight segments. Segment ids are the letters; labels the direction
names. (The ``SE`` direction only collides with "single elimination"
lexically — both are just strings in their own namespaces.)

Byes ride the S2 walkover→BYE policy: a bye's "loser" feeds BYE into
West et al., and the sweep hollows those matches automatically.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

from scheduler_core.domain.tournament import Event, Participant, PlayUnit

from ..draw import BracketSlot, Draw, DrawSegment
from ._knockout import build_knockout
from ._segments import segment_label
from ._waves import metadata_order_key, waves_from_dependencies
from .single_elimination import _assign_to_bracket, _next_bracket_size

# (segment, source segment, source round) — entries are the losers of
# the source segment's round. Listed in generation/display order; every
# source precedes its dependents.
_SPAWN_TABLE: Tuple[Tuple[str, str, int], ...] = (
    ("W", "E", 0),
    ("N", "E", 1),
    ("S", "W", 0),
    ("NE", "E", 2),
    ("NW", "N", 0),
    ("SE", "W", 1),
    ("SW", "S", 0),
)


def generate_compass(
    participants: Sequence[Participant],
    *,
    event_id: str = "compass",
    play_unit_id_prefix: str = "CMP",
    duration_slots: int = 1,
    seeded_count: Optional[int] = None,
    bracket_size: Optional[int] = None,
) -> Draw:
    """Generate a compass draw: East main bracket + spawned directions."""
    if len(participants) < 2:
        raise ValueError("need at least 2 participants")

    size = bracket_size or _next_bracket_size(len(participants))
    if size & (size - 1) != 0 or size < 2:
        raise ValueError(f"bracket_size must be a power of two >= 2, got {size}")
    if len(participants) > size:
        raise ValueError(
            f"bracket_size={size} cannot hold {len(participants)} participants"
        )
    if seeded_count is None:
        seeded_count = len(participants)
    if seeded_count < 0 or seeded_count > len(participants):
        raise ValueError(
            f"seeded_count must be 0..{len(participants)}, got {seeded_count}"
        )

    prefix = play_unit_id_prefix
    play_units: Dict[str, PlayUnit] = {}
    slots: Dict[str, Tuple[BracketSlot, BracketSlot]] = {}
    segments: List[DrawSegment] = []
    seg_rounds_by_id: Dict[str, List[List[str]]] = {}

    def _add_segment(seg_id: str, entry_slots: List[BracketSlot]) -> None:
        order = len(segments)
        units, seg_slots, seg_rounds = build_knockout(
            entry_slots,
            event_id=event_id,
            id_prefix=prefix,
            seg_id=seg_id,
            seg_order=order,
            duration_slots=duration_slots,
        )
        play_units.update(units)
        slots.update(seg_slots)
        seg_rounds_by_id[seg_id] = seg_rounds
        segments.append(
            DrawSegment(
                id=seg_id,
                label=segment_label("compass", seg_id),
                order=order,
                rounds=seg_rounds,
            )
        )

    # E — the entrants, exact SE shape.
    bracket = _assign_to_bracket(participants, seeded_count, size)
    _add_segment("E", [BracketSlot.of_participant(p.id) for p in bracket])

    # Spawned directions, only where the source round drops >= 2 losers.
    for seg_id, source_id, source_round in _SPAWN_TABLE:
        source_rounds = seg_rounds_by_id.get(source_id)
        if source_rounds is None or source_round >= len(source_rounds):
            continue
        source_units = source_rounds[source_round]
        if len(source_units) < 2:
            continue
        _add_segment(
            seg_id,
            [BracketSlot.of_feeder(uid, take="loser") for uid in source_units],
        )

    event = Event(
        id=event_id,
        type_tags=["compass"],
        format_plugin_name="compass",
        parameters={
            "bracket_size": size,
            "participant_count": len(participants),
            "seeded_count": seeded_count,
        },
    )

    return Draw(
        event=event,
        participants={p.id: p for p in participants},
        play_units=play_units,
        slots=slots,
        rounds=waves_from_dependencies(
            play_units, metadata_order_key(play_units)
        ),
        segments=segments,
    )
