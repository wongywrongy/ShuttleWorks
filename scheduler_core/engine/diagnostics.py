"""Infeasibility diagnostics for CP-SAT model."""
from collections import Counter
from typing import Dict, List

from scheduler_core.domain.models import Match, Player, ScheduleConfig


def get_player_ids(match: Match) -> List[str]:
    """All player IDs in a match, de-duplicated, in **stable sorted order**.

    The sort is load-bearing, not tidiness. This used to return a bare
    ``set``, and ``CPSATScheduler._player_matches`` builds its dict by
    iterating it — so the dict's *key insertion order* was inherited from
    string hash order, which Python randomises per interpreter unless
    ``PYTHONHASHSEED`` is pinned. The three constraint plugins that walk
    that dict (``player_no_overlap``, ``rest``, ``game_proximity``) then
    emitted their constraints in a different order on every run, so
    CP-SAT broke search-tree ties differently and returned a different —
    equally optimal — schedule.

    Measured before the fix on a 10-match doubles instance: four
    ``PYTHONHASHSEED`` values produced four distinct CP-SAT model
    fingerprints. After it, all four agree.

    Everything else feeding the model build was already ordered
    (``add_matches``/``add_players`` sort by id; ``bridge._build_players``
    sorts its participant set). This was the last unordered construct,
    which is why ``PYTHONHASHSEED=0`` could mask it so completely.

    Returns a ``list`` rather than a ``set``: the ordering *is* the
    contract now, and a set would silently discard it again — every call
    site is a ``for`` loop, so nothing else would fail.

    Negative control (2026-08-04, CODE_HEALTH rule 3b): dropping the
    ``sorted()`` fails 3 of the 4 tests in
    ``tests/unit/test_engine_build_order.py``, with the fingerprint test
    reporting 4 distinct hashes across 4 hash seeds. Verified, not
    assumed.
    """
    return sorted(set(match.side_a) | set(match.side_b))


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
