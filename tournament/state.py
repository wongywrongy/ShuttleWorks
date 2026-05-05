"""State helpers for absorbing a Draw into a TournamentState.

`register_draw` copies the draw's participants, event, and play units
into a TournamentState and auto-walks-over any R1 PlayUnit with a BYE
side so the dependency chain starts cleanly. Subsequent calls to
`record_result` propagate winners forward.
"""
from __future__ import annotations

from typing import Optional

from scheduler_core.domain.tournament import (
    PlayUnitId,
    Result,
    TournamentState,
    WinnerSide,
)

from tournament.draw import BYE, Draw


def register_draw(state: TournamentState, draw: Draw) -> None:
    """Insert a draw's participants/event/play_units into state.

    Auto-walks-over any PlayUnit where one side is a BYE so its
    successor immediately has one slot resolved.
    """
    for pid, p in draw.participants.items():
        state.participants.setdefault(pid, p)
    state.events.setdefault(draw.event.id, draw.event)
    for pu_id, pu in draw.play_units.items():
        if pu_id in state.play_units:
            raise ValueError(f"PlayUnit {pu_id} already in state")
        state.play_units[pu_id] = pu

    # Walk-over byes (R1 PlayUnits with one or both sides absent).
    # We make a list copy because record_result may, in principle,
    # cascade and add results we'd otherwise be iterating over.
    for pu_id in list(draw.rounds[0]):
        pu = state.play_units[pu_id]
        a_empty = not pu.side_a
        b_empty = not pu.side_b
        if a_empty and b_empty:
            # Both sides bye — true no-op. Record a NONE result so the
            # downstream PlayUnit knows this branch is dead.
            state.results[pu_id] = Result(
                winner_side=WinnerSide.NONE,
                walkover=True,
            )
        elif a_empty:
            from tournament.advancement import record_result as _rr
            _rr(state, draw, pu_id, WinnerSide.B, finished_at_slot=None,
                walkover=True)
        elif b_empty:
            from tournament.advancement import record_result as _rr
            _rr(state, draw, pu_id, WinnerSide.A, finished_at_slot=None,
                walkover=True)


def find_ready_play_units(
    state: TournamentState, draw: Draw
) -> list[PlayUnitId]:
    """Return PlayUnits that can be scheduled now: dependencies satisfied,
    sides non-empty, and not yet assigned or completed.
    """
    ready: list[PlayUnitId] = []
    for pu_id, pu in draw.play_units.items():
        if pu_id in state.results:
            continue
        if pu_id in state.assignments:
            continue
        if not pu.side_a or not pu.side_b:
            continue  # awaiting advancement to fill in a side
        if any(dep not in state.results for dep in pu.dependencies):
            continue
        # Skip dead branches: if a feeder result is NONE (double bye),
        # this PlayUnit can never be played. Mark it walked-over.
        if pu.dependencies and any(
            state.results[dep].winner_side == WinnerSide.NONE
            for dep in pu.dependencies
        ):
            state.results[pu_id] = Result(
                winner_side=WinnerSide.NONE, walkover=True
            )
            continue
        ready.append(pu_id)
    return ready


def latest_completed_finish_slot(state: TournamentState) -> Optional[int]:
    """Return the highest `actual_end_slot` across all assigned PlayUnits."""
    end_slots = [
        a.actual_end_slot
        for a in state.assignments.values()
        if a.actual_end_slot is not None
    ]
    if not end_slots:
        return None
    return max(end_slots)
