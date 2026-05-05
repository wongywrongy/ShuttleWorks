"""Hard pins from ``previous_assignments``.

A locked assignment fixes both slot and court. A pinned assignment
fixes whichever fields are set on the ``PreviousAssignment``. Invalid
locks (slot/court out of range) are recorded as infeasibility reasons
so the operator gets a clear message rather than a generic INFEASIBLE.
"""
from __future__ import annotations

from scheduler_core.engine.constraints import (
    Constraint,
    ConstraintContext,
    register_constraint,
)


@register_constraint
class LocksAndPins:
    name = "locks_and_pins"

    def __init__(self) -> None:
        pass

    def apply(self, ctx: ConstraintContext) -> None:
        T = ctx.config.total_slots
        C = ctx.config.court_count

        for match_id, assignment in ctx.previous_assignments.items():
            if match_id not in ctx.matches:
                continue
            match = ctx.matches[match_id]
            d = match.duration_slots

            if assignment.locked:
                if not (0 <= assignment.slot_id <= T - d and 1 <= assignment.court_id <= C):
                    ctx.infeasible_reasons.append(
                        f"Match {match.event_code}: locked assignment "
                        f"({assignment.slot_id}, {assignment.court_id}) is invalid"
                    )
                    continue
                ctx.model.Add(ctx.svars.start[match_id] == assignment.slot_id)
                ctx.model.Add(ctx.svars.court[match_id] == assignment.court_id)
                continue

            if assignment.pinned_slot_id is not None:
                ctx.model.Add(ctx.svars.start[match_id] == assignment.pinned_slot_id)
            if assignment.pinned_court_id is not None:
                ctx.model.Add(ctx.svars.court[match_id] == assignment.pinned_court_id)
