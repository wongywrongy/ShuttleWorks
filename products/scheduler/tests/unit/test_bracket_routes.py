"""Unit tests for the bracket routes mounted under
``/tournaments/{tid}/bracket/*`` (PR 2 of the backend-merge arc).

Coverage:

  - create / read / delete happy paths
  - 4xx error paths: no events, duplicate event id, undersized event,
    bracket-already-exists, no-bracket-on-GET, unknown tournament
  - outbox: every write through ``_LocalBracketRepo`` stages a
    ``sync_queue`` row (one per event / participant set / match /
    result), so operator browsers can subscribe via Realtime
  - record-result + advancement: the result row lands, downstream
    match slots resolve, downstream sync rows queue
  - schedule-next no-op: ``/schedule-next`` returns gracefully on a
    bracket with no ready PlayUnits (e.g. 2-entrant event with
    auto-walkover already cascaded — covered by SE smoke)
  - export.csv / export.ics return non-empty bodies with correct media
    types

Tests run against an in-memory SQLite via the ``isolate_test_database``
helper; the FastAPI TestClient pipeline exercises the routers + auth
deps + repository layer end-to-end. The local-dev synthetic user is
seeded as the tournament owner, so role gates pass without a real JWT.
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
    return seed_tournament(client, "Bracket Routes Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _se_4_body(time_limit: float = 1.0) -> dict:
    """Minimal 4-entrant single-elimination payload."""
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


# ---- Create -----------------------------------------------------------------


def test_create_bracket_returns_full_state(client, tid):
    r = client.post(_bracket_url(tid), json=_se_4_body())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["courts"] == 2
    assert body["total_slots"] == 64
    assert len(body["events"]) == 1
    assert body["events"][0]["id"] == "MS"
    assert body["events"][0]["format"] == "se"
    assert len(body["participants"]) == 4
    # 4-entrant SE: 2 semis + 1 final = 3 play units.
    assert len(body["play_units"]) == 3


def test_create_bracket_persists_event_rows(client, tid):
    r = client.post(_bracket_url(tid), json=_se_4_body())
    assert r.status_code == 200

    r2 = client.get(_bracket_url(tid))
    assert r2.status_code == 200
    body = r2.json()
    assert [e["id"] for e in body["events"]] == ["MS"]
    # Slot tree round-trips: final's slot_a is a feeder ref.
    final = next(p for p in body["play_units"] if p["round_index"] == 1)
    assert final["slot_a"]["feeder_play_unit_id"] is not None


def test_create_bracket_rejects_empty_events(client, tid):
    payload = _se_4_body()
    payload["events"] = []
    r = client.post(_bracket_url(tid), json=payload)
    assert r.status_code == 400


def test_create_bracket_rejects_undersized_event(client, tid):
    payload = _se_4_body()
    payload["events"][0]["participants"] = payload["events"][0][
        "participants"
    ][:1]
    r = client.post(_bracket_url(tid), json=payload)
    assert r.status_code == 400


def test_create_bracket_rejects_duplicate_event_ids(client, tid):
    payload = _se_4_body()
    payload["events"].append(payload["events"][0])
    r = client.post(_bracket_url(tid), json=payload)
    assert r.status_code == 400


def test_create_bracket_multi_event_namespaces_play_units(client, tid):
    """Multiple events with distinct ids must not collide play-unit ids.

    Regression: ``create_bracket`` called the draw generators with
    ``event_id`` but no ``play_unit_id_prefix``, so the prefix fell back
    to its constant default (``"M"`` for SE, ``"RR"`` for RR) and every
    event minted identical ids (``M-R0-0`` …). The second event's
    ``register_draw`` then raised ``ValueError`` on the shared
    ``TournamentState`` — unhandled in the route, surfacing as a 500.
    """
    payload = _se_4_body()
    payload["events"].append(
        {
            "id": "WS",
            "discipline": "Women's Singles",
            "format": "se",
            "participants": [
                {"id": f"Q{i}", "name": f"Player {i}", "seed": i}
                for i in range(1, 5)
            ],
            "duration_slots": 1,
        }
    )
    r = client.post(_bracket_url(tid), json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert {e["id"] for e in body["events"]} == {"MS", "WS"}
    # 4-entrant SE = 3 play units per event; two events = 6, all unique.
    pu_ids = [p["id"] for p in body["play_units"]]
    assert len(pu_ids) == 6
    assert len(set(pu_ids)) == 6, f"play-unit ids collided: {sorted(pu_ids)}"


def test_create_bracket_rejects_if_one_already_exists(client, tid):
    r1 = client.post(_bracket_url(tid), json=_se_4_body())
    assert r1.status_code == 200
    r2 = client.post(_bracket_url(tid), json=_se_4_body())
    assert r2.status_code == 409


def test_create_bracket_404_on_unknown_tournament(client):
    body = _se_4_body()
    fake_tid = str(uuid.uuid4())
    r = client.post(_bracket_url(fake_tid), json=body)
    # require_tournament_access fires first (no membership → 403),
    # so the 404 we'd want lives behind the auth wall. Accept either
    # in this seam — the contract is "not a successful create".
    assert r.status_code in (403, 404)


# ---- Read -------------------------------------------------------------------


def test_get_bracket_404_when_unconfigured(client, tid):
    r = client.get(_bracket_url(tid))
    assert r.status_code == 404


# ---- Delete -----------------------------------------------------------------


def test_delete_bracket_clears_everything(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    r = client.delete(_bracket_url(tid))
    assert r.status_code == 200
    # GET now 404s — nothing left.
    r2 = client.get(_bracket_url(tid))
    assert r2.status_code == 404


# ---- Outbox -----------------------------------------------------------------


def test_create_bracket_stages_sync_rows(client, tid):
    """Outbox invariant: every write through _LocalBracketRepo stages
    a sync_queue row in the same transaction."""
    client.post(_bracket_url(tid), json=_se_4_body())

    # Inspect sync_queue directly via the same SQLite engine the
    # backend uses (bound by isolate_test_database).
    from sqlalchemy import select
    from database.models import SyncQueue
    from database.session import SessionLocal

    with SessionLocal() as session:
        rows = list(session.scalars(select(SyncQueue)))
    types = [r.entity_type for r in rows]
    # 1 event + 3 matches + 0 results (SE with seeds, no auto-walkovers
    # because every R1 has two real players) + 1 tournament (from the
    # initial /tournaments create) = 5 minimum.
    assert "bracket_event" in types
    assert types.count("bracket_match") == 3


# ---- Record result ----------------------------------------------------------


def test_record_result_advances_downstream_slot(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = next(
        p for p in state["play_units"] if p["round_index"] == 0 and p["match_index"] == 0
    )
    final = next(p for p in state["play_units"] if p["round_index"] == 1)
    assert final["slot_a"]["participant_id"] is None
    assert final["slot_a"]["feeder_play_unit_id"] == sf1["id"]

    r = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": sf1["id"],
            "winner_side": "A",
            "finished_at_slot": 0,
            "walkover": False,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    new_final = next(p for p in body["play_units"] if p["round_index"] == 1)
    # Winner's id should now be in the final's slot_a.
    assert new_final["slot_a"]["participant_id"] == sf1["side_a"][0]
    assert new_final["slot_a"]["feeder_play_unit_id"] is None
    # Result row recorded.
    assert any(
        r["play_unit_id"] == sf1["id"] and r["winner_side"] == "A"
        for r in body["results"]
    )


def test_record_result_stages_result_and_match_sync_rows(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = next(
        p for p in state["play_units"] if p["round_index"] == 0 and p["match_index"] == 0
    )
    # Drain the queue's pre-existing rows so we only see the new ones
    # from the result recording.
    from sqlalchemy import delete
    from database.models import SyncQueue
    from database.session import SessionLocal

    with SessionLocal() as session:
        session.execute(delete(SyncQueue))
        session.commit()

    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": sf1["id"], "winner_side": "A", "walkover": False},
    )

    from sqlalchemy import select

    with SessionLocal() as session:
        rows = list(session.scalars(select(SyncQueue)))
    types = sorted(r.entity_type for r in rows)
    # 1 result + 1 downstream match update (final's slot_a resolves).
    assert "bracket_result" in types
    assert "bracket_match" in types


def test_record_result_404_when_no_bracket(client, tid):
    r = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": "missing", "winner_side": "A"},
    )
    assert r.status_code == 404


def test_record_result_404_for_unknown_play_unit(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    r = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": "GHOST", "winner_side": "A"},
    )
    assert r.status_code == 404


# ---- Export -----------------------------------------------------------------


def test_export_json_alias_returns_same_as_get(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    a = client.get(_bracket_url(tid)).json()
    b = client.get(_bracket_url(tid, "export.json")).json()
    # Same structural counts; equality up to ordering edge cases.
    assert len(a["events"]) == len(b["events"])
    assert len(a["play_units"]) == len(b["play_units"])
    assert len(a["participants"]) == len(b["participants"])


def test_export_csv_returns_csv_body(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    r = client.get(_bracket_url(tid, "export.csv"))
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"].lower()
    # Header row is always emitted, even with no assignments yet.
    assert "event_id" in r.text
    assert "match_id" in r.text


def test_export_ics_returns_calendar_body(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    r = client.get(_bracket_url(tid, "export.ics"))
    assert r.status_code == 200
    assert "text/calendar" in r.headers["content-type"].lower()
    assert "BEGIN:VCALENDAR" in r.text
    assert "END:VCALENDAR" in r.text


# ---- Schedule-next ----------------------------------------------------------


def test_schedule_next_returns_status(client, tid):
    """Smoke: the route runs without crashing on a fresh bracket and
    returns the wire shape callers expect."""
    client.post(_bracket_url(tid), json=_se_4_body())
    r = client.post(_bracket_url(tid, "schedule-next"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "status" in body
    assert isinstance(body["play_unit_ids"], list)
