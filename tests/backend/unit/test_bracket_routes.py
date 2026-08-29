"""Unit tests for the bracket routes mounted under
``/tournaments/{tid}/bracket/*`` (PR 2 of the backend-merge arc).

Coverage:

  - create / read / delete happy paths
  - 4xx error paths: no events, duplicate event id, undersized event,
    bracket-already-exists, no-bracket-on-GET, unknown tournament
  - record-result + advancement: the result row lands and downstream
    match slots resolve
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
                    {"id": f"P{i}", "name": f"Player {i}", "seed": i} for i in range(1, 5)
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


def test_event_status_round_trips_through_dto(client, tid):
    """Regression: the serialized event must carry its lifecycle status.

    EventOut previously omitted ``status`` entirely, so the Draws page —
    which defaults a missing status to 'draft' — showed every generated
    draw as DRAFT with a Generate (not Open) affordance. The DTO must
    report draft -> generated as the event is generated.
    """
    client.post(_bracket_url(tid), json=_se_4_body())
    # Freshly created: draft.
    before = client.get(_bracket_url(tid)).json()
    assert before["events"][0]["status"] == "draft"

    # Generate the event.
    g = client.post(_bracket_url(tid, "events", "MS", "generate"), json={"wipe": False})
    assert g.status_code == 200, g.text
    assert g.json()["events"][0]["status"] == "generated"

    # And it survives a fresh GET (hydration path), not just the response.
    after = client.get(_bracket_url(tid)).json()
    assert after["events"][0]["status"] == "generated"


def test_create_bracket_rejects_empty_events(client, tid):
    payload = _se_4_body()
    payload["events"] = []
    r = client.post(_bracket_url(tid), json=payload)
    assert r.status_code == 400


def test_create_bracket_rejects_undersized_event(client, tid):
    payload = _se_4_body()
    payload["events"][0]["participants"] = payload["events"][0]["participants"][:1]
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
                {"id": f"Q{i}", "name": f"Player {i}", "seed": i} for i in range(1, 5)
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


def test_historical_import_accepts_completed_matches_in_every_round(client, tid):
    payload = {
        "courts": 2,
        "total_slots": 64,
        "events": [
            {
                "id": "MS",
                "discipline": "MS",
                "format": "se",
                "record_scope": "completed_matches_only",
                "historical": True,
                "advertised_size": 32,
                "round_labels": ["Round of 16", "Quarterfinals"],
                "source_url": "https://example.test/results",
                "participants": [
                    {"id": "P1", "name": "Player 1"},
                    {"id": "P2", "name": "Player 2"},
                    {"id": "P3", "name": "Player 3"},
                    {"id": "P4", "name": "Player 4"},
                ],
                "rounds": [
                    [
                        {
                            "id": "R16-1",
                            "side_a": ["P1"],
                            "side_b": ["P2"],
                            "played_on": "2026-07-14",
                            "local_time": "9:50 AM",
                            "court_label": "Court 2",
                            "source_url": "https://example.test/results/day-1",
                            "source_ref": "matches.csv:42",
                            "result": {
                                "winner_side": "A",
                                "score": {"sets": [{"sideA": 21, "sideB": 14}]},
                            },
                        }
                    ],
                    [
                        {
                            "id": "QF-1",
                            "side_a": ["P3"],
                            "side_b": ["P4"],
                            "result": {
                                "winner_side": "B",
                                "walkover": True,
                                "reason": "walkover",
                            },
                        }
                    ],
                ],
            }
        ],
    }
    response = client.post(_bracket_url(tid, "import"), json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    event = body["events"][0]
    assert event["bracket_size"] == 32
    assert event["status"] == "completed"
    assert event["config"]["record_scope"] == "completed_matches_only"
    assert event["config"]["round_labels"] == ["Round of 16", "Quarterfinals"]
    assert len(body["results"]) == 2
    assert {result["play_unit_id"] for result in body["results"]} == {"R16-1", "QF-1"}
    first_unit = next(unit for unit in body["play_units"] if unit["id"] == "R16-1")
    assert first_unit["played_on"] == "2026-07-14"
    assert first_unit["local_time"] == "9:50 AM"
    assert first_unit["court_label"] == "Court 2"
    assert first_unit["source_ref"] == "matches.csv:42"

    hydrated = client.get(_bracket_url(tid)).json()
    assert hydrated["events"][0]["config"]["historical"] is True
    assert hydrated["events"][0]["status"] == "completed"
    assert len(hydrated["results"]) == 2
    hydrated_unit = next(unit for unit in hydrated["play_units"] if unit["id"] == "R16-1")
    assert hydrated_unit["source_url"] == "https://example.test/results/day-1"


def test_historical_import_persists_roster_and_verified_partial_feeders(client, tid):
    payload = {
        "courts": 1,
        "total_slots": 16,
        "roster": [
            {"id": "P1", "name": "Player 1"},
            {"id": "P2", "name": "Player 2"},
            {"id": "P3", "name": "Player 3"},
        ],
        "events": [
            {
                "id": "MS",
                "discipline": "MS",
                "format": "se",
                "record_scope": "completed_matches_only",
                "historical": True,
                "round_codes": ["R16", "QF"],
                "round_labels": ["Round of 16", "Quarterfinals"],
                "topology_scope": "proven_winner_advancement",
                "topology_edge_count": 1,
                "imported_match_count": 2,
                "expected_match_count": 31,
                "participants": [
                    {"id": "P1", "name": "Player 1"},
                    {"id": "P2", "name": "Player 2"},
                    {"id": "P3", "name": "Player 3"},
                ],
                "rounds": [
                    [
                        {
                            "id": "R16-1",
                            "side_a": ["P1"],
                            "side_b": ["P2"],
                            "result": {"winner_side": "A"},
                        }
                    ],
                    [
                        {
                            "id": "QF-1",
                            "side_a": ["P1"],
                            "side_b": ["P3"],
                            "feeder_a": "R16-1",
                            "result": {"winner_side": "B"},
                        }
                    ],
                ],
            }
        ],
    }
    response = client.post(_bracket_url(tid, "import"), json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    target = next(unit for unit in body["play_units"] if unit["id"] == "QF-1")
    assert target["side_a"] == ["P1"]
    assert target["side_b"] == ["P3"]
    assert target["dependencies"] == ["R16-1"]
    assert target["slot_a"]["feeder_play_unit_id"] == "R16-1"
    assert target["slot_b"]["participant_id"] == "P3"
    assert body["events"][0]["config"]["round_codes"] == ["R16", "QF"]
    assert body["events"][0]["config"]["topology_edge_count"] == 1

    from sqlalchemy import select
    from db.models import Tournament
    from db.session import SessionLocal

    with SessionLocal() as session:
        tournament = session.scalar(select(Tournament).where(Tournament.id == uuid.UUID(tid)))
        assert tournament is not None
        assert [player["id"] for player in tournament.data["bracketPlayers"]] == [
            "P1",
            "P2",
            "P3",
        ]


def test_historical_import_rejects_unproven_or_nonadjacent_feeder(client, tid):
    payload = {
        "courts": 1,
        "total_slots": 16,
        "events": [
            {
                "id": "MS",
                "record_scope": "completed_matches_only",
                "historical": True,
                "round_codes": ["R32", "QF"],
                "round_labels": ["Round of 32", "Quarterfinals"],
                "topology_scope": "proven_winner_advancement",
                "participants": [
                    {"id": "P1", "name": "Player 1"},
                    {"id": "P2", "name": "Player 2"},
                    {"id": "P3", "name": "Player 3"},
                ],
                "rounds": [
                    [
                        {
                            "id": "R32-1",
                            "side_a": ["P1"],
                            "side_b": ["P2"],
                            "result": {"winner_side": "A"},
                        }
                    ],
                    [
                        {
                            "id": "QF-1",
                            "side_a": ["P1"],
                            "side_b": ["P3"],
                            "feeder_a": "R32-1",
                            "result": {"winner_side": "B"},
                        }
                    ],
                ],
            }
        ],
    }
    response = client.post(_bracket_url(tid, "import"), json=payload)
    assert response.status_code == 400
    assert "cannot advance from 'R32' to 'QF'" in response.json()["detail"]

    payload["events"][0]["round_codes"] = ["R16", "QF"]
    payload["events"][0]["rounds"][1][0]["side_a"] = ["P2"]
    response = client.post(_bracket_url(tid, "import"), json=payload)
    assert response.status_code == 400
    assert "winner does not match side A" in response.json()["detail"]


def test_invalid_import_does_not_erase_existing_bracket(client, tid):
    created = client.post(_bracket_url(tid), json=_se_4_body())
    assert created.status_code == 200
    original_ids = {unit["id"] for unit in created.json()["play_units"]}
    invalid = {
        "courts": 1,
        "total_slots": 16,
        "events": [
            {
                "id": "bad",
                "participants": [
                    {"id": "P1", "name": "One"},
                    {"id": "P1", "name": "Duplicate"},
                ],
                "rounds": [[{"id": "bad-1", "side_a": ["P1"], "side_b": ["P1"]}]],
            }
        ],
    }
    response = client.post(_bracket_url(tid, "import"), json=invalid)
    assert response.status_code == 400
    assert "duplicate participant id" in response.json()["detail"]
    after = client.get(_bracket_url(tid))
    assert after.status_code == 200
    assert {unit["id"] for unit in after.json()["play_units"]} == original_ids


def test_import_rejects_global_unit_collision_and_unresolved_roster_member(client, tid):
    shared = {
        "participants": [
            {"id": "P1", "name": "One"},
            {"id": "P2", "name": "Two"},
        ],
        "rounds": [[{"id": "shared-unit", "side_a": ["P1"], "side_b": ["P2"]}]],
    }
    payload = {
        "courts": 1,
        "total_slots": 16,
        "events": [{"id": "MS", **shared}, {"id": "WS", **shared}],
    }
    response = client.post(_bracket_url(tid, "import"), json=payload)
    assert response.status_code == 400
    assert "duplicated across imported events" in response.json()["detail"]

    payload = {
        "courts": 1,
        "total_slots": 16,
        "roster": [{"id": "P1", "name": "One"}],
        "events": [
            {
                "id": "MD",
                "participants": [
                    {
                        "id": "PAIR",
                        "name": "One / Missing",
                        "members": ["P1", "P2"],
                    }
                ],
                "rounds": [
                    [
                        {
                            "id": "MD-1",
                            "side_a": ["PAIR"],
                            "side_b": ["PAIR"],
                        }
                    ]
                ],
            }
        ],
    }
    response = client.post(_bracket_url(tid, "import"), json=payload)
    assert response.status_code == 400
    assert "roster players that do not exist: ['P2']" in response.json()["detail"]

    payload["events"][0]["participants"] = [{"id": "P2", "name": "Missing"}]
    payload["events"][0]["rounds"] = [[{"id": "MS-1", "side_a": ["P2"], "side_b": ["P2"]}]]
    response = client.post(_bracket_url(tid, "import"), json=payload)
    assert response.status_code == 400
    assert "roster players that do not exist: ['P2']" in response.json()["detail"]


def test_historical_import_requires_a_result_for_every_record(client, tid):
    payload = {
        "courts": 1,
        "total_slots": 16,
        "events": [
            {
                "id": "MS",
                "record_scope": "completed_matches_only",
                "historical": True,
                "participants": [
                    {"id": "P1", "name": "One"},
                    {"id": "P2", "name": "Two"},
                ],
                "rounds": [[{"id": "MS-1", "side_a": ["P1"], "side_b": ["P2"]}]],
            }
        ],
    }
    response = client.post(_bracket_url(tid, "import"), json=payload)
    assert response.status_code == 400
    assert "must include its completed result" in response.json()["detail"]


def test_structural_import_still_requires_feeders_after_round_one(client, tid):
    payload = {
        "courts": 1,
        "total_slots": 16,
        "events": [
            {
                "id": "MS",
                "participants": [
                    {"id": "P1", "name": "Player 1"},
                    {"id": "P2", "name": "Player 2"},
                ],
                "rounds": [
                    [{"id": "R1", "side_a": ["P1"], "side_b": ["P2"]}],
                    [{"id": "R2", "side_a": ["P1"], "side_b": ["P2"]}],
                ],
            }
        ],
    }
    response = client.post(_bracket_url(tid, "import"), json=payload)
    assert response.status_code == 400
    assert "must declare feeder_a and feeder_b" in response.json()["detail"]


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


# ---- Record result ----------------------------------------------------------


def test_record_result_advances_downstream_slot(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = next(p for p in state["play_units"] if p["round_index"] == 0 and p["match_index"] == 0)
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
    assert any(r["play_unit_id"] == sf1["id"] and r["winner_side"] == "A" for r in body["results"])


def test_record_result_replay_does_not_duplicate_or_corrupt_advancement(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    sched = client.post(_bracket_url(tid, "schedule-next"))
    assert sched.status_code == 200, sched.text
    first_match = sched.json()["play_unit_ids"][0]
    initial_state = client.get(_bracket_url(tid)).json()
    first_play_unit = next(p for p in initial_state["play_units"] if p["id"] == first_match)
    final = next(p for p in initial_state["play_units"] if p["round_index"] == 1)

    r1 = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": first_match,
            "winner_side": "A",
            "finished_at_slot": 4,
            "walkover": False,
        },
    )
    assert r1.status_code == 200, r1.text

    from db.models import BracketEvent, BracketMatch
    from db.session import SessionLocal

    tournament_id = uuid.UUID(tid)
    with SessionLocal() as session:
        event = session.get(BracketEvent, (tournament_id, "MS"))
        assert event is not None
        event.status = "generated"
        final_row = session.get(BracketMatch, (tournament_id, "MS", final["id"]))
        assert final_row is not None
        final_row.slot_a = {
            "participant_id": None,
            "feeder_play_unit_id": first_match,
        }
        final_row.side_a = []
        session.commit()

    r2 = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": first_match,
            "winner_side": "A",
            "finished_at_slot": 4,
            "walkover": False,
        },
    )
    assert r2.status_code == 200, r2.text

    state = client.get(_bracket_url(tid))
    assert state.status_code == 200
    body = state.json()
    matching_results = [r for r in body["results"] if r["play_unit_id"] == first_match]
    assert len(matching_results) == 1
    assert matching_results[0]["winner_side"] == "A"
    assert matching_results[0]["finished_at_slot"] == 4
    assert matching_results[0]["walkover"] is False

    repaired_final = next(p for p in body["play_units"] if p["id"] == final["id"])
    assert repaired_final["slot_a"]["participant_id"] == first_play_unit["side_a"][0]
    assert repaired_final["slot_a"]["feeder_play_unit_id"] is None
    assert repaired_final["side_a"] == first_play_unit["side_a"]

    with SessionLocal() as session:
        event = session.get(BracketEvent, (tournament_id, "MS"))
        assert event is not None
        assert event.status == "started"


def test_record_result_replay_rejects_changed_metadata(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    sched = client.post(_bracket_url(tid, "schedule-next"))
    assert sched.status_code == 200, sched.text
    first_match = sched.json()["play_unit_ids"][0]

    r1 = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": first_match,
            "winner_side": "A",
            "finished_at_slot": 4,
            "walkover": False,
        },
    )
    assert r1.status_code == 200, r1.text

    changed_slot = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": first_match,
            "winner_side": "A",
            "finished_at_slot": 5,
            "walkover": False,
        },
    )
    assert changed_slot.status_code == 409, changed_slot.text

    changed_walkover = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": first_match,
            "winner_side": "A",
            "finished_at_slot": 4,
            "walkover": True,
        },
    )
    assert changed_walkover.status_code == 409, changed_walkover.text

    state = client.get(_bracket_url(tid))
    assert state.status_code == 200
    matching_results = [r for r in state.json()["results"] if r["play_unit_id"] == first_match]
    assert matching_results == [
        {
            "play_unit_id": first_match,
            "winner_side": "A",
            "walkover": False,
            "finished_at_slot": 4,
            "score": None,
            # (task 5b) reason: Optional annotation field added to
            # ResultOut; None here since this test never sends one.
            "reason": None,
        }
    ]


def test_record_result_replay_rejects_changed_winner(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    sched = client.post(_bracket_url(tid, "schedule-next"))
    assert sched.status_code == 200, sched.text
    first_match = sched.json()["play_unit_ids"][0]

    r1 = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_match, "winner_side": "A"},
    )
    assert r1.status_code == 200, r1.text

    r2 = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_match, "winner_side": "B"},
    )
    assert r2.status_code == 409, r2.text

    state = client.get(_bracket_url(tid))
    assert state.status_code == 200
    matching_results = [r for r in state.json()["results"] if r["play_unit_id"] == first_match]
    assert len(matching_results) == 1
    assert matching_results[0]["winner_side"] == "A"


def test_bracket_match_action_rejects_finish_before_start(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    sched = client.post(_bracket_url(tid, "schedule-next"))
    assert sched.status_code == 200, sched.text
    match_id = sched.json()["play_unit_ids"][0]

    r = client.post(
        _bracket_url(tid, "match-action"),
        json={"play_unit_id": match_id, "action": "finish"},
    )

    assert r.status_code == 409


def _schedule_and_start_first(client, tid) -> str:
    """Schedule the first round and start its first match. Returns the
    started play_unit id."""
    sched = client.post(_bracket_url(tid, "schedule-next"))
    assert sched.status_code == 200, sched.text
    match_id = sched.json()["play_unit_ids"][0]
    started = client.post(
        _bracket_url(tid, "match-action"),
        json={"play_unit_id": match_id, "action": "start"},
    )
    assert started.status_code == 200, started.text
    return match_id


def test_bracket_match_action_rejects_start_after_result(client, tid):
    """Regression (M4): 'start' on a match that already has a result is
    rejected — it would otherwise wipe ``actual_end_slot`` and shift the
    next round's scheduling baseline."""
    client.post(_bracket_url(tid), json=_se_4_body())
    match_id = _schedule_and_start_first(client, tid)
    rec = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": match_id, "winner_side": "A", "finished_at_slot": 1},
    )
    assert rec.status_code == 200, rec.text

    r = client.post(
        _bracket_url(tid, "match-action"),
        json={"play_unit_id": match_id, "action": "start"},
    )
    assert r.status_code == 409, r.text


def test_bracket_match_action_rejects_reset_after_result(client, tid):
    """Regression (M5): 'reset' on a resulted match is rejected — reset
    does not un-advance the winner, so it would leave the bracket in an
    inconsistent state with no recovery path."""
    client.post(_bracket_url(tid), json=_se_4_body())
    match_id = _schedule_and_start_first(client, tid)
    rec = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": match_id, "winner_side": "A", "finished_at_slot": 1},
    )
    assert rec.status_code == 200, rec.text

    r = client.post(
        _bracket_url(tid, "match-action"),
        json={"play_unit_id": match_id, "action": "reset"},
    )
    assert r.status_code == 409, r.text


def test_bracket_match_action_reset_clears_start_before_result(client, tid):
    """A started-but-not-resulted match can still be reset (the Undo
    Start affordance) — the guard only blocks reset once a result exists."""
    client.post(_bracket_url(tid), json=_se_4_body())
    match_id = _schedule_and_start_first(client, tid)
    r = client.post(
        _bracket_url(tid, "match-action"),
        json={"play_unit_id": match_id, "action": "reset"},
    )
    assert r.status_code == 200, r.text
    a = next(a for a in r.json()["assignments"] if a["play_unit_id"] == match_id)
    assert a["actual_start_slot"] is None
    assert a["started"] is False


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


# ---- Deep walkover-cascade persistence (regression for H1) ------------------


def _two_layer_bye_import_body() -> dict:
    """Crafted import: a real QF + a double-bye QF feeding the same SF,
    whose winner feeds the final.

    Top half:  QF0 (P1 vs P2, real) and QF1 (bye vs bye) feed SF0.
    Bottom half: SF1 (P3 vs P4, real, no byes) so it never cascades.
    Final F0 feeds from SF0 and SF1.

    At import, QF1's double-bye auto-walkovers and propagates a BYE into
    SF0.side_b. SF0.side_a stays a feeder on the real QF0. Recording QF0
    then unblocks a TWO-layer cascade: SF0 walks over (side_b is a bye)
    and SF0's winner must propagate into F0.side_a — a unit two layers
    below the recorded match, and NOT a direct dependent of QF0.
    """
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
                "participants": [{"id": f"P{i}", "name": f"Player {i}"} for i in range(1, 5)],
                "rounds": [
                    [
                        {"id": "QF0", "side_a": ["P1"], "side_b": ["P2"]},
                        {"id": "QF1", "side_a": None, "side_b": None},
                        {"id": "QF2", "side_a": ["P3"], "side_b": ["P4"]},
                        {"id": "QF3", "side_a": None, "side_b": None},
                    ],
                    [
                        {"id": "SF0", "feeder_a": "QF0", "feeder_b": "QF1"},
                        {"id": "SF1", "feeder_a": "QF2", "feeder_b": "QF3"},
                    ],
                    [{"id": "F0", "feeder_a": "SF0", "feeder_b": "SF1"}],
                ],
            }
        ],
    }


def _pu(body: dict, pu_id: str) -> dict:
    return next(p for p in body["play_units"] if p["id"] == pu_id)


def test_record_result_persists_deep_walkover_cascade(client, tid):
    """Regression (H1): recording a result that unblocks a multi-layer
    bye cascade must PERSIST the winner two layers down, not just the
    direct dependent.

    The bug: ``_persist_result_advancement`` only writes rows for the
    ids returned by ``record_result``, which (before the fix) excluded
    units touched by ``_sweep_walkovers`` beyond the first dependency
    layer. The in-memory POST response looked correct, but a fresh GET
    (re-hydrated from the DB) showed the final's slot still empty — the
    champion's path was silently lost on reload.
    """
    imp = client.post(_bracket_url(tid, "import"), json=_two_layer_bye_import_body())
    assert imp.status_code == 200, imp.text

    # Sanity on the imported shape: SF0's bye side resolved at import,
    # but F0's top slot is still an (unresolved) feeder on SF0.
    state = imp.json()
    assert _pu(state, "F0")["slot_a"]["feeder_play_unit_id"] == "SF0"
    assert _pu(state, "F0")["slot_a"]["participant_id"] is None

    # Record the real QF0 (P1 wins). This unblocks SF0 (its other side
    # is a bye) which must auto-advance P1 into F0.side_a.
    r = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": "QF0", "winner_side": "A", "finished_at_slot": 1},
    )
    assert r.status_code == 200, r.text
    # The POST response (in-memory) advances P1 into F0 correctly.
    assert _pu(r.json(), "F0")["slot_a"]["participant_id"] == "P1"

    # The real assertion: a FRESH GET re-hydrates from the DB. If the
    # cascade was persisted, F0.side_a is P1 here too. Before the fix
    # this was None — the final was never schedulable on reload.
    fresh = client.get(_bracket_url(tid)).json()
    f0 = _pu(fresh, "F0")
    assert f0["slot_a"]["participant_id"] == "P1", (
        f"deep walkover cascade was not persisted: F0.slot_a is {f0['slot_a']} after reload"
    )
    assert f0["side_a"] == ["P1"]


# ---- bracket_session preservation across meet-side state writes -------------


def test_meet_side_put_state_preserves_bracket_session(client, tid):
    """Regression: PUT /tournaments/{id}/state must NOT wipe bracket_session.

    Before the fix, ``commit_tournament_state`` called ``upsert_data``
    with the raw ``TournamentStateDTO`` payload, which has no
    ``bracket_session`` key. ``_stamp_payload`` replaced ``row.data``
    unconditionally, silently erasing every bracket assignment.

    The critical payload inside bracket_session is ``assignments`` — the
    per-play-unit court/slot scheduling state. We inject a synthetic
    assignment directly into the DB so the test doesn't depend on the
    solver finding a solution within a time limit.
    """
    from sqlalchemy import select
    from db.models import Tournament
    from db.session import SessionLocal

    # 1. Create a bracket — this writes bracket_session into tournaments.data.
    r = client.post(_bracket_url(tid), json=_se_4_body())
    assert r.status_code == 200, r.text

    # Retrieve the play-unit id of the first semifinal so we can anchor
    # the synthetic assignment.
    bracket_state = r.json()
    first_pu_id = bracket_state["play_units"][0]["id"]

    # 2. Inject a synthetic assignment into bracket_session["assignments"]
    #    to simulate what the scheduler persists after schedule-next runs.
    with SessionLocal() as session:
        row = session.scalar(select(Tournament).where(Tournament.id == uuid.UUID(tid)))
        assert row is not None
        assert "bracket_session" in (row.data or {}), (
            "bracket_session should be set after bracket creation"
        )
        data = dict(row.data)
        bs = dict(data["bracket_session"])
        bs["assignments"] = [
            {
                "play_unit_id": first_pu_id,
                "slot_id": 0,
                "court_id": 1,
                "duration_slots": 1,
                "actual_start_slot": 0,
                "actual_end_slot": 1,
            }
        ]
        data["bracket_session"] = bs
        row.data = data
        session.commit()

    # 3. Do a meet-side PUT /state with a minimal payload (no bracket_session).
    minimal_state = {
        "version": 1,
        "matches": [],
        "groups": [],
        "players": [],
    }
    r2 = client.put(f"/tournaments/{tid}/state", json=minimal_state)
    assert r2.status_code == 200, r2.text

    # 4. GET /bracket — verify bracket_session survived with assignments intact.
    r3 = client.get(_bracket_url(tid))
    assert r3.status_code == 200, (
        f"GET /bracket returned {r3.status_code} after meet-side PUT — bracket_session was wiped"
    )
    body = r3.json()
    assert body["courts"] == 2
    assert len(body["events"]) == 1
    assert len(body["play_units"]) == 3
    # The synthetic assignment must survive the meet-side PUT.
    assert len(body["assignments"]) == 1, (
        f"Expected 1 assignment but got {len(body['assignments'])} — "
        "bracket_session['assignments'] was wiped by the meet-side PUT"
    )
    assert body["assignments"][0]["play_unit_id"] == first_pu_id
