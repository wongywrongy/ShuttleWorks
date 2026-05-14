"""Single-elimination bracket generation, BWF-conformant.

Seeding follows the BWF / Tournament Planner methodology:

- Seed 1 at the top of the bracket (position 0), seed 2 at the bottom
  (position size-1) — they only meet in the final.
- Seeds 3 and 4 land in opposite quarters, in the half not containing
  the top seed of that section.
- Seeds 5-8 land in opposite eighths, then 9-16 in opposite sixteenths,
  recursively.
- Byes are assigned to the R1 opponents of the top seeds (seeds 1..K
  for K byes), per BWF convention — top seeds receive byes first.

The placement is deterministic. A ``randomize`` flag is reserved for a
future change that shuffles within each tier before placement; for
now it is the API attachment point and raises if set.

Bye padding: if the participant count isn't a power of two, the bracket
is padded up to the next power; the extra slots become BYE placeholders
positioned opposite the top seeds in R1.
"""
from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

from scheduler_core.domain.tournament import (
    Event,
    Participant,
    PlayUnit,
    PlayUnitKind,
)

from ..draw import BYE, BracketSlot, Draw

_BRACKET_SIZES = (2, 4, 8, 16, 32, 64, 128, 256)


def _next_bracket_size(n: int) -> int:
    if n < 2:
        raise ValueError(f"need at least 2 participants, got {n}")
    for size in _BRACKET_SIZES:
        if size >= n:
            return size
    raise ValueError(f"bracket size > 256 not supported (got {n})")


def _bwf_positions(size: int) -> List[int]:
    """Return pos_to_seed[i] = seed (1..size) assigned to position i.

    Deterministic BWF placement via recursive bisection:

      - Seed 1 -> position 0
      - Seed 2 -> position size-1
      - At each level, each existing section (start..end) is bisected;
        the next pair of seeds goes into the two new sub-sections, with
        the lower-numbered seed on the side adjacent to the higher seed
        of the section (i.e. seed 5 lands in seed 4's quarter, seed 8
        lands in seed 1's quarter, etc.).

    For size == 2^n this produces a full permutation of 1..size.
    """
    if size & (size - 1) != 0 or size < 2:
        raise ValueError(f"size must be a power of two >= 2, got {size}")
    positions = [0] * size
    positions[0] = 1
    positions[size - 1] = 2
    sections: List[Tuple[int, int]] = [(0, size - 1)]
    next_seed = 3
    while sections and next_seed <= size:
        new_sections: List[Tuple[int, int]] = []
        for start, end in sections:
            if end - start < 3:
                continue
            mid_lo = (start + end) // 2
            mid_hi = mid_lo + 1
            positions[mid_hi] = next_seed
            positions[mid_lo] = next_seed + 1
            next_seed += 2
            new_sections.append((start, mid_lo))
            new_sections.append((mid_hi, end))
        sections = new_sections
    return positions


def _seed_to_position_map(size: int) -> List[int]:
    """Inverse of ``_bwf_positions``: ``seed_to_pos[seed-1] = position``."""
    pos_to_seed = _bwf_positions(size)
    seed_to_pos = [0] * size
    for pos, seed in enumerate(pos_to_seed):
        seed_to_pos[seed - 1] = pos
    return seed_to_pos


def _r1_opponent_position(pos: int) -> int:
    """In a paired bracket, R1 opponents are (2k, 2k+1) — toggle low bit."""
    return pos ^ 1


def _assign_to_bracket(
    participants: Sequence[Participant],
    seeded_count: int,
    size: int,
) -> List[Participant]:
    """Place participants and byes onto the bracket.

    Returns ``bracket[i] = participant at position i``.

    - The first ``seeded_count`` participants are treated as seeds 1..N
      and placed at their BWF positions.
    - Remaining participants are unseeded; they fill whatever positions
      are left over, in the seed-order traversal — the deterministic
      stand-in for the BWF random unseeded draw.
    - Byes are placed at the R1 opponents of the top seeds (1..K where
      K = size - len(participants)).
    """
    n_real = len(participants)
    bye_count = size - n_real
    if bye_count < 0:
        raise ValueError(
            f"bracket size {size} smaller than participant count {n_real}"
        )

    seed_to_pos = _seed_to_position_map(size)

    bye_positions = {seed_to_pos[i] ^ 1 for i in range(bye_count)}

    bye_p = Participant(id=BYE, name="(bye)", metadata={"bye": True})
    bracket: List[Optional[Participant]] = [None] * size

    # Single iterator: top ``seeded_count`` entries are seeded and get
    # placed at the first ``seeded_count`` non-bye positions in seed
    # order; unseeded entries fill the remaining non-bye positions in
    # seed order. ``seeded_count`` is informational — the placement
    # itself is identical because participants are already supplied in
    # the order they should occupy seed slots.
    real_iter = iter(participants)
    for pos in seed_to_pos:
        if pos in bye_positions:
            bracket[pos] = bye_p
            continue
        try:
            bracket[pos] = next(real_iter)
        except StopIteration:
            # All real participants placed; remaining non-bye seed
            # slots become byes too (this shouldn't happen when
            # bye_count is computed correctly, but it's a safe fallback
            # for degenerate sizes).
            bracket[pos] = bye_p

    # Defensive: any position still None (shouldn't happen) becomes bye.
    return [b if b is not None else bye_p for b in bracket]


def generate_single_elimination(
    participants: Sequence[Participant],
    *,
    event_id: str = "main",
    duration_slots: int = 1,
    play_unit_id_prefix: str = "M",
    seeded_count: Optional[int] = None,
    bracket_size: Optional[int] = None,
    randomize: bool = False,
) -> Draw:
    """Generate a BWF-conformant single-elimination draw.

    Args:
        participants: list of participants in input order. Seeded entries
            come first (the first ``seeded_count`` of the list), then
            unseeded.
        seeded_count: how many of ``participants`` are treated as seeds.
            Default: all of them. Must be <= len(participants).
        bracket_size: explicit bracket size (power of two). Default:
            next power of two >= len(participants).
        randomize: not yet implemented. Reserved for a future change
            that shuffles within each seed tier before placement.

    Returns:
        A ``Draw`` whose round-0 PlayUnits have concrete sides (with
        ``side_a``/``side_b`` set to ``None`` for byes), and whose later
        rounds carry ``dependencies`` pointing at their feeders.
    """
    if randomize:
        raise NotImplementedError(
            "randomize=True is not yet supported; deterministic placement only"
        )
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

    bracket = _assign_to_bracket(participants, seeded_count, size)

    participants_map = {p.id: p for p in participants}

    play_units: dict = {}
    slots: dict = {}
    rounds: List[List[str]] = []

    # Round 0
    round_play_units: List[str] = []
    pairings: List[Tuple[Participant, Participant]] = []
    for i in range(0, size, 2):
        pairings.append((bracket[i], bracket[i + 1]))

    for match_index, (a, b) in enumerate(pairings):
        pu_id = _pu_id(play_unit_id_prefix, 0, match_index)
        side_a_ids = [a.id] if a.id != BYE else None
        side_b_ids = [b.id] if b.id != BYE else None
        pu = PlayUnit(
            id=pu_id,
            event_id=event_id,
            side_a=side_a_ids,
            side_b=side_b_ids,
            expected_duration_slots=duration_slots,
            kind=PlayUnitKind.MATCH,
            metadata={"round": 0, "match_index": match_index},
        )
        play_units[pu_id] = pu
        slots[pu_id] = (
            BracketSlot.of_participant(a.id),
            BracketSlot.of_participant(b.id),
        )
        round_play_units.append(pu_id)
    rounds.append(round_play_units)

    # Subsequent rounds: each match's feeders are adjacent pairs from
    # the previous round.
    round_index = 0
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
        parameters={
            "bracket_size": size,
            "participant_count": len(participants),
            "seeded_count": seeded_count,
        },
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
