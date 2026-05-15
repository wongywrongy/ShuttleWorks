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


# ---- TournamentDriver.repin_and_resolve -----------------------------------


def _driver_state_two_assigned():
    """State with M1 (P1 vs P2) at (0,1) and M2 (P3 vs P4) at (0,2),
    both scheduled, no results."""
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
    state.assignments["M1"] = TournamentAssignment(
        play_unit_id="M1", slot_id=0, court_id=1, duration_slots=1
    )
    state.assignments["M2"] = TournamentAssignment(
        play_unit_id="M2", slot_id=0, court_id=2, duration_slots=1
    )
    return state


def test_repin_pins_target_and_reoptimises_free():
    from scheduler_core.domain.models import (
        ScheduleConfig,
        SolverOptions,
        SolverStatus,
    )
    from services.bracket.scheduler import TournamentDriver

    state = _driver_state_two_assigned()
    driver = TournamentDriver(
        state=state,
        config=ScheduleConfig(total_slots=64, court_count=2),
        solver_options=SolverOptions(time_limit_seconds=2.0),
    )
    # Pin M2 to (slot=3, court=1). M1 is free (no result, not started,
    # not past) — the solver re-places it.
    result = driver.repin_and_resolve("M2", slot_id=3, court_id=1)
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    # M2 landed at its pinned target.
    assert state.assignments["M2"].slot_id == 3
    assert state.assignments["M2"].court_id == 1
    # M1 is still scheduled (re-optimised, exact cell solver's choice).
    assert "M1" in state.assignments


def test_repin_keeps_locked_match_fixed():
    from scheduler_core.domain.models import (
        ScheduleConfig,
        SolverOptions,
        SolverStatus,
    )
    from scheduler_core.domain.tournament import Result, WinnerSide
    from services.bracket.scheduler import TournamentDriver

    state = _driver_state_two_assigned()
    # M1 has a result → locked. Its (slot, court) must not move.
    state.results["M1"] = Result(winner_side=WinnerSide.A)
    locked_slot = state.assignments["M1"].slot_id
    locked_court = state.assignments["M1"].court_id

    driver = TournamentDriver(
        state=state,
        config=ScheduleConfig(total_slots=64, court_count=2),
        solver_options=SolverOptions(time_limit_seconds=2.0),
    )
    result = driver.repin_and_resolve("M2", slot_id=5, court_id=2)
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert state.assignments["M1"].slot_id == locked_slot
    assert state.assignments["M1"].court_id == locked_court
    assert state.assignments["M2"].slot_id == 5
    assert state.assignments["M2"].court_id == 2


def test_repin_rejects_locked_play_unit():
    from scheduler_core.domain.models import ScheduleConfig, SolverOptions
    from scheduler_core.domain.tournament import Result, WinnerSide
    from services.bracket.scheduler import TournamentDriver

    state = _driver_state_two_assigned()
    state.results["M1"] = Result(winner_side=WinnerSide.A)  # M1 locked
    driver = TournamentDriver(
        state=state,
        config=ScheduleConfig(total_slots=64, court_count=2),
        solver_options=SolverOptions(time_limit_seconds=2.0),
    )
    with pytest.raises(ValueError, match="locked"):
        driver.repin_and_resolve("M1", slot_id=9, court_id=1)


# ---- POST /bracket/validate -----------------------------------------------


def _schedule_round_one(client, tid) -> dict:
    """Create a 4-entrant SE bracket and solve round one. Returns the
    TournamentDTO after schedule-next."""
    assert client.post(_bracket_url(tid), json=_se_4_body()).status_code == 200
    r = client.post(_bracket_url(tid, "schedule-next"))
    assert r.status_code == 200, r.text
    body = client.get(_bracket_url(tid)).json()
    # Two semifinals should now be assigned.
    assert len(body["assignments"]) == 2, body["assignments"]
    return body


def test_validate_feasible_move(client, tid):
    body = _schedule_round_one(client, tid)
    assignments = sorted(body["assignments"], key=lambda a: a["court_id"])
    target = assignments[0]
    # Move it to a slot guaranteed clear of every current assignment.
    safe_slot = max(a["slot_id"] + a["duration_slots"] for a in body["assignments"]) + 10
    r = client.post(
        _bracket_url(tid, "validate"),
        json={
            "play_unit_id": target["play_unit_id"],
            "slot_id": safe_slot,
            "court_id": target["court_id"],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["feasible"] is True
    assert payload["conflicts"] == []


def test_validate_court_overlap(client, tid):
    body = _schedule_round_one(client, tid)
    assignments = sorted(body["assignments"], key=lambda a: a["court_id"])
    a0, a1 = assignments[0], assignments[1]
    # Drag a1 onto a0's exact (slot, court).
    r = client.post(
        _bracket_url(tid, "validate"),
        json={
            "play_unit_id": a1["play_unit_id"],
            "slot_id": a0["slot_id"],
            "court_id": a0["court_id"],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["feasible"] is False
    assert any(c["type"] == "court_conflict" for c in payload["conflicts"])


def test_validate_locked_match_is_infeasible(client, tid):
    """A played match is locked → /validate returns feasible:false with
    a `locked` conflict (locked matches are not draggable)."""
    body = _schedule_round_one(client, tid)
    sf = body["assignments"][0]
    # Record a result for that semifinal → it is now locked.
    rec = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": sf["play_unit_id"], "winner_side": "A"},
    )
    assert rec.status_code == 200, rec.text
    r = client.post(
        _bracket_url(tid, "validate"),
        json={
            "play_unit_id": sf["play_unit_id"],
            "slot_id": 30,
            "court_id": 1,
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["feasible"] is False
    assert any(c["type"] == "locked" for c in payload["conflicts"])


def test_validate_404_when_no_bracket(client, tid):
    r = client.post(
        _bracket_url(tid, "validate"),
        json={"play_unit_id": "M1", "slot_id": 0, "court_id": 1},
    )
    assert r.status_code == 404


def test_validate_404_for_unknown_play_unit(client, tid):
    _schedule_round_one(client, tid)
    r = client.post(
        _bracket_url(tid, "validate"),
        json={"play_unit_id": "GHOST", "slot_id": 0, "court_id": 1},
    )
    assert r.status_code == 404


def test_validate_unscheduled_play_unit_is_infeasible(client, tid):
    """A ready-but-unscheduled play_unit (e.g. the final, awaiting the
    next schedule-next) is not on the Gantt and cannot be dragged.
    /validate must report feasible:false — mirroring /pin's 409 — so
    the feasible:true => /pin-succeeds invariant holds."""
    body = _schedule_round_one(client, tid)
    # The final exists in play_units but is not yet in assignments.
    final = next(p for p in body["play_units"] if p["round_index"] == 1)
    assert final["id"] not in {
        a["play_unit_id"] for a in body["assignments"]
    }
    r = client.post(
        _bracket_url(tid, "validate"),
        json={"play_unit_id": final["id"], "slot_id": 30, "court_id": 1},
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["feasible"] is False
    assert any(c["type"] == "unscheduled" for c in payload["conflicts"])


# ---- POST /bracket/pin ----------------------------------------------------


def test_pin_lands_target_and_persists(client, tid):
    body = _schedule_round_one(client, tid)
    assignments = sorted(body["assignments"], key=lambda a: a["court_id"])
    target = assignments[0]
    r = client.post(
        _bracket_url(tid, "pin"),
        json={
            "play_unit_id": target["play_unit_id"],
            "slot_id": 10,
            "court_id": target["court_id"],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    pinned = next(
        a for a in payload["assignments"]
        if a["play_unit_id"] == target["play_unit_id"]
    )
    assert pinned["slot_id"] == 10
    assert pinned["court_id"] == target["court_id"]
    # Persisted: a fresh GET sees the re-pin.
    after = client.get(_bracket_url(tid)).json()
    pinned_after = next(
        a for a in after["assignments"]
        if a["play_unit_id"] == target["play_unit_id"]
    )
    assert pinned_after["slot_id"] == 10


def test_pin_keeps_locked_match_fixed(client, tid):
    body = _schedule_round_one(client, tid)
    assignments = sorted(body["assignments"], key=lambda a: a["court_id"])
    locked_pu, free_pu = assignments[0], assignments[1]
    # Record a result for locked_pu → locked.
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": locked_pu["play_unit_id"], "winner_side": "A"},
    )
    locked_slot = locked_pu["slot_id"]
    locked_court = locked_pu["court_id"]
    # Re-pin the *free* match elsewhere.
    r = client.post(
        _bracket_url(tid, "pin"),
        json={
            "play_unit_id": free_pu["play_unit_id"],
            "slot_id": 7,
            "court_id": free_pu["court_id"],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    locked_after = next(
        a for a in payload["assignments"]
        if a["play_unit_id"] == locked_pu["play_unit_id"]
    )
    assert locked_after["slot_id"] == locked_slot
    assert locked_after["court_id"] == locked_court
    free_after = next(
        a for a in payload["assignments"]
        if a["play_unit_id"] == free_pu["play_unit_id"]
    )
    assert free_after["slot_id"] == 7
    assert free_after["court_id"] == free_pu["court_id"]


def test_pin_409_when_play_unit_locked(client, tid):
    body = _schedule_round_one(client, tid)
    sf = body["assignments"][0]
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": sf["play_unit_id"], "winner_side": "A"},
    )
    r = client.post(
        _bracket_url(tid, "pin"),
        json={"play_unit_id": sf["play_unit_id"], "slot_id": 12, "court_id": 1},
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "locked"


def test_pin_404_when_no_bracket(client, tid):
    r = client.post(
        _bracket_url(tid, "pin"),
        json={"play_unit_id": "M1", "slot_id": 0, "court_id": 1},
    )
    assert r.status_code == 404


def test_pin_404_for_unknown_play_unit(client, tid):
    _schedule_round_one(client, tid)
    r = client.post(
        _bracket_url(tid, "pin"),
        json={"play_unit_id": "GHOST", "slot_id": 0, "court_id": 1},
    )
    assert r.status_code == 404


def test_pin_409_for_unscheduled_play_unit(client, tid):
    """A real PlayUnit that isn't in state.assignments yet (e.g. the
    final, awaiting feeders) cannot be pinned — it is not on the
    Gantt. repin_and_resolve raises ValueError → 409 infeasible."""
    body = _schedule_round_one(client, tid)
    final = next(
        p for p in body["play_units"] if p["round_index"] == 1
    )
    assert final["id"] not in {
        a["play_unit_id"] for a in body["assignments"]
    }
    r = client.post(
        _bracket_url(tid, "pin"),
        json={"play_unit_id": final["id"], "slot_id": 30, "court_id": 1},
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "infeasible"


# ---- The validate <-> pin contract ----------------------------------------


def test_validate_pin_contract_conservative_but_sound(client, tid):
    """Drag a match onto a cell occupied only by a *movable* match:
    /validate reports feasible:false (correct over-conservatism — it
    cannot see that a re-solve would vacate the cell), yet /pin for the
    same move *succeeds* (the re-solve relocates the movable match).

    This is the test that makes the meet-faithful conservatism a
    guarantee rather than a comment: the asymmetry that must never
    happen is the reverse — feasible:true that /pin then rejects."""
    body = _schedule_round_one(client, tid)
    assignments = sorted(body["assignments"], key=lambda a: a["court_id"])
    a0, a1 = assignments[0], assignments[1]
    # a0 and a1 share no players (distinct semifinals), so a0's cell is
    # blocked for a1 only by a *movable* match.
    move = {
        "play_unit_id": a1["play_unit_id"],
        "slot_id": a0["slot_id"],
        "court_id": a0["court_id"],
    }

    # /validate: conservative → infeasible (court_conflict with a0).
    v = client.post(_bracket_url(tid, "validate"), json=move)
    assert v.status_code == 200, v.text
    v_payload = v.json()
    assert v_payload["feasible"] is False
    assert any(c["type"] == "court_conflict" for c in v_payload["conflicts"])

    # /pin: the same move succeeds — the re-solve relocates a0.
    p = client.post(_bracket_url(tid, "pin"), json=move)
    assert p.status_code == 200, p.text
    p_payload = p.json()
    pinned = next(
        a for a in p_payload["assignments"]
        if a["play_unit_id"] == a1["play_unit_id"]
    )
    assert pinned["slot_id"] == a0["slot_id"]
    assert pinned["court_id"] == a0["court_id"]
    # a0 was relocated off its old cell (movable, no result).
    moved = next(
        a for a in p_payload["assignments"]
        if a["play_unit_id"] == a0["play_unit_id"]
    )
    assert (moved["slot_id"], moved["court_id"]) != (
        a0["slot_id"], a0["court_id"]
    )
