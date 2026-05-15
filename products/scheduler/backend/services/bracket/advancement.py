"""Record results and propagate winners through bracket dependencies.

When a PlayUnit's result is recorded, every downstream PlayUnit that
listed it as a dependency gets its corresponding BracketSlot resolved
(participant id filled in, feeder pointer cleared) and its `side_a` /
`side_b` updated on the engine-facing PlayUnit.

For multi-event tournaments, callers pass a `draws` dict keyed by
event id; the function looks up the right Draw via the PlayUnit's
`event_id`. A single ``Draw`` is also accepted (treated as a one-event
mapping) for the single-event tests.

After each recorded result, ``_sweep_walkovers`` cascades through any
downstream PlayUnit whose remaining side is now a BYE (one feeder
walked over, the other already absent). A chain of byes — e.g. when
the field is much smaller than the bracket — resolves in one sweep
rather than waiting for each subsequent round to be scheduled.
"""
from __future__ import annotations

from typing import Dict, List, Mapping, Optional, Union

from scheduler_core.domain.tournament import (
    PlayUnitId,
    Result,
    TournamentState,
    WinnerSide,
)

from .draw import BYE, BracketSlot, Draw


DrawSource = Union[Draw, Mapping[str, Draw]]


def _as_draws(source: DrawSource) -> Dict[str, Draw]:
    if isinstance(source, Draw):
        return {source.event.id: source}
    return dict(source)


def record_result(
    state: TournamentState,
    draws: DrawSource,
    play_unit_id: PlayUnitId,
    winner_side: WinnerSide,
    *,
    finished_at_slot: Optional[int],
    walkover: bool = False,
    score: Optional[dict] = None,
) -> List[PlayUnitId]:
    """Store a Result for ``play_unit_id`` and propagate the winner forward.

    Returns the list of downstream PlayUnit ids whose slots were
    resolved by this call. Walkovers cascade through chains of byes
    automatically — callers don't need to recurse.
    """
    draw_map = _as_draws(draws)
    pu = state.play_units.get(play_unit_id)
    if pu is None:
        raise KeyError(f"unknown play unit {play_unit_id!r}")
    draw = draw_map.get(pu.event_id)
    if draw is None:
        raise KeyError(f"no draw registered for event {pu.event_id!r}")
    if play_unit_id in state.results:
        raise ValueError(f"play unit {play_unit_id!r} already has a result")

    if winner_side == WinnerSide.A and not pu.side_a:
        raise ValueError(
            f"cannot record A win on {play_unit_id!r}: side_a is empty"
        )
    if winner_side == WinnerSide.B and not pu.side_b:
        raise ValueError(
            f"cannot record B win on {play_unit_id!r}: side_b is empty"
        )

    resolved = _record_and_propagate(
        state,
        draw,
        play_unit_id,
        winner_side,
        finished_at_slot=finished_at_slot,
        walkover=walkover,
        score=score,
    )
    _sweep_walkovers(state, draw_map)
    return resolved


def auto_walkover_byes(state: TournamentState, draw: Draw) -> None:
    """Record walkover results for any R0 PlayUnit with a BYE side.

    Goes through R0 only — chains beyond R0 are picked up by the
    cascade sweep that runs inside every ``record_result`` call.
    """
    for pu_id in list(draw.rounds[0]):
        if pu_id in state.results:
            continue
        pu = state.play_units[pu_id]
        a_empty = not pu.side_a
        b_empty = not pu.side_b
        if a_empty and b_empty:
            record_result(
                state, draw, pu_id, WinnerSide.NONE,
                finished_at_slot=None, walkover=True,
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


# ---- internals ------------------------------------------------------------


def _record_and_propagate(
    state: TournamentState,
    draw: Draw,
    play_unit_id: PlayUnitId,
    winner_side: WinnerSide,
    *,
    finished_at_slot: Optional[int],
    walkover: bool,
    score: Optional[dict],
) -> List[PlayUnitId]:
    """Store the result and update downstream slots. Does NOT sweep."""
    state.results[play_unit_id] = Result(
        winner_side=winner_side,
        score=score,
        finished_at_slot=finished_at_slot,
        walkover=walkover,
    )

    winner = _winner_participant_id(draw, play_unit_id, winner_side)
    resolved: List[PlayUnitId] = []
    for downstream_id, downstream in draw.play_units.items():
        if play_unit_id not in downstream.dependencies:
            continue
        slot_a, slot_b = draw.slots[downstream_id]
        changed = False
        if slot_a.feeder_play_unit_id == play_unit_id:
            new_slot = BracketSlot.of_participant(winner or BYE)
            draw.slots[downstream_id] = (new_slot, slot_b)
            slot_a = new_slot
            changed = True
        if slot_b.feeder_play_unit_id == play_unit_id:
            new_slot = BracketSlot.of_participant(winner or BYE)
            draw.slots[downstream_id] = (slot_a, new_slot)
            slot_b = new_slot
            changed = True
        if changed:
            _refresh_play_unit_sides(draw, downstream_id)
            resolved.append(downstream_id)
    return resolved


def _sweep_walkovers(
    state: TournamentState, draw_map: Dict[str, Draw]
) -> None:
    """Cascade walkovers across the whole state until stable.

    A PlayUnit becomes auto-walkover-eligible when all its
    dependencies are resolved AND at least one of its sides is now
    empty (one feeder walked over to a BYE, the other already absent).
    The loop runs until no further PlayUnits are recorded.
    """
    changed = True
    while changed:
        changed = False
        for pu_id, pu in state.play_units.items():
            if pu_id in state.results:
                continue
            if pu.dependencies and not all(
                d in state.results for d in pu.dependencies
            ):
                continue
            a_empty = not pu.side_a
            b_empty = not pu.side_b
            if not (a_empty or b_empty):
                continue
            draw = draw_map.get(pu.event_id)
            if draw is None:
                continue
            if a_empty and b_empty:
                w = WinnerSide.NONE
            elif a_empty:
                w = WinnerSide.B
            else:
                w = WinnerSide.A
            _record_and_propagate(
                state,
                draw,
                pu_id,
                w,
                finished_at_slot=None,
                walkover=True,
                score=None,
            )
            changed = True


def _winner_participant_id(
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
