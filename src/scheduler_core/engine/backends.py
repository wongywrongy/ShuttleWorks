"""Scheduling backends (engines).

CP-SAT and optional greedy backends. Both consume ScheduleRequest
and return ScheduleResult. No format logic.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Set, Tuple

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleRequest,
    ScheduleResult,
    SolverOptions,
    SolverStatus,
)

from scheduler_core.engine.cpsat_backend import CPSATScheduler


class SchedulingBackend(ABC):
    """Backend that solves a scheduling request."""

    @abstractmethod
    def solve(self, request: ScheduleRequest) -> ScheduleResult:
        """Solve and return ScheduleResult."""
        ...


class CPSATBackend(SchedulingBackend):
    """CP-SAT backend. Uses existing CPSATScheduler."""

    def __init__(
        self,
        solver_options: Optional[SolverOptions] = None,
        candidate_pool_size: int = 0,
    ) -> None:
        self.solver_options = solver_options or SolverOptions()
        self.candidate_pool_size = candidate_pool_size

    def solve(self, request: ScheduleRequest) -> ScheduleResult:
        scheduler = CPSATScheduler(
            config=request.config,
            solver_options=request.solver_options or self.solver_options,
        )
        scheduler.add_players(request.players)
        scheduler.add_matches(request.matches)
        scheduler.set_previous_assignments(request.previous_assignments)
        scheduler.build()
        return scheduler.solve(candidate_pool_size=self.candidate_pool_size)


def _player_ids(m: Match) -> Set[str]:
    return set(m.side_a) | set(m.side_b)


class GreedyBackend(SchedulingBackend):
    """Greedy / local-search backend for ultra-fast reschedules.

    Assigns matches to first feasible (slot, court). Respects court capacity,
    player non-overlap, availability, locks, and freeze horizon.
    """

    def solve(self, request: ScheduleRequest) -> ScheduleResult:
        config = request.config
        T = config.total_slots
        C = config.court_count
        current = config.current_slot
        freeze = config.freeze_horizon_slots
        freeze_until = current + freeze

        matches_by_id = {m.id: m for m in request.matches}
        players_by_id = {p.id: p for p in request.players}
        prev_by_match: Dict[str, PreviousAssignment] = {
            pa.match_id: pa for pa in request.previous_assignments
        }
        locked: Set[str] = {
            pa.match_id for pa in request.previous_assignments if pa.locked
        }
        for pa in request.previous_assignments:
            if pa.slot_id < freeze_until and not pa.locked:
                locked.add(pa.match_id)

        slot_court_to_match: Dict[Tuple[int, int], str] = {}
        match_to_assignment: Dict[str, Assignment] = {}
        moved_count = 0

        def occupies(slot: int, court: int, duration: int) -> List[Tuple[int, int]]:
            return [(slot + i, court) for i in range(duration)]

        def player_busy(pid: str, slot: int, duration: int) -> bool:
            for t in range(slot, slot + duration):
                for c in range(1, C + 1):
                    mid = slot_court_to_match.get((t, c))
                    if not mid:
                        continue
                    m = matches_by_id.get(mid)
                    if m and pid in _player_ids(m):
                        return True
            return False

        def available(pid: str, slot: int, duration: int) -> bool:
            p = players_by_id.get(pid)
            if not p or not p.availability:
                return True
            for start, end in p.availability:
                if all(start <= t < end for t in range(slot, slot + duration)):
                    return True
            return False

        def feasible(m: Match, slot: int, court: int) -> bool:
            d = m.duration_slots
            if slot + d > T:
                return False
            for (t, c) in occupies(slot, court, d):
                if (t, c) in slot_court_to_match:
                    return False
            for pid in _player_ids(m):
                if player_busy(pid, slot, d):
                    return False
                if not available(pid, slot, d):
                    return False
            return True

        order = [m.id for m in request.matches]
        for match_id in order:
            m = matches_by_id.get(match_id)
            if not m:
                continue
            prev = prev_by_match.get(match_id)
            if match_id in locked and prev:
                t_star, c_star = prev.slot_id, prev.court_id
                if t_star + m.duration_slots <= T:
                    a = Assignment(
                        match_id=match_id,
                        slot_id=t_star,
                        court_id=c_star,
                        duration_slots=m.duration_slots,
                        moved=False,
                    )
                    match_to_assignment[match_id] = a
                    for (t, c) in occupies(t_star, c_star, m.duration_slots):
                        slot_court_to_match[(t, c)] = match_id
                continue

        for match_id in order:
            if match_id in match_to_assignment:
                continue
            m = matches_by_id.get(match_id)
            if not m:
                continue
            prev = prev_by_match.get(match_id)
            placed = False
            for t in range(T - m.duration_slots + 1):
                if placed:
                    break
                for c in range(1, C + 1):
                    if not feasible(m, t, c):
                        continue
                    a = Assignment(
                        match_id=match_id,
                        slot_id=t,
                        court_id=c,
                        duration_slots=m.duration_slots,
                        moved=bool(prev and (prev.slot_id != t or prev.court_id != c)),
                        previous_slot_id=prev.slot_id if prev else None,
                        previous_court_id=prev.court_id if prev else None,
                    )
                    if prev and (prev.slot_id != t or prev.court_id != c):
                        moved_count += 1
                    match_to_assignment[match_id] = a
                    for (s, cx) in occupies(t, c, m.duration_slots):
                        slot_court_to_match[(s, cx)] = match_id
                    placed = True
                    break

        assignments = [match_to_assignment[mid] for mid in order if mid in match_to_assignment]
        unscheduled = [mid for mid in order if mid not in match_to_assignment]
        status = SolverStatus.FEASIBLE if not unscheduled else SolverStatus.INFEASIBLE
        infeasible_reasons = []
        if unscheduled:
            infeasible_reasons.append(f"Greedy backend could not place: {unscheduled}")

        return ScheduleResult(
            status=status,
            runtime_ms=0.0,
            assignments=assignments,
            soft_violations=[],
            infeasible_reasons=infeasible_reasons,
            unscheduled_matches=unscheduled,
            moved_count=moved_count,
            locked_count=len(locked),
        )
