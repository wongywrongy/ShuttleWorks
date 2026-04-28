"""Freeze the schedule for the next ``freeze_horizon_slots`` slots.

Any unlocked assignment that falls inside ``[current_slot,
current_slot + freeze_horizon_slots)`` gets pinned to its previous
slot + court. Used during live re-optimisation so a near-term
re-solve doesn't yank a match that's about to be called.
"""
from __future__ import annotations

from scheduler_core.engine.constraints import (
    Constraint,
    ConstraintContext,
    register_constraint,
)


@register_constraint
class FreezeHorizon:
    name = "freeze_horizon"

    def __init__(self) -> None:
        pass

    def apply(self, ctx: ConstraintContext) -> None:
        cutoff = ctx.config.current_slot + ctx.config.freeze_horizon_slots
        if cutoff <= ctx.config.current_slot:
            return

        for match_id, assignment in ctx.previous_assignments.items():
            if match_id not in ctx.matches or assignment.locked:
                continue
            if assignment.slot_id < cutoff:
                ctx.model.Add(ctx.svars.start[match_id] == assignment.slot_id)
                ctx.model.Add(ctx.svars.court[match_id] == assignment.court_id)
                ctx.locked_matches.add(match_id)
