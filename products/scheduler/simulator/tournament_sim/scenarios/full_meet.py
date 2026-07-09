"""full-meet — bigger dual meet with doubles, a lunch break, and one
mid-run postpone + court reassignment."""
from __future__ import annotations

from ..actors import Director
from ..context import RunContext
from ..runner import Phase
from .base import play_out_meet, setup_meet, verify_meet


class FullMeet:
    name = "full-meet"
    description = "~14 matches across MS/WS/MD/WD/XD, breaks, 4 courts, one postpone+reassign mid-run"

    def run(self, ctx: RunContext, phase_cb) -> None:
        blob = setup_meet(
            ctx, phase_cb,
            name=f"Sim Full Meet (seed {ctx.seed})",
            events={"MS": 4, "WS": 3, "MD": 3, "WD": 2, "XD": 2},
            court_count=4,
            breaks=[{"start": "12:00", "end": "13:00"}],
        )

        # Mid-run director intervention: postpone the last scheduled match,
        # then place it back on court 1 late in the day.
        schedule = blob.get("schedule") or {}
        assignments = sorted(schedule.get("assignments") or [], key=lambda a: (a["slotId"], a["courtId"]))
        with Phase("meet-intervention", phase_cb):
            if assignments:
                victim = assignments[-1]["matchId"]
                Director.postpone(ctx.client, ctx, victim)
                last_slot = max(a["slotId"] + a.get("durationSlots", 1) for a in assignments)
                Director.assign_court(ctx.client, ctx, victim, court_id=1, time_slot=last_slot)

        play_out_meet(ctx, phase_cb, blob)
        verify_meet(ctx, phase_cb)
