"""Monrad (classification / plate) draw generation.

The badminton-native consolation format: a knockout where losers keep
playing. Two consolation depths (the ``consolation`` per-draw knob):

- ``'plate'`` — ONE extra knockout (segment ``PLATE``) over the losers
  of the main draw's first round. Everyone gets at least two matches.
- ``'full'`` — recursive classification until EVERY position 1..N is
  decided by exactly one final. The standard Monrad recursion: in a
  bracket deciding positions ``[lo..hi]`` of size ``s``, the losers of
  round ``r`` (for every round except that bracket's final) spawn a
  child bracket deciding positions
  ``[lo + s/2^(r+1) .. lo + s/2^r - 1]``, and each child recurses the
  same rule. The bracket's own final decides ``lo`` (winner) and
  ``lo + 1`` (loser).

  N=8 worked example (pinned by test): M(1–8) → M-R0 losers spawn
  P5_8; P5_8's R0 losers spawn P7_8; M-R1 (SF) losers spawn P3_4.
  Finals decide (1,2), (3,4), (5,6), (7,8) — a bijection over 1..8.

Classification segment ids are ``P{lo}_{hi}`` (underscored), labels the
en-dashed range ("5–8"), and both segment and play-unit metadata carry
``positions: [lo, hi]`` so hydration recovers the range.

Byes get no special handling: the S2 walkover→BYE policy cascades them
through the consolation tree (a bye's "loser" never enters a plate), so
padded fields leave the bottom classification finals as hollow
double-BYE walkovers — those positions simply go undecided.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

from scheduler_core.domain.tournament import Event, Participant, PlayUnit

from ..draw import BracketSlot, Draw, DrawSegment
from ._knockout import build_knockout, knockout_unit_id
from ._segments import segment_label
from ._waves import metadata_order_key, waves_from_dependencies
from .single_elimination import _assign_to_bracket, _next_bracket_size

_CONSOLATION_MODES = ("full", "plate")


def generate_monrad(
    participants: Sequence[Participant],
    *,
    event_id: str = "monrad",
    play_unit_id_prefix: str = "MON",
    duration_slots: int = 1,
    seeded_count: Optional[int] = None,
    bracket_size: Optional[int] = None,
    consolation: str = "full",
) -> Draw:
    """Generate a Monrad draw: main knockout ``M`` + consolation segments."""
    if consolation not in _CONSOLATION_MODES:
        raise ValueError(
            f"consolation must be one of {_CONSOLATION_MODES}, got {consolation!r}"
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

    prefix = play_unit_id_prefix
    play_units: Dict[str, PlayUnit] = {}
    slots: Dict[str, Tuple[BracketSlot, BracketSlot]] = {}
    segments: List[DrawSegment] = []

    # ── M: the main knockout — exact SE shape (BWF seeding + byes). ────
    bracket = _assign_to_bracket(participants, seeded_count, size)
    m_units, m_slots, m_rounds = build_knockout(
        [BracketSlot.of_participant(p.id) for p in bracket],
        event_id=event_id,
        id_prefix=prefix,
        seg_id="M",
        seg_order=0,
        duration_slots=duration_slots,
    )
    play_units.update(m_units)
    slots.update(m_slots)
    segments.append(
        DrawSegment(
            id="M", label=segment_label("monrad", "M"), order=0, rounds=m_rounds
        )
    )

    if consolation == "plate":
        # One plate over the M-R0 losers (only meaningful when M-R0 has
        # at least two matches to lose from).
        if len(m_rounds[0]) >= 2:
            plate_units, plate_slots, plate_rounds = build_knockout(
                [
                    BracketSlot.of_feeder(uid, take="loser")
                    for uid in m_rounds[0]
                ],
                event_id=event_id,
                id_prefix=prefix,
                seg_id="PLATE",
                seg_order=1,
                duration_slots=duration_slots,
            )
            play_units.update(plate_units)
            slots.update(plate_slots)
            segments.append(
                DrawSegment(
                    id="PLATE",
                    label=segment_label("monrad", "PLATE"),
                    order=1,
                    rounds=plate_rounds,
                )
            )
    else:
        # Full classification: plan the recursion first (feeder ids are
        # formulaic, so no units need to exist yet), then build the
        # segments in display order (ascending position range).
        plans: List[Tuple[int, int, str, List[str]]] = []

        def _plan_children(parent_seg: str, lo: int, s: int) -> None:
            rounds_count = s.bit_length() - 1  # log2(s)
            for r in range(rounds_count - 1):  # every round but the final
                child_size = s >> (r + 1)  # number of round-r losers
                if child_size < 2:
                    continue
                child_lo = lo + (s >> (r + 1))
                child_hi = lo + (s >> r) - 1
                child_seg = f"P{child_lo}_{child_hi}"
                entries = [
                    knockout_unit_id(prefix, parent_seg, r, m)
                    for m in range(child_size)
                ]
                plans.append((child_lo, child_hi, child_seg, entries))
                _plan_children(child_seg, child_lo, child_size)

        _plan_children("M", 1, size)

        for order, (lo, hi, seg_id, entries) in enumerate(
            sorted(plans, key=lambda p: (p[0], p[1])), start=1
        ):
            seg_units, seg_slots, seg_rounds = build_knockout(
                [BracketSlot.of_feeder(uid, take="loser") for uid in entries],
                event_id=event_id,
                id_prefix=prefix,
                seg_id=seg_id,
                seg_order=order,
                duration_slots=duration_slots,
                start_positions=[lo, hi],
            )
            play_units.update(seg_units)
            slots.update(seg_slots)
            segments.append(
                DrawSegment(
                    id=seg_id,
                    label=segment_label(
                        "monrad", seg_id, {"positions": [lo, hi]}
                    ),
                    order=order,
                    rounds=seg_rounds,
                    metadata={"positions": [lo, hi]},
                )
            )

    event = Event(
        id=event_id,
        type_tags=["monrad"],
        format_plugin_name="monrad",
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
