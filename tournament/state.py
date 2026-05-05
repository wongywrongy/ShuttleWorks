"""State helpers for absorbing a Draw into a TournamentState.

`register_draw` copies the draw's participants, event, and play units
into a TournamentState, then delegates to `advancement.auto_walkover_byes`
to walk-over any R1 PlayUnit with a BYE side. Subsequent calls to
`record_result` propagate winners forward.
"""
from __future__ import annotations

from scheduler_core.domain.tournament import (
    PlayUnitId,
    Result,
    TournamentState,
    WinnerSide,
)

from tournament.advancement import auto_walkover_byes
from tournament.draw import Draw


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

    auto_walkover_byes(state, draw)


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
