"""Single-elimination bracket generation.

Standard seeded bracket: top seed plays bottom seed in round 1, with
the remaining slots filled by recursive interleave so the final pits
seed 1 against seed 2 if both win out (1 vs 32, 16 vs 17, 8 vs 25, ...).

Bye padding: if the participant count isn't a power of two, BYE
participants are appended at the *bottom* of the seed list so the
top seeds get the byes (standard convention).
"""
from __future__ import annotations

from typing import List, Sequence, Tuple

from scheduler_core.domain.tournament import (
    Event,
    Participant,
    ParticipantId,
    PlayUnit,
    PlayUnitKind,
)

from tournament.draw import BYE, BracketSlot, Draw

_BRACKET_SIZES = (2, 4, 8, 16, 32, 64, 128, 256)


def _next_bracket_size(n: int) -> int:
    if n < 2:
        raise ValueError(f"need at least 2 participants, got {n}")
    for size in _BRACKET_SIZES:
        if size >= n:
            return size
    raise ValueError(f"bracket size > 256 not supported (got {n})")


def _seed_order(size: int) -> List[int]:
    """Return seed indices (1-based) in bracket position order.

    Position i (0-based) plays position i+1, with i even.
    Output for size=8: [1, 8, 4, 5, 2, 7, 3, 6] — seed 1 plays seed 8,
    seed 4 plays seed 5, etc. Recursive interleave: each round halves
    fold across the bracket so 1 and 2 only meet in the final.
    """
    if size & (size - 1) != 0 or size < 2:
        raise ValueError(f"size must be a power of two >= 2, got {size}")
    order: List[int] = [1, 2]
    while len(order) < size:
        new_size = len(order) * 2
        next_order: List[int] = []
        for s in order:
            next_order.append(s)
            next_order.append(new_size + 1 - s)
        order = next_order
    return order


def generate_single_elimination(
    participants: Sequence[Participant],
    *,
    event_id: str = "main",
    duration_slots: int = 1,
    play_unit_id_prefix: str = "M",
) -> Draw:
    """Generate a single-elimination draw from a seeded participant list.

    `participants` is treated as already in seed order (index 0 = top
    seed). If the count isn't a power of two, BYEs are appended at the
    bottom so the top seeds receive the byes.
    """
    if len(participants) < 2:
        raise ValueError("need at least 2 participants")

    size = _next_bracket_size(len(participants))
    bye_count = size - len(participants)

    # Build the seed list: real participants 1..len(participants),
    # then BYE placeholders.
    seeded: List[Participant] = list(participants)
    for i in range(bye_count):
        seeded.append(
            Participant(id=f"{BYE}_{i+1}", name="(bye)", metadata={"bye": True})
        )
    # Force the bye participant_id to the BYE sentinel so downstream
    # code can detect them by id.
    for p in seeded[len(participants):]:
        p.id = BYE

    seed_positions = _seed_order(size)  # e.g. [1, 8, 4, 5, 2, 7, 3, 6]
    # bracket_positions[i] = participant at position i in round 1
    bracket: List[Participant] = [seeded[s - 1] for s in seed_positions]

    participants_map = {p.id: p for p in participants}
    # Don't add BYE placeholders to the participant map — BYE is a
    # sentinel id, not a real participant.

    play_units: dict = {}
    slots: dict = {}
    rounds: List[List[str]] = []

    # Round 0: pair adjacent positions.
    round_play_units: List[str] = []
    round_index = 0
    pairings: List[Tuple[Participant, Participant]] = []
    for i in range(0, size, 2):
        pairings.append((bracket[i], bracket[i + 1]))

    for match_index, (a, b) in enumerate(pairings):
        pu_id = _pu_id(play_unit_id_prefix, round_index, match_index)
        side_a_ids = [a.id] if a.id != BYE else None
        side_b_ids = [b.id] if b.id != BYE else None
        pu = PlayUnit(
            id=pu_id,
            event_id=event_id,
            side_a=side_a_ids,
            side_b=side_b_ids,
            expected_duration_slots=duration_slots,
            kind=PlayUnitKind.MATCH,
            metadata={"round": round_index, "match_index": match_index},
        )
        play_units[pu_id] = pu
        slots[pu_id] = (
            BracketSlot.of_participant(a.id),
            BracketSlot.of_participant(b.id),
        )
        round_play_units.append(pu_id)
    rounds.append(round_play_units)

    # Subsequent rounds: each match's feeders are the two adjacent
    # matches in the previous round.
    prev_round = round_play_units
    while len(prev_round) > 1:
        round_index += 1
        round_play_units = []
        for match_index in range(0, len(prev_round), 2):
            feeder_a = prev_round[match_index]
            feeder_b = prev_round[match_index + 1]
            pu_id = _pu_id(play_unit_id_prefix, round_index, match_index // 2)
            pu = PlayUnit(
                id=pu_id,
                event_id=event_id,
                side_a=None,
                side_b=None,
                expected_duration_slots=duration_slots,
                kind=PlayUnitKind.MATCH,
                dependencies=[feeder_a, feeder_b],
                metadata={"round": round_index, "match_index": match_index // 2},
            )
            play_units[pu_id] = pu
            slots[pu_id] = (
                BracketSlot.of_feeder(feeder_a),
                BracketSlot.of_feeder(feeder_b),
            )
            round_play_units.append(pu_id)
        rounds.append(round_play_units)
        prev_round = round_play_units

    event = Event(
        id=event_id,
        type_tags=["single_elimination"],
        format_plugin_name="single_elimination",
        parameters={"bracket_size": size, "participant_count": len(participants)},
    )

    return Draw(
        event=event,
        participants=participants_map,
        play_units=play_units,
        slots=slots,
        rounds=rounds,
    )


def _pu_id(prefix: str, round_index: int, match_index: int) -> str:
    return f"{prefix}-R{round_index}-{match_index}"
