"""Shared scenario building blocks.

A scenario is an object with ``name``, ``description`` and
``run(ctx, phase_cb)``. The helpers here implement the common meet and
bracket phase sequences so concrete scenarios stay short and declarative.
"""
from __future__ import annotations

from typing import Optional

from ..actors import BracketDirector, Director
from ..context import RunContext
from ..factories import make_bracket_create_body, make_bracket_events, make_meet_state
from ..invariants import (
    check_bracket_final,
    check_bracket_wave,
    check_display_consistency,
    check_meet_final,
    check_schedule,
    check_state_roundtrip,
)
from ..results import WinnerModel
from ..runner import Phase

#: hard cap on schedule-next waves — a runaway-loop backstop, far above any
#: real draw's round count.
MAX_WAVES = 60


# ---- meet phases -------------------------------------------------------


def setup_meet(ctx: RunContext, phase_cb, *, name: str, events: dict[str, int],
               court_count: int = 3, breaks: Optional[list[dict]] = None,
               create_modules: Optional[list[dict]] = None) -> dict:
    """create -> seed blob -> solve -> persist schedule -> finalize.

    Returns the final blob (with schedule) for the run phase.
    """
    client = ctx.client
    with Phase("meet-setup", phase_cb):
        created = client.create_tournament(name, kind="meet", modules=create_modules)
        ctx.tid = created["id"]

        blob, ratings = make_meet_state(
            ctx.seed, events=events, court_count=court_count, breaks=breaks,
            tournament_name=name,
        )
        ctx.winner_model = WinnerModel(ctx.seed, ratings)
        # remember group sides for the ledger (standings reconciliation)
        by_id = {p["id"]: p for p in blob["players"]}
        for m in blob["matches"]:
            rec = ctx.ledger.meet(m["id"])
            rec.side_a_group = by_id[m["sideA"][0]]["groupId"]
            rec.side_b_group = by_id[m["sideB"][0]]["groupId"]

        client.put_state(ctx.tid, blob)

    with Phase("meet-solve", phase_cb):
        schedule = client.solve(blob["config"], blob["players"], blob["matches"])
        ctx.violations.extend(check_schedule(schedule, blob["config"], blob["matches"], blob["players"]))

        # determinism: same input + deterministic config -> identical assignments
        schedule2 = client.solve(blob["config"], blob["players"], blob["matches"])
        if schedule.get("assignments") != schedule2.get("assignments"):
            from ..invariants import Violation
            ctx.violations.append(Violation("solve", "nondeterministic-solve",
                                            "two identical solves returned different assignments"))

        blob["schedule"] = schedule
        client.put_state(ctx.tid, blob)
        got = client.get_state(ctx.tid) or {}
        ctx.violations.extend(check_state_roundtrip(blob, got))
        client.finalize_plan(ctx.tid, True)
        if not (client.get_state(ctx.tid) or {}).get("planFinalized"):
            from ..invariants import Violation
            ctx.violations.append(Violation("state", "plan-finalized-lost",
                                            "planFinalized not set after POST /plan-finalized"))
    return blob


def play_out_meet(ctx: RunContext, phase_cb, blob: dict) -> None:
    """Run every scheduled match through call->start->finish->score, in
    schedule order (slot, then court) — the way a real tournament day runs."""
    with Phase("meet-run", phase_cb):
        schedule = blob.get("schedule") or {}
        order = sorted(
            schedule.get("assignments") or [],
            key=lambda a: (a["slotId"], a["courtId"]),
        )
        by_id = {m["id"]: m for m in blob["matches"]}
        for a in order:
            m = by_id.get(a["matchId"])
            if m is None:
                continue
            Director.run_match_lifecycle(
                ctx.client, ctx, m["id"], side_a=m.get("sideA"), side_b=m.get("sideB")
            )


def verify_meet(ctx: RunContext, phase_cb) -> None:
    with Phase("meet-verify", phase_cb):
        ctx.violations.extend(check_meet_final(ctx.client, ctx))
        ctx.violations.extend(check_display_consistency(ctx.client, ctx, meet=True, bracket=False))


# ---- bracket phases -------------------------------------------------------


def setup_bracket(ctx: RunContext, phase_cb, *, name: str, formats: list[str],
                  participants: int = 16, courts: int = 4,
                  create_workspace: bool = True) -> list[dict]:
    """create workspace (optional) -> create bracket session + draws.

    Returns the EventIn list used (ids match server events).
    """
    client = ctx.client
    with Phase("bracket-setup", phase_cb):
        if create_workspace:
            created = client.create_tournament(name, kind="bracket")
            ctx.tid = created["id"]
        events, ratings = make_bracket_events(ctx.seed, formats, participants_per_event=participants)
        if ctx.winner_model.ratings:
            ctx.winner_model.ratings.update(ratings)  # mixed scenario: merge
        else:
            ctx.winner_model = WinnerModel(ctx.seed, ratings)
        client.create_bracket(ctx.tid, make_bracket_create_body(events, courts=courts))

        # POST /bracket creates draws but leaves events in 'draft'; the
        # explicit generate is what flips them to 'generated' (the same
        # step the Draws UI performs). Progressive formats (Swiss) gate
        # rounds/next on that status, so always generate.
        for ev in events:
            client.generate_event(ctx.tid, ev["id"], wipe=True)
    return events


def play_out_bracket(ctx: RunContext, phase_cb, events: list[dict]) -> None:
    """Wave loop: play every ASSIGNED-but-unresulted unit (generate-event
    already schedules round 1 itself), then ask schedule-next for the next
    ready wave; Swiss events append their next round once the current one
    is fully resolved. Stops when nothing is playable, schedulable, or
    appendable — mirroring the backend bracket CLI's no-progress guard.
    """
    client = ctx.client
    swiss_ids = [e["id"] for e in events if e["format"] == "swiss"]
    with Phase("bracket-run", phase_cb):
        for _wave in range(MAX_WAVES):
            dto = client.get_bracket(ctx.tid)
            resulted = {r["play_unit_id"] for r in dto.get("results") or []}
            units = {u["id"]: u for u in dto.get("play_units") or []}
            playable = sorted(
                (a for a in dto.get("assignments") or [] if a["play_unit_id"] not in resulted),
                key=lambda a: (a["slot_id"], a["court_id"]),
            )
            if playable:
                ctx.violations.extend(check_bracket_wave(dto, [a["play_unit_id"] for a in playable]))
                for a in playable:
                    unit = units.get(a["play_unit_id"])
                    if unit is None:
                        continue
                    side_a, side_b = unit.get("side_a") or [], unit.get("side_b") or []
                    if side_a and not side_b:  # unopposed — walkover through
                        BracketDirector.record_result(client, ctx, unit["id"], "A", walkover=True)
                    elif side_b and not side_a:
                        BracketDirector.record_result(client, ctx, unit["id"], "B", walkover=True)
                    else:
                        BracketDirector.play_unit(client, ctx, unit)
                    ctx.pacer.between_steps()
                continue

            out = client.schedule_next(ctx.tid)
            if out.get("play_unit_ids"):
                continue  # picked up as assigned-unresulted next iteration

            # Nothing playable or schedulable: try appending the next Swiss
            # round. A 409 is the route's documented "cannot advance" answer
            # (all K rounds generated / round incomplete / non-progressive).
            # List comprehension, NOT a bare any() generator — any() would
            # short-circuit and starve later Swiss events of their call.
            outcomes = [client.swiss_next_round(ctx.tid, eid).status_code == 200
                        for eid in swiss_ids]
            if not any(outcomes):
                break
        else:
            from ..invariants import Violation
            ctx.violations.append(Violation("bracket-run", "wave-cap",
                                            f"exceeded {MAX_WAVES} schedule-next waves"))


def verify_bracket(ctx: RunContext, phase_cb, events: list[dict]) -> None:
    with Phase("bracket-verify", phase_cb):
        for ev in events:
            ctx.violations.extend(check_bracket_final(ctx.client, ctx, ev["format"], ev["id"]))
        ctx.violations.extend(check_display_consistency(ctx.client, ctx, meet=False, bracket=True))
