"""Task 9b: non-solver bracket court assign/unassign.

Endpoints:
  POST /tournaments/{tid}/bracket/assign
  POST /tournaments/{tid}/bracket/unassign

TDD — write tests RED first, then implement.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


# ---------------------------------------------------------------------------
# Fixtures (mirrors test_bracket_commands_seam_c.py)
# ---------------------------------------------------------------------------


@pytest.fixture
def bracket_client(tmp_path, monkeypatch):
    """In-memory SQLite + FastAPI app with tournaments + brackets routers."""
    isolate_test_database(tmp_path, monkeypatch)
    from bracket import brackets
    from workspaces import tournaments
    from core.exceptions import ConflictError
    from core.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


def _se_4_body() -> dict:
    """Minimal 4-entrant single-elimination bracket payload."""
    return {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 1.0,
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


@pytest.fixture
def seeded_bracket(bracket_client) -> tuple[str, str, str]:
    """Return (tournament_id, sf0_id, sf1_id) — the two round-0 SFs.

    Creates a 4-entrant SE bracket. No schedule-next called so ZERO
    assignments exist. Round 0 has match_index 0 and match_index 1.
    """
    tid = seed_tournament(bracket_client, "Assign Test")
    bracket_client.post(f"/tournaments/{tid}/bracket", json=_se_4_body())
    state = bracket_client.get(f"/tournaments/{tid}/bracket").json()

    round0 = sorted(
        [p for p in state["play_units"] if p["round_index"] == 0],
        key=lambda p: p["match_index"],
    )
    assert len(round0) >= 2, "Expected at least 2 SFs in round 0"
    return tid, round0[0]["id"], round0[1]["id"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_assign_unscheduled_unit_returns_200(bracket_client, seeded_bracket):
    """Assigning an un-scheduled play unit must return 200 (not 409)."""
    tid, sf0, _sf1 = seeded_bracket
    r = bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": sf0, "court_id": 1, "slot_id": 3},
    )
    assert r.status_code == 200, r.text


def test_assign_places_unit_at_court_and_slot(bracket_client, seeded_bracket):
    """Assigned unit appears in the DTO's assignments list at the given court+slot."""
    tid, sf0, _sf1 = seeded_bracket
    bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": sf0, "court_id": 1, "slot_id": 3},
    )
    state = bracket_client.get(f"/tournaments/{tid}/bracket").json()
    assignments_for_sf0 = [
        a for a in state["assignments"] if a["play_unit_id"] == sf0
    ]
    assert len(assignments_for_sf0) == 1
    a = assignments_for_sf0[0]
    assert a["court_id"] == 1
    assert a["slot_id"] == 3

    # Operations assignment is also the public projection source. Solver
    # planning stays in the bracket-session blob and never writes this row.
    from db.models import Match
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        operational = session.get(Match, (uuid.UUID(tid), sf0))
        assert operational is not None
        assert operational.court_id == 1
        assert operational.time_slot == 3
    finally:
        session.close()


def test_assign_does_not_disturb_other_units(bracket_client, seeded_bracket):
    """After assigning sf0, sf1 stays unassigned — the solver was NOT run."""
    tid, sf0, sf1 = seeded_bracket
    bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": sf0, "court_id": 1, "slot_id": 3},
    )
    state = bracket_client.get(f"/tournaments/{tid}/bracket").json()
    # sf1 must NOT appear in assignments (solver would have scheduled it too)
    sf1_assignments = [
        a for a in state["assignments"] if a["play_unit_id"] == sf1
    ]
    assert sf1_assignments == [], (
        f"sf1 appeared in assignments — solver must have run: {state['assignments']}"
    )


def test_assign_overwrites_existing_assignment(bracket_client, seeded_bracket):
    """Re-assigning a unit updates court+slot without removing other units."""
    tid, sf0, sf1 = seeded_bracket
    # First: assign both units
    bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": sf0, "court_id": 1, "slot_id": 3},
    )
    bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": sf1, "court_id": 2, "slot_id": 3},
    )
    # Overwrite sf0 to a new court+slot
    r = bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": sf0, "court_id": 2, "slot_id": 5},
    )
    assert r.status_code == 200, r.text

    state = bracket_client.get(f"/tournaments/{tid}/bracket").json()
    sf0_a = next(
        (a for a in state["assignments"] if a["play_unit_id"] == sf0), None
    )
    sf1_a = next(
        (a for a in state["assignments"] if a["play_unit_id"] == sf1), None
    )
    # sf0 moved
    assert sf0_a is not None
    assert sf0_a["court_id"] == 2
    assert sf0_a["slot_id"] == 5
    # sf1 untouched
    assert sf1_a is not None
    assert sf1_a["court_id"] == 2
    assert sf1_a["slot_id"] == 3


def test_unassign_removes_assignment(bracket_client, seeded_bracket):
    """Unassign removes the play unit's assignment; other units are unaffected."""
    tid, sf0, sf1 = seeded_bracket
    bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": sf0, "court_id": 1, "slot_id": 3},
    )
    bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": sf1, "court_id": 2, "slot_id": 3},
    )
    r = bracket_client.post(
        f"/tournaments/{tid}/bracket/unassign",
        json={"play_unit_id": sf0},
    )
    assert r.status_code == 200, r.text

    state = bracket_client.get(f"/tournaments/{tid}/bracket").json()
    sf0_assignments = [
        a for a in state["assignments"] if a["play_unit_id"] == sf0
    ]
    sf1_assignments = [
        a for a in state["assignments"] if a["play_unit_id"] == sf1
    ]
    assert sf0_assignments == [], "sf0 should be unassigned after unassign"
    assert len(sf1_assignments) == 1, "sf1 assignment must survive the unassign"

    from db.models import Match
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        sf0_operational = session.get(Match, (uuid.UUID(tid), sf0))
        sf1_operational = session.get(Match, (uuid.UUID(tid), sf1))
        assert sf0_operational is not None
        assert sf0_operational.court_id is None
        assert sf0_operational.time_slot is None
        assert sf1_operational is not None
        assert sf1_operational.court_id == 2
        assert sf1_operational.time_slot == 3
    finally:
        session.close()


def test_unassign_nonexistent_assignment_is_noop(bracket_client, seeded_bracket):
    """Unassigning a play unit with no assignment returns 200 (no-op)."""
    tid, sf0, _sf1 = seeded_bracket
    r = bracket_client.post(
        f"/tournaments/{tid}/bracket/unassign",
        json={"play_unit_id": sf0},
    )
    assert r.status_code == 200, r.text
    state = r.json()
    assert not any(a["play_unit_id"] == sf0 for a in state["assignments"])


def test_assign_unknown_play_unit_returns_404(bracket_client, seeded_bracket):
    """Assigning an unknown play_unit_id returns 404."""
    tid, _sf0, _sf1 = seeded_bracket
    r = bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": "nonexistent-unit", "court_id": 1, "slot_id": 1},
    )
    assert r.status_code == 404, r.text


def test_unresolved_future_match_cannot_be_sent_to_court(bracket_client, seeded_bracket):
    tid, _sf0, _sf1 = seeded_bracket
    state = bracket_client.get(f"/tournaments/{tid}/bracket").json()
    final = next(unit for unit in state["play_units"] if unit["round_index"] == 1)

    response = bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": final["id"], "court_id": 1, "slot_id": 8},
    )

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["error"] == "unresolved_participants"
    assert final["slot_a"]["feeder_play_unit_id"] in " ".join(detail["reasons"])


def test_unresolved_planned_match_cannot_start_or_record_result(bracket_client):
    tid = seed_tournament(bracket_client, "Unresolved Planned Match")
    payload = {
        "courts": 2,
        "total_slots": 32,
        "events": [
            {
                "id": "MS",
                "participants": [
                    {"id": f"P{i}", "name": f"Player {i}"} for i in range(1, 5)
                ],
                "rounds": [
                    [
                        {"id": "SF1", "side_a": ["P1"], "side_b": ["P2"]},
                        {"id": "SF2", "side_a": ["P3"], "side_b": ["P4"]},
                    ],
                    [{"id": "F", "feeder_a": "SF1", "feeder_b": "SF2"}],
                ],
            }
        ],
        "assignments": [
            {"play_unit_id": "F", "court_id": 1, "slot_id": 8, "duration_slots": 1}
        ],
    }
    imported = bracket_client.post(f"/tournaments/{tid}/bracket/import", json=payload)
    assert imported.status_code == 200, imported.text

    started = bracket_client.post(
        f"/tournaments/{tid}/bracket/match-action",
        json={"play_unit_id": "F", "action": "start"},
    )
    result = bracket_client.post(
        f"/tournaments/{tid}/bracket/results",
        json={"play_unit_id": "F", "winner_side": "A"},
    )

    assert started.status_code == 409
    assert result.status_code == 409
    assert started.json()["detail"]["error"] == "unresolved_participants"
    assert result.json()["detail"]["error"] == "unresolved_participants"


def test_clear_court_keeps_the_plan_slot_and_is_idempotent(
    bracket_client, seeded_bracket
):
    """OPR-0908-8: withdraw the published court, keep the planned slot.

    ``/bracket/unassign`` removes the assignment altogether, so an operator
    who changed their mind about a court could not get back to "planned at
    this slot, no approved court" — the public tier kept publishing the
    court. ``/bracket/clear-court`` is that third verb.

    The Operations ``Match`` row is the public projection's court source
    (``_schedule_runtime_snapshot`` builds its ``courts`` map from the rows
    whose ``court_id`` is not NULL), so a NULL court there IS "no court" on
    the public page, while ``time_slot`` and the session assignment keep the
    plan intact.
    """
    tid, sf0, sf1 = seeded_bracket
    bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": sf0, "court_id": 1, "slot_id": 3},
    )
    bracket_client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": sf1, "court_id": 2, "slot_id": 3},
    )

    command_id = str(uuid.uuid4())
    first = bracket_client.post(
        f"/tournaments/{tid}/bracket/clear-court",
        json={"play_unit_id": sf0, "command_id": command_id},
    )
    assert first.status_code == 200, first.text
    # Same command twice: replayed, never applied a second time.
    second = bracket_client.post(
        f"/tournaments/{tid}/bracket/clear-court",
        json={"play_unit_id": sf0, "command_id": command_id},
    )
    assert second.status_code == 200, second.text

    state = bracket_client.get(f"/tournaments/{tid}/bracket").json()
    sf0_a = next((a for a in state["assignments"] if a["play_unit_id"] == sf0), None)
    sf1_a = next((a for a in state["assignments"] if a["play_unit_id"] == sf1), None)
    # The PLAN is untouched — this is the whole point of the verb.
    assert sf0_a is not None, "clear-court must not remove the plan assignment"
    assert sf0_a["slot_id"] == 3
    assert sf0_a["court_id"] == 1
    assert sf1_a is not None and sf1_a["court_id"] == 2

    from db.models import Match
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        sf0_operational = session.get(Match, (uuid.UUID(tid), sf0))
        sf1_operational = session.get(Match, (uuid.UUID(tid), sf1))
        assert sf0_operational is not None
        assert sf0_operational.court_id is None, "the published court must be gone"
        assert sf0_operational.time_slot == 3, "the approved slot must survive"
        assert sf1_operational is not None and sf1_operational.court_id == 2
    finally:
        session.close()


def test_clear_court_without_an_assignment_is_a_noop(bracket_client, seeded_bracket):
    """No plan, nothing published — still 200, still nothing invented."""
    tid, sf0, _sf1 = seeded_bracket
    r = bracket_client.post(
        f"/tournaments/{tid}/bracket/clear-court",
        json={"play_unit_id": sf0},
    )
    assert r.status_code == 200, r.text
    assert not any(a["play_unit_id"] == sf0 for a in r.json()["assignments"])
