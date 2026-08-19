"""Actors — composable user-behaviour actions.

Every action is a plain function ``(client, ctx, ...) -> result`` grouped
in stateless classes. No global state, no threading assumptions: this is
the seam that lets phase 2 run the exact same actions under Locust with N
concurrent users (a ``LocustClientAdapter`` exposing SimClient's surface
over Locust's instrumented client is all that's missing).

Director      — meet operations via the idempotent command queue
BracketDirector — bracket match-actions + idempotent record_result commands
Spectator     — the read-only polling surface Display uses (load-test workhorse)
"""
from __future__ import annotations

from typing import Optional

from .client import SimClient
from .context import RunContext
from .rng import command_uuid


def _seen_version(client: SimClient, ctx: RunContext, match_id: str) -> int:
    """Current ``matches.version`` for a match, bootstrapping from the
    single-match GET's ETag on first touch (projection creates rows at
    version 1; unseen rows are implicitly 0 — the ETag is authoritative
    either way)."""
    if match_id not in ctx.versions:
        _, version = client.get_match_state(ctx.tid, match_id)
        ctx.versions[match_id] = version
    return ctx.versions[match_id]


class Director:
    """Meet floor control through ``POST /tournaments/{tid}/commands``."""

    @staticmethod
    def command(
        client: SimClient,
        ctx: RunContext,
        match_id: str,
        action: str,
        payload: Optional[dict] = None,
        *,
        expect=(200,),
        key_suffix: str = "",
        seen_version: Optional[int] = None,
    ):
        """Submit one command. Returns the httpx response.

        On 200: updates ``ctx.versions`` from the CommandResponse and
        registers the command id in the ledger's applied set.
        """
        version = seen_version if seen_version is not None else _seen_version(client, ctx, match_id)
        cmd_id = command_uuid(ctx.seed, ctx.tid or "", match_id, action, key_suffix)
        body = {
            "id": cmd_id,
            "match_id": match_id,
            "action": action,
            "seen_version": version,
        }
        if payload is not None:
            body["payload"] = payload
        resp = client.submit_command(ctx.tid, body, expect=expect)
        if resp.status_code == 200:
            data = resp.json()
            ctx.versions[match_id] = data["version"]
            ctx.ledger.applied_command_ids.add(cmd_id)
            rec = ctx.ledger.meet(match_id)
            rec.status = data["status"]
            rec.court_id = data.get("court_id")
            rec.time_slot = data.get("time_slot")
        return resp

    # -- lifecycle steps ----------------------------------------------------

    @staticmethod
    def call_to_court(client, ctx, match_id, **kw):
        return Director.command(client, ctx, match_id, "call_to_court", **kw)

    @staticmethod
    def start(client, ctx, match_id, **kw):
        return Director.command(client, ctx, match_id, "start_match", **kw)

    @staticmethod
    def finish(client, ctx, match_id, **kw):
        return Director.command(client, ctx, match_id, "finish_match", **kw)

    @staticmethod
    def retire(client, ctx, match_id, **kw):
        return Director.command(client, ctx, match_id, "retire_match", **kw)

    @staticmethod
    def postpone(client, ctx, match_id, **kw):
        return Director.command(client, ctx, match_id, "postpone_match", payload={}, **kw)

    @staticmethod
    def assign_court(client, ctx, match_id, court_id: int, time_slot: int, **kw):
        return Director.command(
            client, ctx, match_id, "assign_court",
            payload={"court_id": court_id, "time_slot": time_slot}, **kw,
        )

    @staticmethod
    def record_score(client, ctx, match_id, score: dict):
        """Persist the score via the match-states PUT (the command queue's
        finish carries no score). Same-state ``finished`` write — allowed
        by the route's no-op carve-out.

        Read-modify-write: the PUT replaces the whole row, so we merge the
        score into the current DTO instead of sending a bare one — a bare
        PUT would wipe the calledAt/actualStart/actualEnd stamps the
        command path recorded. The GET also refreshes the version (ETag).
        """
        current, version = client.get_match_state(ctx.tid, match_id)
        ctx.versions[match_id] = version
        body = {**current, "matchId": match_id, "status": "finished", "score": score}
        resp = client.put_match_state(ctx.tid, match_id, body, if_match=version)
        etag = (resp.headers.get("ETag") or "").strip('"')
        if etag.isdigit():
            ctx.versions[match_id] = int(etag)
        rec = ctx.ledger.meet(match_id)
        rec.score = score
        return resp

    @staticmethod
    def run_match_lifecycle(client, ctx, match_id, side_a=None, side_b=None):
        """call -> start -> finish -> score; records winner in the ledger."""
        Director.call_to_court(client, ctx, match_id)
        ctx.pacer.between_steps()
        Director.start(client, ctx, match_id)
        ctx.pacer.match_duration(1)
        winner = ctx.winner_model.winner(match_id, side_a or [], side_b or [])
        Director.finish(client, ctx, match_id)
        score = ctx.winner_model.meet_score(match_id, winner)
        Director.record_score(client, ctx, match_id, score)
        rec = ctx.ledger.meet(match_id)
        rec.winner = winner
        rec.status = "finished"
        return winner


class BracketDirector:
    """Bracket floor control: match-action clock + idempotent record_result."""

    @staticmethod
    def start(client: SimClient, ctx: RunContext, play_unit_id: str, slot: Optional[int] = None):
        return client.bracket_match_action(ctx.tid, play_unit_id, "start", slot)

    @staticmethod
    def finish_clock(client: SimClient, ctx: RunContext, play_unit_id: str, slot: Optional[int] = None):
        return client.bracket_match_action(ctx.tid, play_unit_id, "finish", slot)

    @staticmethod
    def record_result(
        client: SimClient,
        ctx: RunContext,
        play_unit_id: str,
        winner_side: str,
        *,
        walkover: bool = False,
        score: Optional[dict] = None,
        finished_at_slot: Optional[int] = None,
        seen_version: Optional[int] = None,
        expect=(200,),
        key_suffix: str = "",
    ):
        cmd_id = command_uuid(ctx.seed, ctx.tid or "", play_unit_id, "record_result", key_suffix)
        body = {
            "id": cmd_id,
            "kind": "record_result",
            "play_unit_id": play_unit_id,
            "winner_side": winner_side,
            "walkover": walkover,
        }
        if score is not None:
            body["score"] = score
        if finished_at_slot is not None:
            body["finished_at_slot"] = finished_at_slot
        if seen_version is not None:
            body["seen_version"] = seen_version
        resp = client.bracket_command(ctx.tid, body, expect=expect)
        if resp.status_code == 200:
            ctx.ledger.applied_command_ids.add(cmd_id)
            ctx.ledger.record_bracket_result(
                play_unit_id, winner_side, walkover=walkover, score=score, command_id=cmd_id
            )
        return resp

    @staticmethod
    def play_unit(client, ctx, unit: dict):
        """start -> finish clock -> record winner for one ready play unit."""
        pu_id = unit["id"]
        BracketDirector.start(client, ctx, pu_id)
        ctx.pacer.match_duration(unit.get("duration_slots", 1))
        BracketDirector.finish_clock(client, ctx, pu_id)
        winner = ctx.winner_model.winner(pu_id, unit.get("side_a") or [], unit.get("side_b") or [])
        score = ctx.winner_model.bracket_score(pu_id, winner)
        BracketDirector.record_result(client, ctx, pu_id, winner, score=score)
        return winner


class Spectator:
    """Read-only polling — exactly what the Display module does."""

    @staticmethod
    def poll_state(client: SimClient, ctx: RunContext):
        return client.get_state(ctx.tid)

    @staticmethod
    def poll_match_states(client: SimClient, ctx: RunContext):
        return client.get_match_states(ctx.tid)

    @staticmethod
    def poll_bracket(client: SimClient, ctx: RunContext):
        return client.get_bracket(ctx.tid)
