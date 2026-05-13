"""Fast feasibility check for drag-to-reschedule.

Evaluates a single ``ProposedMoveDTO`` against a current schedule without
invoking CP-SAT. Delegates the actual constraint checking to
``scheduler_core.engine.validation.find_conflicts`` so the API and the solver
agree on what "feasible" means.

Target latency: <50 ms for tournaments up to 40 matches.
"""
from __future__ import annotations

from typing import List

from app.schemas import (
    MatchDTO,
    PlayerDTO,
    PreviousAssignmentDTO,
    ProposedMoveDTO,
    ScheduleAssignment,
    TournamentConfig,
    ValidationConflict,
    ValidationResponseDTO,
)

from adapters.badminton import prepare_solver_input
from scheduler_core.domain.models import Assignment as CoreAssignment
from scheduler_core.engine.validation import Conflict, find_conflicts


def validate_move(
    *,
    config: TournamentConfig,
    players: List[PlayerDTO],
    matches: List[MatchDTO],
    assignments: List[ScheduleAssignment],
    proposed_move: ProposedMoveDTO,
    previous_assignments: List[PreviousAssignmentDTO] | None = None,
) -> ValidationResponseDTO:
    """Return ``ValidationResponseDTO`` for ``proposed_move`` applied to ``assignments``.

    The current assignment for ``proposed_move.matchId`` (if any) is replaced;
    if the match wasn't scheduled yet, the proposed position is added.
    """
    # Reuse the same DTO → domain conversion the solver uses, so the
    # validator and the solver agree on every field (rest slots,
    # availability windows, breaks, closed courts).
    core_config, core_players_list, core_matches_list, core_previous_list = prepare_solver_input(
        config,
        players,
        matches,
        [pa.model_dump() for pa in (previous_assignments or [])],
    )
    core_players = {p.id: p for p in core_players_list}
    core_matches = {m.id: m for m in core_matches_list}
    core_previous = {pa.match_id: pa for pa in core_previous_list}

    # Apply the proposed move on top of the current assignments.
    target_match = core_matches.get(proposed_move.matchId)
    duration = target_match.duration_slots if target_match else 1

    replaced = False
    core_assignments: List[CoreAssignment] = []
    for a in assignments:
        if a.matchId == proposed_move.matchId:
            core_assignments.append(
                CoreAssignment(
                    match_id=a.matchId,
                    slot_id=proposed_move.slotId,
                    court_id=proposed_move.courtId,
                    duration_slots=duration,
                )
            )
            replaced = True
        else:
            core_assignments.append(
                CoreAssignment(
                    match_id=a.matchId,
                    slot_id=a.slotId,
                    court_id=a.courtId,
                    duration_slots=a.durationSlots,
                )
            )
    if not replaced:
        core_assignments.append(
            CoreAssignment(
                match_id=proposed_move.matchId,
                slot_id=proposed_move.slotId,
                court_id=proposed_move.courtId,
                duration_slots=duration,
            )
        )

    # ``find_conflicts`` checks every hard constraint the solver
    # enforces — court capacity, player overlap, availability, breaks,
    # rest, locks, AND court closures (added at validation.py:5c).
    conflicts: List[Conflict] = find_conflicts(
        config=core_config,
        players=core_players,
        matches=core_matches,
        assignments=core_assignments,
        previous_assignments=core_previous,
    )

    return ValidationResponseDTO(
        feasible=not conflicts,
        conflicts=[
            ValidationConflict(
                type=c.type,
                description=c.description,
                matchId=c.match_id,
                otherMatchId=c.other_match_id,
                playerId=c.player_id,
                courtId=c.court_id,
                slotId=c.slot_id,
            )
            for c in conflicts
        ],
    )
