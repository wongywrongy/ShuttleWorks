"""Infeasibility diagnostics for CP-SAT model."""
from collections import Counter
from typing import Dict, List

from scheduler_core.domain.models import Match, Player, ScheduleConfig


def get_player_ids(match: Match) -> set[str]:
    """Get all player IDs in a match."""
    return set(match.side_a) | set(match.side_b)


def diagnose_infeasibility(
    matches: Dict[str, Match],
    players: Dict[str, Player],
    config: ScheduleConfig,
    existing_reasons: List[str],
) -> List[str]:
    """Attempt to diagnose why the model is infeasible."""
    reasons = list(existing_reasons)
    
    if not matches:
        reasons.append("No matches to schedule")
    
    total_match_slots = sum(m.duration_slots for m in matches.values())
    total_capacity = config.total_slots * config.court_count
    if total_match_slots > total_capacity:
        reasons.append(
            f"Not enough capacity: {total_match_slots} match-slots needed, "
            f"but only {total_capacity} available"
        )
    
    player_match_count = Counter()
    for match in matches.values():
        for pid in get_player_ids(match):
            player_match_count[pid] += match.duration_slots
    
    for player_id, slots_needed in player_match_count.items():
        player = players.get(player_id)
        if player and player.availability:
            available_slots = sum(end - start for start, end in player.availability)
            if slots_needed > available_slots:
                reasons.append(
                    f"Player {player.name} needs {slots_needed} slots "
                    f"but only available for {available_slots}"
                )

    # No generic placeholder when we couldn't pinpoint a cause —
    # the frontend renders an actionable empty state in that case
    # ("try adding courts, reducing rest, etc."), which is more
    # useful than telling the operator "constraints may be too
    # restrictive".
    return reasons
