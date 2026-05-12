"""Court capacity: at most one match per court per slot.

Lifted verbatim from ``CPSATScheduler._add_court_capacity`` — uses the
per-court optional intervals already created by ``variables.py`` and
applies ``AddNoOverlap`` per court.
"""
from __future__ import annotations

from scheduler_core.engine.constraints import (
    Constraint,
    ConstraintContext,
    register_constraint,
)


@register_constraint
class CourtCapacity:
    name = "court_capacity"

    def __init__(self) -> None:
        pass

    def apply(self, ctx: ConstraintContext) -> None:
        court_count = ctx.config.court_count
        for c in range(1, court_count + 1):
            intervals = [ctx.svars.court_interval[(m_id, c)] for m_id in ctx.matches]
            if intervals:
                ctx.model.AddNoOverlap(intervals)
                # Coordinator increments _num_no_overlap_groups via
                # this side channel so logging stats stay accurate.
                ctx._num_no_overlap_groups += 1  # type: ignore[attr-defined]
