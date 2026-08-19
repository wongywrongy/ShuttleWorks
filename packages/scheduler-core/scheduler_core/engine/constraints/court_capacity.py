"""Court capacity: at most one match per court per slot.

Two encodings, decided by ``plan_pool`` via ``svars.pool``:

- Matches with explicit court choice (all of them under pinned policy;
  locked/pinned/frozen ones under queue) keep the per-court optional
  intervals and ``AddNoOverlap`` per court — the original encoding.
- Pooled matches share ONE ``AddCumulative(capacity=len(pool_courts))``:
  at most |pool| of them at any instant. Court identity comes back in
  extraction via left-edge colouring (SP-COURT-1 Phase 2).

No kept match ever sits on a pool court (``plan_pool`` falls back to
pinned if one does), so the two encodings never contend for a court.
"""
from __future__ import annotations

from scheduler_core.engine.constraints import (
    ConstraintContext,
    register_constraint,
)


@register_constraint
class CourtCapacity:
    name = "court_capacity"

    def __init__(self) -> None:
        pass

    def apply(self, ctx: ConstraintContext) -> None:
        pool = ctx.svars.pool
        court_count = ctx.config.court_count
        for c in range(1, court_count + 1):
            intervals = [
                ctx.svars.court_interval[(m_id, c)]
                for m_id in ctx.matches
                if m_id not in pool
            ]
            if intervals:
                ctx.model.AddNoOverlap(intervals)
                # Coordinator increments _num_no_overlap_groups via
                # this side channel so logging stats stay accurate.
                ctx._num_no_overlap_groups += 1  # type: ignore[attr-defined]

        # The pool is one cumulative: at most |pool_courts| matches at any
        # instant. This single constraint replaces O(matches x courts)
        # booleans + per-court NoOverlap groups for the pooled set.
        if pool and ctx.svars.pool_courts:
            pooled_intervals = [ctx.svars.interval[m_id] for m_id in sorted(pool)]
            ctx.model.AddCumulative(
                pooled_intervals, [1] * len(pooled_intervals), len(ctx.svars.pool_courts)
            )
