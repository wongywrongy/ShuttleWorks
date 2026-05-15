"""Pure-Python bracket feasibility check for drag-to-reschedule.

Splices a single proposed ``(slot_id, court_id)`` move for one
PlayUnit into the bracket session's current assignment set, then runs
the subset of hard constraints that applies to a bracket:

  - court/slot overlap, player double-booking, player rest,
    availability, breaks, court closures — via
    ``scheduler_core.engine.validation.find_conflicts``;
  - draw-dependency ordering — a new forward-only check: the proposed
    slot must be >= every feeder match's end-slot.

No CP-SAT invocation — fast enough to be debounced on drag-move by
the interactive Gantt UI (sub-project #3). Checked against the
**full current assignment set** (meet-faithful conservatism): a
position clear of every current match is necessarily clear of the
locked subset, so ``feasible: true`` reliably means ``/pin`` succeeds.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from scheduler_core.domain.models import (
    Assignment as CoreAssignment,
    Match,
    ScheduleConfig,
)
from scheduler_core.domain.tournament import TournamentState
from scheduler_core.engine.validation import Conflict, find_conflicts

from .adapter import build_players, expand_side


@dataclass
class BracketConflict:
    """One reason a proposed bracket move fails a hard constraint.

    Mirrors ``scheduler_core.engine.validation.Conflict`` but names the
    match field ``play_unit_id`` to match bracket-domain terminology.
    """

    type: str
    description: str
    play_unit_id: Optional[str] = None
    other_play_unit_id: Optional[str] = None
    player_id: Optional[str] = None
    court_id: Optional[int] = None
    slot_id: Optional[int] = None


def validate_bracket_move(
    state: TournamentState,
    config: ScheduleConfig,
    *,
    play_unit_id: str,
    slot_id: int,
    court_id: int,
) -> List[BracketConflict]:
    """Return the hard-constraint conflicts for moving ``play_unit_id``
    to ``(slot_id, court_id)`` against the current assignment set.

    An empty list means the move is feasible. Raises ``KeyError`` if
    ``play_unit_id`` has no PlayUnit in ``state``.
    """
    pu = state.play_units.get(play_unit_id)
    if pu is None:
        raise KeyError(f"unknown play unit {play_unit_id!r}")

    duration = pu.expected_duration_slots or 1

    # Build the Match + Player views for every *currently assigned*
    # PlayUnit — find_conflicts checks the full assignment set.
    matches: dict[str, Match] = {}
    referenced_player_ids: set[str] = set()
    for assigned_id in state.assignments:
        assigned_pu = state.play_units.get(assigned_id)
        if assigned_pu is None:
            continue
        if not assigned_pu.side_a or not assigned_pu.side_b:
            continue
        side_a = expand_side(assigned_pu.side_a, state.participants)
        side_b = expand_side(assigned_pu.side_b, state.participants)
        matches[assigned_id] = Match(
            id=assigned_id,
            event_code=assigned_pu.event_id,
            duration_slots=assigned_pu.expected_duration_slots or 1,
            side_a=side_a,
            side_b=side_b,
        )
        referenced_player_ids.update(side_a)
        referenced_player_ids.update(side_b)

    # Also include the moved play_unit if it's not already in state.assignments
    # (i.e., being placed for the first time).
    if play_unit_id not in matches and pu.side_a and pu.side_b:
        side_a = expand_side(pu.side_a, state.participants)
        side_b = expand_side(pu.side_b, state.participants)
        matches[play_unit_id] = Match(
            id=play_unit_id,
            event_code=pu.event_id,
            duration_slots=duration,
            side_a=side_a,
            side_b=side_b,
        )
        referenced_player_ids.update(side_a)
        referenced_player_ids.update(side_b)

    players_list = build_players(
        referenced_player_ids,
        state.participants,
        availability_window=(config.current_slot, config.total_slots),
    )
    players = {p.id: p for p in players_list}

    # Splice the proposed move into the assignment set, replacing the
    # PlayUnit's existing entry.
    core_assignments: List[CoreAssignment] = []
    for assigned_id, assignment in state.assignments.items():
        if assigned_id == play_unit_id:
            core_assignments.append(
                CoreAssignment(
                    match_id=play_unit_id,
                    slot_id=slot_id,
                    court_id=court_id,
                    duration_slots=duration,
                )
            )
        else:
            core_assignments.append(
                CoreAssignment(
                    match_id=assigned_id,
                    slot_id=assignment.slot_id,
                    court_id=assignment.court_id,
                    duration_slots=assignment.duration_slots,
                )
            )

    # If the play_unit_id was not already in state.assignments, add it now.
    if play_unit_id not in state.assignments:
        core_assignments.append(
            CoreAssignment(
                match_id=play_unit_id,
                slot_id=slot_id,
                court_id=court_id,
                duration_slots=duration,
            )
        )

    raw_conflicts: List[Conflict] = find_conflicts(
        config=config,
        players=players,
        matches=matches,
        assignments=core_assignments,
        previous_assignments={},
    )

    conflicts: List[BracketConflict] = [
        BracketConflict(
            type=c.type,
            description=c.description,
            play_unit_id=c.match_id,
            other_play_unit_id=c.other_match_id,
            player_id=c.player_id,
            court_id=c.court_id,
            slot_id=c.slot_id,
        )
        for c in raw_conflicts
        # ``unscheduled`` fires for PlayUnits not in the assignment set;
        # the bracket only validates the scheduled set, so it is noise.
        if c.type != "unscheduled"
    ]

    # Forward-only draw-dependency ordering: the proposed slot must be
    # >= every feeder's end-slot. A PlayUnit whose feeders are not
    # resolved is not "ready" and so not in state.assignments at all —
    # so the reverse check (dragging earlier than something it feeds)
    # cannot arise and is not checked.
    for feeder_id in pu.dependencies:
        feeder_assignment = state.assignments.get(feeder_id)
        if feeder_assignment is None:
            continue
        feeder_end = (
            feeder_assignment.slot_id + feeder_assignment.duration_slots
        )
        if slot_id < feeder_end:
            conflicts.append(
                BracketConflict(
                    type="dependency_order",
                    description=(
                        f"Play unit {play_unit_id} at slot {slot_id} starts "
                        f"before feeder {feeder_id} ends (slot {feeder_end})"
                    ),
                    play_unit_id=play_unit_id,
                    other_play_unit_id=feeder_id,
                    slot_id=slot_id,
                )
            )

    return conflicts
