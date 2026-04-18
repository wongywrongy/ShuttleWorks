"""Fast feasibility check for drag-to-reschedule.

Evaluates a single ``ProposedMoveDTO`` against a current schedule without
invoking CP-SAT. Delegates the actual constraint checking to
``scheduler_core.engine.validation.find_conflicts`` so the API and the solver
agree on what "feasible" means.

Target latency: <50 ms for tournaments up to 40 matches.
"""
from __future__ import annotations

import os
import sys
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

# scheduler_core imports mirror the pattern used in backend/api/schedule.py.
_backend_dir = os.path.dirname(os.path.dirname(__file__))
_project_root = os.path.dirname(_backend_dir)
_scheduler_core_path = os.path.join(_project_root, "src")
if _scheduler_core_path not in sys.path:
    sys.path.insert(0, _scheduler_core_path)

from scheduler_core.domain.models import Assignment as CoreAssignment  # noqa: E402
from scheduler_core.engine.validation import Conflict, find_conflicts  # noqa: E402


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
    # Lazy import to avoid circular dependency with schedule.py
    from api.schedule import (  # noqa: WPS433
        _convert_matches,
        _convert_players,
        _convert_previous_assignments,
        _convert_to_schedule_config,
    )

    core_config = _convert_to_schedule_config(config)
    core_players = {p.id: p for p in _convert_players(players, config)}
    core_matches = {m.id: m for m in _convert_matches(matches)}
    core_previous = {
        pa.match_id: pa
        for pa in _convert_previous_assignments(
            [pa.model_dump() for pa in (previous_assignments or [])]
        )
    }

    # Apply the proposed move.
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
