"""Pairwise rest between any two matches a player plays.

Hard mode: enforce ``end_i + rest_slots <= start_j`` (or the swapped
order) via a reified boolean. Soft mode: introduce a per-pair slack
variable bounded by ``rest_slots`` and let the objective minimise it.

Rest length is per-player (``Player.rest_slots``), with a fallback to
``default_rest_slots`` from the engine config. Same for hard vs soft
choice (``Player.rest_is_hard``).
"""
from __future__ import annotations

from scheduler_core.engine.constraints import (
    Constraint,
    ConstraintContext,
    register_constraint,
)


@register_constraint
class RestBetweenMatches:
    name = "rest"

    def __init__(
        self,
        *,
        default_rest_slots: int = 1,
        soft_enabled: bool = False,
        default_penalty: float = 10.0,
    ) -> None:
        self.default_rest_slots = default_rest_slots
        self.soft_enabled = soft_enabled
        self.default_penalty = default_penalty

    def apply(self, ctx: ConstraintContext) -> None:
        for player_id, p_matches in ctx._player_matches().items():
            if len(p_matches) <= 1:
                continue
            player = ctx.players.get(player_id)
            rest_slots = player.rest_slots if player else self.default_rest_slots
            is_hard = player.rest_is_hard if player else True

            for i in range(len(p_matches)):
                for j in range(i + 1, len(p_matches)):
                    m_i, m_j = p_matches[i], p_matches[j]
                    order = ctx.model.NewBoolVar(f"order_{m_i.id}_{m_j.id}_{player_id}")

                    if is_hard or not self.soft_enabled:
                        ctx.model.Add(
                            ctx.svars.end[m_i.id] + rest_slots <= ctx.svars.start[m_j.id]
                        ).OnlyEnforceIf(order)
                        ctx.model.Add(
                            ctx.svars.end[m_j.id] + rest_slots <= ctx.svars.start[m_i.id]
                        ).OnlyEnforceIf(order.Not())
                    else:
                        slack = ctx.model.NewIntVar(
                            0, rest_slots, f"rest_slack_{m_i.id}_{m_j.id}_{player_id}"
                        )
                        ctx.rest_slack[(player_id, m_i.id, m_j.id)] = slack
                        ctx.model.Add(
                            ctx.svars.end[m_i.id] + rest_slots - slack <= ctx.svars.start[m_j.id]
                        ).OnlyEnforceIf(order)
                        ctx.model.Add(
                            ctx.svars.end[m_j.id] + rest_slots - slack <= ctx.svars.start[m_i.id]
                        ).OnlyEnforceIf(order.Not())
