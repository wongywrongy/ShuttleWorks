"""Targeted disruption repair.

Solves a tightly-scoped slice of the tournament — the matches affected
by a specific disruption — while pinning everything else at its
current assignment. The bounded slice + CP-SAT warm-start (via
``model.AddHint``) collapses repair solve times to ~1-3 s for typical
tournaments, vs. ~30 s for a cold full re-solve.

Slice rules are decided by the *adapter* (e.g.
``adapters/badminton/repair.py``); this module just consumes the
result.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Optional, Sequence, Set

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleResult,
    SolverOptions,
)
from scheduler_core.engine.config import EngineConfig
from scheduler_core.engine.cpsat_backend import CPSATScheduler


@dataclass(frozen=True)
class RepairSpec:
    """Slice rule for one disruption.

    - ``free_match_ids``: matches the solver may move.
    - ``forbid_match_ids``: matches removed from the model (forfeited
      or cancelled). They stay out of the result entirely.
    - ``forbid_court_ids``: courts the solver may NOT use (closure).
    - ``hint_assignments``: where each match was originally; free
      matches get a CP-SAT hint at their original slot+court so the
      solver warm-starts close to the previous schedule.
    """
    free_match_ids: frozenset[str]
    forbid_match_ids: frozenset[str] = frozenset()
    forbid_court_ids: frozenset[int] = frozenset()
    hint_assignments: Mapping[str, Assignment] = field(default_factory=dict)


def solve_repair(
    config: ScheduleConfig,
    players: Sequence[Player],
    matches: Sequence[Match],
    repair: RepairSpec,
    *,
    solver_options: Optional[SolverOptions] = None,
) -> ScheduleResult:
    """Re-solve only the free slice, holding everything else fixed.

    Returns a ``ScheduleResult`` whose ``assignments`` cover every
    surviving match (every ``match.id`` not in
    ``repair.forbid_match_ids``). Already-pinned matches are unchanged
    in the output; free matches may have moved.

    The default solver options trim ``time_limit_seconds`` to 5 (the
    repair problem is small and warm-started, so it converges fast)
    and keep determinism off; pass a custom ``SolverOptions`` to
    override.
    """
    forbid_matches: Set[str] = set(repair.forbid_match_ids)
    forbid_courts: Set[int] = set(repair.forbid_court_ids)
    free: Set[str] = set(repair.free_match_ids)

    # Build the model input: drop every forbidden match entirely.
    surviving = [m for m in matches if m.id not in forbid_matches]

    # Lock every non-free match at its current assignment via the
    # ``LocksAndPins`` constraint plugin. Free matches get hints (not
    # locks) so the solver may move them but starts close to where
    # they were.
    previous: list[PreviousAssignment] = []
    for match_id, ref in repair.hint_assignments.items():
        if match_id in forbid_matches:
            continue
        if match_id in free:
            continue
        previous.append(
            PreviousAssignment(
                match_id=match_id,
                slot_id=ref.slot_id,
                court_id=ref.court_id,
                locked=True,
            )
        )

    options = solver_options or SolverOptions(
        time_limit_seconds=5.0,
        num_workers=4,
        random_seed=42,
        log_progress=False,
    )

    engine_config = EngineConfig.from_legacy(config, options)
    scheduler = CPSATScheduler(engine_config)
    scheduler.add_matches(surviving)
    scheduler.add_players(players)
    scheduler.set_previous_assignments(previous)
    scheduler.build()

    # Warm-start: hint free matches at their original slot+court. CP-SAT
    # uses these hints as a starting point for the search; if the hint
    # is feasible, the solver's first solution is already close to the
    # previous schedule, and any further improvement only moves what
    # the slice rule allowed.
    for match_id in free:
        ref = repair.hint_assignments.get(match_id)
        if ref is None:
            continue
        if match_id in scheduler.svars.start:
            scheduler.model.AddHint(scheduler.svars.start[match_id], ref.slot_id)
        if match_id in scheduler.svars.court:
            scheduler.model.AddHint(scheduler.svars.court[match_id], ref.court_id)

    # Court closure: forbid the closed court for every free match.
    # We can't delete the variable's domain entry retroactively, so
    # we add a ``court_var != closed_id`` constraint per (match,court).
    for match_id in free:
        if match_id not in scheduler.svars.court:
            continue
        for cid in forbid_courts:
            scheduler.model.Add(scheduler.svars.court[match_id] != cid)

    return scheduler.solve()
