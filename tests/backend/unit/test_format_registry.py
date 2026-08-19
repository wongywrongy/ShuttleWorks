"""S1 — the format registry + per-draw config plumbing.

Pins:
  1. Registry dispatch parity — se/rr draws built through the registry's
     uniform adapters are identical to direct generator calls.
  2. Unknown format ids fail Pydantic validation (422) at every format
     field (create / upsert / import).
  3. The per-draw ``config`` blob round-trips upsert → hydrate → EventOut
     (normalize_config drops junk for knob-less formats).
  4. PATCH /bracket/events/{id}: draft-only config edits that leave
     participants untouched; 409 on generated/started; 404 unknown.
  5. rr_rounds is persisted for every format (the old ``if format=="rr"``
     conditionals are gone).
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
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


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Format Registry Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    return base + ("/" + "/".join(suffix) if suffix else "")


def _event_url(tid: str, event_id: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket/events/{event_id}"
    return base + ("/" + "/".join(suffix) if suffix else "")


def _players(n: int) -> list[dict]:
    return [{"id": f"p{i}", "name": f"Player {i}"} for i in range(1, n + 1)]


def _create_session(client, tid: str) -> None:
    r = client.post(
        _bracket_url(tid),
        json={
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
                    "participants": _players(2),
                    "duration_slots": 1,
                }
            ],
        },
    )
    assert r.status_code == 200, r.text


# ---- 1. Dispatch parity --------------------------------------------------


def test_registry_dispatch_matches_direct_generators():
    from bracket.formats import FORMAT_REGISTRY
    from bracket.formats import (
        generate_round_robin,
        generate_single_elimination,
    )
    from scheduler_core.domain.tournament import Participant, ParticipantType

    participants = [
        Participant(id=f"p{i}", name=f"P{i}", type=ParticipantType.PLAYER)
        for i in range(1, 6)
    ]

    def shape(draw):
        return (
            sorted(draw.play_units.keys()),
            [list(r) for r in draw.rounds],
            {
                pu_id: (
                    (a.participant_id, a.feeder_play_unit_id),
                    (b.participant_id, b.feeder_play_unit_id),
                )
                for pu_id, (a, b) in draw.slots.items()
            },
            dict(draw.event.parameters),
        )

    se_direct = generate_single_elimination(
        participants, event_id="MS", play_unit_id_prefix="MS",
        duration_slots=1, seeded_count=2, bracket_size=None,
    )
    se_registry = FORMAT_REGISTRY["se"].generate(
        participants, event_id="MS", play_unit_id_prefix="MS",
        duration_slots=1, seeded_count=2, bracket_size=None,
        rr_rounds=1, config={},
    )
    assert shape(se_direct) == shape(se_registry)

    rr_direct = generate_round_robin(
        participants, rounds=2, event_id="WS", play_unit_id_prefix="WS",
        duration_slots=1,
    )
    rr_registry = FORMAT_REGISTRY["rr"].generate(
        participants, event_id="WS", play_unit_id_prefix="WS",
        duration_slots=1, seeded_count=None, bracket_size=None,
        rr_rounds=2, config={},
    )
    assert shape(rr_direct) == shape(rr_registry)


# ---- 2. Unknown format → 422 ----------------------------------------------


def test_unknown_format_rejected_everywhere(client, tid):
    _create_session(client, tid)

    # Upsert route.
    r = client.post(
        _event_url(tid, "XX"),
        json={"discipline": "MS", "format": "bogus", "participants": []},
    )
    assert r.status_code == 422
    assert "unknown draw format" in r.text

    # Create-tournament route.
    r = client.post(
        _bracket_url(tid),
        json={
            "courts": 2, "total_slots": 64, "rest_between_rounds": 1,
            "interval_minutes": 30, "time_limit_seconds": 2.0,
            "events": [{
                "id": "YY", "discipline": "MS", "format": "ladderz",
                "participants": _players(2),
            }],
        },
    )
    assert r.status_code == 422


# ---- 3. Config round-trip + 5. rr_rounds persisted ------------------------


def test_config_and_rr_rounds_round_trip(client, tid):
    _create_session(client, tid)

    r = client.post(
        _event_url(tid, "WS"),
        json={
            "discipline": "WS",
            "format": "rr",
            "rr_rounds": 3,
            "participants": _players(4),
            # rr has no knobs — normalize_config drops junk.
            "config": {"nonsense": True},
        },
    )
    assert r.status_code == 200, r.text
    ev = next(e for e in r.json()["events"] if e["id"] == "WS")
    assert ev["rr_rounds"] == 3
    assert ev["config"] == {}  # junk dropped by normalize_config

    # rr_rounds persists for NON-rr formats too (no more conditional).
    r = client.post(
        _event_url(tid, "MS"),
        json={
            "discipline": "MS",
            "format": "se",
            "rr_rounds": 2,
            "participants": _players(4),
        },
    )
    assert r.status_code == 200, r.text
    ev = next(e for e in r.json()["events"] if e["id"] == "MS")
    assert ev["rr_rounds"] == 2
    assert ev["seeded_count"] == 0


# ---- 4. PATCH gates --------------------------------------------------------


def test_patch_edits_draft_config_without_touching_participants(client, tid):
    _create_session(client, tid)
    r = client.post(
        _event_url(tid, "MS"),
        json={
            "discipline": "MS", "format": "se", "seeded_count": 0,
            "participants": _players(4),
        },
    )
    assert r.status_code == 200, r.text

    r = client.patch(
        _event_url(tid, "MS"),
        json={"seeded_count": 2, "rr_rounds": 5},
    )
    assert r.status_code == 200, r.text
    out = r.json()
    ev = next(e for e in out["events"] if e["id"] == "MS")
    assert ev["seeded_count"] == 2
    assert ev["rr_rounds"] == 5
    # Participants untouched (the upsert route would have wiped them).
    ms_participants = {p["id"] for p in out["participants"]}
    assert {"p1", "p2", "p3", "p4"} <= ms_participants


def test_patch_rejected_unless_draft(client, tid):
    _create_session(client, tid)
    r = client.post(
        _event_url(tid, "MS"),
        json={"discipline": "MS", "format": "se", "participants": _players(4)},
    )
    assert r.status_code == 200, r.text
    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r.status_code == 200, r.text

    r = client.patch(_event_url(tid, "MS"), json={"seeded_count": 2})
    assert r.status_code == 409
    assert "only draft draws" in r.text

    r = client.patch(_event_url(tid, "NOPE"), json={"seeded_count": 2})
    assert r.status_code == 404
