"""End-to-end repair scenarios.

Each test boots a small tournament, runs an initial solve, then calls
``solve_repair`` with a slice rule emulating one disruption type.
Asserts that:

  - finished/locked matches don't move,
  - free matches respect the constraints,
  - solve time is well under 5 s.
"""
from __future__ import annotations

import time

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    ScheduleConfig,
    SolverOptions,
)
from scheduler_core.engine.cpsat_backend import CPSATScheduler
from scheduler_core.engine.repair import RepairSpec, solve_repair


def _problem():
    config = ScheduleConfig(
        total_slots=20,
        court_count=3,
        interval_minutes=30,
        default_rest_slots=1,
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


def test_court_closure_routes_off_closed_court():
    config, players, matches = _problem()
    initial = _initial_solve(config, players, matches)
    # Pick a court that has at least one match assigned.
    closed_court = next(iter({a.court_id for a in initial.values()}))
    free = {mid for mid, a in initial.items() if a.court_id == closed_court}

    spec = RepairSpec(
        free_match_ids=frozenset(free),
        forbid_court_ids=frozenset({closed_court}),
        hint_assignments=initial,
    )

    t0 = time.perf_counter()
    result = solve_repair(config, players, matches, spec)
    elapsed = time.perf_counter() - t0

    assert elapsed < 5.0, f"repair took too long: {elapsed:.2f}s"
    new_by_match = {a.match_id: a for a in result.assignments}

    # No surviving match may end up on the closed court.
    for a in result.assignments:
        assert a.court_id != closed_court, f"match {a.match_id} still on closed court {closed_court}"

    # Pinned (non-free) matches must not have moved.
    for mid, original in initial.items():
        if mid in free:
            continue
        new = new_by_match.get(mid)
        assert new is not None, f"non-free match {mid} disappeared"
        assert new.slot_id == original.slot_id and new.court_id == original.court_id, \
            f"non-free match {mid} moved unexpectedly"


def test_cancellation_drops_match_from_schedule():
    config, players, matches = _problem()
    initial = _initial_solve(config, players, matches)
    cancelled = "m2"

    spec = RepairSpec(
        free_match_ids=frozenset(),  # no slack — just forfeit it
        forbid_match_ids=frozenset({cancelled}),
        hint_assignments=initial,
    )

    result = solve_repair(config, players, matches, spec)
    new_ids = {a.match_id for a in result.assignments}
    assert cancelled not in new_ids, "cancelled match should not be in repaired schedule"
    # All other matches are still present.
    for m in matches:
        if m.id == cancelled:
            continue
        assert m.id in new_ids, f"match {m.id} unexpectedly dropped"


def test_warm_start_keeps_pinned_matches_in_place():
    """Sanity: when no matches are free, the result equals the pinned state."""
    config, players, matches = _problem()
    initial = _initial_solve(config, players, matches)

    spec = RepairSpec(
        free_match_ids=frozenset(),
        hint_assignments=initial,
    )

    result = solve_repair(config, players, matches, spec)
    new_by_match = {a.match_id: a for a in result.assignments}

    for mid, original in initial.items():
        new = new_by_match[mid]
        assert new.slot_id == original.slot_id, f"{mid}: slot drifted"
        assert new.court_id == original.court_id, f"{mid}: court drifted"
