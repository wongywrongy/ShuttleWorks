"""CP-SAT Tournament Scheduling Algorithm (interval-variable formulation).

Decision Variables
------------------
For each match m with duration d:
  start[m]     ∈ [0, T-d]
  end[m]      == start[m] + d
  interval[m]  = NewIntervalVar(start[m], d, end[m])
  court[m]     ∈ [1, C]
  is_on_court[(m,c)] ∈ {0,1}  — exactly one true per match
  court_interval[(m,c)] = NewOptionalIntervalVar(start[m], d, end[m], is_on_court[(m,c)])

Hard Constraints
----------------
1. Court capacity       — ``AddNoOverlap([court_interval[(m,c)] for m])`` per court c.
2. Player non-overlap   — ``AddNoOverlap([interval[m] for m in matches_of(player)])`` per player.
3. Availability         — ``AddAllowedAssignments([start[m]], allowed_starts_for(m))``.
4. Locks/pins           — ``Add(start[m] == slot)`` / ``Add(court[m] == court)``.
5. Freeze horizon       — same form, applied to assignments whose slot < freeze cutoff.

Soft Constraints (penalties added to objective)
-----------------------------------------------
- Rest slack               — pairwise on player's matches; slack = shortfall.
- Disruption               — ``|start[m] - previous_start|``.
- Late finish              — weight * start[m].
- Court change             — reified ``court[m] == previous_court``.
- Game proximity (min/max) — pairwise on player's matches (opt-in).
- Compact schedule         — makespan / finish-by-time / no-gaps (opt-in).
- Player overlap           — when allow_player_overlap=True, pairwise overlap slack.

Court utilization
-----------------
Total occupied court-slots = Σ duration(m), which is constant under the model.
The legacy backend penalized this constant value — a no-op for the solver — so
the refactor does not add a term. The config flag is preserved for schema
compatibility but does not influence the objective.
"""
from __future__ import annotations

import heapq
import time as time_module
import uuid
from collections import defaultdict
from functools import lru_cache
from typing import Callable, Dict, FrozenSet, List, Optional, Set, Tuple

from ortools.sat.python import cp_model

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleResult,
    ScheduleSnapshot,
    SolverOptions,
    SolverStatus,
)
from scheduler_core._log import (
    log_build_end,
    log_build_start,
    log_infeasible_diagnostics,
    log_solution_extraction,
    log_solve_end,
    log_solve_start,
)
from scheduler_core.engine.config import EngineConfig
from scheduler_core.engine.constraints import load as load_constraint
# Importing each plugin module registers it with the registry.
from scheduler_core.engine.constraints import (  # noqa: F401  -- side effect: register
    availability,
    court_capacity,
    freeze_horizon,
    game_proximity,
    locks_and_pins,
    objective,
    player_no_overlap,
    rest,
)
from scheduler_core.engine.diagnostics import diagnose_infeasibility, get_player_ids
from scheduler_core.engine.extraction import extract_solution
from scheduler_core.engine.validation import verify_schedule
from scheduler_core.engine.variables import SchedulingVars, create_variables


class ProgressCallback(cp_model.CpSolverSolutionCallback):
    """Emits progress events to an external callback on every intermediate solution."""

    def __init__(
        self,
        callback_fn: Optional[Callable[[dict], None]] = None,
        svars: Optional[SchedulingVars] = None,
        matches: Optional[Dict[str, Match]] = None,
        model_stats: Optional[Dict[str, int]] = None,
        pool_size: int = 0,
    ) -> None:
        super().__init__()
        self.callback_fn = callback_fn
        self.svars = svars
        self.matches = matches or {}
        self.model_stats = model_stats or {}
        self.start_time = time_module.perf_counter()
        self.solution_count = 0
        self.last_objective: Optional[float] = None
        self.last_gap_checkpoint = 100
        self.time_checkpoints = {5: False, 10: False, 30: False, 60: False}
        self.initial_stats_sent = False
        # Candidate-pool bookkeeping. ``_pool`` is a max-heap (Python's
        # heapq is min-heap, so we push ``-objective`` to invert) capped
        # at ``pool_size`` — pushing a worse solution when full pops
        # the worst already in the pool. ``_seen`` dedupes identical
        # assignment lists so the pool isn't filled with copies of the
        # same schedule under different objective values.
        self.pool_size = pool_size
        self._pool: List[Tuple[float, int, ScheduleSnapshot]] = []
        self._seen: Set[Tuple] = set()
        self._counter = 0  # tie-breaker so heap comparisons never reach the snapshot

    def on_solution_callback(self) -> None:
        self.solution_count += 1
        elapsed_ms = (time_module.perf_counter() - self.start_time) * 1000
        elapsed_sec = elapsed_ms / 1000

        current_assignments: List[dict] = []
        if self.svars is not None:
            for match_id, match in self.matches.items():
                start = self.Value(self.svars.start[match_id])
                court = self.Value(self.svars.court[match_id])
                current_assignments.append(
                    {
                        "matchId": match_id,
                        "slotId": start,
                        "courtId": court,
                        "durationSlots": match.duration_slots,
                    }
                )

        current_obj = self.ObjectiveValue()
        self._maybe_capture_candidate(current_obj, current_assignments)
        best_bound = self.BestObjectiveBound()
        gap_percent: Optional[float] = None
        if best_bound != 0:
            gap_percent = abs(current_obj - best_bound) / abs(best_bound) * 100

        messages: List[dict] = []

        for checkpoint, reported in self.time_checkpoints.items():
            if not reported and elapsed_sec >= checkpoint:
                self.time_checkpoints[checkpoint] = True
                gap_info = f", {gap_percent:.2f}% gap" if gap_percent is not None else ""
                messages.append(
                    {"type": "progress", "text": f"Still searching... {int(elapsed_sec)}s elapsed{gap_info}"}
                )

        if gap_percent is not None:
            gap_milestones = [50, 20, 10, 5, 2, 1, 0.5, 0.1]
            for milestone in gap_milestones:
                if self.last_gap_checkpoint > milestone >= gap_percent:
                    self.last_gap_checkpoint = milestone
                    if milestone <= 5:
                        messages.append(
                            {"type": "progress", "text": f"Approaching optimal: {gap_percent:.1f}% gap"}
                        )
                    break

        if self.solution_count == 1 and not self.initial_stats_sent:
            self.initial_stats_sent = True
            if self.model_stats:
                stats = self.model_stats
                messages.append(
                    {
                        "type": "progress",
                        "text": (
                            f"Model: {stats.get('num_matches', 0)} matches, "
                            f"{stats.get('num_intervals', 0)} intervals, "
                            f"{stats.get('num_no_overlap', 0)} no-overlap groups"
                        ),
                    }
                )
                if stats.get("multi_match_players", 0) > 0:
                    messages.append(
                        {
                            "type": "progress",
                            "text": f"Scheduling {stats['multi_match_players']} players with multiple events",
                        }
                    )
                if stats.get("difficulty"):
                    messages.append(
                        {"type": "progress", "text": f"Problem complexity: {stats['difficulty']}"}
                    )
            messages.append(
                {"type": "progress", "text": f"Initial solution found with score {int(current_obj)}"}
            )

        if self.last_objective is not None and current_obj < self.last_objective:
            improvement = self.last_objective - current_obj
            if improvement >= 100:
                messages.append(
                    {"type": "progress", "text": f"Major improvement: -{int(improvement)} points"}
                )
        self.last_objective = current_obj

        if self.callback_fn:
            self.callback_fn(
                {
                    "elapsed_ms": int(elapsed_ms),
                    "current_objective": current_obj,
                    "best_bound": best_bound,
                    "solution_count": self.solution_count,
                    "current_assignments": current_assignments,
                    "gap_percent": gap_percent,
                    "messages": messages,
                }
            )

    def _maybe_capture_candidate(
        self, objective_value: float, current_assignments: List[dict]
    ) -> None:
        """Push this solution into the candidate pool if it qualifies.

        Heap key is ``-objective_value`` so the heap pops the *worst*
        candidate when full and we keep the best-N. Identical assignment
        lists (same matches at same slot/court) are deduped — CP-SAT
        sometimes calls back with the same primal under different
        objective bounds.
        """
        if self.pool_size <= 0:
            return

        signature = tuple(
            sorted(
                (a["matchId"], a["slotId"], a["courtId"], a["durationSlots"])
                for a in current_assignments
            )
        )
        if signature in self._seen:
            return

        snapshot = ScheduleSnapshot(
            assignments=[
                Assignment(
                    match_id=a["matchId"],
                    slot_id=a["slotId"],
                    court_id=a["courtId"],
                    duration_slots=a["durationSlots"],
                )
                for a in current_assignments
            ],
            objective_value=float(objective_value),
            found_at_seconds=time_module.perf_counter() - self.start_time,
            solution_id=str(uuid.uuid4()),
        )

        self._counter += 1
        # Negate so heapq's min-heap behaves like a max-heap on objective.
        entry = (-float(objective_value), self._counter, snapshot)
        if len(self._pool) < self.pool_size:
            heapq.heappush(self._pool, entry)
            self._seen.add(signature)
        else:
            # Heap top is the worst (highest objective). Replace it only
            # if this new solution is better.
            if entry > self._pool[0]:
                evicted = heapq.heappushpop(self._pool, entry)
                # The evicted snapshot's signature comes back into play
                # if the same primal is found again later.
                self._seen.discard(self._signature_of(evicted[2]))
                self._seen.add(signature)

    @staticmethod
    def _signature_of(snap: ScheduleSnapshot) -> Tuple:
        return tuple(
            sorted(
                (a.match_id, a.slot_id, a.court_id, a.duration_slots)
                for a in snap.assignments
            )
        )

    @property
    def candidates(self) -> List[ScheduleSnapshot]:
        """Top-N candidates ordered best-first (lowest objective)."""
        # Sort the heap copy by ascending objective_value (best first).
        return [snap for _, _, snap in sorted(self._pool, key=lambda e: -e[0])]


@lru_cache(maxsize=4096)
def _player_allowed_starts_cached(
    availability: Tuple[Tuple[int, int], ...],
    max_start: int,
    duration: int,
) -> FrozenSet[int]:
    """Set of start slots for which a duration-`duration` interval fits
    inside at least one availability window.

    Memoized at module scope so repeated builds across solves (warm
    restarts, repairs, director actions) reuse the work. Cache key is
    the player's availability tuple + the geometry of the slot grid;
    same player + same grid = same answer, regardless of which match
    asked. The cache is bounded (4096 entries) so very large
    tournaments stay memory-safe.
    """
    if max_start < 0:
        return frozenset()
    out: Set[int] = set()
    for t in range(max_start + 1):
        for start, end in availability:
            if start <= t and t + duration <= end:
                out.add(t)
                break
    return frozenset(out)


class CPSATScheduler:
    """Interval-based CP-SAT scheduler."""

    def __init__(
        self,
        config: ScheduleConfig | EngineConfig,
        solver_options: Optional[SolverOptions] = None,
    ) -> None:
        # Accept either the legacy ``ScheduleConfig`` (which we wrap via
        # ``EngineConfig.from_legacy``) or a ready-made ``EngineConfig``.
        # Internally we always work with an ``EngineConfig`` so the build
        # path is uniform.
        if isinstance(config, EngineConfig):
            self.engine_config = config
            self.config = config.schedule
            self.solver_options = solver_options or config.solver
        else:
            self.config = config
            self.solver_options = solver_options or SolverOptions()
            self.engine_config = EngineConfig.from_legacy(config, self.solver_options)

        self.model = cp_model.CpModel()
        self.matches: Dict[str, Match] = {}
        self.players: Dict[str, Player] = {}
        self.previous_assignments: Dict[str, PreviousAssignment] = {}

        self.svars: SchedulingVars = SchedulingVars()

        # Soft-constraint slack bookkeeping, used by extract_solution.
        self.rest_slack: Dict[Tuple[str, str, str], cp_model.IntVar] = {}
        self.proximity_min_slack: Dict[Tuple[str, str, str], cp_model.IntVar] = {}
        self.proximity_max_slack: Dict[Tuple[str, str, str], cp_model.IntVar] = {}
        self.overlap_slack: List[cp_model.IntVar] = []
        # Bus for auxiliary objective terms that plugins outside the
        # core constraint set want to add. The ``StayClose`` plugin
        # (used by warm-start) appends per-match move-penalty
        # variables; the ``Objective`` plugin pulls them in.
        self.extra_objective_terms: List = []

        self.infeasible_reasons: List[str] = []
        self.locked_matches: Set[str] = set()

        # Lightweight model stats for logging + SSE.
        self._num_no_overlap_groups = 0
        self._num_intervals = 0

    # ---- input ingestion -----------------------------------------------------

    def add_matches(self, matches: List[Match]) -> None:
        # Sort by id so the model's variable creation order is
        # deterministic. CP-SAT's search-tree ties depend on variable
        # order; without this, two equivalent inputs in different order
        # can produce different (still valid) schedules even with a
        # fixed seed.
        for match in sorted(matches, key=lambda m: m.id):
            self.matches[match.id] = match

    def add_players(self, players: List[Player]) -> None:
        for player in sorted(players, key=lambda p: p.id):
            self.players[player.id] = player

    def set_previous_assignments(self, assignments: List[PreviousAssignment]) -> None:
        for assignment in assignments:
            self.previous_assignments[assignment.match_id] = assignment
            if assignment.locked:
                self.locked_matches.add(assignment.match_id)

    # ---- model construction --------------------------------------------------

    def _player_matches(self) -> Dict[str, List[Match]]:
        out: Dict[str, List[Match]] = defaultdict(list)
        for match in self.matches.values():
            for pid in get_player_ids(match):
                out[pid].append(match)
        return out

    def _allowed_starts(self, match: Match) -> Optional[List[Tuple[int]]]:
        """Starts where [t, t+d) sits inside the intersection of every side player's availability windows
        and does not overlap any break window.

        Returns ``None`` only when there are no availability constraints *and* no break
        windows (i.e. the match is unconstrained). Returns an empty list when the
        match is infeasible.

        Per-player availability scans are memoized via the module-level
        LRU cache below — repeated builds for the same tournament reuse
        the per-(player, duration, max_start) sets without rescanning.
        """
        T = self.config.total_slots
        d = match.duration_slots
        max_start = T - d
        if max_start < 0:
            return []

        breaks = self.config.break_slots

        per_player_allowed: List[FrozenSet[int]] = []
        for player_id in get_player_ids(match):
            player = self.players.get(player_id)
            if not player or not player.availability:
                continue
            per_player_allowed.append(
                _player_allowed_starts_cached(
                    tuple(player.availability), max_start, d
                )
            )

        if not per_player_allowed and not breaks:
            return None

        if per_player_allowed:
            intersection: Set[int] = set(per_player_allowed[0])
            for s in per_player_allowed[1:]:
                intersection &= s
        else:
            intersection = set(range(max_start + 1))

        if breaks:
            intersection = {
                t for t in intersection
                if not any(t < be and t + d > bs for bs, be in breaks)
            }

        return [(t,) for t in sorted(intersection)]

    # ---- build + solve -------------------------------------------------------

    def build(self) -> None:
        log_build_start(
            len(self.matches),
            len(self.players),
            self.config.total_slots,
            self.config.court_count,
        )

        self.svars = create_variables(self.model, self.matches, self.config)
        self._num_intervals = len(self.svars.interval) + len(self.svars.court_interval)

        # Court closures — a list of (court_id, from_slot, to_slot)
        # half-open windows. We forbid each match × court combination
        # whose interval would overlap the closed window. The legacy
        # ``closed_court_ids`` list still works as "indefinite/all-day"
        # closures and is folded into the same window list.
        windows: List[Tuple[int, int, int]] = list(
            self.config.closed_court_windows or []
        )
        for c in (self.config.closed_court_ids or []):
            if 1 <= c <= self.config.court_count:
                windows.append((c, 0, self.config.total_slots))
        # Drop any entry outside the court range or that doesn't form a
        # meaningful range. (Adapter has already filtered these but be
        # defensive — direct callers may construct ScheduleConfig.)
        windows = [
            (cid, fs, ts) for (cid, fs, ts) in windows
            if 1 <= cid <= self.config.court_count and ts > fs
        ]
        for match_id, match in self.matches.items():
            d = match.duration_slots
            for cid, from_slot, to_slot in windows:
                # The interval [start, start+d) must NOT overlap
                # [from_slot, to_slot) when court[m] == cid. The match
                # avoids the window iff start+d <= from_slot OR
                # start >= to_slot. Reify one BoolVar per (match, window)
                # capturing "starts before window" and require, when
                # the match is on this court, that either condition holds.
                start = self.svars.start[match_id]
                is_on = self.svars.is_on_court[(match_id, cid)]
                before = self.model.NewBoolVar(
                    f"closed_{match_id}_c{cid}_before_{from_slot}"
                )
                after = self.model.NewBoolVar(
                    f"closed_{match_id}_c{cid}_after_{to_slot}"
                )
                self.model.Add(start + d <= from_slot).OnlyEnforceIf(before)
                self.model.Add(start + d > from_slot).OnlyEnforceIf(before.Not())
                self.model.Add(start >= to_slot).OnlyEnforceIf(after)
                self.model.Add(start < to_slot).OnlyEnforceIf(after.Not())
                # If the match is on this court, at least one must hold.
                self.model.AddBoolOr([before, after, is_on.Not()])

        # Walk the constraint spec list. Each plugin's ``apply(ctx)`` is
        # the lifted body of one of the old ``_add_*`` methods. The
        # scheduler instance itself satisfies ``ConstraintContext`` via
        # duck typing: ``ctx.model``, ``ctx.matches`` etc. all resolve
        # to the same attributes the inline methods used to read.
        for spec in self.engine_config.constraints:
            if not spec.enabled:
                continue
            plugin = load_constraint(spec)
            plugin.apply(self)

        log_build_end(len(self.matches))

    def _compute_model_stats(self) -> Dict[str, int]:
        player_match_count: Dict[str, int] = defaultdict(int)
        for match in self.matches.values():
            for pid in get_player_ids(match):
                player_match_count[pid] += 1
        multi = sum(1 for count in player_match_count.values() if count > 1)
        max_per_player = max(player_match_count.values()) if player_match_count else 0

        return {
            "num_matches": len(self.matches),
            "num_players": len(self.players),
            "num_intervals": self._num_intervals,
            "num_no_overlap": self._num_no_overlap_groups,
            "num_variables": self._num_intervals + len(self.svars.start) + len(self.svars.court),
            "total_slots": self.config.total_slots,
            "court_count": self.config.court_count,
            "multi_match_players": multi,
            "max_matches_per_player": max_per_player,
            "locked_count": len(self.locked_matches),
        }

    def _estimate_difficulty(self, stats: Dict[str, int]) -> str:
        complexity = stats["num_matches"] * stats["multi_match_players"]
        if complexity < 50:
            return "simple"
        if complexity < 200:
            return "moderate"
        if complexity < 500:
            return "complex"
        return "very complex"

    def solve(
        self,
        progress_callback: Optional[Callable[[dict], None]] = None,
        candidate_pool_size: int = 0,
    ) -> ScheduleResult:
        start_time = time_module.perf_counter()
        log_solve_start()

        if self.infeasible_reasons:
            log_infeasible_diagnostics(len(self.infeasible_reasons), self.infeasible_reasons)
            runtime_ms = (time_module.perf_counter() - start_time) * 1000
            log_solve_end(SolverStatus.INFEASIBLE.value, runtime_ms, 0)
            return ScheduleResult(
                status=SolverStatus.INFEASIBLE,
                runtime_ms=runtime_ms,
                infeasible_reasons=self.infeasible_reasons,
                unscheduled_matches=list(self.matches.keys()),
            )

        model_stats = self._compute_model_stats()
        model_stats["difficulty"] = self._estimate_difficulty(model_stats)

        # Determinism mode forces a single search worker. CP-SAT only
        # guarantees byte-identical output across runs (same input +
        # same seed) under one worker; with multiple workers, parallel
        # search introduces nondeterminism that no seed can absorb.
        effective_workers = (
            1 if self.solver_options.deterministic else self.solver_options.num_workers
        )
        effective_seed = self.solver_options.random_seed

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.solver_options.time_limit_seconds
        solver.parameters.num_search_workers = effective_workers
        solver.parameters.random_seed = effective_seed
        solver.parameters.log_search_progress = self.solver_options.log_progress

        # We instantiate the callback whenever EITHER an external
        # progress callback was supplied OR a candidate pool was
        # requested — it serves both roles. With neither, the solver
        # runs uninstrumented (legacy behaviour).
        callback: Optional[ProgressCallback] = None
        if progress_callback is not None or candidate_pool_size > 0:
            callback = ProgressCallback(
                callback_fn=progress_callback,
                svars=self.svars,
                matches=self.matches,
                model_stats=model_stats,
                pool_size=candidate_pool_size,
            )
            status = solver.Solve(self.model, callback)
        else:
            status = solver.Solve(self.model)
        runtime_ms = (time_module.perf_counter() - start_time) * 1000

        status_map = {
            cp_model.OPTIMAL: SolverStatus.OPTIMAL,
            cp_model.FEASIBLE: SolverStatus.FEASIBLE,
            cp_model.INFEASIBLE: SolverStatus.INFEASIBLE,
            cp_model.UNKNOWN: SolverStatus.UNKNOWN,
            cp_model.MODEL_INVALID: SolverStatus.MODEL_INVALID,
        }
        solver_status = status_map.get(status, SolverStatus.UNKNOWN)

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            assignments, soft_violations, moved_count = extract_solution(
                solver=solver,
                matches=self.matches,
                players=self.players,
                previous_assignments=self.previous_assignments,
                locked_matches=self.locked_matches,
                svars=self.svars,
                rest_slack=self.rest_slack,
                proximity_min_slack=self.proximity_min_slack,
                proximity_max_slack=self.proximity_max_slack,
                config=self.config,
                status=solver_status,
                runtime_ms=runtime_ms,
            )
            log_solution_extraction(len(assignments), moved_count, len(self.locked_matches))
            # Runtime safety net: verify the extracted schedule satisfies every hard
            # constraint. Catches any regression in the CP-SAT model that would
            # otherwise ship a silently-broken schedule.
            verify_schedule(
                config=self.config,
                players=self.players,
                matches=self.matches,
                assignments=assignments,
                previous_assignments=self.previous_assignments,
            )
            log_solve_end(solver_status.value, runtime_ms, len(assignments))
            return ScheduleResult(
                status=solver_status,
                objective_score=solver.ObjectiveValue() if solver.ObjectiveValue() else None,
                runtime_ms=runtime_ms,
                assignments=assignments,
                soft_violations=soft_violations,
                moved_count=moved_count,
                locked_count=len(self.locked_matches),
                solver_seed=effective_seed,
                candidates=callback.candidates if callback else [],
            )

        infeasible_reasons = diagnose_infeasibility(
            self.matches,
            self.players,
            self.config,
            self.infeasible_reasons,
        )
        log_infeasible_diagnostics(len(infeasible_reasons), infeasible_reasons)
        log_solve_end(solver_status.value, runtime_ms, 0)
        return ScheduleResult(
            status=solver_status,
            runtime_ms=runtime_ms,
            infeasible_reasons=infeasible_reasons,
            unscheduled_matches=list(self.matches.keys()),
            solver_seed=effective_seed,
        )
