"""Standalone schedule validator.

Confirms that a set of ``Assignment`` objects satisfies every hard constraint
encoded in the CP-SAT model (court capacity, player non-overlap, availability,
locks, pins, freeze horizon). Used as a runtime safety net after
``extract_solution`` to catch any regression in the solver model and as a fast
feasibility check for the ``/schedule/validate`` API endpoint.

Pure Python — no dependency on OR-Tools. Target latency: <50ms for tournaments
up to 40 matches.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
)
from scheduler_core.engine.diagnostics import get_player_ids


@dataclass
class Conflict:
    """One reason an assignment set fails hard constraints."""

    type: str
    description: str
    match_id: Optional[str] = None
    other_match_id: Optional[str] = None
    player_id: Optional[str] = None
    court_id: Optional[int] = None
    slot_id: Optional[int] = None


class ScheduleValidationError(AssertionError):
    """Raised when a schedule produced by the solver violates a hard constraint."""

    def __init__(self, conflicts: Sequence[Conflict]) -> None:
        self.conflicts = list(conflicts)
        preview = "; ".join(c.description for c in self.conflicts[:3])
        more = f" (+{len(self.conflicts) - 3} more)" if len(self.conflicts) > 3 else ""
        super().__init__(f"schedule violates hard constraints: {preview}{more}")


def verify_schedule(
    *,
    config: ScheduleConfig,
    players: Dict[str, Player],
    matches: Dict[str, Match],
    assignments: Iterable[Assignment],
    previous_assignments: Optional[Dict[str, PreviousAssignment]] = None,
) -> None:
    """Assert that ``assignments`` satisfies every hard constraint; raise otherwise."""
    conflicts = find_conflicts(
        config=config,
        players=players,
        matches=matches,
        assignments=list(assignments),
        previous_assignments=previous_assignments or {},
    )
    if conflicts:
        raise ScheduleValidationError(conflicts)


def find_conflicts(
    *,
    config: ScheduleConfig,
    players: Dict[str, Player],
    matches: Dict[str, Match],
    assignments: List[Assignment],
    previous_assignments: Optional[Dict[str, PreviousAssignment]] = None,
) -> List[Conflict]:
    """Return the list of hard-constraint conflicts for the given assignments (empty = feasible)."""
    previous_assignments = previous_assignments or {}
    conflicts: List[Conflict] = []

    T = config.total_slots
    C = config.court_count
    assigned_match_ids = {a.match_id for a in assignments}

    # 1. Missing matches.
    for match_id in matches:
        if match_id not in assigned_match_ids:
            match = matches[match_id]
            conflicts.append(
                Conflict(
                    type="unscheduled",
                    match_id=match_id,
                    description=f"Match {match.event_code} is not assigned",
                )
            )

    # 2. Out of day / invalid court.
    for a in assignments:
        match = matches.get(a.match_id)
        if not match:
            conflicts.append(
                Conflict(
                    type="unknown_match",
                    match_id=a.match_id,
                    description=f"Assignment references unknown match {a.match_id}",
                )
            )
            continue
        d = match.duration_slots
        if a.slot_id < 0 or a.slot_id + d > T:
            conflicts.append(
                Conflict(
                    type="out_of_day",
                    match_id=a.match_id,
                    slot_id=a.slot_id,
                    description=(
                        f"Match {match.event_code} at slot {a.slot_id} with duration "
                        f"{d} does not fit in {T} total slots"
                    ),
                )
            )
        if a.court_id < 1 or a.court_id > C:
            conflicts.append(
                Conflict(
                    type="invalid_court",
                    match_id=a.match_id,
                    court_id=a.court_id,
                    description=f"Match {match.event_code} on court {a.court_id} — valid range 1..{C}",
                )
            )

    # 3. Court capacity (≤1 match per court per slot).
    occupancy: Dict[Tuple[int, int], str] = {}
    for a in assignments:
        match = matches.get(a.match_id)
        if not match:
            continue
        for t in range(a.slot_id, a.slot_id + match.duration_slots):
            key = (t, a.court_id)
            if key in occupancy:
                conflicts.append(
                    Conflict(
                        type="court_conflict",
                        match_id=a.match_id,
                        other_match_id=occupancy[key],
                        court_id=a.court_id,
                        slot_id=t,
                        description=(
                            f"Court {a.court_id} slot {t}: {a.match_id} conflicts with {occupancy[key]}"
                        ),
                    )
                )
            else:
                occupancy[key] = a.match_id

    # 4. Player non-overlap (hard when not allow_player_overlap).
    if not config.allow_player_overlap:
        player_occupancy: Dict[Tuple[str, int], str] = {}
        for a in assignments:
            match = matches.get(a.match_id)
            if not match:
                continue
            for pid in get_player_ids(match):
                for t in range(a.slot_id, a.slot_id + match.duration_slots):
                    key = (pid, t)
                    if key in player_occupancy:
                        conflicts.append(
                            Conflict(
                                type="player_overlap",
                                match_id=a.match_id,
                                other_match_id=player_occupancy[key],
                                player_id=pid,
                                slot_id=t,
                                description=(
                                    f"Player {pid} double-booked at slot {t}: "
                                    f"{a.match_id} and {player_occupancy[key]}"
                                ),
                            )
                        )
                    else:
                        player_occupancy[key] = a.match_id

    # 5. Availability windows.
    for a in assignments:
        match = matches.get(a.match_id)
        if not match:
            continue
        for pid in get_player_ids(match):
            player = players.get(pid)
            if not player or not player.availability:
                continue
            if not _covers_range(player.availability, a.slot_id, a.slot_id + match.duration_slots):
                conflicts.append(
                    Conflict(
                        type="availability",
                        match_id=a.match_id,
                        player_id=pid,
                        slot_id=a.slot_id,
                        description=(
                            f"Player {player.name} not available for match {match.event_code} "
                            f"at slot {a.slot_id}"
                        ),
                    )
                )

    # 5b. Break windows — no match may occupy any slot inside a break.
    for a in assignments:
        match = matches.get(a.match_id)
        if not match:
            continue
        d = match.duration_slots
        for bs, be in config.break_slots:
            if a.slot_id < be and a.slot_id + d > bs:
                conflicts.append(
                    Conflict(
                        type="break",
                        match_id=a.match_id,
                        slot_id=a.slot_id,
                        description=(
                            f"Match {match.event_code} at slot {a.slot_id} "
                            f"(duration {d}) overlaps break [{bs},{be})"
                        ),
                    )
                )

    # 5c. Court closures — half-open per-court windows that mirror the
    # solver's reified blocker constraints. Includes legacy all-day
    # closures (``closed_court_ids``) which we treat as full-day windows.
    closure_windows: List[Tuple[int, int, int]] = list(
        config.closed_court_windows or []
    )
    for cid in (config.closed_court_ids or []):
        if 1 <= cid <= C and T > 0:
            closure_windows.append((cid, 0, T))
    for a in assignments:
        match = matches.get(a.match_id)
        if not match:
            continue
        d = match.duration_slots
        for cid, fs, ts in closure_windows:
            if a.court_id != cid:
                continue
            if a.slot_id < ts and a.slot_id + d > fs:
                conflicts.append(
                    Conflict(
                        type="court_closed",
                        match_id=a.match_id,
                        court_id=cid,
                        slot_id=a.slot_id,
                        description=(
                            f"Match {match.event_code} at slot {a.slot_id} "
                            f"(duration {d}) overlaps closure on court {cid} "
                            f"[{fs},{ts})"
                        ),
                    )
                )

    # 6. Rest (hard only — soft rest is permitted to produce positive slack).
    by_player: Dict[str, List[Tuple[int, int, str]]] = defaultdict(list)
    for a in assignments:
        match = matches.get(a.match_id)
        if not match:
            continue
        for pid in get_player_ids(match):
            by_player[pid].append((a.slot_id, a.slot_id + match.duration_slots, a.match_id))
    for pid, segments in by_player.items():
        player = players.get(pid)
        rest = player.rest_slots if player else config.default_rest_slots
        is_hard = player.rest_is_hard if player else True
        if not is_hard or config.soft_rest_enabled and (not player or not player.rest_is_hard):
            continue
        segments.sort()
        for (s1, e1, mid1), (s2, _e2, mid2) in zip(segments, segments[1:]):
            if s2 < e1 + rest:
                conflicts.append(
                    Conflict(
                        type="rest",
                        match_id=mid2,
                        other_match_id=mid1,
                        player_id=pid,
                        slot_id=s2,
                        description=(
                            f"Player {pid}: {e1 - s1}-slot match ends at {e1}, next starts at {s2} "
                            f"(needs {rest} rest slots)"
                        ),
                    )
                )

    # 7. Locks, pins, freeze horizon.
    freeze_cutoff = config.current_slot + config.freeze_horizon_slots
    by_match = {a.match_id: a for a in assignments}
    for match_id, prev in previous_assignments.items():
        assn = by_match.get(match_id)
        if assn is None:
            continue
        if prev.locked:
            if assn.slot_id != prev.slot_id or assn.court_id != prev.court_id:
                conflicts.append(
                    Conflict(
                        type="lock_violated",
                        match_id=match_id,
                        description=(
                            f"Locked match moved: expected ({prev.slot_id}, {prev.court_id}) "
                            f"got ({assn.slot_id}, {assn.court_id})"
                        ),
                    )
                )
            continue
        if prev.pinned_slot_id is not None and assn.slot_id != prev.pinned_slot_id:
            conflicts.append(
                Conflict(
                    type="pin_violated",
                    match_id=match_id,
                    slot_id=assn.slot_id,
                    description=f"Pin violated: expected slot {prev.pinned_slot_id}, got {assn.slot_id}",
                )
            )
        if prev.pinned_court_id is not None and assn.court_id != prev.pinned_court_id:
            conflicts.append(
                Conflict(
                    type="pin_violated",
                    match_id=match_id,
                    court_id=assn.court_id,
                    description=f"Pin violated: expected court {prev.pinned_court_id}, got {assn.court_id}",
                )
            )
        if prev.slot_id < freeze_cutoff and (
            assn.slot_id != prev.slot_id or assn.court_id != prev.court_id
        ):
            conflicts.append(
                Conflict(
                    type="freeze_violated",
                    match_id=match_id,
                    description=(
                        f"Freeze horizon violated (cutoff slot {freeze_cutoff}): "
                        f"expected ({prev.slot_id}, {prev.court_id}), "
                        f"got ({assn.slot_id}, {assn.court_id})"
                    ),
                )
            )

    return conflicts


def _covers_range(windows: List[Tuple[int, int]], start: int, end: int) -> bool:
    """True when some ``(w_start, w_end)`` in ``windows`` covers ``[start, end)`` fully."""
    for w_start, w_end in windows:
        if w_start <= start and end <= w_end:
            return True
    return False
