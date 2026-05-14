"""TournamentDriver: layered round-by-round scheduling across events.

Each call to `schedule_next_round` collects ready PlayUnits across
the entire TournamentState (every registered event), calls the
engine once, and writes assignments back into TournamentState. The
caller records results between calls.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import List, Optional

from scheduler_core import schedule
from scheduler_core.domain.models import (
    ScheduleConfig,
    ScheduleResult,
    SolverOptions,
    SolverStatus,
)
from scheduler_core.domain.tournament import (
    PlayUnitId,
    TournamentAssignment,
    TournamentState,
)

from .adapter import advance_current_slot, build_problem
from .state import find_ready_play_units


@dataclass
class RoundResult:
    """Outcome of a single `schedule_next_round` call."""

    play_unit_ids: List[PlayUnitId] = field(default_factory=list)
    status: SolverStatus = SolverStatus.UNKNOWN
    schedule_result: Optional[ScheduleResult] = None
    started_at_current_slot: int = 0

    @property
    def scheduled(self) -> bool:
        return self.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)

    @property
    def empty(self) -> bool:
        return not self.play_unit_ids


@dataclass
class TournamentDriver:
    """Round-by-round scheduling orchestrator.

    The driver is event-agnostic: it operates on whatever PlayUnits
    are registered in `state` and lets the engine's player-no-overlap
    constraint resolve cross-event conflicts.
    """

    state: TournamentState
    config: ScheduleConfig
    solver_options: Optional[SolverOptions] = None
    rest_between_rounds: int = 1

    def schedule_next_round(self) -> RoundResult:
        ready = find_ready_play_units(self.state)
        if not ready:
            return RoundResult(
                play_unit_ids=[],
                status=SolverStatus.UNKNOWN,
            )

        current_slot = advance_current_slot(
            self.state,
            base_current_slot=self.config.current_slot,
            rest_between_rounds=self.rest_between_rounds,
        )
        round_config = replace(self.config, current_slot=current_slot)

        problem = build_problem(
            self.state,
            ready,
            config=round_config,
            solver_options=self.solver_options,
        )

        result = schedule(problem, options=self.solver_options)

        if result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE):
            for assignment in result.assignments:
                self.state.assignments[assignment.match_id] = (
                    TournamentAssignment(
                        play_unit_id=assignment.match_id,
                        slot_id=assignment.slot_id,
                        court_id=assignment.court_id,
                        duration_slots=assignment.duration_slots,
                    )
                )

        return RoundResult(
            play_unit_ids=ready,
            status=result.status,
            schedule_result=result,
            started_at_current_slot=current_slot,
        )

    def schedule_until_blocked(self, max_rounds: int = 32) -> List[RoundResult]:
        """Run rounds until no more ready PlayUnits exist or max_rounds hit."""
        results: List[RoundResult] = []
        for _ in range(max_rounds):
            r = self.schedule_next_round()
            if r.empty:
                break
            results.append(r)
            if not r.scheduled:
                break
        return results
