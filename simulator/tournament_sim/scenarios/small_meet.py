"""small-meet — the vertical slice: minimal dual meet, full lifecycle."""
from __future__ import annotations

from ..context import RunContext
from .base import play_out_meet, setup_meet, verify_meet


class SmallMeet:
    name = "small-meet"
    description = "2 groups, 4 singles matches, 2 courts — solve, finalize, run, verify (<30s)"

    def run(self, ctx: RunContext, phase_cb) -> None:
        blob = setup_meet(
            ctx, phase_cb,
            name=f"Sim Small Meet (seed {ctx.seed})",
            events={"MS": 2, "WS": 2},
            court_count=2,
        )
        play_out_meet(ctx, phase_cb, blob)
        verify_meet(ctx, phase_cb)
