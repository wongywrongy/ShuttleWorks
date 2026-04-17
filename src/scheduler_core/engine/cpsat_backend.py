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

import time as time_module
from collections import defaultdict
from typing import Callable, Dict, List, Optional, Set, Tuple

from ortools.sat.python import cp_model

from scheduler_core.domain.models import (
    Assignment,
    Match,
    Player,
    PreviousAssignment,
    ScheduleConfig,
    ScheduleResult,
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


class CPSATScheduler:
    """Interval-based CP-SAT scheduler."""

    def __init__(
        self,
        config: ScheduleConfig,
        solver_options: Optional[SolverOptions] = None,
    ) -> None:
        self.config = config
        self.solver_options = solver_options or SolverOptions()

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

        self.infeasible_reasons: List[str] = []
        self.locked_matches: Set[str] = set()

        # Lightweight model stats for logging + SSE.
        self._num_no_overlap_groups = 0
        self._num_intervals = 0

    # ---- input ingestion -----------------------------------------------------

    def add_matches(self, matches: List[Match]) -> None:
        for match in matches:
            self.matches[match.id] = match

    def add_players(self, players: List[Player]) -> None:
        for player in players:
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
        """Starts where [t, t+d) sits inside the intersection of every side player's availability windows.

        Returns ``None`` when no player on the match has any availability data
        (i.e. availability is unconstrained). Returns an empty list when the
        match is infeasible.
        """
        T = self.config.total_slots
        d = match.duration_slots
        max_start = T - d
        if max_start < 0:
            return []

        per_player_allowed: List[Set[int]] = []
        for player_id in get_player_ids(match):
            player = self.players.get(player_id)
            if not player or not player.availability:
                continue
            allowed = set()
            for t in range(max_start + 1):
                for start, end in player.availability:
                    if start <= t and t + d <= end:
                        allowed.add(t)
                        break
            per_player_allowed.append(allowed)

        if not per_player_allowed:
            return None

        intersection = set.intersection(*per_player_allowed) if per_player_allowed else set()
        return [(t,) for t in sorted(intersection)]

    def _add_court_capacity(self) -> None:
        C = self.config.court_count
        for c in range(1, C + 1):
            intervals = [self.svars.court_interval[(m_id, c)] for m_id in self.matches]
            if intervals:
                self.model.AddNoOverlap(intervals)
                self._num_no_overlap_groups += 1

    def _add_player_nonoverlap(self) -> None:
        allow = self.config.allow_player_overlap

        for player_id, p_matches in self._player_matches().items():
            if len(p_matches) <= 1:
                continue

            if not allow:
                self.model.AddNoOverlap([self.svars.interval[m.id] for m in p_matches])
                self._num_no_overlap_groups += 1
                continue

            # Soft overlap: pairwise overlap amount = max(0, min(end_i, end_j) - max(start_i, start_j)).
            for i in range(len(p_matches)):
                for j in range(i + 1, len(p_matches)):
                    m_i, m_j = p_matches[i], p_matches[j]
                    T = self.config.total_slots
                    min_end = self.model.NewIntVar(0, T, f"minend_{m_i.id}_{m_j.id}_{player_id}")
                    max_start = self.model.NewIntVar(0, T, f"maxstart_{m_i.id}_{m_j.id}_{player_id}")
                    self.model.AddMinEquality(min_end, [self.svars.end[m_i.id], self.svars.end[m_j.id]])
                    self.model.AddMaxEquality(max_start, [self.svars.start[m_i.id], self.svars.start[m_j.id]])
                    overlap = self.model.NewIntVar(0, T, f"overlap_{m_i.id}_{m_j.id}_{player_id}")
                    self.model.AddMaxEquality(overlap, [0, min_end - max_start])
                    self.overlap_slack.append(overlap)

    def _add_availability(self) -> None:
        for match_id, match in self.matches.items():
            allowed = self._allowed_starts(match)
            if allowed is None:
                continue  # no availability data — unconstrained
            if not allowed:
                self.infeasible_reasons.append(
                    f"Match {match.event_code}: no valid time slots available"
                )
                continue
            self.model.AddAllowedAssignments([self.svars.start[match_id]], allowed)

    def _add_locks_and_pins(self) -> None:
        T = self.config.total_slots
        C = self.config.court_count

        for match_id, assignment in self.previous_assignments.items():
            if match_id not in self.matches:
                continue
            match = self.matches[match_id]
            d = match.duration_slots

            if assignment.locked:
                if not (0 <= assignment.slot_id <= T - d and 1 <= assignment.court_id <= C):
                    self.infeasible_reasons.append(
                        f"Match {match.event_code}: locked assignment ({assignment.slot_id}, {assignment.court_id}) is invalid"
                    )
                    continue
                self.model.Add(self.svars.start[match_id] == assignment.slot_id)
                self.model.Add(self.svars.court[match_id] == assignment.court_id)
                continue

            if assignment.pinned_slot_id is not None:
                self.model.Add(self.svars.start[match_id] == assignment.pinned_slot_id)
            if assignment.pinned_court_id is not None:
                self.model.Add(self.svars.court[match_id] == assignment.pinned_court_id)

    def _add_freeze_horizon(self) -> None:
        cutoff = self.config.current_slot + self.config.freeze_horizon_slots
        if cutoff <= self.config.current_slot:
            return

        for match_id, assignment in self.previous_assignments.items():
            if match_id not in self.matches or assignment.locked:
                continue
            if assignment.slot_id < cutoff:
                self.model.Add(self.svars.start[match_id] == assignment.slot_id)
                self.model.Add(self.svars.court[match_id] == assignment.court_id)
                self.locked_matches.add(match_id)

    def _add_rest(self) -> None:
        for player_id, p_matches in self._player_matches().items():
            if len(p_matches) <= 1:
                continue
            player = self.players.get(player_id)
            rest_slots = player.rest_slots if player else self.config.default_rest_slots
            is_hard = player.rest_is_hard if player else True

            for i in range(len(p_matches)):
                for j in range(i + 1, len(p_matches)):
                    m_i, m_j = p_matches[i], p_matches[j]
                    order = self.model.NewBoolVar(f"order_{m_i.id}_{m_j.id}_{player_id}")

                    if is_hard or not self.config.soft_rest_enabled:
                        self.model.Add(
                            self.svars.end[m_i.id] + rest_slots <= self.svars.start[m_j.id]
                        ).OnlyEnforceIf(order)
                        self.model.Add(
                            self.svars.end[m_j.id] + rest_slots <= self.svars.start[m_i.id]
                        ).OnlyEnforceIf(order.Not())
                    else:
                        slack = self.model.NewIntVar(
                            0, rest_slots, f"rest_slack_{m_i.id}_{m_j.id}_{player_id}"
                        )
                        self.rest_slack[(player_id, m_i.id, m_j.id)] = slack
                        self.model.Add(
                            self.svars.end[m_i.id] + rest_slots - slack <= self.svars.start[m_j.id]
                        ).OnlyEnforceIf(order)
                        self.model.Add(
                            self.svars.end[m_j.id] + rest_slots - slack <= self.svars.start[m_i.id]
                        ).OnlyEnforceIf(order.Not())

    def _add_game_proximity(self) -> None:
        if not self.config.enable_game_proximity:
            return
        min_spacing = self.config.min_game_spacing_slots
        max_spacing = self.config.max_game_spacing_slots
        if min_spacing is None and max_spacing is None:
            return

        T = self.config.total_slots

        for player_id, p_matches in self._player_matches().items():
            if len(p_matches) <= 1:
                continue

            for i in range(len(p_matches)):
                for j in range(i + 1, len(p_matches)):
                    m_i, m_j = p_matches[i], p_matches[j]
                    order = self.model.NewBoolVar(f"prox_order_{m_i.id}_{m_j.id}_{player_id}")

                    self.model.Add(
                        self.svars.end[m_i.id] <= self.svars.start[m_j.id]
                    ).OnlyEnforceIf(order)
                    self.model.Add(
                        self.svars.end[m_j.id] <= self.svars.start[m_i.id]
                    ).OnlyEnforceIf(order.Not())

                    if min_spacing is not None:
                        slack_min = self.model.NewIntVar(
                            0, min_spacing, f"prox_min_slack_{m_i.id}_{m_j.id}_{player_id}"
                        )
                        self.proximity_min_slack[(player_id, m_i.id, m_j.id)] = slack_min
                        self.model.Add(
                            self.svars.start[m_j.id] - self.svars.end[m_i.id] + slack_min >= min_spacing
                        ).OnlyEnforceIf(order)
                        self.model.Add(
                            self.svars.start[m_i.id] - self.svars.end[m_j.id] + slack_min >= min_spacing
                        ).OnlyEnforceIf(order.Not())

                    if max_spacing is not None:
                        slack_max = self.model.NewIntVar(
                            0, T, f"prox_max_slack_{m_i.id}_{m_j.id}_{player_id}"
                        )
                        self.proximity_max_slack[(player_id, m_i.id, m_j.id)] = slack_max
                        self.model.Add(
                            self.svars.start[m_j.id] - self.svars.end[m_i.id] - slack_max <= max_spacing
                        ).OnlyEnforceIf(order)
                        self.model.Add(
                            self.svars.start[m_i.id] - self.svars.end[m_j.id] - slack_max <= max_spacing
                        ).OnlyEnforceIf(order.Not())

    # ---- objective -----------------------------------------------------------

    def _build_objective(self) -> None:
        terms: List[cp_model.LinearExpr] = []
        T = self.config.total_slots

        # Soft rest
        if self.config.soft_rest_enabled:
            for (player_id, _m_i, _m_j), slack in self.rest_slack.items():
                player = self.players.get(player_id)
                penalty = player.rest_penalty if player else self.config.rest_slack_penalty
                terms.append(int(penalty * 10) * slack)

        # Game proximity
        if self.config.enable_game_proximity:
            penalty = int(self.config.game_proximity_penalty * 10)
            for slack in self.proximity_min_slack.values():
                terms.append(penalty * slack)
            for slack in self.proximity_max_slack.values():
                terms.append(penalty * slack)

        # Disruption + court change
        if self.previous_assignments and (
            self.config.disruption_penalty > 0 or self.config.court_change_penalty > 0
        ):
            for match_id, prev in self.previous_assignments.items():
                if match_id not in self.matches or match_id in self.locked_matches:
                    continue

                if self.config.disruption_penalty > 0:
                    abs_diff = self.model.NewIntVar(0, T, f"disrupt_{match_id}")
                    self.model.AddAbsEquality(abs_diff, self.svars.start[match_id] - prev.slot_id)
                    terms.append(int(self.config.disruption_penalty * 10) * abs_diff)

                if self.config.court_change_penalty > 0:
                    same_court = self.model.NewBoolVar(f"same_court_{match_id}")
                    self.model.Add(self.svars.court[match_id] == prev.court_id).OnlyEnforceIf(same_court)
                    self.model.Add(self.svars.court[match_id] != prev.court_id).OnlyEnforceIf(same_court.Not())
                    terms.append(int(self.config.court_change_penalty * 10) * (1 - same_court))

        # Late finish
        if self.config.late_finish_penalty > 0:
            penalty = int(self.config.late_finish_penalty * 10)
            for match_id in self.matches:
                if match_id in self.locked_matches:
                    continue
                terms.append(penalty * self.svars.start[match_id])

        # Compact schedule
        if self.config.enable_compact_schedule and self.config.compact_schedule_penalty > 0:
            mode = self.config.compact_schedule_mode
            penalty = int(self.config.compact_schedule_penalty * 10)
            active_ends = [self.svars.end[m_id] for m_id in self.matches if m_id not in self.locked_matches]

            if mode == "minimize_makespan" and active_ends:
                makespan = self.model.NewIntVar(0, T, "makespan")
                self.model.AddMaxEquality(makespan, active_ends)
                terms.append(penalty * makespan)

            elif mode == "no_gaps" and active_ends:
                # Approximate no-gaps by minimizing residual idle = makespan*C - Σ durations(active).
                # This keeps the objective small and linear and captures the same intent:
                # pack matches tightly by pushing makespan down.
                makespan = self.model.NewIntVar(0, T, "makespan_nogaps")
                self.model.AddMaxEquality(makespan, active_ends)
                total_active_duration = sum(
                    self.matches[m_id].duration_slots
                    for m_id in self.matches
                    if m_id not in self.locked_matches
                )
                idle = self.model.NewIntVar(0, T * self.config.court_count, "idle_slots")
                self.model.Add(idle == makespan * self.config.court_count - total_active_duration)
                terms.append(penalty * idle)

            elif mode == "finish_by_time":
                target = self.config.target_finish_slot
                if target is not None:
                    for match_id in self.matches:
                        if match_id in self.locked_matches:
                            continue
                        overshoot = self.model.NewIntVar(0, T, f"overshoot_{match_id}")
                        self.model.Add(overshoot >= self.svars.end[match_id] - target)
                        terms.append(penalty * overshoot)

        # Player overlap (soft)
        if self.config.allow_player_overlap and self.config.player_overlap_penalty > 0:
            penalty = int(self.config.player_overlap_penalty * 10)
            for overlap in self.overlap_slack:
                terms.append(penalty * overlap)

        if terms:
            self.model.Minimize(sum(terms))

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

        self._add_court_capacity()
        self._add_player_nonoverlap()
        self._add_availability()
        self._add_locks_and_pins()
        self._add_freeze_horizon()
        self._add_rest()
        self._add_game_proximity()
        self._build_objective()

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

    def solve(self, progress_callback: Optional[Callable[[dict], None]] = None) -> ScheduleResult:
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

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.solver_options.time_limit_seconds
        solver.parameters.num_search_workers = self.solver_options.num_workers
        solver.parameters.random_seed = self.solver_options.random_seed
        solver.parameters.log_search_progress = self.solver_options.log_progress

        if progress_callback is not None:
            callback = ProgressCallback(
                callback_fn=progress_callback,
                svars=self.svars,
                matches=self.matches,
                model_stats=model_stats,
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
        )
