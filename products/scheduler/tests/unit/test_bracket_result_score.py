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
