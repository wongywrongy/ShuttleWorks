"""Extract assignments and soft-violation reports from a solved interval model."""
from typing import Dict, List, Set, Tuple

from ortools.sat.python import cp_model

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    SoftViolation,
    SolverStatus,
)
from scheduler_core.engine.variables import SchedulingVars


def extract_solution(
    *,
    solver: cp_model.CpSolver,
    matches: Dict[str, Match],
    players: Dict[str, Player],
    previous_assignments: Dict[str, PreviousAssignment],
    locked_matches: Set[str],
    svars: SchedulingVars,
    rest_slack: Dict[Tuple[str, str, str], cp_model.IntVar],
    proximity_min_slack: Dict[Tuple[str, str, str], cp_model.IntVar],
    proximity_max_slack: Dict[Tuple[str, str, str], cp_model.IntVar],
    config: ScheduleConfig,
    status: SolverStatus,
    runtime_ms: float,
) -> Tuple[List[Assignment], List[SoftViolation], int]:
    """Read assignments directly from interval variables; report soft violations."""
    assignments: List[Assignment] = []
    soft_violations: List[SoftViolation] = []
    moved_count = 0

    for match_id, match in matches.items():
        slot = solver.Value(svars.start[match_id])
        court = solver.Value(svars.court[match_id])

        prev = previous_assignments.get(match_id)
        moved = False
        prev_slot = None
        prev_court = None
        if prev and match_id not in locked_matches:
            if prev.slot_id != slot or prev.court_id != court:
                moved = True
                moved_count += 1
                prev_slot = prev.slot_id
                prev_court = prev.court_id

        assignments.append(
            Assignment(
                match_id=match_id,
                slot_id=slot,
                court_id=court,
                duration_slots=match.duration_slots,
                moved=moved,
                previous_slot_id=prev_slot,
                previous_court_id=prev_court,
            )
        )

    if config.soft_rest_enabled:
        for (player_id, _m_i, _m_j), slack in rest_slack.items():
            slack_val = solver.Value(slack)
            if slack_val > 0:
                player = players.get(player_id)
                player_name = player.name if player else player_id
                soft_violations.append(
                    SoftViolation(
                        type="rest",
                        player_id=player_id,
                        description=f"Player {player_name} has {slack_val} slots less rest than required",
                        penalty_incurred=slack_val
                        * (player.rest_penalty if player else config.rest_slack_penalty),
                    )
                )

    if config.enable_game_proximity:
        penalty = config.game_proximity_penalty

        for (player_id, _m_i, _m_j), slack in proximity_min_slack.items():
            slack_val = solver.Value(slack)
            if slack_val > 0:
                player = players.get(player_id)
                player_name = player.name if player else player_id
                soft_violations.append(
                    SoftViolation(
                        type="game_proximity_min",
                        player_id=player_id,
                        description=f"Player {player_name}: games {slack_val} slots closer than minimum spacing",
                        penalty_incurred=slack_val * penalty,
                    )
                )

        for (player_id, _m_i, _m_j), slack in proximity_max_slack.items():
            slack_val = solver.Value(slack)
            if slack_val > 0:
                player = players.get(player_id)
                player_name = player.name if player else player_id
                soft_violations.append(
                    SoftViolation(
                        type="game_proximity_max",
                        player_id=player_id,
                        description=f"Player {player_name}: games {slack_val} slots farther than maximum spacing",
                        penalty_incurred=slack_val * penalty,
                    )
                )

    return assignments, soft_violations, moved_count
