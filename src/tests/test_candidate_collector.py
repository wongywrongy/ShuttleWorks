"""Candidate-pool capture during the initial solve.

CP-SAT calls back on every improving solution while it climbs toward
the optimum. The collector keeps the top-N near-optimal alternatives
and pipes them into ``ScheduleResult.candidates`` so the operator can
swap to one in a click without a re-solve.
"""
from __future__ import annotations

from scheduler_core.domain.models import (
    Match,
    Player,
    ScheduleConfig,
    SolverOptions,
)
from scheduler_core.engine.cpsat_backend import CPSATScheduler


def _wide_open_problem():
    """A problem with many feasible schedules (loose constraints, lots
    of slots/courts) so the solver finds several improving solutions."""
    config = ScheduleConfig(
        total_slots=20,
        court_count=4,
        interval_minutes=30,
        default_rest_slots=1,
        # Compact-schedule on so the solver has an objective and keeps
        # finding better solutions; without an objective CP-SAT exits
        # at the first feasible point and we'd see only one candidate.
        enable_compact_schedule=True,
        compact_schedule_mode="minimize_makespan",
        compact_schedule_penalty=10.0,
    )
    players = [
        Player(id=f"p{i}", name=f"P{i}", rest_slots=1, rest_is_hard=True)
        for i in range(8)
    ]
    matches = [
        Match(id=f"m{i}", event_code="MS", duration_slots=2,
              side_a=[f"p{2*i}"], side_b=[f"p{2*i+1}"])
        for i in range(4)
    ]
    return config, players, matches


def _solve(pool_size: int):
    config, players, matches = _wide_open_problem()
    sched = CPSATScheduler(
        config,
        SolverOptions(time_limit_seconds=2.0, num_workers=1, random_seed=42, deterministic=True),
    )
    sched.add_matches(matches)
    sched.add_players(players)
    sched.build()
    return sched.solve(candidate_pool_size=pool_size)


def test_pool_captures_when_size_set():
    result = _solve(pool_size=5)
    # The solver should find at least one candidate (the final
    # solution itself). Pool size is an upper bound, not a guarantee.
    assert len(result.candidates) >= 1
    assert len(result.candidates) <= 5


def test_pool_empty_when_size_zero():
    result = _solve(pool_size=0)
    assert result.candidates == []


def test_candidates_have_unique_ids():
    result = _solve(pool_size=5)
    ids = [c.solution_id for c in result.candidates]
    assert len(ids) == len(set(ids)), "candidate solution_ids must be unique"


def test_candidates_sorted_best_first():
    result = _solve(pool_size=5)
    if len(result.candidates) >= 2:
        # Lower objective is better in a minimisation problem.
        objectives = [c.objective_value for c in result.candidates]
        assert objectives == sorted(objectives), \
            f"candidates not sorted best-first: {objectives}"


def test_candidate_assignments_well_formed():
    result = _solve(pool_size=3)
    for cand in result.candidates:
        # Every candidate must have one assignment per match.
        assert len(cand.assignments) == 4
        for a in cand.assignments:
            assert a.match_id.startswith("m")
            assert 0 <= a.slot_id < 20
            assert 1 <= a.court_id <= 4
            assert a.duration_slots == 2
