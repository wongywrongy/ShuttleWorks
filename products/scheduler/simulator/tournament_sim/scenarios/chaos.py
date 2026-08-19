"""chaos — edge cases and failure-mode probes on top of a small meet,
plus a bracket walkover. Every EXPECTED failure passes its status through
``expect=`` so the hygiene check still catches anything unexpected.

Steps:
  1. duplicate replay        -> 200, replay=true, version unchanged
  2. out-of-order start      -> 409 (scheduled -> playing is illegal)
  3. stale seen_version      -> 409, then refresh + succeed
  4. retire mid-match        -> playing -> retired
  5. postpone + reassign     -> court/slot mutate, version bumps
  6. interleaved directors   -> second client races, 409s, recovers
  7. bracket walkover        -> record_result walkover=true advances
"""
from __future__ import annotations

from ..actors import BracketDirector, Director
from ..context import RunContext
from ..invariants import Violation
from ..rng import command_uuid
from ..runner import Phase
from .base import setup_bracket, setup_meet, verify_meet


class Chaos:
    name = "chaos"
    description = "replay/409/retire/postpone/race/walkover edge cases against a small meet + tiny bracket"

    def run(self, ctx: RunContext, phase_cb) -> None:
        blob = setup_meet(
            ctx, phase_cb,
            name=f"Sim Chaos (seed {ctx.seed})",
            events={"MS": 3, "WS": 2},
            court_count=2,
        )
        matches = blob["matches"]
        by_id = {m["id"]: m for m in matches}
        mids = [m["id"] for m in matches]
        client = ctx.client

        def expect_violation_free(cond: bool, check: str, detail: str) -> None:
            if not cond:
                ctx.violations.append(Violation("chaos", check, detail))

        with Phase("chaos-steps", phase_cb):
            # -- 1. finish a match normally, then REPLAY the exact finish command
            m1 = mids[0]
            Director.run_match_lifecycle(client, ctx, m1,
                                         side_a=by_id[m1]["sideA"], side_b=by_id[m1]["sideB"])
            replay_id = command_uuid(ctx.seed, ctx.tid, m1, "finish_match", "")
            v_before = ctx.versions[m1]
            resp = client.submit_command(ctx.tid, {
                "id": replay_id, "match_id": m1, "action": "finish_match",
                "seen_version": 0,  # deliberately stale — replay check runs FIRST
            })
            data = resp.json()
            expect_violation_free(data.get("replay") is True, "replay-flag",
                                  f"replayed finish returned replay={data.get('replay')}")
            expect_violation_free(data.get("version") == v_before, "replay-version",
                                  f"replay changed version {v_before} -> {data.get('version')}")

            # -- 2. out-of-order: start a match that was never called -> 409
            m2 = mids[1]
            resp = Director.start(client, ctx, m2, expect=(409,))
            expect_violation_free(resp.status_code == 409, "out-of-order",
                                  f"start-before-call returned {resp.status_code}")

            # -- 3. stale seen_version -> 409; refresh; succeed
            resp = Director.call_to_court(client, ctx, m2)  # legal now
            stale = ctx.versions[m2] - 1
            resp = Director.start(client, ctx, m2, seen_version=stale,
                                  expect=(409,), key_suffix="stale")
            expect_violation_free(resp.status_code == 409, "stale-version",
                                  f"stale seen_version returned {resp.status_code}")
            del ctx.versions[m2]  # force a fresh ETag bootstrap — the recovery path
            resp = Director.start(client, ctx, m2, key_suffix="retry")
            expect_violation_free(resp.status_code == 200, "stale-recovery",
                                  f"post-refresh start returned {resp.status_code}")

            # -- 4. retire the now-playing match
            resp = Director.retire(client, ctx, m2)
            expect_violation_free(resp.json().get("status") == "retired", "retire",
                                  f"retire landed on {resp.json().get('status')}")
            ctx.ledger.meet(m2).status = "retired"

            # -- 5. postpone + reassign on a fresh match
            m3 = mids[2]
            v0 = None
            resp = Director.assign_court(client, ctx, m3, court_id=2, time_slot=90)
            data = resp.json()
            v0 = data["version"]
            expect_violation_free(
                data.get("court_id") == 2 and data.get("time_slot") == 90,
                "assign-court", f"assign returned court={data.get('court_id')} slot={data.get('time_slot')}")
            resp = Director.postpone(client, ctx, m3)
            data = resp.json()
            expect_violation_free(
                data.get("court_id") is None and data.get("time_slot") is None,
                "postpone", f"postpone left court={data.get('court_id')} slot={data.get('time_slot')}")
            expect_violation_free(data["version"] == v0 + 1, "postpone-version",
                                  f"version {v0} -> {data['version']} (expected +1)")

            # -- 6. interleaved directors racing one match
            m4 = mids[3]
            second = client.clone()
            try:
                Director.call_to_court(client, ctx, m4)          # director 1 acts
                stale_v = ctx.versions[m4] - 1                   # director 2 saw the old world
                resp = second.submit_command(ctx.tid, {
                    "id": command_uuid(ctx.seed, ctx.tid, m4, "start_match", "racer"),
                    "match_id": m4, "action": "start_match", "seen_version": stale_v,
                }, expect=(409,))
                expect_violation_free(resp.status_code == 409, "race-409",
                                      f"racing director got {resp.status_code}")
                # director 2 refreshes and proceeds — standard recovery
                _, fresh_v = second.get_match_state(ctx.tid, m4)
                resp = second.submit_command(ctx.tid, {
                    "id": command_uuid(ctx.seed, ctx.tid, m4, "start_match", "racer2"),
                    "match_id": m4, "action": "start_match", "seen_version": fresh_v,
                })
                ctx.versions[m4] = resp.json()["version"]
                ctx.ledger.meet(m4).status = "playing"
                Director.finish(client, ctx, m4)
                ctx.ledger.meet(m4).status = "finished"
            finally:
                second.close()

            # finish remaining matches so the final invariant set is clean
            for mid in mids[4:]:
                m = by_id[mid]
                Director.run_match_lifecycle(client, ctx, mid,
                                             side_a=m["sideA"], side_b=m["sideB"])

        # -- 7. bracket walkover in the same workspace (tiny 4-draw SE)
        with Phase("chaos-walkover", phase_cb):
            events = setup_bracket(ctx, phase_cb, name="", formats=["se"],
                                   participants=4, courts=1, create_workspace=False)
            # generate-event already assigned round 1 — walk over the first
            # assigned unit rather than expecting schedule-next to yield.
            dto = client.get_bracket(ctx.tid)
            unit_ids = sorted(a["play_unit_id"] for a in dto.get("assignments") or [])
            if not unit_ids:
                ctx.violations.append(Violation("chaos", "walkover-setup", "no ready units to walk over"))
            else:
                # walkover the first unit WITHOUT starting it
                wo = unit_ids[0]
                resp = BracketDirector.record_result(client, ctx, wo, "A", walkover=True)
                expect_violation_free(resp.status_code == 200, "walkover",
                                      f"walkover returned {resp.status_code}")
                # replay the same record_result command id — no double advancement
                units_before = client.get_bracket(ctx.tid)
                resp = BracketDirector.record_result(client, ctx, wo, "A", walkover=True)
                units_after = client.get_bracket(ctx.tid)
                expect_violation_free(
                    units_before.get("results") == units_after.get("results"),
                    "walkover-replay", "replayed record_result changed results")
                # play the rest of the tiny draw to completion
                from .base import play_out_bracket, verify_bracket
                play_out_bracket(ctx, phase_cb, events)
                verify_bracket(ctx, phase_cb, events)

        verify_meet(ctx, phase_cb)
