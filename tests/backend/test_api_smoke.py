"""End-to-end smoke for the FastAPI app.

Exercises the same flow the CLI demo runs: create -> schedule first
round -> record results -> schedule next round, and reset.
"""
from __future__ import annotations

import pytest

httpx = pytest.importorskip("httpx")
fastapi = pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from backend.main import app
from backend.state import container


@pytest.fixture(autouse=True)
def _reset_container():
    container.clear()
    yield
    container.clear()


def _participants(n: int):
    return [{"id": f"P{i+1}", "name": f"P{i+1}"} for i in range(n)]


def test_round_robin_create_and_schedule():
    client = TestClient(app)
    r = client.post(
        "/tournament",
        json={
            "format": "rr",
            "participants": _participants(4),
            "courts": 2,
            "total_slots": 20,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["format"] == "rr"
    assert len(body["play_units"]) == 6
    assert body["assignments"] == []

    r = client.post("/tournament/schedule-next")
    assert r.status_code == 200, r.text
    sched = r.json()
    assert sched["status"] in ("optimal", "feasible")
    assert len(sched["play_unit_ids"]) == 6

    r = client.get("/tournament")
    body = r.json()
    assert len(body["assignments"]) == 6


def test_single_elim_full_flow():
    client = TestClient(app)
    r = client.post(
        "/tournament",
        json={
            "format": "se",
            "participants": _participants(8),
            "courts": 2,
            "total_slots": 40,
        },
    )
    assert r.status_code == 200, r.text

    # Round 0
    r = client.post("/tournament/schedule-next").json()
    assert r["status"] in ("optimal", "feasible")
    r0_ids = list(r["play_unit_ids"])
    assert len(r0_ids) == 4

    state = client.get("/tournament").json()
    assignments_by_id = {a["play_unit_id"]: a for a in state["assignments"]}
    play_units_by_id = {pu["id"]: pu for pu in state["play_units"]}

    # Top seed wins (smaller "P" index).
    for pu_id in r0_ids:
        pu = play_units_by_id[pu_id]
        a_seed = int(pu["side_a"][0][1:])
        b_seed = int(pu["side_b"][0][1:])
        winner = "A" if a_seed < b_seed else "B"
        a = assignments_by_id[pu_id]
        rr = client.post(
            "/tournament/results",
            json={
                "play_unit_id": pu_id,
                "winner_side": winner,
                "finished_at_slot": a["slot_id"] + a["duration_slots"],
            },
        )
        assert rr.status_code == 200, rr.text

    # Round 1
    r = client.post("/tournament/schedule-next").json()
    assert r["status"] in ("optimal", "feasible")
    r1_ids = list(r["play_unit_ids"])
    assert len(r1_ids) == 2


def test_match_action_start_finish_reset():
    client = TestClient(app)
    client.post(
        "/tournament",
        json={
            "format": "rr",
            "participants": _participants(4),
            "courts": 2,
            "total_slots": 20,
        },
    )
    client.post("/tournament/schedule-next")
    state = client.get("/tournament").json()
    pu_id = state["assignments"][0]["play_unit_id"]

    r = client.post(
        "/tournament/match-action",
        json={"play_unit_id": pu_id, "action": "start"},
    )
    assert r.status_code == 200, r.text
    a = next(
        a for a in r.json()["assignments"] if a["play_unit_id"] == pu_id
    )
    assert a["started"] is True
    assert a["finished"] is False

    r = client.post(
        "/tournament/match-action",
        json={"play_unit_id": pu_id, "action": "reset"},
    )
    a = next(
        a for a in r.json()["assignments"] if a["play_unit_id"] == pu_id
    )
    assert a["started"] is False


def test_delete_clears_state():
    client = TestClient(app)
    client.post(
        "/tournament",
        json={
            "format": "rr",
            "participants": _participants(4),
            "courts": 2,
            "total_slots": 20,
        },
    )
    r = client.delete("/tournament")
    assert r.status_code == 200
    r = client.get("/tournament")
    assert r.status_code == 404
