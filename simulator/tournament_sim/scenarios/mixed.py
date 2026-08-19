"""mixed — one workspace running meet + bracket + display modules,
meet matches and bracket waves interleaved (the hybrid-workspace case)."""
from __future__ import annotations

from ..context import RunContext
from .base import (
    play_out_bracket,
    play_out_meet,
    setup_bracket,
    setup_meet,
    verify_bracket,
    verify_meet,
)


class Mixed:
    name = "mixed"
    description = "meet + bracket + display enabled in ONE workspace; both engines played out; both read-models verified"

    def run(self, ctx: RunContext, phase_cb) -> None:
        blob = setup_meet(
            ctx, phase_cb,
            name=f"Sim Mixed Workspace (seed {ctx.seed})",
            events={"MS": 2, "WS": 1},
            court_count=3,
            create_modules=[
                {"moduleId": "meet", "status": "enabled"},
                {"moduleId": "bracket", "status": "enabled"},
                {"moduleId": "display", "status": "enabled"},
            ],
        )
        # Same workspace: bracket session rides on the tid setup_meet created.
        events = setup_bracket(
            ctx, phase_cb,
            name="",  # unused when create_workspace=False
            formats=["se"],
            participants=8,
            courts=2,
            create_workspace=False,
        )

        # Interleave: the meet day runs while bracket waves get scheduled
        # and played — the workspace's two engines operating side by side.
        play_out_meet(ctx, phase_cb, blob)
        play_out_bracket(ctx, phase_cb, events)

        verify_meet(ctx, phase_cb)
        verify_bracket(ctx, phase_cb, events)
