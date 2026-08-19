"""Full re-solve seeded by an existing schedule, with a stay-close objective.

Use case: the operator presses "Re-plan from here" — they want the
solver to consider the whole problem again, but keep finished and
in-progress matches where they actually played, and only move future
matches when necessary. Conservative weight setting: the solver
prefers staying close even when a small move would improve makespan
or rest fairness.

Returns a normal ``ScheduleResult``. Solve time is typically much
shorter than a cold solve because the hint (= the existing schedule)
is already feasible — the solver's first solution is the reference
itself, and any later improvement is a deliberate trade-off the
operator's stay-close weight allows.
"""
from __future__ import annotations

from typing import Mapping, Optional, Sequence, Set

from scheduler_core.domain.models import (
    Assignment,
    LockedAssignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleResult,
    SolverOptions,
)
from scheduler_core.engine.cancel_token import CancelToken
from scheduler_core.engine.config import ConstraintSpec, EngineConfig
from scheduler_core.engine.constraints import stay_close as _stay_close  # noqa: F401  -- side effect: register
from scheduler_core.engine.cpsat_backend import CPSATScheduler


def solve_warm_start(
    config: ScheduleConfig,
    players: Sequence[Player],
    matches: Sequence[Match],
    reference: Mapping[str, Assignment],
    *,
    finished_match_ids: Set[str] = frozenset(),
    stay_close_weight: int = 10,
    solver_options: Optional[SolverOptions] = None,
    cancel_token: Optional[CancelToken] = None,
    locked_assignments: Optional[Sequence[LockedAssignment]] = None,
) -> ScheduleResult:
    """Full re-solve, seeded with ``reference`` and biased to stay close.

    - Finished matches (``finished_match_ids``) are hard-pinned via
      the existing ``LocksAndPins`` plugin so the solver can't move
      them.
    - Every other match in ``reference`` gets a ``model.AddHint`` at
      its reference slot+court so the solver warm-starts.
    - The ``StayClose`` plugin adds a per-match move-penalty term to
      the objective (weight 10 / 5 / 1 for Conservative / Balanced /
      Aggressive in the suggested UI).

    The constraint list is the legacy default plus ``stay_close``
    inserted before ``objective`` (so its terms make it into the
    final ``model.Minimize``).
    """
    options = solver_options or SolverOptions(
        time_limit_seconds=10.0,
        num_workers=4,
        random_seed=42,
        log_progress=False,
    )

    # Hard-pin every finished match at its reference assignment via
    # PreviousAssignment(locked=True). Other matches still in the
    # reference get hints (no lock).
    previous: list[PreviousAssignment] = []
    for m_id in finished_match_ids:
        ref = reference.get(m_id)
        if ref is None:
            continue
        previous.append(
            PreviousAssignment(
                match_id=m_id,
                slot_id=ref.slot_id,
                court_id=ref.court_id,
                locked=True,
            )
        )

    # Standard constraint list with stay_close added before objective.
    base = EngineConfig.from_legacy(config, options)
    specs = list(base.constraints)
    insert_at = next(
        (i for i, s in enumerate(specs) if s.name == "objective"), len(specs)
    )
    specs.insert(
        insert_at,
        ConstraintSpec(
            name="stay_close",
            params={"reference": reference, "weight": stay_close_weight},
        ),
    )
    engine_config = EngineConfig(schedule=config, constraints=specs, solver=options)

    scheduler = CPSATScheduler(engine_config)
    scheduler.add_matches(matches)
    scheduler.add_players(players)
    scheduler.set_previous_assignments(previous)
    if locked_assignments:
        scheduler.set_locked_assignments(list(locked_assignments))
    scheduler.build()

    # Warm-start: hint every reference match (including finished, which
    # the solver will see as already-pinned anyway, but the hint helps
    # CP-SAT seed its first solution).
    for m_id, ref in reference.items():
        if m_id in scheduler.svars.start:
            scheduler.model.AddHint(scheduler.svars.start[m_id], ref.slot_id)
        if m_id in scheduler.svars.court:
            scheduler.model.AddHint(scheduler.svars.court[m_id], ref.court_id)

    return scheduler.solve(cancel_token=cancel_token)
