"""Record results and propagate winners through bracket dependencies.

When a PlayUnit's result is recorded, every downstream PlayUnit that
listed it as a dependency gets its corresponding BracketSlot resolved
(participant id filled in, feeder pointer cleared) and its `side_a` /
`side_b` updated on the engine-facing PlayUnit.

Walkovers cascade — recording a walkover on a R1 PlayUnit may resolve
a R2 slot, which in turn may not yet be ready (waiting on the other
feeder) but will resolve as soon as that feeder finishes.
"""
from __future__ import annotations

from typing import List, Optional

from scheduler_core.domain.tournament import (
    PlayUnitId,
    Result,
    TournamentState,
    WinnerSide,
)

from tournament.draw import BYE, BracketSlot, Draw


def record_result(
    state: TournamentState,
    draw: Draw,
    play_unit_id: PlayUnitId,
    winner_side: WinnerSide,
    *,
    finished_at_slot: Optional[int],
    walkover: bool = False,
    score: Optional[dict] = None,
) -> List[PlayUnitId]:
    """Store a Result for `play_unit_id` and propagate the winner forward.

    Returns the list of downstream PlayUnit ids whose slots were
    resolved by this call.
    """
    if play_unit_id not in draw.play_units:
        raise KeyError(f"unknown play unit {play_unit_id!r}")
    if play_unit_id in state.results:
        raise ValueError(f"play unit {play_unit_id!r} already has a result")

    state.results[play_unit_id] = Result(
        winner_side=winner_side,
        score=score,
        finished_at_slot=finished_at_slot,
        walkover=walkover,
    )

    winning_participant_id = _winner_participant_id(
        state, draw, play_unit_id, winner_side
    )

    resolved: List[PlayUnitId] = []
    for downstream_id, downstream in draw.play_units.items():
        if play_unit_id not in downstream.dependencies:
            continue
        slot_a, slot_b = draw.slots[downstream_id]
        changed = False
        if slot_a.feeder_play_unit_id == play_unit_id:
            new_slot = BracketSlot.of_participant(
                winning_participant_id or BYE
            )
            draw.slots[downstream_id] = (new_slot, slot_b)
            slot_a = new_slot
            changed = True
        if slot_b.feeder_play_unit_id == play_unit_id:
            new_slot = BracketSlot.of_participant(
                winning_participant_id or BYE
            )
            draw.slots[downstream_id] = (slot_a, new_slot)
            slot_b = new_slot
            changed = True
        if changed:
            _refresh_play_unit_sides(draw, downstream_id)
            resolved.append(downstream_id)

    return resolved


def _winner_participant_id(
    state: TournamentState,
    draw: Draw,
    play_unit_id: PlayUnitId,
    winner_side: WinnerSide,
) -> Optional[str]:
    pu = draw.play_units[play_unit_id]
    if winner_side == WinnerSide.A:
        return pu.side_a[0] if pu.side_a else None
    if winner_side == WinnerSide.B:
        return pu.side_b[0] if pu.side_b else None
    return None  # WinnerSide.NONE — double-bye / dead branch


def auto_walkover_byes(state: TournamentState, draw: Draw) -> None:
    """Record walkover results for any R1 PlayUnit that has a BYE side.

    A R1 PlayUnit may have one side absent (the standard case — top
    seed gets a bye) or both sides absent (a degenerate case for very
    small fields). The winner of a one-sided bye is the present side;
    a double-bye produces a NONE result so the downstream PlayUnit
    knows the branch is dead and gets walked over too.
    """
    for pu_id in list(draw.rounds[0]):
        pu = state.play_units[pu_id]
        a_empty = not pu.side_a
        b_empty = not pu.side_b
        if a_empty and b_empty:
            state.results[pu_id] = Result(
                winner_side=WinnerSide.NONE, walkover=True
            )
        elif a_empty:
            record_result(
                state, draw, pu_id, WinnerSide.B,
                finished_at_slot=None, walkover=True,
            )
        elif b_empty:
            record_result(
                state, draw, pu_id, WinnerSide.A,
                finished_at_slot=None, walkover=True,
            )


def _refresh_play_unit_sides(draw: Draw, play_unit_id: PlayUnitId) -> None:
    """Sync PlayUnit.side_a/side_b with the current BracketSlot map."""
    slot_a, slot_b = draw.slots[play_unit_id]
    pu = draw.play_units[play_unit_id]
    if slot_a.is_resolved:
        pu.side_a = [slot_a.participant_id]
    elif slot_a.is_bye:
        pu.side_a = None
    if slot_b.is_resolved:
        pu.side_b = [slot_b.participant_id]
    elif slot_b.is_bye:
        pu.side_b = None
