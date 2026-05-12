"""Restrict each match's start to slots inside every player's
availability windows AND outside any global break window.

Computed by ``ctx._allowed_starts(match)`` — the union/intersection
work lives there. This plugin just applies the result via
``AddAllowedAssignments``.
"""
from __future__ import annotations

from scheduler_core.engine.constraints import (
    Constraint,
    ConstraintContext,
    register_constraint,
)


@register_constraint
class Availability:
    name = "availability"

    def __init__(self) -> None:
        pass

    def apply(self, ctx: ConstraintContext) -> None:
        for match_id, match in ctx.matches.items():
            allowed = ctx._allowed_starts(match)
            if allowed is None:
                continue  # no availability data — unconstrained
            if not allowed:
                ctx.infeasible_reasons.append(
                    f"Match {match.event_code}: no valid time slots available"
                )
                continue
            ctx.model.AddAllowedAssignments([ctx.svars.start[match_id]], allowed)
