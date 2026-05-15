"""Unit tests for the per-event bracket routes added in A.4:

  POST   /tournaments/{id}/bracket/events/{event_id}         — upsert
  POST   /tournaments/{id}/bracket/events/{event_id}/generate — generate
  DELETE /tournaments/{id}/bracket/events/{event_id}          — delete

Also tests that ``record_match_result`` flips ``event.status`` from
``'generated'`` to ``'started'`` on the first result.

Tests run against an in-memory SQLite via the ``isolate_test_database``
helper; the FastAPI TestClient pipeline exercises the routers + auth
deps + repository layer end-to-end.
"""
from __future__ import annotations

import uuid

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
    return seed_tournament(client, "Event Routes Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _event_url(tid: str, event_id: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket/events/{event_id}"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _minimal_bracket(tid: str, client) -> None:
    """Create a minimal bracket session so events can be registered."""
    body = {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 2.0,
        "events": [
            {
                "id": "_SEED",
                "discipline": "Seed",
                "format": "se",
                "participants": [
                    {"id": "s1", "name": "Seed1"},
                    {"id": "s2", "name": "Seed2"},
                ],
                "duration_slots": 1,
            }
        ],
    }
    r = client.post(_bracket_url(tid), json=body)
    assert r.status_code == 200, r.text


def _upsert_body(participants=None) -> dict:
    if participants is None:
        participants = [
            {"id": f"P{i}", "name": f"Player {i}", "seed": i}
            for i in range(1, 5)
        ]
    return {
        "discipline": "Men's Singles",
        "format": "se",
        "duration_slots": 1,
        "participants": participants,
    }


def _get_event_status(client, tid: str, event_id: str) -> str:
    """Read the event status directly from the DB (not just from route response)."""
    from repositories import get_repository
    from database.session import SessionLocal
    from database.models import BracketEvent
    from sqlalchemy.orm import Session
    session: Session = SessionLocal()
    try:
        row = session.get(BracketEvent, (uuid.UUID(tid), event_id))
        return row.status if row else "NOT_FOUND"
    finally:
        session.close()


# ---------------------------------------------------------------------------
# POST /events/{event_id} — upsert
# ---------------------------------------------------------------------------


def test_upsert_event_creates_draft_event(client, tid):
    """Happy path: upsert creates a draft event with participants."""
    _minimal_bracket(tid, client)
    r = client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert r.status_code == 200, r.text
    body = r.json()
    # The response includes all events (including _SEED from create).
    event_ids = [e["id"] for e in body["events"]]
    assert "MS" in event_ids
    # DB status should be 'draft'.
    assert _get_event_status(client, tid, "MS") == "draft"


def test_upsert_event_replaces_participants(client, tid):
    """Upsert replaces participants on a second call."""
    _minimal_bracket(tid, client)
    r1 = client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert r1.status_code == 200, r1.text
    # Second upsert with 2 participants.
    new_participants = [
        {"id": "A", "name": "Alpha"},
        {"id": "B", "name": "Beta"},
    ]
    r2 = client.post(_event_url(tid, "MS"), json=_upsert_body(new_participants))
    assert r2.status_code == 200, r2.text
    body = r2.json()
    ms_event = next(e for e in body["events"] if e["id"] == "MS")
    assert ms_event["participant_count"] == 2


def test_upsert_event_404_on_missing_tournament(client):
    """Upsert 404s on an unknown tournament."""
    fake_tid = str(uuid.uuid4())
    r = client.post(_event_url(fake_tid, "MS"), json=_upsert_body())
    # Auth wall fires first (403) or 404 — either is acceptable.
    assert r.status_code in (403, 404)


def test_upsert_event_409_on_started(client, tid):
    """Cannot upsert a started event."""
    _minimal_bracket(tid, client)
    # Create + generate + record a result to flip to 'started'.
    r = client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert r.status_code == 200, r.text
    rg = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert rg.status_code == 200, rg.text
    body = rg.json()
    # Pick a scheduled MS match and record a result.
    assignments = body.get("assignments", [])
    assert assignments, "generate should have produced assignments"
    first_pu_id = next(
        a["play_unit_id"] for a in assignments
        if a["play_unit_id"].startswith("MS")
    )
    rr = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_pu_id, "winner_side": "A"},
    )
    assert rr.status_code == 200, rr.text
    # Now upsert should 409.
    r2 = client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert r2.status_code == 409


# ---------------------------------------------------------------------------
# POST /events/{event_id}/generate — generate
# ---------------------------------------------------------------------------


def test_generate_draft_sets_status_generated(client, tid):
    """Draft event → generate → status becomes 'generated'."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["assignments"], "generate should produce assignments"
    # DB status should be 'generated'.
    assert _get_event_status(client, tid, "MS") == "generated"
    # Response events[MS].rounds must be populated (not an empty draw).
    ms_event = next(e for e in body["events"] if e["id"] == "MS")
    assert ms_event["rounds"], "events[MS].rounds should be populated after generate"
    # Response play_units must include MS matches.
    ms_play_units = [p for p in body["play_units"] if p["event_id"] == "MS"]
    assert ms_play_units, "play_units should include MS matches after generate"


def test_generate_with_wipe_true_succeeds(client, tid):
    """Generated event + wipe=true → re-generates successfully."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    r1 = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r1.status_code == 200, r1.text
    # Re-generate with wipe.
    r2 = client.post(_event_url(tid, "MS", "generate"), json={"wipe": True})
    assert r2.status_code == 200, r2.text
    assert _get_event_status(client, tid, "MS") == "generated"


def test_generate_started_returns_409(client, tid):
    """Started event → generate → 409."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    # Record a result to make it 'started'.
    body = client.get(_bracket_url(tid)).json()
    assignments = body.get("assignments", [])
    first_pu_id = next(
        a["play_unit_id"] for a in assignments
        if a["play_unit_id"].startswith("MS")
    )
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_pu_id, "winner_side": "A"},
    )
    assert _get_event_status(client, tid, "MS") == "started"
    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r.status_code == 409


def test_generate_already_generated_without_wipe_returns_409(client, tid):
    """Generated + wipe=false → 409 (must pass wipe=true)."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r.status_code == 409


def test_generate_infeasible_returns_409(client, tid):
    """Infeasible problem → 409.

    Create a bracket with 1 court and 1 total_slot. Even a 2-entrant event
    (1 match, duration_slots=2) cannot fit — the match needs 2 consecutive
    slots but only 1 is available.
    """
    body = {
        "courts": 1,
        "total_slots": 1,
        "rest_between_rounds": 0,
        "interval_minutes": 30,
        "time_limit_seconds": 2.0,
        "events": [
            {
                "id": "_SEED",
                "discipline": "Seed",
                "format": "se",
                "participants": [
                    {"id": "s1", "name": "Seed1"},
                    {"id": "s2", "name": "Seed2"},
                ],
                "duration_slots": 1,
            }
        ],
    }
    r = client.post(_bracket_url(tid), json=body)
    assert r.status_code == 200, r.text
    # Upsert a 2-entrant event with duration_slots=2, but only 1 slot exists.
    # The single match cannot be placed.
    r2 = client.post(
        _event_url(tid, "MS"),
        json={
            "discipline": "Men's Singles",
            "format": "se",
            "duration_slots": 2,
            "participants": [
                {"id": "P1", "name": "Player 1"},
                {"id": "P2", "name": "Player 2"},
            ],
        },
    )
    assert r2.status_code == 200, r2.text
    rg = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    # With only 1 total slot and a match needing 2 slots, it's infeasible.
    assert rg.status_code == 409
    # DB must have rolled back — no bracket_matches rows for MS.
    from repositories import get_repository
    from database.session import SessionLocal
    from database.models import BracketMatch
    import uuid as _uuid
    _s = SessionLocal()
    try:
        ms_matches = list(
            _s.query(BracketMatch).filter(
                BracketMatch.tournament_id == _uuid.UUID(tid),
                BracketMatch.bracket_event_id == "MS",
            ).all()
        )
    finally:
        _s.close()
    assert ms_matches == [], "infeasible generate must not write any matches to DB"


# ---------------------------------------------------------------------------
# DELETE /events/{event_id}
# ---------------------------------------------------------------------------


def test_delete_draft_event_returns_204(client, tid):
    """Draft event → delete → 204."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert _get_event_status(client, tid, "MS") == "draft"
    r = client.delete(_event_url(tid, "MS"))
    assert r.status_code == 204
    assert _get_event_status(client, tid, "MS") == "NOT_FOUND"


def test_delete_generated_event_returns_409(client, tid):
    """Generated event → delete → 409."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert _get_event_status(client, tid, "MS") == "generated"
    r = client.delete(_event_url(tid, "MS"))
    assert r.status_code == 409


def test_delete_started_event_returns_409(client, tid):
    """Started event → delete → 409."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    body = client.get(_bracket_url(tid)).json()
    assignments = body.get("assignments", [])
    first_pu_id = next(
        a["play_unit_id"] for a in assignments
        if a["play_unit_id"].startswith("MS")
    )
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_pu_id, "winner_side": "A"},
    )
    assert _get_event_status(client, tid, "MS") == "started"
    r = client.delete(_event_url(tid, "MS"))
    assert r.status_code == 409


def test_delete_nonexistent_event_returns_404(client, tid):
    """Delete on a non-existent event → 404."""
    _minimal_bracket(tid, client)
    r = client.delete(_event_url(tid, "GHOST"))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Status write wiring: record_match_result → 'started'
# ---------------------------------------------------------------------------


def test_record_result_flips_generated_to_started(client, tid):
    """First result on a Generated event → event.status becomes 'started'."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r.status_code == 200, r.text
    assert _get_event_status(client, tid, "MS") == "generated"
    body = r.json()
    assignments = body.get("assignments", [])
    first_pu_id = next(
        a["play_unit_id"] for a in assignments
        if a["play_unit_id"].startswith("MS")
    )
    rr = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_pu_id, "winner_side": "A"},
    )
    assert rr.status_code == 200, rr.text
    assert _get_event_status(client, tid, "MS") == "started"


def test_second_result_does_not_flip_started_back(client, tid):
    """A second result on a different match in a Started event stays 'started'.

    The event was flipped to 'started' on the first result. Recording a
    second match result should succeed (200) and keep status as 'started'.
    """
    _minimal_bracket(tid, client)
    # Use a 4-entrant SE: 2 semis + 1 final — both semis can be recorded.
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    body = client.get(_bracket_url(tid)).json()
    assignments = body.get("assignments", [])
    # All assigned MS matches.
    ms_assigned = [
        a["play_unit_id"] for a in assignments
        if a["play_unit_id"].startswith("MS")
    ]
    assert len(ms_assigned) >= 2, "4-entrant SE should have at least 2 ready matches"
    # Record first semi.
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": ms_assigned[0], "winner_side": "A"},
    )
    assert _get_event_status(client, tid, "MS") == "started"
    # Record second semi — should succeed and keep status 'started'.
    r2 = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": ms_assigned[1], "winner_side": "B"},
    )
    assert r2.status_code == 200, r2.text
    assert _get_event_status(client, tid, "MS") == "started"


# ---------------------------------------------------------------------------
# C-1 regression: BYE walkover results persisted by generate_event_route
# ---------------------------------------------------------------------------


def test_generate_bye_result_persisted(client, tid):
    """SE event with 3 participants forces bracket_size=4 → one R1 BYE.

    After generate, the walkover Result written by register_draw / auto_walkover_byes
    must appear as a row in bracket_results (walkover=True).  Without the C-1
    fix, this row was only in-memory and would disappear on next hydration.
    """
    _minimal_bracket(tid, client)
    # 3 participants → bracket_size=4 → one R1 match is a BYE walkover.
    r = client.post(
        _event_url(tid, "MS"),
        json={
            "discipline": "Men's Singles",
            "format": "se",
            "duration_slots": 1,
            "participants": [
                {"id": "P1", "name": "Player 1"},
                {"id": "P2", "name": "Player 2"},
                {"id": "P3", "name": "Player 3"},
            ],
        },
    )
    assert r.status_code == 200, r.text
    rg = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert rg.status_code == 200, rg.text

    # Query the DB directly for walkover result rows for this event.
    from repositories import get_repository
    from database.session import SessionLocal
    from database.models import BracketResult
    import uuid as _uuid

    _s = SessionLocal()
    try:
        rows = list(
            _s.query(BracketResult).filter(
                BracketResult.tournament_id == _uuid.UUID(tid),
                BracketResult.bracket_event_id == "MS",
                BracketResult.walkover.is_(True),
            ).all()
        )
    finally:
        _s.close()

    assert len(rows) == 1, (
        f"expected 1 BYE walkover result row in DB for MS, got {len(rows)}"
    )
    assert rows[0].winner_side in ("A", "B"), (
        f"BYE winner_side should be A or B, got {rows[0].winner_side!r}"
    )
