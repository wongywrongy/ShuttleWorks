"""Double-elimination draw generation.

Three segments over one play-unit DAG (docs/explanation/architecture/draw-formats.md):

- ``W`` — the winners (main) bracket: the exact single-elimination shape
  (BWF seeding, bye padding), re-built through the generalized knockout
  so its units carry segment metadata and ``W``-namespaced ids.
- ``L`` — the losers bracket for size ``N = 2^k``: ``2k - 2`` rounds
  alternating "internal" rounds (pair adjacent L winners) with "drop-in"
  rounds (an L winner meets a freshly dropped W loser).
- ``GF`` — the grand final: W champion vs L champion, plus an optional
  static "if needed" reset match (``grand_final_reset``).

Drop-in mapping (anti-rematch, deterministic — pinned by test): the
losers of ``W-R{w}`` enter L-round ``2w - 1`` in :func:`_drop_order`
order — REVERSED on odd ``w``, HALF-ROTATED on even ``w`` — so a player
who just lost in the W bracket doesn't immediately replay the opponent
whose section of the draw fed their side of the L bracket.

Byes need no special handling here: W-R0 byes auto-walkover at
``register_draw`` time, their "losers" feed BYE into L (the S2
walkover→BYE policy in ``advancement._loser_participant_id``), and the
normal sweep hollows the affected L units.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

from scheduler_core.domain.tournament import (
    Event,
    Participant,
    PlayUnit,
    PlayUnitKind,
)

from ..draw import BracketSlot, Draw, DrawSegment
from ._knockout import build_knockout, knockout_unit_id
from ._segments import segment_label
from ._waves import metadata_order_key, waves_from_dependencies
from .single_elimination import _assign_to_bracket, _next_bracket_size


def _drop_order(count: int, w: int) -> List[int]:
    """Order in which ``W-R{w}``'s losers fill that drop-in round's slots.

    ``order[m]`` = the W match index whose loser lands in L drop-in unit
    ``m``. Odd ``w`` → reverse order; even ``w`` → half-rotation. Both
    are deterministic permutations that push a dropping player away from
    the L-bracket region seeded by their own quarter of the draw
    (standard anti-rematch shifting).
    """
    if w % 2 == 1:
        return list(range(count - 1, -1, -1))
    half = count // 2
    return list(range(half, count)) + list(range(half))


def generate_double_elimination(
    participants: Sequence[Participant],
    *,
    event_id: str = "de",
    play_unit_id_prefix: str = "DE",
    duration_slots: int = 1,
    seeded_count: Optional[int] = None,
    bracket_size: Optional[int] = None,
    grand_final_reset: bool = False,
) -> Draw:
    """Generate a double-elimination draw (W + L + GF segments).

    ``participants`` follow the SE contract: input order is seed order,
    the first ``seeded_count`` treated as seeds (default: all). The
    effective bracket size must be at least 4 — a 2-bracket has no
    losers bracket to speak of.
    """
    if len(participants) < 2:
        raise ValueError("need at least 2 participants")

    size = bracket_size or _next_bracket_size(len(participants))
    if size & (size - 1) != 0 or size < 2:
        raise ValueError(f"bracket_size must be a power of two >= 2, got {size}")
    if size < 4:
        raise ValueError(
            f"double elimination needs a bracket size of at least 4, got {size}"
        )
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
    k = size.bit_length() - 1  # log2(size)

    play_units: Dict[str, PlayUnit] = {}
    slots: Dict[str, Tuple[BracketSlot, BracketSlot]] = {}

    # ── W: the main bracket — exact SE shape (BWF seeding + byes). ─────
    bracket = _assign_to_bracket(participants, seeded_count, size)
    w_units, w_slots, w_rounds = build_knockout(
        [BracketSlot.of_participant(p.id) for p in bracket],
        event_id=event_id,
        id_prefix=prefix,
        seg_id="W",
        seg_order=0,
        duration_slots=duration_slots,
    )
    play_units.update(w_units)
    slots.update(w_slots)

    def _wid(r: int, m: int) -> str:
        return knockout_unit_id(prefix, "W", r, m)

    def _lid(r: int, m: int) -> str:
        return knockout_unit_id(prefix, "L", r, m)

    # ── L: 2k-2 rounds. Round sizes halve every TWO rounds:
    #      count(r) = size / 2^(r//2 + 2)  →  N/4, N/4, N/8, N/8, … 1, 1.
    l_rounds: List[List[str]] = []
    num_l_rounds = 2 * k - 2
    for r in range(num_l_rounds):
        count = size >> ((r // 2) + 2)
        round_ids: List[str] = []
        if r % 2 == 1:
            w = (r + 1) // 2  # which W round drops its losers in here
            order = _drop_order(count, w)
        for m in range(count):
            if r == 0:
                # Pair W-R0 losers adjacently.
                slot_a = BracketSlot.of_feeder(_wid(0, 2 * m), take="loser")
                slot_b = BracketSlot.of_feeder(_wid(0, 2 * m + 1), take="loser")
            elif r % 2 == 1:
                # Drop-in round: previous L winner vs W-R{w} loser.
                slot_a = BracketSlot.of_feeder(_lid(r - 1, m))
                slot_b = BracketSlot.of_feeder(_wid(w, order[m]), take="loser")
            else:
                # Internal round: pair adjacent previous-L winners.
                slot_a = BracketSlot.of_feeder(_lid(r - 1, 2 * m))
                slot_b = BracketSlot.of_feeder(_lid(r - 1, 2 * m + 1))
            pu_id = _lid(r, m)
            deps: List[str] = []
            for s in (slot_a, slot_b):
                if s.feeder_play_unit_id not in deps:
                    deps.append(s.feeder_play_unit_id)
            play_units[pu_id] = PlayUnit(
                id=pu_id,
                event_id=event_id,
                side_a=None,
                side_b=None,
                expected_duration_slots=duration_slots,
                kind=PlayUnitKind.MATCH,
                dependencies=deps,
                metadata={
                    "segment": "L",
                    "segment_order": 1,
                    "round": r,
                    "match_index": m,
                },
            )
            slots[pu_id] = (slot_a, slot_b)
            round_ids.append(pu_id)
        l_rounds.append(round_ids)

    # ── GF: W champion vs L champion (+ optional static reset). ────────
    w_final = _wid(k - 1, 0)
    l_final = _lid(num_l_rounds - 1, 0)
    gf0 = knockout_unit_id(prefix, "GF", 0, 0)
    play_units[gf0] = PlayUnit(
        id=gf0,
        event_id=event_id,
        side_a=None,
        side_b=None,
        expected_duration_slots=duration_slots,
        kind=PlayUnitKind.MATCH,
        dependencies=[w_final, l_final],
        metadata={
            "segment": "GF",
            "segment_order": 2,
            "round": 0,
            "match_index": 0,
        },
    )
    slots[gf0] = (
        BracketSlot.of_feeder(w_final),
        BracketSlot.of_feeder(l_final),
    )
    gf_rounds: List[List[str]] = [[gf0]]

    if grand_final_reset:
        # Static "if needed" bracket reset: both GF1 players meet again.
        # If the W champion wins GF1 the reset is moot — the operator
        # records it as a walkover for the champion.
        gf1 = knockout_unit_id(prefix, "GF", 1, 0)
        play_units[gf1] = PlayUnit(
            id=gf1,
            event_id=event_id,
            side_a=None,
            side_b=None,
            expected_duration_slots=duration_slots,
            kind=PlayUnitKind.MATCH,
            dependencies=[gf0],
            metadata={
                "segment": "GF",
                "segment_order": 2,
                "round": 1,
                "match_index": 0,
                "conditional": True,
            },
        )
        slots[gf1] = (
            BracketSlot.of_feeder(gf0, take="winner"),
            BracketSlot.of_feeder(gf0, take="loser"),
        )
        gf_rounds.append([gf1])

    segments = [
        DrawSegment(
            id="W", label=segment_label("de", "W"), order=0, rounds=w_rounds
        ),
        DrawSegment(
            id="L", label=segment_label("de", "L"), order=1, rounds=l_rounds
        ),
        DrawSegment(
            id="GF", label=segment_label("de", "GF"), order=2, rounds=gf_rounds
        ),
    ]

    event = Event(
        id=event_id,
        type_tags=["double_elimination"],
        format_plugin_name="double_elimination",
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
