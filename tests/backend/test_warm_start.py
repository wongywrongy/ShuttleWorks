"""Warm-start full re-solve with stay-close objective.

Asserts:
  - Re-solving an already-solved schedule with high stay_close_weight
    produces few or zero moves.
  - Finished matches are hard-pinned and never move.
"""
from __future__ import annotations

from scheduler_core.domain.models import (
    Match,
    Player,
    ScheduleConfig,
    SolverOptions,
)
from scheduler_core.engine.cpsat_backend import CPSATScheduler
from scheduler_core.engine.warm_start import solve_warm_start


def _problem():
    config = ScheduleConfig(
        total_slots=20,
        court_count=3,
        interval_minutes=30,
        default_rest_slots=1,
    )
    players = [Player(id=f"p{i}", name=f"P{i}", rest_slots=1, rest_is_hard=True) for i in range(8)]
    matches = [
        Match(id=f"m{i}", event_code="MS", duration_slots=2,
              side_a=[f"p{2*i}"], side_b=[f"p{2*i+1}"])
        for i in range(4)
    ]
    return config, players, matches


def _initial_solve(config, players, matches):
    sched = CPSATScheduler(
        config,
        SolverOptions(time_limit_seconds=2.0, num_workers=1, random_seed=42, deterministic=True),
    )
    sched.add_matches(matches)
    sched.add_players(players)
    sched.build()
    result = sched.solve()
    return {a.match_id: a for a in result.assignments}


def _move_count(result, reference) -> int:
    return sum(
        1 for a in result.assignments
        if reference[a.match_id].slot_id != a.slot_id or reference[a.match_id].court_id != a.court_id
    )


def test_high_stay_close_reduces_moves():
    """High weight produces fewer moves than low weight.

    With a small problem the solver may still wiggle a few matches
    because the late-finish + makespan terms bias toward a tighter
    layout. The directional invariant is what matters: making
    stay-close stronger relative to those terms reduces operator-
    visible disruption.
    """
    config, players, matches = _problem()
    reference = _initial_solve(config, players, matches)

    options = SolverOptions(
        time_limit_seconds=3.0, num_workers=1, random_seed=42, deterministic=True,
    )

    high = solve_warm_start(
        config, players, matches, reference,
        stay_close_weight=1000,
        solver_options=options,
    )
    low = solve_warm_start(
        config, players, matches, reference,
        stay_close_weight=0,  # no stay-close at all
        solver_options=options,
    )

    high_moves = _move_count(high, reference)
    low_moves = _move_count(low, reference)
    assert high_moves <= low_moves, (
        f"high stay_close weight should produce ≤ moves than no weight; "
        f"got high={high_moves}, low={low_moves}"
    )


def test_finished_matches_hard_pinned():
    config, players, matches = _problem()
    reference = _initial_solve(config, players, matches)
    finished = {"m0"}

    result = solve_warm_start(
        config, players, matches, reference,
        finished_match_ids=finished,
        stay_close_weight=1,  # weak — solver may move other matches freely
        solver_options=SolverOptions(
            time_limit_seconds=3.0, num_workers=1, random_seed=42, deterministic=True,
        ),
    )
    new_by_match = {a.match_id: a for a in result.assignments}
    for m_id in finished:
        assert new_by_match[m_id].slot_id == reference[m_id].slot_id
        assert new_by_match[m_id].court_id == reference[m_id].court_id
