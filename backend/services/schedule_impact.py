"""Pure-function diff between a committed and a proposed schedule.

Used by the proposal pipeline (`POST /schedule/proposals`) to attach a
human-reviewable impact summary to every proposal *before* the operator
commits. No solver invocation; the inputs already carry everything we
need (objective score, soft violations, assignments).

Inputs are the existing `ScheduleDTO` / `MatchDTO` / `PlayerDTO` /
`RosterGroupDTO` shapes from `app.schemas` — no domain conversions.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Dict, Iterable, List, Optional, Tuple

from app.schemas import (
    Impact,
    MatchDTO,
    MatchMove,
    MetricDelta,
    PlayerDTO,
    PlayerImpact,
    RosterGroupDTO,
    ScheduleAssignment,
    ScheduleDTO,
    SchoolImpact,
    SoftViolation,
)


# Soft-violation type strings emitted by extraction.py — kept here so a
# new violation kind in the engine doesn't silently drop out of the diff.
_REST_VIOLATION_TYPES = {"rest"}
_PROXIMITY_VIOLATION_TYPES = {"game_proximity_min", "game_proximity_max"}


def _index_assignments(
    schedule: Optional[ScheduleDTO],
) -> Dict[str, ScheduleAssignment]:
    if schedule is None:
        return {}
    return {a.matchId: a for a in schedule.assignments}


def _count_violations(
    violations: Iterable[SoftViolation],
    types: set[str],
) -> int:
    return sum(1 for v in violations if v.type in types)


def _sum_penalty(violations: Iterable[SoftViolation]) -> float:
    return float(sum(v.penaltyIncurred for v in violations))


def _all_player_ids(match: MatchDTO) -> List[str]:
    out = list(match.sideA) + list(match.sideB)
    if match.sideC:
        out.extend(match.sideC)
    return out


def _all_group_ids_for_match(
    match: MatchDTO,
    players_by_id: Dict[str, PlayerDTO],
) -> List[str]:
    seen: list[str] = []
    seen_set: set[str] = set()
    for pid in _all_player_ids(match):
        player = players_by_id.get(pid)
        if player and player.groupId and player.groupId not in seen_set:
            seen.append(player.groupId)
            seen_set.add(player.groupId)
    return seen


def compute_impact(
    committed: Optional[ScheduleDTO],
    proposed: Optional[ScheduleDTO],
    matches: List[MatchDTO],
    players: List[PlayerDTO],
    groups: Optional[List[RosterGroupDTO]] = None,
) -> Impact:
    """Return a pre-commit summary of how `proposed` differs from `committed`.

    A `None` committed schedule is treated as the empty-schedule baseline
    (every assignment in `proposed` is a fresh placement, none move). A
    `None` proposed schedule is the inverse — everything previously
    scheduled becomes "unscheduled" in the diff.

    The function is deterministic and pure: no I/O, no solver invocation,
    no global state.
    """
    matches_by_id: Dict[str, MatchDTO] = {m.id: m for m in matches}
    players_by_id: Dict[str, PlayerDTO] = {p.id: p for p in players}
    group_names: Dict[str, str] = {}
    if groups:
        group_names = {g.id: g.name for g in groups}

    committed_idx = _index_assignments(committed)
    proposed_idx = _index_assignments(proposed)
    all_match_ids = set(committed_idx) | set(proposed_idx)

    moved_matches: List[MatchMove] = []
    player_match_counts: Dict[str, int] = defaultdict(int)
    player_earliest_delta: Dict[str, int] = {}
    school_match_counts: Dict[str, int] = defaultdict(int)

    for match_id in all_match_ids:
        before = committed_idx.get(match_id)
        after = proposed_idx.get(match_id)
        if before is None and after is None:
            continue  # unreachable; kept defensively
        if (
            before is not None
            and after is not None
            and before.slotId == after.slotId
            and before.courtId == after.courtId
        ):
            continue  # match unchanged

        match = matches_by_id.get(match_id)
        moved_matches.append(
            MatchMove(
                matchId=match_id,
                fromSlotId=before.slotId if before else None,
                toSlotId=after.slotId if after else None,
                fromCourtId=before.courtId if before else None,
                toCourtId=after.courtId if after else None,
                matchNumber=match.matchNumber if match else None,
                eventRank=match.eventRank if match else None,
            )
        )

        # Accumulate player + school touch counts using whichever side
        # of the move has the match metadata. Edge case: a synthetic
        # match referenced in the schedule but missing from `matches` is
        # silently skipped — schedules without match metadata can't have
        # a meaningful impact breakdown.
        if match is None:
            continue
        slot_delta = 0
        if before is not None and after is not None:
            slot_delta = after.slotId - before.slotId
        elif before is None and after is not None:
            slot_delta = after.slotId  # from "unscheduled"
        elif before is not None and after is None:
            slot_delta = -before.slotId  # to "unscheduled"

        for player_id in _all_player_ids(match):
            player_match_counts[player_id] += 1
            existing_delta = player_earliest_delta.get(player_id)
            if existing_delta is None or abs(slot_delta) < abs(existing_delta):
                player_earliest_delta[player_id] = slot_delta
        for group_id in _all_group_ids_for_match(match, players_by_id):
            school_match_counts[group_id] += 1

    affected_players: List[PlayerImpact] = []
    for pid, count in sorted(
        player_match_counts.items(), key=lambda kv: (-kv[1], kv[0])
    ):
        player = players_by_id.get(pid)
        affected_players.append(
            PlayerImpact(
                playerId=pid,
                playerName=player.name if player else None,
                matchCount=count,
                earliestSlotDelta=player_earliest_delta.get(pid, 0),
            )
        )

    affected_schools: List[SchoolImpact] = []
    for gid, count in sorted(
        school_match_counts.items(), key=lambda kv: (-kv[1], kv[0])
    ):
        affected_schools.append(
            SchoolImpact(
                groupId=gid,
                groupName=group_names.get(gid),
                matchCount=count,
            )
        )

    metric_delta = _compute_metric_delta(committed, proposed)
    infeasibility_warnings = _collect_infeasibility_warnings(committed, proposed)

    return Impact(
        movedMatches=sorted(moved_matches, key=_move_sort_key),
        affectedPlayers=affected_players,
        affectedSchools=affected_schools,
        metricDelta=metric_delta,
        infeasibilityWarnings=infeasibility_warnings,
    )


def _move_sort_key(move: MatchMove) -> Tuple[int, int, str]:
    """Order moves by target slot, falling back to origin slot for
    removals. Both-None is unreachable (matches are always at one
    end), but we push the sentinel to the *bottom* of the list so a
    surprise null doesn't masquerade as the earliest move.
    """
    if move.toSlotId is not None:
        primary = move.toSlotId
    elif move.fromSlotId is not None:
        primary = move.fromSlotId
    else:
        primary = 1_000_000  # sort to end if both ends are null
    return (primary, move.toCourtId or 0, move.matchId)


def _compute_metric_delta(
    committed: Optional[ScheduleDTO],
    proposed: Optional[ScheduleDTO],
) -> MetricDelta:
    committed_violations = committed.softViolations if committed else []
    proposed_violations = proposed.softViolations if proposed else []

    objective_delta: Optional[float] = None
    if committed is not None and proposed is not None:
        if (
            committed.objectiveScore is not None
            and proposed.objectiveScore is not None
        ):
            objective_delta = proposed.objectiveScore - committed.objectiveScore

    rest_delta = _count_violations(
        proposed_violations, _REST_VIOLATION_TYPES
    ) - _count_violations(committed_violations, _REST_VIOLATION_TYPES)
    proximity_delta = _count_violations(
        proposed_violations, _PROXIMITY_VIOLATION_TYPES
    ) - _count_violations(committed_violations, _PROXIMITY_VIOLATION_TYPES)

    return MetricDelta(
        objectiveDelta=objective_delta,
        softViolationCountDelta=len(proposed_violations) - len(committed_violations),
        restViolationsDelta=rest_delta,
        proximityViolationsDelta=proximity_delta,
        totalPenaltyDelta=_sum_penalty(proposed_violations) - _sum_penalty(committed_violations),
        unscheduledMatchesDelta=(
            (len(proposed.unscheduledMatches) if proposed else 0)
            - (len(committed.unscheduledMatches) if committed else 0)
        ),
    )


def _collect_infeasibility_warnings(
    committed: Optional[ScheduleDTO],
    proposed: Optional[ScheduleDTO],
) -> List[str]:
    if proposed is None:
        return []
    warnings: List[str] = []
    # Propagate any reasons the solver itself flagged.
    warnings.extend(proposed.infeasibleReasons or [])
    # Newly unscheduled matches are a strong signal even if the solver
    # returned FEASIBLE — they were placeable before, can't be now.
    committed_unscheduled = set(committed.unscheduledMatches if committed else [])
    new_unscheduled = [
        m for m in proposed.unscheduledMatches if m not in committed_unscheduled
    ]
    if new_unscheduled:
        warnings.append(
            f"{len(new_unscheduled)} match(es) cannot be placed in the proposed schedule"
        )
    # Net new rest violations are a soft signal but worth surfacing
    # explicitly so the operator sees them at-a-glance.
    delta = _compute_metric_delta(committed, proposed)
    if delta.restViolationsDelta > 0:
        warnings.append(
            f"{delta.restViolationsDelta} new player rest violation(s) introduced"
        )
    return warnings
