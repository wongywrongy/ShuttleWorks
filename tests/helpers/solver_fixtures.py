"""Reusable solver fixture helpers for test suites."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    ScheduleConfig,
    SolverOptions,
)
from scheduler_core.engine.cpsat_backend import CPSATScheduler


@dataclass
class WarmStartInputs:
    config: ScheduleConfig
    players: List[Player]
    matches: List[Match]
    reference: Dict[str, Assignment]
    options_with_long_budget: SolverOptions


def make_minimal_warm_start_inputs() -> WarmStartInputs:
    """A medium-sized but solvable warm-start input set.

    Used by tests that exercise the solver-cancellation pathway.

    Sized so CP-SAT is still searching for improvements well past
    200 ms (it finds the reference schedule immediately as its first
    feasible solution from the AddHint warm-start, then keeps
    optimising). The 10 s time-limit gives the cancellation test
    headroom to observe early termination.

    20 matches × 4 courts × 60 slots.  Each of the 10 players
    appears in exactly 2 matches, creating player-non-overlap
    constraints that the solver must satisfy globally, and the
    stay-close objective adds an additional per-match penalty term
    to the objective — giving CP-SAT plenty of search space.
    """
    # 10 players, each appearing in 2 matches → 20 matches total
    num_players = 10
    num_matches = 20
    players: List[Player] = [
        Player(id=f"p{i}", name=f"Player {i}", rest_slots=1, rest_is_hard=True)
        for i in range(num_players)
    ]

    # Each match involves two distinct players: match i uses players
    # (i % num_players) and ((i + 1) % num_players).  This creates a
    # circular dependency chain that forces the solver to serialise
    # many pairs of matches (each player can't play two matches
    # simultaneously).
    matches: List[Match] = [
        Match(
            id=f"m{i:02d}",
            event_code="MS",
            duration_slots=2,
            side_a=[f"p{i % num_players}"],
            side_b=[f"p{(i + 1) % num_players}"],
        )
        for i in range(num_matches)
    ]

    config = ScheduleConfig(
        total_slots=60,
        court_count=4,
        interval_minutes=30,
        default_rest_slots=1,
        # Compact-schedule pressure means the objective has more to
        # trade off, keeping the solver busy.
        enable_compact_schedule=True,
        compact_schedule_mode="minimize_makespan",
        compact_schedule_penalty=50.0,
    )

    # Run a quick initial solve to obtain the reference schedule.
    # Single worker + deterministic seed so this helper is fast and
    # reproducible (typically < 300 ms on any machine).
    init_options = SolverOptions(
        time_limit_seconds=5.0,
        num_workers=1,
        random_seed=42,
        deterministic=True,
    )
    scheduler = CPSATScheduler(config, init_options)
    scheduler.add_matches(matches)
    scheduler.add_players(players)
    scheduler.build()
    result = scheduler.solve()
    reference: Dict[str, Assignment] = {a.match_id: a for a in result.assignments}

    # The cancellation-test solve uses 4 workers + 10 s budget so
    # CP-SAT keeps searching well past the 200 ms cancellation window.
    options_with_long_budget = SolverOptions(
        time_limit_seconds=10.0,
        num_workers=4,
        random_seed=42,
        log_progress=False,
    )

    return WarmStartInputs(
        config=config,
        players=players,
        matches=matches,
        reference=reference,
        options_with_long_budget=options_with_long_budget,
    )
