"""CP-SAT Tournament Scheduling Algorithm.

Uses Google OR-Tools CP-SAT solver to find optimal match schedules.

Decision Variables:
- x[m,t,c] ∈ {0,1}: match m starts at slot t on court c

Hard Constraints:
1. Each match scheduled exactly once
2. Court capacity: at most one match per court per slot
3. Player non-overlap: players can't be in multiple matches simultaneously
4. Availability: respect player availability windows
5. Locks/pins: respect locked and pinned assignments
6. Freeze horizon: treat near-future assignments as locked

Soft Constraints (with penalties):
- Rest between matches (can be hard or soft)
- Disruption from previous schedule
- Late finish penalty
"""
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
from scheduler_core.engine.variables import create_variables, link_start_to_x


class ProgressCallback(cp_model.CpSolverSolutionCallback):
    """
    Callback for tracking CP-SAT solver progress.

    Captures intermediate solutions during the solve process and reports
    progress metrics like objective value, best bound, and elapsed time.
    Also extracts current assignments to visualize solver progress.
    """

    def __init__(
        self,
        callback_fn: Optional[Callable[[dict], None]] = None,
        x: Optional[Dict[Tuple[str, int, int], cp_model.IntVar]] = None,
        matches: Optional[Dict[str, Match]] = None,
        model_stats: Optional[Dict[str, int]] = None,
    ):
        """
        Initialize progress callback.

        Args:
            callback_fn: Optional function to call with progress updates.
                        Receives dict with keys: elapsed_ms, current_objective, best_bound
            x: Decision variables mapping (match_id, slot, court) -> IntVar
            matches: Match data for extracting assignment metadata
            model_stats: Optional model statistics for verbose logging
        """
        super().__init__()
        self.callback_fn = callback_fn
        self.x = x or {}
        self.matches = matches or {}
        self.model_stats = model_stats or {}
        self.start_time = time_module.perf_counter()
        self.solution_count = 0
        self.last_objective = None
        self.last_gap_checkpoint = 100  # Track gap milestones
        self.time_checkpoints = {5: False, 10: False, 30: False, 60: False}  # seconds
        self.initial_stats_sent = False  # Track if we've sent initial model stats

    def on_solution_callback(self) -> None:
        """Called by solver when a new solution is found."""
        self.solution_count += 1
        elapsed_ms = (time_module.perf_counter() - self.start_time) * 1000
        elapsed_sec = elapsed_ms / 1000

        # Extract current solution assignments
        current_assignments = []
        if self.x and self.matches:
            for (match_id, t, c), var in self.x.items():
                if self.Value(var) == 1:
                    match = self.matches.get(match_id)
                    duration = match.duration_slots if match else 1
                    current_assignments.append({
                        'matchId': match_id,
                        'slotId': t,
                        'courtId': c,
                        'durationSlots': duration,
                    })

        # Calculate optimality gap
        current_obj = self.ObjectiveValue()
        best_bound = self.BestObjectiveBound()
        gap_percent = None
        if best_bound != 0:
            gap_percent = abs(current_obj - best_bound) / abs(best_bound) * 100

        # Generate verbose messages
        messages = []

        # Time checkpoint messages (always show)
        for checkpoint, reported in self.time_checkpoints.items():
            if not reported and elapsed_sec >= checkpoint:
                self.time_checkpoints[checkpoint] = True
                gap_info = f', {gap_percent:.2f}% gap' if gap_percent is not None else ''
                messages.append({
                    'type': 'progress',
                    'text': f'Still searching... {int(elapsed_sec)}s elapsed{gap_info}'
                })

        # Gap milestone messages (report when gap drops significantly)
        if gap_percent is not None:
            gap_milestones = [50, 20, 10, 5, 2, 1, 0.5, 0.1]
            for milestone in gap_milestones:
                if self.last_gap_checkpoint > milestone >= gap_percent:
                    self.last_gap_checkpoint = milestone
                    if milestone <= 5:
                        messages.append({
                            'type': 'progress',
                            'text': f'Approaching optimal: {gap_percent:.1f}% gap'
                        })
                    break

        # First solution - include model stats and initial solution message
        if self.solution_count == 1 and not self.initial_stats_sent:
            self.initial_stats_sent = True
            # Add model stats first
            if self.model_stats:
                messages.append({
                    'type': 'progress',
                    'text': f'Model: {self.model_stats.get("num_matches", 0)} matches, {self.model_stats.get("num_variables", 0)} variables'
                })
                if self.model_stats.get('multi_match_players', 0) > 0:
                    messages.append({
                        'type': 'progress',
                        'text': f'Scheduling {self.model_stats["multi_match_players"]} players with multiple events'
                    })
                if self.model_stats.get('difficulty'):
                    messages.append({
                        'type': 'progress',
                        'text': f'Problem complexity: {self.model_stats["difficulty"]}'
                    })
            # Then add initial solution message
            messages.append({
                'type': 'progress',
                'text': f'Initial solution found with score {int(current_obj)}'
            })

        # Large improvement message (threshold: 100 points)
        if self.last_objective is not None and current_obj < self.last_objective:
            improvement = self.last_objective - current_obj
            if improvement >= 100:
                messages.append({
                    'type': 'progress',
                    'text': f'Major improvement: -{int(improvement)} points'
                })
        self.last_objective = current_obj

        if self.callback_fn:
            progress_data = {
                'elapsed_ms': int(elapsed_ms),
                'current_objective': current_obj,
                'best_bound': best_bound,
                'solution_count': self.solution_count,
                'current_assignments': current_assignments,
                'gap_percent': gap_percent,
                'messages': messages,
            }
            self.callback_fn(progress_data)


class CPSATScheduler:
    """
    CP-SAT based tournament scheduler.
    
    Builds and solves a constraint satisfaction problem to find optimal
    match schedules respecting all hard constraints while minimizing
    soft constraint violations.
    """
    
    def __init__(
        self,
        config: ScheduleConfig,
        solver_options: Optional[SolverOptions] = None,
    ):
        self.config = config
        self.solver_options = solver_options or SolverOptions()
        
        # Model components
        self.model = cp_model.CpModel()
        
        # Data structures
        self.matches: Dict[str, Match] = {}
        self.players: Dict[str, Player] = {}
        self.previous_assignments: Dict[str, PreviousAssignment] = {}
        
        # Decision variables: x[match_id, slot, court] = bool
        self.x: Dict[Tuple[str, int, int], cp_model.IntVar] = {}
        
        # Auxiliary variables for objectives
        self.start_slot: Dict[str, cp_model.IntVar] = {}
        self.end_slot: Dict[str, cp_model.IntVar] = {}
        
        # Soft constraint slack variables
        self.rest_slack: Dict[Tuple[str, str, str], cp_model.IntVar] = {}
        self.proximity_min_slack: Dict[Tuple[str, str, str], cp_model.IntVar] = {}
        self.proximity_max_slack: Dict[Tuple[str, str, str], cp_model.IntVar] = {}
        self.overlap_violations: List[cp_model.IntVar] = []

        # Tracking
        self.infeasible_reasons: List[str] = []
        self.locked_matches: Set[str] = set()
    
    def add_matches(self, matches: List[Match]) -> None:
        """Add matches to be scheduled."""
        for match in matches:
            self.matches[match.id] = match
    
    def add_players(self, players: List[Player]) -> None:
        """Add players with their constraints."""
        for player in players:
            self.players[player.id] = player
    
    def set_previous_assignments(self, assignments: List[PreviousAssignment]) -> None:
        """Set previous assignments for re-optimization."""
        for assignment in assignments:
            self.previous_assignments[assignment.match_id] = assignment
            if assignment.locked:
                self.locked_matches.add(assignment.match_id)
    
    def _create_variables(self) -> None:
        """Create decision variables."""
        self.x, self.start_slot, self.end_slot = create_variables(
            self.model, self.matches, self.config
        )
    
    def _link_start_to_x(self) -> None:
        """Link start slot variables to x decision variables."""
        link_start_to_x(self.model, self.matches, self.config, self.x, self.start_slot)
    
    def _add_exactly_once_constraint(self) -> None:
        """Each match scheduled exactly once."""
        T = self.config.total_slots
        C = self.config.court_count
        
        for match_id, match in self.matches.items():
            d = match.duration_slots
            max_start = T - d
            
            all_vars = [
                self.x[(match_id, t, c)]
                for t in range(max_start + 1)
                for c in range(1, C + 1)
                if (match_id, t, c) in self.x
            ]
            
            if all_vars:
                self.model.AddExactlyOne(all_vars)
            else:
                self.infeasible_reasons.append(
                    f"Match {match.event_code}: no valid time slots available"
                )
    
    def _add_court_capacity_constraint(self) -> None:
        """Court capacity: at most one match per court per slot."""
        T = self.config.total_slots
        C = self.config.court_count
        
        for s in range(T):
            for c in range(1, C + 1):
                overlapping_vars = []
                
                for match_id, match in self.matches.items():
                    d = match.duration_slots
                    for t in range(max(0, s - d + 1), s + 1):
                        if (match_id, t, c) in self.x:
                            overlapping_vars.append(self.x[(match_id, t, c)])
                
                if len(overlapping_vars) > 1:
                    self.model.Add(sum(overlapping_vars) <= 1)
    
    def _add_player_nonoverlap_constraint(self) -> None:
        """Player non-overlap: each player in at most one match per slot.

        If allow_player_overlap is True, this becomes a soft constraint with penalty.
        """
        T = self.config.total_slots
        C = self.config.court_count
        allow_overlap = self.config.allow_player_overlap

        player_matches: Dict[str, List[Match]] = defaultdict(list)
        for match in self.matches.values():
            for player_id in get_player_ids(match):
                player_matches[player_id].append(match)

        for player_id, matches in player_matches.items():
            if len(matches) <= 1:
                continue

            for s in range(T):
                overlapping_vars = []

                for match in matches:
                    d = match.duration_slots
                    for t in range(max(0, s - d + 1), s + 1):
                        for c in range(1, C + 1):
                            if (match.id, t, c) in self.x:
                                overlapping_vars.append(self.x[(match.id, t, c)])

                if len(overlapping_vars) > 1:
                    if allow_overlap:
                        # Soft constraint: allow overlap but track violations
                        # violation = max(0, sum(overlapping_vars) - 1)
                        violation = self.model.NewIntVar(
                            0, len(overlapping_vars) - 1,
                            f"overlap_{player_id}_{s}"
                        )
                        self.model.Add(violation >= sum(overlapping_vars) - 1)
                        self.overlap_violations.append(violation)
                    else:
                        # Hard constraint: no overlap allowed
                        self.model.Add(sum(overlapping_vars) <= 1)
    
    def _add_availability_constraint(self) -> None:
        """Availability: respect player availability windows."""
        T = self.config.total_slots
        C = self.config.court_count
        
        for match_id, match in self.matches.items():
            d = match.duration_slots
            
            for player_id in get_player_ids(match):
                player = self.players.get(player_id)
                if not player or not player.availability:
                    continue
                
                for t in range(T - d + 1):
                    match_range = range(t, t + d)
                    
                    is_available = False
                    for start, end in player.availability:
                        if all(start <= s < end for s in match_range):
                            is_available = True
                            break
                    
                    if not is_available:
                        for c in range(1, C + 1):
                            if (match_id, t, c) in self.x:
                                self.model.Add(self.x[(match_id, t, c)] == 0)
    
    def _add_lock_pin_constraints(self) -> None:
        """Locks and pins: respect locked and pinned assignments."""
        T = self.config.total_slots
        C = self.config.court_count
        
        for match_id, assignment in self.previous_assignments.items():
            if match_id not in self.matches:
                continue
            
            match = self.matches[match_id]
            d = match.duration_slots
            
            if assignment.locked:
                t_star = assignment.slot_id
                c_star = assignment.court_id
                
                if (match_id, t_star, c_star) in self.x:
                    self.model.Add(self.x[(match_id, t_star, c_star)] == 1)
                else:
                    self.infeasible_reasons.append(
                        f"Match {match.event_code}: locked assignment ({t_star}, {c_star}) is invalid"
                    )
            else:
                if assignment.pinned_slot_id is not None:
                    t_pin = assignment.pinned_slot_id
                    for t in range(T - d + 1):
                        if t != t_pin:
                            for c in range(1, C + 1):
                                if (match_id, t, c) in self.x:
                                    self.model.Add(self.x[(match_id, t, c)] == 0)
                
                if assignment.pinned_court_id is not None:
                    c_pin = assignment.pinned_court_id
                    for t in range(T - d + 1):
                        for c in range(1, C + 1):
                            if c != c_pin and (match_id, t, c) in self.x:
                                self.model.Add(self.x[(match_id, t, c)] == 0)
    
    def _add_freeze_horizon_constraint(self) -> None:
        """Freeze horizon: treat near-future assignments as locked."""
        horizon = self.config.freeze_horizon_slots
        current = self.config.current_slot
        freeze_until = current + horizon
        
        for match_id, assignment in self.previous_assignments.items():
            if match_id not in self.matches or assignment.locked:
                continue
            
            if assignment.slot_id < freeze_until:
                t_star = assignment.slot_id
                c_star = assignment.court_id
                
                if (match_id, t_star, c_star) in self.x:
                    self.model.Add(self.x[(match_id, t_star, c_star)] == 1)
                    self.locked_matches.add(match_id)
    
    def _add_rest_constraint(self) -> None:
        """Rest constraint: minimum rest between matches for each player."""
        player_matches: Dict[str, List[Match]] = defaultdict(list)
        for match in self.matches.values():
            for player_id in get_player_ids(match):
                player_matches[player_id].append(match)
        
        for player_id, matches in player_matches.items():
            if len(matches) <= 1:
                continue
            
            player = self.players.get(player_id)
            rest_slots = player.rest_slots if player else self.config.default_rest_slots
            is_hard = player.rest_is_hard if player else True
            penalty = player.rest_penalty if player else self.config.rest_slack_penalty
            
            for i in range(len(matches)):
                for j in range(i + 1, len(matches)):
                    m_i = matches[i]
                    m_j = matches[j]
                    
                    b_ij = self.model.NewBoolVar(f"order_{m_i.id}_{m_j.id}_{player_id}")
                    
                    if is_hard or not self.config.soft_rest_enabled:
                        self.model.Add(
                            self.end_slot[m_i.id] + rest_slots <= self.start_slot[m_j.id]
                        ).OnlyEnforceIf(b_ij)
                        self.model.Add(
                            self.end_slot[m_j.id] + rest_slots <= self.start_slot[m_i.id]
                        ).OnlyEnforceIf(b_ij.Not())
                    else:
                        slack = self.model.NewIntVar(0, rest_slots, f"rest_slack_{m_i.id}_{m_j.id}_{player_id}")
                        self.rest_slack[(player_id, m_i.id, m_j.id)] = slack
                        
                        self.model.Add(
                            self.end_slot[m_i.id] + rest_slots - slack <= self.start_slot[m_j.id]
                        ).OnlyEnforceIf(b_ij)
                        self.model.Add(
                            self.end_slot[m_j.id] + rest_slots - slack <= self.start_slot[m_i.id]
                        ).OnlyEnforceIf(b_ij.Not())

    def _add_game_proximity_constraint(self) -> None:
        """Game proximity constraint: control spacing between consecutive games for each player.

        This soft constraint penalizes games that are too close together (min_game_spacing_slots)
        or too far apart (max_game_spacing_slots) for the same player.
        """
        if not self.config.enable_game_proximity:
            return

        min_spacing = self.config.min_game_spacing_slots
        max_spacing = self.config.max_game_spacing_slots

        if min_spacing is None and max_spacing is None:
            return

        # Build player -> matches mapping
        player_matches: Dict[str, List[Match]] = defaultdict(list)
        for match in self.matches.values():
            for player_id in get_player_ids(match):
                player_matches[player_id].append(match)

        for player_id, matches in player_matches.items():
            if len(matches) <= 1:
                continue

            # For each pair of matches involving this player
            for i in range(len(matches)):
                for j in range(i + 1, len(matches)):
                    m_i = matches[i]
                    m_j = matches[j]

                    # Create ordering variable: b_ij = 1 means m_i ends before m_j starts
                    b_ij = self.model.NewBoolVar(f"prox_order_{m_i.id}_{m_j.id}_{player_id}")

                    # Link b_ij to actual match ordering
                    # b_ij = 1 <=> end[m_i] <= start[m_j]
                    # We use: b_ij => (end[m_i] <= start[m_j]) AND !b_ij => (end[m_j] <= start[m_i])
                    # Since player non-overlap ensures matches don't overlap, exactly one must be true
                    self.model.Add(
                        self.end_slot[m_i.id] <= self.start_slot[m_j.id]
                    ).OnlyEnforceIf(b_ij)
                    self.model.Add(
                        self.end_slot[m_j.id] <= self.start_slot[m_i.id]
                    ).OnlyEnforceIf(b_ij.Not())

                    if min_spacing is not None:
                        # Soft minimum spacing constraint
                        # If gap < min_spacing, add slack penalty
                        slack_min = self.model.NewIntVar(
                            0, min_spacing,
                            f"prox_min_slack_{m_i.id}_{m_j.id}_{player_id}"
                        )
                        self.proximity_min_slack[(player_id, m_i.id, m_j.id)] = slack_min

                        # When m_i before m_j (b_ij=1): start[m_j] - end[m_i] + slack >= min_spacing
                        self.model.Add(
                            self.start_slot[m_j.id] - self.end_slot[m_i.id] + slack_min >= min_spacing
                        ).OnlyEnforceIf(b_ij)

                        # When m_j before m_i (b_ij=0): start[m_i] - end[m_j] + slack >= min_spacing
                        self.model.Add(
                            self.start_slot[m_i.id] - self.end_slot[m_j.id] + slack_min >= min_spacing
                        ).OnlyEnforceIf(b_ij.Not())

                    if max_spacing is not None:
                        # Soft maximum spacing constraint
                        # If gap > max_spacing, add slack penalty
                        max_possible_gap = self.config.total_slots
                        slack_max = self.model.NewIntVar(
                            0, max_possible_gap,
                            f"prox_max_slack_{m_i.id}_{m_j.id}_{player_id}"
                        )
                        self.proximity_max_slack[(player_id, m_i.id, m_j.id)] = slack_max

                        # When m_i before m_j (b_ij=1): start[m_j] - end[m_i] - slack <= max_spacing
                        self.model.Add(
                            self.start_slot[m_j.id] - self.end_slot[m_i.id] - slack_max <= max_spacing
                        ).OnlyEnforceIf(b_ij)

                        # When m_j before m_i (b_ij=0): start[m_i] - end[m_j] - slack <= max_spacing
                        self.model.Add(
                            self.start_slot[m_i.id] - self.end_slot[m_j.id] - slack_max <= max_spacing
                        ).OnlyEnforceIf(b_ij.Not())

    def _build_objective(self) -> None:
        """Build the objective function to minimize."""
        objective_terms = []

        # Court utilization: minimize idle court time
        if self.config.enable_court_utilization and self.config.court_utilization_penalty > 0:
            T = self.config.total_slots
            C = self.config.court_count

            # Create boolean variables to track court occupancy
            court_occupied = {}
            for s in range(T):
                for c in range(1, C + 1):
                    court_occupied[(s, c)] = self.model.NewBoolVar(f"court_occupied_{s}_{c}")

                    # Collect all matches that could occupy this court at this slot
                    occupying_vars = []
                    for match_id, match in self.matches.items():
                        d = match.duration_slots
                        # A match starting at time t occupies slots [t, t+d)
                        # So slot s is occupied if match starts at any t in [s-d+1, s]
                        for t in range(max(0, s - d + 1), s + 1):
                            if (match_id, t, c) in self.x:
                                occupying_vars.append(self.x[(match_id, t, c)])

                    # Court is occupied if any match is scheduled on it at this slot
                    if occupying_vars:
                        # court_occupied = OR(all occupying vars)
                        # In CP-SAT: court_occupied >= each var, and court_occupied <= sum(vars)
                        for var in occupying_vars:
                            self.model.Add(court_occupied[(s, c)] >= var)
                        self.model.Add(court_occupied[(s, c)] <= sum(occupying_vars))

            # Count idle court-slots (total possible - occupied)
            total_court_slots = T * C
            occupied_count = sum(court_occupied.values())
            idle_slots = self.model.NewIntVar(0, total_court_slots, "idle_court_slots")
            self.model.Add(idle_slots == total_court_slots - occupied_count)

            # Penalize idle time
            objective_terms.append(int(self.config.court_utilization_penalty * 10) * idle_slots)

        # Rest slack penalties
        if self.config.soft_rest_enabled:
            for (player_id, m_i, m_j), slack in self.rest_slack.items():
                player = self.players.get(player_id)
                penalty = player.rest_penalty if player else self.config.rest_slack_penalty
                objective_terms.append(int(penalty * 10) * slack)

        # Game proximity penalties
        if self.config.enable_game_proximity:
            penalty = self.config.game_proximity_penalty
            # Minimum spacing violations (games too close)
            for slack in self.proximity_min_slack.values():
                objective_terms.append(int(penalty * 10) * slack)
            # Maximum spacing violations (games too far apart)
            for slack in self.proximity_max_slack.values():
                objective_terms.append(int(penalty * 10) * slack)

        # Disruption penalty
        if self.previous_assignments and self.config.disruption_penalty > 0:
            for match_id, prev in self.previous_assignments.items():
                if match_id not in self.matches or match_id in self.locked_matches:
                    continue

                prev_start = prev.slot_id
                diff_pos = self.model.NewIntVar(0, self.config.total_slots, f"diff_pos_{match_id}")
                diff_neg = self.model.NewIntVar(0, self.config.total_slots, f"diff_neg_{match_id}")

                self.model.Add(self.start_slot[match_id] - prev_start == diff_pos - diff_neg)
                objective_terms.append(int(self.config.disruption_penalty * 10) * (diff_pos + diff_neg))

                if self.config.court_change_penalty > 0:
                    prev_court = prev.court_id
                    court_changed = self.model.NewBoolVar(f"court_changed_{match_id}")

                    match = self.matches[match_id]
                    d = match.duration_slots
                    same_court_vars = []

                    for t in range(self.config.total_slots - d + 1):
                        if (match_id, t, prev_court) in self.x:
                            same_court_vars.append(self.x[(match_id, t, prev_court)])

                    if same_court_vars:
                        self.model.Add(sum(same_court_vars) + court_changed == 1)
                        objective_terms.append(int(self.config.court_change_penalty * 10) * court_changed)

        # Late finish penalty
        if self.config.late_finish_penalty > 0:
            for match_id in self.matches:
                if match_id in self.locked_matches:
                    continue
                objective_terms.append(int(self.config.late_finish_penalty * 10) * self.start_slot[match_id])

        # Compact schedule modes
        if self.config.enable_compact_schedule and self.config.compact_schedule_penalty > 0:
            mode = self.config.compact_schedule_mode
            penalty = int(self.config.compact_schedule_penalty * 10)

            if mode == "minimize_makespan":
                # Minimize latest finish time
                max_possible_end = self.config.total_slots
                makespan = self.model.NewIntVar(0, max_possible_end, "makespan")
                for match_id in self.matches:
                    if match_id not in self.locked_matches:
                        self.model.Add(makespan >= self.end_slot[match_id])
                objective_terms.append(penalty * makespan)

            elif mode == "no_gaps":
                # Heavily penalize idle court slots - more aggressive than court utilization
                T = self.config.total_slots
                C = self.config.court_count
                for s in range(T):
                    for c in range(1, C + 1):
                        occupying_vars = []
                        for match_id, match in self.matches.items():
                            d = match.duration_slots
                            for t in range(max(0, s - d + 1), s + 1):
                                if (match_id, t, c) in self.x:
                                    occupying_vars.append(self.x[(match_id, t, c)])
                        if occupying_vars:
                            is_idle = self.model.NewBoolVar(f"idle_{s}_{c}")
                            self.model.Add(sum(occupying_vars) == 0).OnlyEnforceIf(is_idle)
                            self.model.Add(sum(occupying_vars) >= 1).OnlyEnforceIf(is_idle.Not())
                            objective_terms.append(penalty * is_idle)

            elif mode == "finish_by_time":
                # Penalize matches ending after target slot
                target = self.config.target_finish_slot
                if target is not None:
                    for match_id in self.matches:
                        if match_id not in self.locked_matches:
                            overshoot = self.model.NewIntVar(0, self.config.total_slots, f"overshoot_{match_id}")
                            self.model.Add(overshoot >= self.end_slot[match_id] - target)
                            objective_terms.append(penalty * overshoot)

        # Player overlap penalty (when soft overlap is enabled)
        if self.config.allow_player_overlap and self.config.player_overlap_penalty > 0:
            for violation in self.overlap_violations:
                objective_terms.append(int(self.config.player_overlap_penalty * 10) * violation)

        if objective_terms:
            self.model.Minimize(sum(objective_terms))
    
    def build(self) -> None:
        """Build the complete CP-SAT model."""
        log_build_start(
            len(self.matches),
            len(self.players),
            self.config.total_slots,
            self.config.court_count,
        )
        self._create_variables()
        self._link_start_to_x()
        self._add_exactly_once_constraint()
        self._add_court_capacity_constraint()
        self._add_player_nonoverlap_constraint()
        self._add_availability_constraint()
        self._add_lock_pin_constraints()
        self._add_freeze_horizon_constraint()
        self._add_rest_constraint()
        self._add_game_proximity_constraint()
        self._build_objective()
        log_build_end(len(self.matches))

    def _compute_model_stats(self) -> Dict[str, int]:
        """Compute model statistics for verbose logging."""
        # Count player overlaps (players in multiple matches)
        player_match_count: Dict[str, int] = defaultdict(int)
        for match in self.matches.values():
            for player_id in get_player_ids(match):
                player_match_count[player_id] += 1

        multi_match_players = sum(1 for count in player_match_count.values() if count > 1)
        max_matches_per_player = max(player_match_count.values()) if player_match_count else 0

        return {
            'num_matches': len(self.matches),
            'num_players': len(self.players),
            'num_variables': len(self.x),
            'total_slots': self.config.total_slots,
            'court_count': self.config.court_count,
            'multi_match_players': multi_match_players,
            'max_matches_per_player': max_matches_per_player,
            'locked_count': len(self.locked_matches),
        }

    def _estimate_difficulty(self, stats: Dict[str, int]) -> str:
        """Estimate problem difficulty based on model stats."""
        # Simple heuristic based on problem size
        complexity = stats['num_matches'] * stats['multi_match_players']
        vars_per_match = stats['num_variables'] / max(stats['num_matches'], 1)

        if complexity < 50 and vars_per_match < 50:
            return 'simple'
        elif complexity < 200 or vars_per_match < 100:
            return 'moderate'
        elif complexity < 500:
            return 'complex'
        else:
            return 'very complex'

    def solve(self, progress_callback: Optional[Callable[[dict], None]] = None) -> ScheduleResult:
        """
        Solve the model and return results.

        Args:
            progress_callback: Optional function to receive progress updates during solving.
                              Called with dict containing elapsed_ms, current_objective, best_bound.

        Returns:
            ScheduleResult with status, assignments, and metrics.
        """
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

        # Compute model statistics for verbose logging (passed to callback)
        model_stats = self._compute_model_stats()
        model_stats['difficulty'] = self._estimate_difficulty(model_stats)

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.solver_options.time_limit_seconds
        solver.parameters.num_search_workers = self.solver_options.num_workers
        solver.parameters.log_search_progress = self.solver_options.log_progress

        # Use solution callback if progress tracking is requested
        if progress_callback:
            callback = ProgressCallback(
                callback_fn=progress_callback,
                x=self.x,
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
                solver,
                self.matches,
                self.players,
                self.previous_assignments,
                self.locked_matches,
                self.x,
                self.rest_slack,
                self.proximity_min_slack,
                self.proximity_max_slack,
                self.config,
                solver_status,
                runtime_ms,
            )
            log_solution_extraction(len(assignments), moved_count, len(self.locked_matches))
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
        else:
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
