"""A player can't be in two matches at the same time.

Hard mode: ``AddNoOverlap`` per player's match intervals.

Soft mode (``allow_overlap=True``): pairwise overlap-amount slack
appended to ``ctx.overlap_slack``. The objective plugin reads that
list and adds it to the minimised expression.
"""
from __future__ import annotations

from scheduler_core.engine.constraints import (
    Constraint,
    ConstraintContext,
    register_constraint,
)


@register_constraint
class PlayerNoOverlap:
    name = "player_no_overlap"

    def __init__(self, *, allow_overlap: bool = False, overlap_penalty: float = 50.0) -> None:
        self.allow_overlap = allow_overlap
        # ``overlap_penalty`` is consumed by the Objective plugin via
        # config, not here. Accepted for spec symmetry.
        self.overlap_penalty = overlap_penalty

    def apply(self, ctx: ConstraintContext) -> None:
        for player_id, p_matches in ctx._player_matches().items():
            if len(p_matches) <= 1:
                continue

            if not self.allow_overlap:
                ctx.model.AddNoOverlap([ctx.svars.interval[m.id] for m in p_matches])
                ctx._num_no_overlap_groups += 1  # type: ignore[attr-defined]
                continue

            T = ctx.config.total_slots
            for i in range(len(p_matches)):
                for j in range(i + 1, len(p_matches)):
                    m_i, m_j = p_matches[i], p_matches[j]
                    min_end = ctx.model.NewIntVar(0, T, f"minend_{m_i.id}_{m_j.id}_{player_id}")
                    max_start = ctx.model.NewIntVar(0, T, f"maxstart_{m_i.id}_{m_j.id}_{player_id}")
                    ctx.model.AddMinEquality(min_end, [ctx.svars.end[m_i.id], ctx.svars.end[m_j.id]])
                    ctx.model.AddMaxEquality(max_start, [ctx.svars.start[m_i.id], ctx.svars.start[m_j.id]])
                    overlap = ctx.model.NewIntVar(0, T, f"overlap_{m_i.id}_{m_j.id}_{player_id}")
                    ctx.model.AddMaxEquality(overlap, [0, min_end - max_start])
                    ctx.overlap_slack.append(overlap)
