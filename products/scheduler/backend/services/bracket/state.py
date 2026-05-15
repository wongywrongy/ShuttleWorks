"""State helpers for absorbing a Draw into a TournamentState.

`register_draw` copies the draw's participants, event, and play units
into a TournamentState, then delegates to `advancement.auto_walkover_byes`
to walk-over any R1 PlayUnit with a BYE side. Multiple draws can be
registered into the same state (multi-event tournaments); each event's
PlayUnits keep their `event_id` so the scheduler and serializers can
filter accordingly.

PR 2 of the backend-merge arc also lifts the two small dataclasses
``EventMeta`` and ``BracketSession`` out of the tournament product's
``backend/state.py`` and into this shared module so the io / export
helpers can describe their shape without importing from a
product-specific location. The tournament backend's
``TournamentSlot`` keeps its driver field and just reuses these here.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional

from sqlalchemy.orm import Session

from database.models import BracketResult
from scheduler_core.domain.models import ScheduleConfig
from scheduler_core.domain.tournament import (
    PlayUnitId,
    Result,
    TournamentAssignment,
    TournamentState,
)

from .advancement import auto_walkover_byes
from .draw import Draw


@dataclass
class EventMeta:
    """Per-event metadata held alongside the Draw.

    ``format`` is ``"se"`` (single-elimination) or ``"rr"`` (round-robin).
    ``bracket_size`` is set for SE only; round-robin events leave it
    ``None``. Lifted here from the tournament product so both backends
    talk about events with the same shape.
    """

    id: str
    discipline: str
    format: str
    duration_slots: int
    bracket_size: Optional[int] = None
    participant_count: int = 0


@dataclass
class BracketSession:
    """Driver-free session container.

    Returned by ``parse_json_payload`` / ``parse_csv_payload`` and
    consumed by ``to_csv`` / ``to_ics`` after the PR 2 refactor that
    decoupled the io helpers from the tournament product's
    ``TournamentSlot`` (which keeps its driver field locally).
    """

    state: TournamentState
    draws: Dict[str, Draw]
    config: ScheduleConfig
    rest_between_rounds: int
    start_time: Optional[datetime]
    events: Dict[str, EventMeta] = field(default_factory=dict)


def register_draw(state: TournamentState, draw: Draw) -> None:
    """Insert a draw's participants/event/play_units into state.

    Safe to call multiple times for multi-event tournaments; each call
    handles one event. Raises if a participant or PlayUnit id collides
    with one already in state (callers should namespace per event).
    """
    for pid, p in draw.participants.items():
        state.participants.setdefault(pid, p)
    state.events.setdefault(draw.event.id, draw.event)
    for pu_id, pu in draw.play_units.items():
        if pu_id in state.play_units:
            raise ValueError(f"PlayUnit {pu_id} already in state")
        state.play_units[pu_id] = pu

    auto_walkover_byes(state, draw)


def find_ready_play_units(state: TournamentState) -> list[PlayUnitId]:
    """Return PlayUnits that can be scheduled now: dependencies
    satisfied, sides non-empty, and not yet assigned or completed.

    Iterates the full state, so multi-event tournaments naturally
    pick up ready PlayUnits from every event. Dead branches and
    cascading walkovers are handled inside ``record_result`` /
    ``auto_walkover_byes``, so this function only has to filter.
    """
    ready: list[PlayUnitId] = []
    for pu_id, pu in state.play_units.items():
        if pu_id in state.results:
            continue
        if pu_id in state.assignments:
            continue
        if not pu.side_a or not pu.side_b:
            continue  # awaiting advancement / walked over to BYE
        if any(dep not in state.results for dep in pu.dependencies):
            continue
        ready.append(pu_id)
    return ready


def is_assignment_locked(
    assignment: TournamentAssignment,
    results: Dict[PlayUnitId, Result],
    current_slot: int,
) -> bool:
    """An assignment is locked — immovable by a re-pin re-solve — when it
    is played (has a result), started (``actual_start_slot`` set), or
    past (ends at or before ``current_slot``)."""
    if assignment.play_unit_id in results:
        return True
    if assignment.actual_start_slot is not None:
        return True
    if assignment.slot_id + assignment.duration_slots <= current_slot:
        return True
    return False


def is_event_started(
    session: Session,
    tournament_id: uuid.UUID,
    event_id: str,
) -> bool:
    """True iff any bracket_results row exists for this (tournament, event)."""
    row = (
        session.query(BracketResult)
        .filter(
            BracketResult.tournament_id == tournament_id,
            BracketResult.bracket_event_id == event_id,
        )
        .first()
    )
    return row is not None
