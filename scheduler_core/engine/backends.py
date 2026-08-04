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
        scheduler.set_locked_assignments(request.locked_assignments)
        scheduler.build()
        return scheduler.solve(candidate_pool_size=self.candidate_pool_size)


def _player_ids(m: Match) -> Set[str]:
    return set(m.side_a) | set(m.side_b)


def _locked_match_ids(
    previous_assignments: List[PreviousAssignment],
    freeze_until: int,
) -> Set[str]:
    """Explicitly-locked matches, plus any whose previous slot is inside the
    freeze horizon ``[current, current + freeze)``."""
    locked = {pa.match_id for pa in previous_assignments if pa.locked}
    for pa in previous_assignments:
        if pa.slot_id < freeze_until and not pa.locked:
            locked.add(pa.match_id)
    return locked


class _GreedyPlacer:
    """Court/slot occupancy + feasibility predicates for the greedy backend.

    Extracted from ``GreedyBackend.solve`` so the placement engine is a cohesive,
    individually-testable unit. Holds the mutable occupancy map; ``pin_locked`` and
    ``place_greedy`` write ``assignments`` (and ``moved_count``).
    """

    def __init__(
        self,
        matches_by_id: Dict[str, Match],
        players_by_id: Dict[str, Player],
        total_slots: int,
        court_count: int,
    ) -> None:
        self._matches_by_id = matches_by_id
        self._players_by_id = players_by_id
        self._T = total_slots
        self._C = court_count
        self._slot_court_to_match: Dict[Tuple[int, int], str] = {}
        self.assignments: Dict[str, Assignment] = {}
        self.moved_count = 0

    def _occupies(self, slot: int, court: int, duration: int) -> List[Tuple[int, int]]:
        return [(slot + i, court) for i in range(duration)]

    def _occupy(self, match_id: str, slot: int, court: int, duration: int) -> None:
        for cell in self._occupies(slot, court, duration):
            self._slot_court_to_match[cell] = match_id

    def _player_busy(self, pid: str, slot: int, duration: int) -> bool:
        for t in range(slot, slot + duration):
            for c in range(1, self._C + 1):
                mid = self._slot_court_to_match.get((t, c))
                if not mid:
                    continue
                m = self._matches_by_id.get(mid)
                if m and pid in _player_ids(m):
                    return True
        return False

    def _available(self, pid: str, slot: int, duration: int) -> bool:
        p = self._players_by_id.get(pid)
        if not p or not p.availability:
            return True
        for start, end in p.availability:
            if all(start <= t < end for t in range(slot, slot + duration)):
                return True
        return False

    def _feasible(self, m: Match, slot: int, court: int) -> bool:
        d = m.duration_slots
        if slot + d > self._T:
            return False
        for cell in self._occupies(slot, court, d):
            if cell in self._slot_court_to_match:
                return False
        for pid in _player_ids(m):
            if self._player_busy(pid, slot, d):
                return False
            if not self._available(pid, slot, d):
                return False
        return True

    def pin_locked(self, m: Match, prev: PreviousAssignment) -> None:
        """Pin a locked/frozen match at its previous cell — NO feasibility check
        (pinned matches may overlap; preserved behavior). No-op if it would overflow
        the horizon, leaving the match for :meth:`place_greedy`."""
        if prev.slot_id + m.duration_slots > self._T:
            return
        self.assignments[m.id] = Assignment(
            match_id=m.id,
            slot_id=prev.slot_id,
            court_id=prev.court_id,
            duration_slots=m.duration_slots,
            moved=False,
        )
        self._occupy(m.id, prev.slot_id, prev.court_id, m.duration_slots)

    def place_greedy(self, m: Match, prev: Optional[PreviousAssignment]) -> None:
        """Place ``m`` at the first feasible (slot, court), scanning slots then
        courts. No-op if none is feasible (the match stays unscheduled)."""
        for t in range(self._T - m.duration_slots + 1):
            for c in range(1, self._C + 1):
                if not self._feasible(m, t, c):
                    continue
                moved = bool(prev and (prev.slot_id != t or prev.court_id != c))
                self.assignments[m.id] = Assignment(
                    match_id=m.id,
                    slot_id=t,
                    court_id=c,
                    duration_slots=m.duration_slots,
                    moved=moved,
                    previous_slot_id=prev.slot_id if prev else None,
                    previous_court_id=prev.court_id if prev else None,
                )
                if moved:
                    self.moved_count += 1
                self._occupy(m.id, t, c, m.duration_slots)
                return

    def place_all(
        self,
        order: List[str],
        prev_by_match: Dict[str, PreviousAssignment],
        locked: Set[str],
    ) -> None:
        """Two-pass placement over ``order``: first pin locked/frozen matches at
        their previous cell, then greedily place everything still unplaced."""
        for match_id in order:
            m = self._matches_by_id.get(match_id)
            if m and match_id in locked and match_id in prev_by_match:
                self.pin_locked(m, prev_by_match[match_id])
        for match_id in order:
            if match_id in self.assignments:
                continue
            m = self._matches_by_id.get(match_id)
            if m:
                self.place_greedy(m, prev_by_match.get(match_id))


class GreedyBackend(SchedulingBackend):
    """Greedy / local-search backend for ultra-fast reschedules.

    Assigns matches to first feasible (slot, court). Respects court capacity,
    player non-overlap, availability, locks, and freeze horizon.
    """

    def solve(self, request: ScheduleRequest) -> ScheduleResult:
        config = request.config
        freeze_until = config.current_slot + config.freeze_horizon_slots

        matches_by_id = {m.id: m for m in request.matches}
        players_by_id = {p.id: p for p in request.players}
        prev_by_match: Dict[str, PreviousAssignment] = {
            pa.match_id: pa for pa in request.previous_assignments
        }
        locked = _locked_match_ids(request.previous_assignments, freeze_until)

        order = [m.id for m in request.matches]
        placer = _GreedyPlacer(
            matches_by_id, players_by_id, config.total_slots, config.court_count
        )
        placer.place_all(order, prev_by_match, locked)
        return self._result(order, placer, locked)

    @staticmethod
    def _result(
        order: List[str],
        placer: _GreedyPlacer,
        locked: Set[str],
    ) -> ScheduleResult:
        assignments = [placer.assignments[mid] for mid in order if mid in placer.assignments]
        unscheduled = [mid for mid in order if mid not in placer.assignments]
        status = SolverStatus.FEASIBLE if not unscheduled else SolverStatus.INFEASIBLE
        infeasible_reasons: List[str] = []
        if unscheduled:
            infeasible_reasons.append(f"Greedy backend could not place: {unscheduled}")
        return ScheduleResult(
            status=status,
            runtime_ms=0.0,
            assignments=assignments,
            soft_violations=[],
            infeasible_reasons=infeasible_reasons,
            unscheduled_matches=unscheduled,
            moved_count=placer.moved_count,
            locked_count=len(locked),
        )
