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


# ---- services/bracket/validation.py ---------------------------------------


def _two_player_state():
    """A TournamentState with two singles play units M1 (P1 vs P2) and
    M2 (P3 vs P4), plus a feeder dependency M3 depends on [M1]."""
    from scheduler_core.domain.tournament import (
        Participant,
        ParticipantType,
        PlayUnit,
        TournamentAssignment,
        TournamentState,
    )

    state = TournamentState()
    for pid in ("P1", "P2", "P3", "P4"):
        state.participants[pid] = Participant(
            id=pid, name=pid, type=ParticipantType.PLAYER
        )
    state.play_units["M1"] = PlayUnit(
        id="M1", event_id="MS", side_a=["P1"], side_b=["P2"],
        expected_duration_slots=1,
    )
    state.play_units["M2"] = PlayUnit(
        id="M2", event_id="MS", side_a=["P3"], side_b=["P4"],
        expected_duration_slots=1,
    )
    state.play_units["M3"] = PlayUnit(
        id="M3", event_id="MS", side_a=["P1"], side_b=["P3"],
        expected_duration_slots=1, dependencies=["M1"],
    )
    state.assignments["M1"] = TournamentAssignment(
        play_unit_id="M1", slot_id=0, court_id=1, duration_slots=1
    )
    state.assignments["M2"] = TournamentAssignment(
        play_unit_id="M2", slot_id=0, court_id=2, duration_slots=1
    )
    return state


def test_validate_move_feasible():
    from scheduler_core.domain.models import ScheduleConfig
    from services.bracket.validation import validate_bracket_move

    state = _two_player_state()
    config = ScheduleConfig(total_slots=64, court_count=2)
    # Move M2 to (slot=1, court=1) — clear cell, no player conflict.
    conflicts = validate_bracket_move(
        state, config, play_unit_id="M2", slot_id=1, court_id=1
    )
    assert conflicts == []


def test_validate_move_court_overlap():
    from scheduler_core.domain.models import ScheduleConfig
    from services.bracket.validation import validate_bracket_move

    state = _two_player_state()
    config = ScheduleConfig(total_slots=64, court_count=2)
    # Move M2 onto M1's cell (slot=0, court=1).
    conflicts = validate_bracket_move(
        state, config, play_unit_id="M2", slot_id=0, court_id=1
    )
    assert any(c.type == "court_conflict" for c in conflicts)


def test_validate_move_player_double_booking():
    from scheduler_core.domain.models import ScheduleConfig
    from scheduler_core.domain.tournament import TournamentAssignment
    from services.bracket.validation import validate_bracket_move

    state = _two_player_state()
    # Schedule M3 (P1 vs P3) at (slot=2, court=1).
    state.assignments["M3"] = TournamentAssignment(
        play_unit_id="M3", slot_id=2, court_id=1, duration_slots=1
    )
    config = ScheduleConfig(total_slots=64, court_count=2)
    # Move M1 (P1 vs P2) onto slot=2 court=2 — P1 collides with M3.
    conflicts = validate_bracket_move(
        state, config, play_unit_id="M1", slot_id=2, court_id=2
    )
    assert any(c.type == "player_overlap" for c in conflicts)


def test_validate_move_player_rest():
    from scheduler_core.domain.models import ScheduleConfig
    from scheduler_core.domain.tournament import TournamentAssignment
    from services.bracket.validation import validate_bracket_move

    state = _two_player_state()
    # M3 (P1 vs P3) at (slot=5, court=1).
    state.assignments["M3"] = TournamentAssignment(
        play_unit_id="M3", slot_id=5, court_id=1, duration_slots=1
    )
    config = ScheduleConfig(total_slots=64, court_count=2)
    # Move M1 (P1 vs P2) to slot=4 court=2: ends at 5, M3 starts at 5,
    # default rest is 1 slot → rest violation for P1.
    conflicts = validate_bracket_move(
        state, config, play_unit_id="M1", slot_id=4, court_id=2
    )
    assert any(c.type == "rest" for c in conflicts)


def test_validate_move_dependency_ordering():
    from scheduler_core.domain.models import ScheduleConfig
    from scheduler_core.domain.tournament import TournamentAssignment
    from services.bracket.validation import validate_bracket_move

    state = _two_player_state()
    # M3 depends on M1; M1 is at slot 0 (ends at 1). M3 currently
    # scheduled at slot 3.
    state.assignments["M3"] = TournamentAssignment(
        play_unit_id="M3", slot_id=3, court_id=1, duration_slots=1
    )
    config = ScheduleConfig(total_slots=64, court_count=2)
    # Drag M3 earlier than M1's end-slot (1) → dependency-ordering conflict.
    conflicts = validate_bracket_move(
        state, config, play_unit_id="M3", slot_id=0, court_id=2
    )
    assert any(c.type == "dependency_order" for c in conflicts)
    # And dragging it to slot >= 1 clears the dependency conflict.
    ok = validate_bracket_move(
        state, config, play_unit_id="M3", slot_id=1, court_id=2
    )
    assert not any(c.type == "dependency_order" for c in ok)
