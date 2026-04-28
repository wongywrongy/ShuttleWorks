"""Objective composer.

Sums the per-component soft penalties:
- soft rest slack
- game proximity slack (min + max)
- disruption (|start - previous_start|)
- court change (1 if court_id != previous_court)
- late finish (start * weight)
- compact schedule (makespan / no-gaps / finish-by-time)
- player overlap (when ``allow_player_overlap``)

Reads slack variables that earlier constraint plugins (rest,
game_proximity, player_no_overlap) populated on the context. Must run
*after* those plugins in the spec list.

The integer scaling factor of 10 mirrors the legacy backend so float
penalty values like ``5.5`` and ``0.5`` survive the float→int cast
with sub-integer precision.
"""
from __future__ import annotations

from scheduler_core.engine.constraints import (
    Constraint,
    ConstraintContext,
    register_constraint,
)


@register_constraint
class Objective:
    name = "objective"

    def __init__(
        self,
        *,
        # Disruption + court change
        disruption_penalty: float = 1.0,
        court_change_penalty: float = 0.5,
        late_finish_penalty: float = 0.5,
        # Compact schedule
        compact_enabled: bool = False,
        compact_mode: str = "minimize_makespan",
        compact_penalty: float = 100.0,
        target_finish_slot: int | None = None,
        # Soft rest (read-only — slack vars populated by RestBetweenMatches)
        soft_rest_enabled: bool = False,
        rest_slack_penalty: float = 10.0,
        # Game proximity (read-only — slack vars populated by GameProximity)
        game_proximity_enabled: bool = False,
        game_proximity_penalty: float = 5.0,
        # Player overlap (read-only — slack list populated by PlayerNoOverlap)
        allow_player_overlap: bool = False,
        player_overlap_penalty: float = 50.0,
    ) -> None:
        self.disruption_penalty = disruption_penalty
        self.court_change_penalty = court_change_penalty
        self.late_finish_penalty = late_finish_penalty
        self.compact_enabled = compact_enabled
        self.compact_mode = compact_mode
        self.compact_penalty = compact_penalty
        self.target_finish_slot = target_finish_slot
        self.soft_rest_enabled = soft_rest_enabled
        self.rest_slack_penalty = rest_slack_penalty
        self.game_proximity_enabled = game_proximity_enabled
        self.game_proximity_penalty = game_proximity_penalty
        self.allow_player_overlap = allow_player_overlap
        self.player_overlap_penalty = player_overlap_penalty

    def apply(self, ctx: ConstraintContext) -> None:
        terms = []
        T = ctx.config.total_slots

        # Soft rest
        if self.soft_rest_enabled:
            for (player_id, _m_i, _m_j), slack in ctx.rest_slack.items():
                player = ctx.players.get(player_id)
                penalty = player.rest_penalty if player else self.rest_slack_penalty
                terms.append(int(penalty * 10) * slack)

        # Game proximity
        if self.game_proximity_enabled:
            penalty = int(self.game_proximity_penalty * 10)
            for slack in ctx.proximity_min_slack.values():
                terms.append(penalty * slack)
            for slack in ctx.proximity_max_slack.values():
                terms.append(penalty * slack)

        # Disruption + court change
        if ctx.previous_assignments and (
            self.disruption_penalty > 0 or self.court_change_penalty > 0
        ):
            for match_id, prev in ctx.previous_assignments.items():
                if match_id not in ctx.matches or match_id in ctx.locked_matches:
                    continue

                if self.disruption_penalty > 0:
                    abs_diff = ctx.model.NewIntVar(0, T, f"disrupt_{match_id}")
                    ctx.model.AddAbsEquality(abs_diff, ctx.svars.start[match_id] - prev.slot_id)
                    terms.append(int(self.disruption_penalty * 10) * abs_diff)

                if self.court_change_penalty > 0:
                    same_court = ctx.model.NewBoolVar(f"same_court_{match_id}")
                    ctx.model.Add(ctx.svars.court[match_id] == prev.court_id).OnlyEnforceIf(same_court)
                    ctx.model.Add(ctx.svars.court[match_id] != prev.court_id).OnlyEnforceIf(same_court.Not())
                    terms.append(int(self.court_change_penalty * 10) * (1 - same_court))

        # Late finish
        if self.late_finish_penalty > 0:
            penalty = int(self.late_finish_penalty * 10)
            for match_id in ctx.matches:
                if match_id in ctx.locked_matches:
                    continue
                terms.append(penalty * ctx.svars.start[match_id])

        # Compact schedule
        if self.compact_enabled and self.compact_penalty > 0:
            penalty = int(self.compact_penalty * 10)
            active_ends = [
                ctx.svars.end[m_id] for m_id in ctx.matches if m_id not in ctx.locked_matches
            ]

            if self.compact_mode == "minimize_makespan" and active_ends:
                makespan = ctx.model.NewIntVar(0, T, "makespan")
                ctx.model.AddMaxEquality(makespan, active_ends)
                terms.append(penalty * makespan)

            elif self.compact_mode == "no_gaps" and active_ends:
                # Approximate no-gaps by minimising residual idle =
                # makespan*C - Σ durations(active). Linear, small, and
                # captures the intent: pack matches tightly.
                makespan = ctx.model.NewIntVar(0, T, "makespan_nogaps")
                ctx.model.AddMaxEquality(makespan, active_ends)
                total_active_duration = sum(
                    ctx.matches[m_id].duration_slots
                    for m_id in ctx.matches
                    if m_id not in ctx.locked_matches
                )
                idle = ctx.model.NewIntVar(0, T * ctx.config.court_count, "idle_slots")
                ctx.model.Add(idle == makespan * ctx.config.court_count - total_active_duration)
                terms.append(penalty * idle)

            elif self.compact_mode == "finish_by_time":
                target = self.target_finish_slot
                if target is not None:
                    for match_id in ctx.matches:
                        if match_id in ctx.locked_matches:
                            continue
                        overshoot = ctx.model.NewIntVar(0, T, f"overshoot_{match_id}")
                        ctx.model.Add(overshoot >= ctx.svars.end[match_id] - target)
                        terms.append(penalty * overshoot)

        # Player overlap (soft)
        if self.allow_player_overlap and self.player_overlap_penalty > 0:
            penalty = int(self.player_overlap_penalty * 10)
            for overlap in ctx.overlap_slack:
                terms.append(penalty * overlap)

        # Pull in any terms other plugins (e.g. StayClose) appended to
        # the shared bus. Decoupling like this means the Objective
        # plugin doesn't have to know which auxiliary plugins are
        # active — anything that pushes onto extra_objective_terms
        # gets summed in.
        terms.extend(getattr(ctx, "extra_objective_terms", []))

        if terms:
            ctx.model.Minimize(sum(terms))
