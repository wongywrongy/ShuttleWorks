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
    PreviousAssignment,
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
from .state import find_ready_play_units, is_assignment_locked


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

    def repin_and_resolve(
        self,
        play_unit_id: PlayUnitId,
        slot_id: int,
        court_id: int,
    ) -> RoundResult:
        """Re-pin one already-scheduled PlayUnit and re-solve the
        already-scheduled set around it.

        Partitions ``state.assignments`` into three groups:

        - **locked** — has a result (played) ∪ has ``actual_start_slot``
          set (started) ∪ ends before ``config.current_slot``
          (``slot_id + duration_slots <= current_slot``). Emitted as
          ``PreviousAssignment(locked=True)``.
        - **pinned** — the single ``play_unit_id`` being dragged.
          Emitted as ``PreviousAssignment(pinned_slot_id=...,
          pinned_court_id=...)``.
        - **free** — every other scheduled PlayUnit. Emitted as a plain
          ``Match`` with no ``PreviousAssignment`` — the solver
          re-places it.

        Re-solves with ``config.current_slot`` **unchanged** (this
        re-optimises the already-scheduled set; it does not advance a
        round — that is ``schedule_next_round``'s job). Writes the
        resulting assignments back into ``state.assignments``.

        Raises ``ValueError`` if ``play_unit_id`` is in the locked set —
        a played/started/past match cannot be re-pinned.
        """
        assignment = self.state.assignments.get(play_unit_id)
        if assignment is None:
            raise ValueError(
                f"play unit {play_unit_id!r} is not scheduled; cannot re-pin"
            )

        current_slot = self.config.current_slot

        if is_assignment_locked(assignment, self.state.results, current_slot):
            raise ValueError(
                f"play unit {play_unit_id!r} is locked "
                f"(played / started / past); cannot re-pin"
            )

        previous_assignments: List[PreviousAssignment] = []
        for pu_id, a in self.state.assignments.items():
            if pu_id == play_unit_id:
                previous_assignments.append(
                    PreviousAssignment(
                        match_id=pu_id,
                        slot_id=a.slot_id,
                        court_id=a.court_id,
                        pinned_slot_id=slot_id,
                        pinned_court_id=court_id,
                    )
                )
            elif is_assignment_locked(a, self.state.results, current_slot):
                previous_assignments.append(
                    PreviousAssignment(
                        match_id=pu_id,
                        slot_id=a.slot_id,
                        court_id=a.court_id,
                        locked=True,
                    )
                )
            # free assignments contribute no PreviousAssignment.

        play_unit_ids = list(self.state.assignments.keys())
        problem = build_problem(
            self.state,
            play_unit_ids,
            config=self.config,
            solver_options=self.solver_options,
            previous_assignments=previous_assignments,
        )

        result = schedule(problem, options=self.solver_options)

        if result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE):
            # Physical-history fields (actual_*) carry over; scheduling-
            # decision metadata (locked/pinned_*) deliberately resets —
            # pins are transient (the re-solve IS the new scheduling decision).
            for solved in result.assignments:
                existing = self.state.assignments.get(solved.match_id)
                self.state.assignments[solved.match_id] = TournamentAssignment(
                    play_unit_id=solved.match_id,
                    slot_id=solved.slot_id,
                    court_id=solved.court_id,
                    duration_slots=solved.duration_slots,
                    actual_start_slot=(
                        existing.actual_start_slot if existing else None
                    ),
                    actual_end_slot=(
                        existing.actual_end_slot if existing else None
                    ),
                )

        return RoundResult(
            play_unit_ids=play_unit_ids,
            status=result.status,
            schedule_result=result,
            started_at_current_slot=current_slot,
        )

    def generate_event(
        self,
        event_id: str,
        wipe: bool = False,
    ) -> RoundResult:
        """Schedule one event's matches in isolation while respecting
        other events' already-generated/started assignments.

        - Find PlayUnits with ``pu.event_id == event_id``.
        - If ``wipe`` is True: drop their existing assignments first.
        - If any of those PlayUnits has a result, refuse with ValueError
          (matches Phase A's Started lifecycle gate).
        - Build the CP-SAT problem with the event's ready PlayUnits as
          the variable set, and emit one ``PreviousAssignment(locked=True)``
          per OTHER event's existing assignment so the solver picks
          (slot, court) cells that don't collide.
        - Write resulting assignments back into ``state.assignments``.
        """
        event_pu_ids = [
            pu_id for pu_id, pu in self.state.play_units.items()
            if pu.event_id == event_id
        ]
        if not event_pu_ids:
            return RoundResult(play_unit_ids=[], status=SolverStatus.UNKNOWN)

        # BYE walkovers are auto-recorded by register_draw/auto_walkover_byes
        # and do not indicate the event has been played.  Only non-walkover
        # results (i.e. real match outcomes) mean the event is started.
        if any(
            pu_id in self.state.results
            and not self.state.results[pu_id].walkover
            for pu_id in event_pu_ids
        ):
            raise ValueError(
                f"event {event_id!r} has results; cannot generate (event is started)"
            )

        if wipe:
            for pu_id in event_pu_ids:
                self.state.assignments.pop(pu_id, None)

        # Ready set inside the target event: dependency satisfied + both sides known.
        ready: List[PlayUnitId] = []
        for pu_id in event_pu_ids:
            pu = self.state.play_units[pu_id]
            if pu_id in self.state.assignments:
                continue
            if not pu.side_a or not pu.side_b:
                continue
            if any(dep not in self.state.results for dep in pu.dependencies):
                continue
            ready.append(pu_id)

        if not ready:
            return RoundResult(play_unit_ids=[], status=SolverStatus.UNKNOWN)

        # Collect other-events' existing assignments as locked phantom matches.
        # They are included in the solve as full Match entries so that
        # CourtCapacity's AddNoOverlap spans both events' matches.
        # LocksAndPins then hard-fixes their (slot, court) so they cannot move.
        # Without this, LocksAndPins silently skips them (match_id not in
        # ctx.matches) and the solver sees an empty court for MS.
        locked_pu_ids: List[PlayUnitId] = []
        previous_assignments: List[PreviousAssignment] = []
        for pu_id, a in self.state.assignments.items():
            pu = self.state.play_units.get(pu_id)
            if pu is None or pu.event_id == event_id:
                continue
            locked_pu_ids.append(pu_id)
            previous_assignments.append(
                PreviousAssignment(
                    match_id=pu_id,
                    slot_id=a.slot_id,
                    court_id=a.court_id,
                    locked=True,
                )
            )

        problem = build_problem(
            self.state,
            ready + locked_pu_ids,
            config=self.config,
            solver_options=self.solver_options,
            previous_assignments=previous_assignments,
        )
        result = schedule(problem, options=self.solver_options)

        ready_set = set(ready)
        if result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE):
            for assignment in result.assignments:
                if assignment.match_id not in ready_set:
                    continue  # locked phantom — did not change
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
            started_at_current_slot=self.config.current_slot,
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
