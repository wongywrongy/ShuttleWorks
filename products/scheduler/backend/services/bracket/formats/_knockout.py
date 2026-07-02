"""Generalized knockout cascade over arbitrary entry slots.

``generate_single_elimination`` builds its round cascade over CONCRETE
participants only. Segment formats (double elimination, Monrad, compass)
need the same cascade over mixed entries — a slot may be a participant OR
a feeder reference ("winner of X" / "loser of X"). ``build_knockout`` is
that generalization; the SE module itself stays untouched (its output is
pinned by existing tests).

Play-unit ids are ``{id_prefix}-{seg_id}-R{r}-{m}`` and every unit's
metadata carries the segment coordinates
(``segment`` / ``segment_order`` / ``round`` / ``match_index``) that the
persistence layer stores in the match ``meta`` JSON column — hydration
rebuilds ``Draw.segments`` from exactly these keys.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

from scheduler_core.domain.tournament import PlayUnit, PlayUnitKind

from ..draw import BYE, BracketSlot


def knockout_unit_id(id_prefix: str, seg_id: str, r: int, m: int) -> str:
    """The deterministic play-unit id scheme for segment knockouts."""
    return f"{id_prefix}-{seg_id}-R{r}-{m}"


def build_knockout(
    entry_slots: List[BracketSlot],
    *,
    event_id: str,
    id_prefix: str,
    seg_id: str,
    seg_order: int,
    duration_slots: int,
    start_positions: Optional[Sequence[int]] = None,
) -> Tuple[
    Dict[str, PlayUnit],
    Dict[str, Tuple[BracketSlot, BracketSlot]],
    List[List[str]],
]:
    """Build one knockout segment from ``entry_slots``.

    Args:
        entry_slots: power-of-two list (>= 2) of R0 entries, paired
            adjacently (``2i`` vs ``2i+1``). Each is a participant slot
            (``BYE`` allowed) or a feeder slot (winner- or loser-take).
        start_positions: optional ``[lo, hi]`` classification range this
            bracket decides (Monrad). When given it is stamped into every
            unit's metadata as ``positions`` so hydration can recover the
            range without re-deriving it from the segment id.

    Returns:
        ``(play_units, slots, seg_rounds)`` — segment-local round-major
        ids in ``seg_rounds``; the caller merges these into the Draw and
        wraps ``seg_rounds`` in a ``DrawSegment``.

    Sides follow the SE idiom: concrete participants fill ``side_a`` /
    ``side_b`` (``None`` for BYE); feeder entries leave sides ``None``
    until advancement resolves them.
    """
    n = len(entry_slots)
    if n < 2 or n & (n - 1) != 0:
        raise ValueError(
            f"knockout segment {seg_id!r} needs a power-of-two entry "
            f"count >= 2, got {n}"
        )

    extra_meta = (
        {"positions": [int(start_positions[0]), int(start_positions[1])]}
        if start_positions is not None
        else {}
    )

    play_units: Dict[str, PlayUnit] = {}
    slots: Dict[str, Tuple[BracketSlot, BracketSlot]] = {}
    seg_rounds: List[List[str]] = []

    # Round 0 — pair adjacent entry slots.
    round_ids: List[str] = []
    for m in range(n // 2):
        slot_a = entry_slots[2 * m]
        slot_b = entry_slots[2 * m + 1]
        pu_id = knockout_unit_id(id_prefix, seg_id, 0, m)
        deps: List[str] = []
        for s in (slot_a, slot_b):
            if s.feeder_play_unit_id is not None and s.feeder_play_unit_id not in deps:
                deps.append(s.feeder_play_unit_id)
        play_units[pu_id] = PlayUnit(
            id=pu_id,
            event_id=event_id,
            side_a=_side_of(slot_a),
            side_b=_side_of(slot_b),
            expected_duration_slots=duration_slots,
            kind=PlayUnitKind.MATCH,
            dependencies=deps,
            metadata={
                "segment": seg_id,
                "segment_order": seg_order,
                "round": 0,
                "match_index": m,
                **extra_meta,
            },
        )
        slots[pu_id] = (slot_a, slot_b)
        round_ids.append(pu_id)
    seg_rounds.append(round_ids)

    # Later rounds — the SE cascade: adjacent winners of the previous round.
    r = 0
    prev_round = round_ids
    while len(prev_round) > 1:
        r += 1
        round_ids = []
        for m in range(len(prev_round) // 2):
            feeder_a = prev_round[2 * m]
            feeder_b = prev_round[2 * m + 1]
            pu_id = knockout_unit_id(id_prefix, seg_id, r, m)
            play_units[pu_id] = PlayUnit(
                id=pu_id,
                event_id=event_id,
                side_a=None,
                side_b=None,
                expected_duration_slots=duration_slots,
                kind=PlayUnitKind.MATCH,
                dependencies=[feeder_a, feeder_b],
                metadata={
                    "segment": seg_id,
                    "segment_order": seg_order,
                    "round": r,
                    "match_index": m,
                    **extra_meta,
                },
            )
            slots[pu_id] = (
                BracketSlot.of_feeder(feeder_a),
                BracketSlot.of_feeder(feeder_b),
            )
            round_ids.append(pu_id)
        seg_rounds.append(round_ids)
        prev_round = round_ids

    return play_units, slots, seg_rounds


def _side_of(slot: BracketSlot):
    """SE side idiom: concrete participant → ``[pid]``, BYE → ``None``,
    feeder → ``None`` (resolved later by advancement)."""
    if slot.participant_id is None or slot.participant_id == BYE:
        return None
    return [slot.participant_id]
