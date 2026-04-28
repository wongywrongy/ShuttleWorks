"""Soft min/max spacing between any two matches a player plays.

Use cases: avoid back-to-back matches (min_spacing) or avoid a
multi-hour gap mid-event (max_spacing). Both directions get a slack
variable that the objective minimises.
"""
from __future__ import annotations

from scheduler_core.engine.constraints import (
    Constraint,
    ConstraintContext,
    register_constraint,
)


@register_constraint
class GameProximity:
    name = "game_proximity"

    def __init__(
        self,
        *,
        enabled: bool = False,
        min_spacing: int | None = None,
        max_spacing: int | None = None,
        penalty: float = 5.0,
    ) -> None:
        self.enabled = enabled
        self.min_spacing = min_spacing
        self.max_spacing = max_spacing
        self.penalty = penalty

    def apply(self, ctx: ConstraintContext) -> None:
        if not self.enabled:
            return
        if self.min_spacing is None and self.max_spacing is None:
            return

        T = ctx.config.total_slots

        for player_id, p_matches in ctx._player_matches().items():
            if len(p_matches) <= 1:
                continue

            for i in range(len(p_matches)):
                for j in range(i + 1, len(p_matches)):
                    m_i, m_j = p_matches[i], p_matches[j]
                    order = ctx.model.NewBoolVar(f"prox_order_{m_i.id}_{m_j.id}_{player_id}")

                    ctx.model.Add(
                        ctx.svars.end[m_i.id] <= ctx.svars.start[m_j.id]
                    ).OnlyEnforceIf(order)
                    ctx.model.Add(
                        ctx.svars.end[m_j.id] <= ctx.svars.start[m_i.id]
                    ).OnlyEnforceIf(order.Not())

                    if self.min_spacing is not None:
                        slack_min = ctx.model.NewIntVar(
                            0, self.min_spacing, f"prox_min_slack_{m_i.id}_{m_j.id}_{player_id}"
                        )
                        ctx.proximity_min_slack[(player_id, m_i.id, m_j.id)] = slack_min
                        ctx.model.Add(
                            ctx.svars.start[m_j.id] - ctx.svars.end[m_i.id] + slack_min >= self.min_spacing
                        ).OnlyEnforceIf(order)
                        ctx.model.Add(
                            ctx.svars.start[m_i.id] - ctx.svars.end[m_j.id] + slack_min >= self.min_spacing
                        ).OnlyEnforceIf(order.Not())

                    if self.max_spacing is not None:
                        slack_max = ctx.model.NewIntVar(
                            0, T, f"prox_max_slack_{m_i.id}_{m_j.id}_{player_id}"
                        )
                        ctx.proximity_max_slack[(player_id, m_i.id, m_j.id)] = slack_max
                        ctx.model.Add(
                            ctx.svars.start[m_j.id] - ctx.svars.end[m_i.id] - slack_max <= self.max_spacing
                        ).OnlyEnforceIf(order)
                        ctx.model.Add(
                            ctx.svars.start[m_i.id] - ctx.svars.end[m_j.id] - slack_max <= self.max_spacing
                        ).OnlyEnforceIf(order.Not())
