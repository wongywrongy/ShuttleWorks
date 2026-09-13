"""SP-E4 — bracket Sets scoring round-trip.

When the bracket Engine runs in Sets mode the operator records a set-by-set
score, not just a winner. ``bracket_results.score`` is already a JSON column,
so this needs no Alembic migration — only the route + serializer must carry
the payload end-to-end.

Coverage:
  - POST /results with a ``score`` JSON body persists it and the recorded
    result echoes the score back.
  - The score survives a reload (fresh GET serializes it from the DB row),
    proving the JSON blob round-trips without a migration.
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
    return seed_tournament(client, "Bracket Score Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _se_4_body() -> dict:
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


def test_record_result_persists_set_score_json(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = next(
        p
        for p in state["play_units"]
        if p["round_index"] == 0 and p["match_index"] == 0
    )

    score = {"sets": [{"sideA": 21, "sideB": 18}, {"sideA": 21, "sideB": 19}]}
    r = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": sf1["id"],
            "winner_side": "A",
            "finished_at_slot": 0,
            "score": score,
        },
    )
    assert r.status_code == 200, r.text
    recorded = next(
        res for res in r.json()["results"] if res["play_unit_id"] == sf1["id"]
    )
    assert recorded["score"] == score


def test_set_score_survives_reload(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = next(
        p
        for p in state["play_units"]
        if p["round_index"] == 0 and p["match_index"] == 0
    )

    score = {"sets": [{"sideA": 21, "sideB": 15}, {"sideA": 19, "sideB": 21}, {"sideA": 21, "sideB": 17}]}
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": sf1["id"], "winner_side": "A", "score": score},
    )

    # Fresh GET re-serializes the result from the persisted DB row.
    reloaded = client.get(_bracket_url(tid)).json()
    persisted = next(
        res for res in reloaded["results"] if res["play_unit_id"] == sf1["id"]
    )
    assert persisted["score"] == score


@pytest.mark.parametrize("score", [
    {"sets": [{"sideA": 5, "sideB": 21}, {"sideA": 7, "sideB": 21}]},
    {"sets": [{"sideA": True, "sideB": 0}]},
    {"sets": [{"sideA": 21, "sideB": 20}]},
    {"sets": [{"sideA": 21, "sideB": 10}] * 3},
    {"sets": [{"sideA": 25, "sideB": 10}] * 2},
])
def test_invalid_live_score_does_not_write_or_advance(client, tid, score):
    assert client.post(_bracket_url(tid), json=_se_4_body()).status_code == 200
    before = client.get(_bracket_url(tid)).json()
    response = client.post(_bracket_url(tid, "results"), json={
        "play_unit_id": "MS-R0-0", "winner_side": "A", "score": score,
    })
    assert response.status_code == 400, response.text
    after = client.get(_bracket_url(tid)).json()
    assert after["results"] == before["results"]
    assert after["play_units"] == before["play_units"]


@pytest.mark.parametrize("cap,a,b,valid", [
    (None, 30, 29, False), (None, 31, 29, True),
    (25, 25, 24, True), (35, 30, 29, False), (35, 35, 34, True),
])
def test_configured_caps(cap, a, b, valid):
    from bracket.result_validation import validate_result
    config = {"pointCap": cap, "setsToWin": 1}
    score = {"sets": [{"sideA": a, "sideB": b}]}
    if valid:
        validate_result(config, "A", score)
    else:
        with pytest.raises(ValueError):
            validate_result(config, "A", score)



def test_correct_result_updates_feeder_and_rejects_stale_version(client, tid):
    import uuid
    assert client.post(_bracket_url(tid), json=_se_4_body()).status_code == 200
    first = client.post(_bracket_url(tid, "commands"), json={
        "id": str(uuid.uuid4()), "kind": "record_result", "play_unit_id": "MS-R0-0",
        "winner_side": "A", "seen_version": 1,
    })
    assert first.status_code == 200, first.text
    version = next(p["version"] for p in first.json()["play_units"] if p["id"] == "MS-R0-0")
    body = {"id": str(uuid.uuid4()), "kind": "correct_result", "play_unit_id": "MS-R0-0",
            "winner_side": "B", "seen_version": version}
    from db.models import Match, MatchState
    from db.session import SessionLocal
    with SessionLocal() as db:
        db.add(Match(tournament_id=uuid.UUID(tid), id="MS-R1-0", court_id=2, time_slot=8, status="scheduled", version=1))
        db.flush()
        db.add(MatchState(tournament_id=uuid.UUID(tid), match_id="MS-R1-0", status="scheduled", original_court_id=2, original_slot_id=8))
        db.commit()
    corrected = client.post(_bracket_url(tid, "commands"), json=body)
    assert corrected.status_code == 200, corrected.text
    with SessionLocal() as db:
        match = db.get(Match, (uuid.UUID(tid), "MS-R1-0"))
        overlay = db.get(MatchState, (uuid.UUID(tid), "MS-R1-0"))
        assert (match.court_id, match.time_slot, match.version) == (None, None, 2)
        assert (overlay.original_court_id, overlay.original_slot_id) == (None, None)
    units = {p["id"]: p for p in corrected.json()["play_units"]}
    assert units["MS-R1-0"]["side_a"] == units["MS-R0-0"]["side_b"]
    assert client.get(_bracket_url(tid)).json()["results"] == corrected.json()["results"]
    assert client.post(_bracket_url(tid, "commands"), json=body).status_code == 200
    body["id"] = str(uuid.uuid4())
    assert client.post(_bracket_url(tid, "commands"), json=body).status_code == 409


@pytest.mark.parametrize("score", [
    {"sets": [{"sideA": 25, "sideB": 10}]},
    {"sets": [{"sideA": 30, "sideB": 30}]},
    {"sets": [{"sideA": 10, "sideB": 21}] * 2},
])
def test_interrupted_result_cannot_overrun_or_reverse_a_completed_match(score):
    from bracket.result_validation import validate_result
    with pytest.raises(ValueError):
        validate_result({"pointCap": 30, "setsToWin": 2}, "A", score, reason="retired")
