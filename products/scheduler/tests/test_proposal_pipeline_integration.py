"""End-to-end integration tests for the proposal pipeline.

These walk a complete operator scenario through real HTTP endpoints
against a tmp tournament file: setup → generate → live tracking →
advisory triggers → proposal review → commit. Covers the cross-module
plumbing that unit tests in the per-module files exercise in isolation.

Each test seeds a small but non-trivial tournament (4 players, 2 courts,
2 matches) so the solver actually does work and the diff/impact code
has something concrete to report.
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


_BACKEND_ROOT = str(Path(__file__).resolve().parents[1] / "backend")
sys.path = [_BACKEND_ROOT] + [p for p in sys.path if p != _BACKEND_ROOT]
for _cached in [
    k for k in list(sys.modules)
    if k == "app" or k.startswith("app.")
    or k == "services" or k.startswith("services.")
    or k == "adapters" or k.startswith("adapters.")
    or k.startswith("api.")
]:
    del sys.modules[_cached]

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from _helpers import seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    from _helpers import isolate_test_database, seed_tournament
    isolate_test_database(tmp_path, monkeypatch)

    from api import (
        match_state,
        schedule_advisories,
        schedule_director,
        schedule_proposals,
        schedule_repair,
        schedule_warm_restart,
        tournaments,
    )

    app_ = FastAPI()
    app_.include_router(schedule_warm_restart.router)
    app_.include_router(schedule_repair.router)
    app_.include_router(schedule_proposals.router)
    app_.include_router(schedule_director.router)
    app_.include_router(schedule_advisories.router)
    app_.include_router(match_state.router)
    app_.include_router(tournaments.router)
    return TestClient(app_)


def _seeded_state() -> dict:
    return {
        "version": 2,
        "config": {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 2,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
            "tournamentDate": "2026-04-28",
            "rankCounts": {},
            "clockShiftMinutes": 0,
        },
        "groups": [
            {"id": "schoolA", "name": "School A"},
            {"id": "schoolB", "name": "School B"},
        ],
        "players": [
            {"id": "p1", "name": "Alice", "groupId": "schoolA", "ranks": ["MS"], "availability": []},
            {"id": "p2", "name": "Bob",   "groupId": "schoolB", "ranks": ["MS"], "availability": []},
            {"id": "p3", "name": "Carol", "groupId": "schoolA", "ranks": ["MS"], "availability": []},
            {"id": "p4", "name": "Dan",   "groupId": "schoolB", "ranks": ["MS"], "availability": []},
        ],
        "matches": [
            {"id": "m1", "matchNumber": 1, "sideA": ["p1"], "sideB": ["p2"], "matchType": "dual", "durationSlots": 1},
            {"id": "m2", "matchNumber": 2, "sideA": ["p3"], "sideB": ["p4"], "matchType": "dual", "durationSlots": 1},
        ],
        "schedule": {
            "assignments": [
                {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 1},
                {"matchId": "m2", "slotId": 1, "courtId": 1, "durationSlots": 1},
            ],
            "unscheduledMatches": [],
            "softViolations": [],
            "objectiveScore": 1000,
            "infeasibleReasons": [],
            "status": "feasible",
        },
        "scheduleStats": None,
        "scheduleIsStale": False,
        "scheduleVersion": 0,
        "scheduleHistory": [],
    }


# ---------- end-to-end scenario: overrun → advisory → repair → commit -----


def test_overrun_advisory_drives_repair_proposal_to_commit(client):
    tid = seed_tournament(client)
    state = _seeded_state()
    assert client.put(f"/tournaments/{tid}/state", json=state).status_code == 200

    # Operator marks m1 as started 50 min ago — well past the
    # expected 30-min duration.
    started = (datetime.now(timezone.utc) - timedelta(minutes=80)).isoformat().replace("+00:00", "Z")
    r = client.put(
        f"/tournaments/{tid}/match-states/m1",
        json={"matchId": "m1", "status": "started", "actualStartTime": started},
    )
    assert r.status_code == 200

    # Advisory pipeline detects the overrun.
    advisories = client.get(f"/tournaments/{tid}/schedule/advisories").json()
    overrun = next((a for a in advisories if a["kind"] == "overrun"), None)
    assert overrun is not None
    assert overrun["severity"] == "critical"
    assert overrun["matchId"] == "m1"
    assert overrun["suggestedAction"]["kind"] == "repair"

    # Operator clicks "Review" — payload becomes a repair proposal.
    suggested = overrun["suggestedAction"]["payload"]
    proposal_r = client.post(
        f"/tournaments/{tid}/schedule/proposals/repair",
        json={
            "originalSchedule": state["schedule"],
            "config": state["config"],
            "players": state["players"],
            "matches": state["matches"],
            "matchStates": {
                "m1": {"matchId": "m1", "status": "started", "actualStartTime": started},
            },
            "disruption": {
                "type": suggested["type"],
                "matchId": suggested["matchId"],
                "extraMinutes": suggested.get("extraMinutes"),
            },
        },
    )
    assert proposal_r.status_code == 200, proposal_r.text
    proposal = proposal_r.json()
    assert proposal["kind"] == "repair"
    pid = proposal["id"]

    # Operator commits.
    commit_r = client.post(f"/tournaments/{tid}/schedule/proposals/{pid}/commit")
    assert commit_r.status_code == 200, commit_r.text
    body = commit_r.json()
    assert body["state"]["scheduleVersion"] == 1
    assert len(body["state"]["scheduleHistory"]) == 1
    assert body["state"]["scheduleHistory"][0]["trigger"] == "repair"


# ---------- end-to-end scenario: director delay_start propagates ----------


def test_director_delay_start_persists_clock_shift_atomically(client):
    tid = seed_tournament(client)
    state = _seeded_state()
    assert client.put(f"/tournaments/{tid}/state", json=state).status_code == 200

    # Director declares the tournament started 25 min late.
    propose = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json={
            "action": {"kind": "delay_start", "minutes": 25},
            "config": state["config"],
            "players": state["players"],
            "matches": state["matches"],
            "originalSchedule": state["schedule"],
            "matchStates": {},
        },
    )
    assert propose.status_code == 200, propose.text
    proposal = propose.json()
    assert proposal["impact"]["clockShiftMinutesDelta"] == 25
    assert proposal["proposedConfig"]["clockShiftMinutes"] == 25

    # Commit applies both schedule (unchanged) and config (clockShift bumped).
    commit_r = client.post(f"/tournaments/{tid}/schedule/proposals/{proposal['id']}/commit")
    assert commit_r.status_code == 200
    persisted = client.get(f"/tournaments/{tid}/state").json()
    assert persisted["config"]["clockShiftMinutes"] == 25
    assert persisted["scheduleVersion"] == 1


# ---------- end-to-end scenario: director insert_blackout reschedules -----


def test_director_insert_blackout_reschedules_via_warm_restart(client):
    tid = seed_tournament(client)
    state = _seeded_state()
    # Start with matches at slots 0 and 1 (09:00 and 09:30).
    assert client.put(f"/tournaments/{tid}/state", json=state).status_code == 200

    # Director inserts a 09:00–09:45 break — both matches must move past it.
    propose = client.post(
        f"/tournaments/{tid}/schedule/director-action",
        json={
            "action": {
                "kind": "insert_blackout",
                "fromTime": "09:00",
                "toTime": "09:45",
                "reason": "Tech check",
            },
            "config": state["config"],
            "players": state["players"],
            "matches": state["matches"],
            "originalSchedule": state["schedule"],
            "matchStates": {},
        },
    )
    assert propose.status_code == 200, propose.text
    proposal = propose.json()
    assert "Tech check" in (proposal["summary"] or "")
    assert proposal["proposedConfig"]["breaks"] == [
        {"start": "09:00", "end": "09:45"},
    ]
    # m1 was at slot 0 (09:00–09:30) — fully inside the blackout's
    # rounded slot range [0, 1) — so it must move. m2 at slot 1
    # (09:30–10:00) starts at the break boundary; the engine treats
    # the break as half-open so slot 1 is unaffected.
    moved = {m["matchId"] for m in proposal["impact"]["movedMatches"]}
    assert "m1" in moved


# ---------- end-to-end scenario: optimistic concurrency rejects stale ----


def test_two_proposals_against_same_version_only_one_can_commit(client):
    tid = seed_tournament(client)
    state = _seeded_state()
    assert client.put(f"/tournaments/{tid}/state", json=state).status_code == 200

    body = {
        "originalSchedule": state["schedule"],
        "config": state["config"],
        "players": state["players"],
        "matches": state["matches"],
        "matchStates": {},
        "stayCloseWeight": 10,
    }
    pa = client.post(f"/tournaments/{tid}/schedule/proposals/warm-restart", json=body).json()
    pb = client.post(f"/tournaments/{tid}/schedule/proposals/warm-restart", json=body).json()
    assert pa["fromScheduleVersion"] == 0
    assert pb["fromScheduleVersion"] == 0

    # First commit succeeds, second 409s because version advanced.
    assert client.post(f"/tournaments/{tid}/schedule/proposals/{pa['id']}/commit").status_code == 200
    second = client.post(f"/tournaments/{tid}/schedule/proposals/{pb['id']}/commit")
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "SCHEDULE_VERSION_CONFLICT"


# ---------- end-to-end scenario: cancel discards without persisting ------


def test_cancelled_proposal_leaves_committed_state_unchanged(client):
    tid = seed_tournament(client)
    state = _seeded_state()
    assert client.put(f"/tournaments/{tid}/state", json=state).status_code == 200

    propose = client.post(
        f"/tournaments/{tid}/schedule/proposals/warm-restart",
        json={
            "originalSchedule": state["schedule"],
            "config": state["config"],
            "players": state["players"],
            "matches": state["matches"],
            "matchStates": {},
            "stayCloseWeight": 10,
        },
    )
    pid = propose.json()["id"]
    # Operator cancels.
    assert client.delete(f"/tournaments/{tid}/schedule/proposals/{pid}").status_code == 200

    persisted = client.get(f"/tournaments/{tid}/state").json()
    assert persisted["scheduleVersion"] == 0  # never bumped
    assert persisted["scheduleHistory"] == []  # never appended


# ---------- end-to-end: optimize worker stamps suggestion ------------------


@pytest.mark.asyncio
async def test_worker_stamps_optimize_suggestion_for_persisted_schedule(
    monkeypatch, tmp_path, caplog,
):
    """End-to-end: post an OPTIMIZE trigger; the handler reads the
    persisted state, runs a warm-restart, and either stamps a
    Suggestion (improvement found) or logs a no-improvement skip.

    The handler uses ``stayCloseWeight=5`` which biases against moves
    even when a packed schedule would be shorter; in practice the
    solver often settles on a same-makespan reshuffle. Rather than
    contrive a fixture that reliably beats this bias, the test
    asserts via caplog that the handler actually executed end-to-end
    (read state, ran solver, decided whether to stamp). Without the
    log assertion the test was vacuous: a handler that silently
    crashed would still let the assertions pass.
    """
    import logging
    # ---- env setup: fresh backend modules against tmp_path ----
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    backend_root = str(Path(__file__).resolve().parents[1] / "backend")
    sys.path[:] = [backend_root] + [p for p in sys.path if p != backend_root]
    for _cached in [
        k for k in list(sys.modules)
        if k == "app" or k.startswith("app.")
        or k == "services" or k.startswith("services.")
        or k == "adapters" or k.startswith("adapters.")
        or k.startswith("api.")
    ]:
        del sys.modules[_cached]

    from api import (
        match_state,
        schedule_proposals,
        schedule_warm_restart,
        tournaments,
    )
    from api.schedule_suggestions import build_handler
    from services.suggestions_worker import SuggestionsWorker, TriggerEvent, TriggerKind

    # Build an isolated FastAPI app (same pattern as the `client` fixture).
    app_ = FastAPI()
    app_.include_router(schedule_warm_restart.router)
    app_.include_router(schedule_proposals.router)
    app_.include_router(match_state.router)
    app_.include_router(tournaments.router)

    # Seed tournament state via sync TestClient so _read_persisted_state() finds it.
    seed = _seeded_state()
    with TestClient(app_) as c:
        tid = seed_tournament(c)
        r = c.put(f"/tournaments/{tid}/state", json=seed)
        assert r.status_code == 200, r.text

    # Start the worker closed over the same app instance.
    import uuid as _uuid
    tournament_uuid = _uuid.UUID(tid)
    worker = SuggestionsWorker(
        handler=build_handler(app_),
        cooldown_seconds=0,
    )
    await worker.start()
    try:
        with caplog.at_level(logging.DEBUG, logger="scheduler.suggestions"):
            await worker.post(TriggerEvent(
                kind=TriggerKind.OPTIMIZE,
                fingerprint="opt:test:e2e",
                tournament_id=tournament_uuid,
            ))

            # Give the consumer task a chance to pull the event from
            # the queue and start the dispatch — without this,
            # drain() may snapshot _inflight while it's still empty
            # and return instantly.
            await asyncio.sleep(0.2)
            # Real solve — drain awaits the in-flight handler.
            await worker.drain()

        # The handler MUST have executed and reached its
        # decision-point (either stamped or skipped). Without this
        # log assertion, a handler that silently crashed during the
        # solver call would let the test pass with no suggestion and
        # no error.
        log_text = "\n".join(r.getMessage() for r in caplog.records
                             if r.name == "scheduler.suggestions")
        assert (
            "stamped optimize" in log_text
            or "found no improvement" in log_text
        ), (
            "OPTIMIZE handler did not reach its decision branch; "
            f"caplog: {log_text!r}"
        )

        # If a suggestion WAS stamped, validate its shape. Reading
        # via _get_suggestion_store ensures we get the dict the
        # handler actually populated.
        from api.schedule_proposals import _get_suggestion_store
        suggestion_store = _get_suggestion_store(app_, tournament_uuid)
        if suggestion_store:
            sug = next(iter(suggestion_store.values()))
            assert sug.kind == "optimize"
            assert sug.proposalId
            assert sug.fingerprint == "opt:test:e2e"
            assert "min finish" in sug.metric
    finally:
        await worker.stop()
