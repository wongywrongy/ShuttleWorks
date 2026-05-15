"""Tests for the bracket interactive-scheduling backend — the
``/tournaments/{tid}/bracket/validate`` + ``/pin`` routes, the
``services/bracket/validation.py`` feasibility check, and
``TournamentDriver.repin_and_resolve``.

Sub-project #1 of the bracket court×time decomposition. Mirrors the
fixture style of ``test_bracket_routes.py`` (in-memory SQLite via
``isolate_test_database``, FastAPI ``TestClient`` over the real
routers + auth deps + repo).
"""
from __future__ import annotations

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
    return seed_tournament(client, "Bracket Interactive Scheduling Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _se_4_body(time_limit: float = 1.0) -> dict:
    """Minimal 4-entrant single-elimination payload (2 courts)."""
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


# ---- adapter.build_problem: previous_assignments wiring --------------------


def test_build_problem_emits_previous_assignments():
    """build_problem accepts a previous_assignments list and threads it
    into the ScheduleRequest; omitting it preserves the legacy [] shape."""
    from services.bracket.adapter import build_problem
    from scheduler_core.domain.models import PreviousAssignment, ScheduleConfig
    from scheduler_core.domain.tournament import (
        Participant,
        ParticipantType,
        PlayUnit,
        TournamentState,
    )

    state = TournamentState()
    state.participants["P1"] = Participant(id="P1", name="P1", type=ParticipantType.PLAYER)
    state.participants["P2"] = Participant(id="P2", name="P2", type=ParticipantType.PLAYER)
    state.play_units["M1"] = PlayUnit(
        id="M1", event_id="MS", side_a=["P1"], side_b=["P2"], expected_duration_slots=1
    )
    config = ScheduleConfig(total_slots=64, court_count=2)

    # Legacy call — no previous_assignments → empty list.
    legacy = build_problem(state, ["M1"], config=config)
    assert legacy.previous_assignments == []

    # New call — previous_assignments threaded through verbatim.
    prev = [PreviousAssignment(match_id="M1", slot_id=3, court_id=1, locked=True)]
    pinned = build_problem(state, ["M1"], config=config, previous_assignments=prev)
    assert pinned.previous_assignments == prev
