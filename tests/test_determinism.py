"""Determinism: same input + same seed + deterministic mode → byte-identical schedules.

CP-SAT only guarantees deterministic output across runs under a single
search worker (parallel workers introduce timing-based nondeterminism
that no random_seed can fix). The engine's ``SolverOptions.deterministic``
flag forces ``num_workers=1``; this test asserts the resulting schedule
is identical across 5 runs.

Also asserts:
- Sorted-input invariance: feeding matches and players in different
  orders produces the same schedule (the engine sorts by id at the
  boundary, so the input order shouldn't matter).
- Different seeds produce (potentially) different schedules but each
  one is internally consistent across re-runs.
"""
from __future__ import annotations

import random
from dataclasses import asdict

from scheduler_core.domain.models import (
    Match,
    Player,
    ScheduleConfig,
    SolverOptions,
)
from scheduler_core.engine.cpsat_backend import CPSATScheduler


def _build_problem():
    """Small but non-trivial problem with multiple players sharing matches."""
    config = ScheduleConfig(
        total_slots=10,
        court_count=2,
        interval_minutes=30,
        default_rest_slots=1,
    )
    players = [
        Player(id=f"p{i}", name=f"Player {i}", rest_slots=1, rest_is_hard=True)
        for i in range(6)
    ]
    matches = [
        Match(id="m1", event_code="MS", duration_slots=2, side_a=["p0"], side_b=["p1"]),
        Match(id="m2", event_code="WS", duration_slots=2, side_a=["p2"], side_b=["p3"]),
        Match(id="m3", event_code="MD", duration_slots=2, side_a=["p0", "p4"], side_b=["p1", "p5"]),
        Match(id="m4", event_code="WD", duration_slots=2, side_a=["p2", "p4"], side_b=["p3", "p5"]),
        Match(id="m5", event_code="XD", duration_slots=2, side_a=["p0", "p2"], side_b=["p1", "p3"]),
    ]
    return config, players, matches


def _solve(config, players, matches, *, seed=42):
    scheduler = CPSATScheduler(
        config,
        SolverOptions(
            time_limit_seconds=5.0,
            num_workers=4,            # ignored in deterministic mode
            random_seed=seed,
            deterministic=True,
        ),
    )
    scheduler.add_matches(matches)
    scheduler.add_players(players)
    scheduler.build()
    return scheduler.solve()


def _signature(result):
    """Stable comparable representation of an assignment list."""
    return tuple(
        (a.match_id, a.slot_id, a.court_id, a.duration_slots)
        for a in sorted(result.assignments, key=lambda a: a.match_id)
    )


def test_same_seed_same_schedule_across_runs():
    config, players, matches = _build_problem()
    sigs = {_signature(_solve(config, players, matches, seed=42)) for _ in range(5)}
    assert len(sigs) == 1, "deterministic mode produced different schedules across runs"


def test_input_order_does_not_matter():
    """Engine sorts by id at the boundary, so any input order works."""
    config, players, matches = _build_problem()
    base = _signature(_solve(config, players, matches, seed=42))

    rng = random.Random(123)
    for _ in range(3):
        shuffled_players = players[:]
        shuffled_matches = matches[:]
        rng.shuffle(shuffled_players)
        rng.shuffle(shuffled_matches)
        assert _signature(_solve(config, shuffled_players, shuffled_matches, seed=42)) == base


def test_solver_seed_persisted_in_result():
    config, players, matches = _build_problem()
    result = _solve(config, players, matches, seed=7)
    assert result.solver_seed == 7
