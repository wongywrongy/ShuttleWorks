"""Unit tests for the bracket SSE scheduling endpoint
``POST /tournaments/{tid}/bracket/schedule-next/stream`` (Task F2).

Mirrors the meet ``POST /schedule/stream`` shape: a Server-Sent Events
sequence of ``model_built | phase | progress | complete | error | done``
with a terminal ``done``, a candidate pool on the ``complete`` payload,
and a separate ``schedule-next/commit`` route that persists the chosen
candidate's assignments (candidate-selection happens *before* commit, so
the stream itself does not write assignments).

Tests run against an in-memory SQLite via ``isolate_test_database``; the
FastAPI TestClient buffers the whole SSE body, which we split on the
blank-line event delimiter and JSON-parse.
"""
from __future__ import annotations

import json
from typing import List

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import brackets, tournaments
    from app.exceptions import ConflictError
    from app.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Bracket Stream Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _se_4_body(time_limit: float = 1.0) -> dict:
    """4-entrant single-elimination: the first ready round is the two
    semifinals — a genuine 2-match / 2-court round so the solver emits at
    least one solution callback and can keep more than one candidate."""
    return {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": time_limit,
        "events": [
            {
                "id": "MS",
                "discipline": "Men's Singles",
                "format": "se",
                "participants": [
                    {"id": f"P{i}", "name": f"Player {i}", "seed": i}
                    for i in range(1, 5)
                ],
                "duration_slots": 1,
            }
        ],
    }


def _parse_sse(text: str) -> List[dict]:
    """Split a buffered SSE body into the list of parsed ``data:`` events."""
    events: List[dict] = []
    for chunk in text.split("\n\n"):
        chunk = chunk.strip()
        if not chunk:
            continue
        for line in chunk.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line[len("data: "):]))
    return events


def test_stream_emits_terminal_done_with_progress_and_complete(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())

    r = client.post(_bracket_url(tid, "schedule-next", "stream"))
    assert r.status_code == 200, r.text
    assert "text/event-stream" in r.headers["content-type"]

    events = _parse_sse(r.text)
    types = [e["type"] for e in events]

    # Terminal event is always ``done``.
    assert types[-1] == "done"
    # Model-built handshake fires once before the solve.
    assert "model_built" in types
    # At least one intermediate solution is streamed.
    assert types.count("progress") >= 1
    # A terminal ``complete`` carries the round result with assignments.
    complete = next(e for e in events if e["type"] == "complete")
    result = complete["result"]
    assert result["status"] in ("optimal", "feasible")
    assert len(result["play_unit_ids"]) == 2  # the two semifinals
    # The complete payload carries a candidate pool, each candidate a list
    # of bracket assignments (play_unit_id + slot/court).
    assert len(result["candidates"]) >= 1
    first = result["candidates"][0]
    assert len(first["assignments"]) == 2
    assert all(
        {"play_unit_id", "slot_id", "court_id", "duration_slots"} <= set(a)
        for a in first["assignments"]
    )


def test_stream_candidate_pool_size_bounds_candidates(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())

    r = client.post(
        _bracket_url(tid, "schedule-next", "stream"),
        params={"candidate_pool_size": 3},
    )
    assert r.status_code == 200, r.text
    events = _parse_sse(r.text)
    complete = next(e for e in events if e["type"] == "complete")
    candidates = complete["result"]["candidates"]
    assert 1 <= len(candidates) <= 3


def test_stream_does_not_persist_assignments(client, tid):
    """The stream solves but defers persistence to ``/commit`` so the
    operator can pick a candidate first."""
    client.post(_bracket_url(tid), json=_se_4_body())

    client.post(_bracket_url(tid, "schedule-next", "stream"))

    after = client.get(_bracket_url(tid)).json()
    assert after["assignments"] == []


def test_driver_schedule_next_round_threads_candidate_pool_size():
    """The ``candidate_pool_size`` argument the plan asks for is threaded
    through ``schedule_next_round`` into ``scheduler_core.schedule`` and
    bounds the captured candidate pool. Covers the batch/driver path the
    stream route does not exercise (it drives ``CPSATScheduler`` directly)."""
    from scheduler_core.domain.models import (
        ScheduleConfig,
        SolverOptions,
        SolverStatus,
    )
    from scheduler_core.domain.tournament import (
        Participant,
        ParticipantType,
        PlayUnit,
        TournamentState,
    )
    from services.bracket.scheduler import TournamentDriver

    state = TournamentState()
    for pid in ("P1", "P2", "P3", "P4"):
        state.participants[pid] = Participant(
            id=pid, name=pid, type=ParticipantType.PLAYER
        )
    # Two independent, unassigned matches with resolved sides → both ready.
    state.play_units["M1"] = PlayUnit(
        id="M1", event_id="MS", side_a=["P1"], side_b=["P2"],
        expected_duration_slots=1,
    )
    state.play_units["M2"] = PlayUnit(
        id="M2", event_id="MS", side_a=["P3"], side_b=["P4"],
        expected_duration_slots=1,
    )

    driver = TournamentDriver(
        state=state,
        config=ScheduleConfig(total_slots=64, court_count=2),
        solver_options=SolverOptions(time_limit_seconds=2.0),
    )
    result = driver.schedule_next_round(candidate_pool_size=3)
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    # The assignments were written back into state (batch path persists).
    assert "M1" in state.assignments and "M2" in state.assignments
    # The pool is bounded by the requested size.
    candidates = result.schedule_result.candidates
    assert 1 <= len(candidates) <= 3


def test_commit_persists_chosen_candidate_assignments(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())

    r = client.post(_bracket_url(tid, "schedule-next", "stream"))
    complete = next(e for e in _parse_sse(r.text) if e["type"] == "complete")
    chosen = complete["result"]["candidates"][0]["assignments"]

    commit = client.post(
        _bracket_url(tid, "schedule-next", "commit"),
        json={"assignments": chosen},
    )
    assert commit.status_code == 200, commit.text
    body = commit.json()
    committed = {a["play_unit_id"] for a in body["assignments"]}
    assert committed == {a["play_unit_id"] for a in chosen}

    # Survives a reload (persisted to the session blob, not just in-memory).
    reread = client.get(_bracket_url(tid)).json()
    assert {a["play_unit_id"] for a in reread["assignments"]} == committed
