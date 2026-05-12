"""Soft penalty for moving any match away from a reference assignment.

Biases a re-solve toward the previous schedule. Used by
``solve_warm_start`` when the operator presses "Re-plan from here" —
the existing schedule is the reference; the solver may still move
matches to satisfy new constraints but each move costs ``weight``
units of the objective so the solver minimises operator-visible
disruption.

The plugin appends per-match boolean penalty terms to
``ctx.extra_objective_terms`` (a list the ``Objective`` plugin sums
into its final ``model.Minimize`` call). StayClose must therefore run
*before* Objective in the constraint list.
"""
from __future__ import annotations

from typing import Mapping

from scheduler_core.domain.models import Assignment
from scheduler_core.engine.constraints import (
    Constraint,
    ConstraintContext,
    register_constraint,
)


@register_constraint
class StayClose:
    name = "stay_close"

    def __init__(
        self,
        *,
        reference: Mapping[str, Assignment],
        weight: int = 10,
    ) -> None:
        self.reference = reference
        self.weight = weight

    def apply(self, ctx: ConstraintContext) -> None:
        if self.weight <= 0 or not self.reference:
            return
        # Make sure the bus exists. CPSATScheduler's __init__ pre-seeds
        # this list, but staying defensive here means a hand-rolled
        # context (e.g. a future test) doesn't have to know about it.
        if not hasattr(ctx, "extra_objective_terms"):
            ctx.extra_objective_terms = []  # type: ignore[attr-defined]

        scaled = self.weight * 10  # mirror Objective's x10 scaling
        for m_id, ref in self.reference.items():
            if m_id not in ctx.matches or m_id in ctx.locked_matches:
                continue
            moved = ctx.model.NewBoolVar(f"stayclose_moved_{m_id}")
            ctx.model.Add(ctx.svars.start[m_id] != ref.slot_id).OnlyEnforceIf(moved)
            ctx.model.Add(ctx.svars.start[m_id] == ref.slot_id).OnlyEnforceIf(moved.Not())
            ctx.extra_objective_terms.append(scaled * moved)
