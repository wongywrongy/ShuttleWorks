"""End-to-end smoke for the FastAPI app (multi-event-aware).

Exercises the same flow the CLI demo runs: create -> schedule first
round -> record results -> schedule next round, and reset. Plus a
multi-event round so cross-event player conflicts are exercised.
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


def _participants(n: int, prefix: str = "P"):
    return [{"id": f"{prefix}{i+1}", "name": f"{prefix}{i+1}"} for i in range(n)]


def test_round_robin_create_and_schedule():
    client = TestClient(app)
    r = client.post(
        "/tournament",
        json={
            "courts": 2,
            "total_slots": 20,
            "events": [
                {
                    "id": "RR",
                    "discipline": "MS",
                    "format": "rr",
                    "participants": _participants(4),
                }
            ],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["events"]) == 1
    assert body["events"][0]["format"] == "rr"
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
            "courts": 2,
            "total_slots": 40,
            "events": [
                {
                    "id": "MS",
                    "discipline": "MS",
                    "format": "se",
                    "participants": _participants(8),
                }
            ],
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


def test_multi_event_no_cross_event_conflicts():
    """Two events sharing players still produce a valid one-pass schedule."""
    client = TestClient(app)
    r = client.post(
        "/tournament",
        json={
            "courts": 2,
            "total_slots": 30,
            "events": [
                {
                    "id": "MS",
                    "discipline": "MS",
                    "format": "rr",
                    "participants": _participants(4, "P"),
                },
                {
                    "id": "XD",
                    "discipline": "XD",
                    "format": "rr",
                    # XD pair "P1/W1" reuses P1 from MS.
                    "participants": [
                        {"id": "X1", "name": "P1/W1", "members": ["P1", "W1"]},
                        {"id": "X2", "name": "P2/W2", "members": ["P2", "W2"]},
                        {"id": "X3", "name": "P3/W3", "members": ["P3", "W3"]},
                        {"id": "X4", "name": "P4/W4", "members": ["P4", "W4"]},
                    ],
                },
            ],
        },
    )
    assert r.status_code == 200, r.text
    state = r.json()
    assert len(state["events"]) == 2
    # 6 MS + 6 XD = 12 PlayUnits
    assert len(state["play_units"]) == 12

    r = client.post("/tournament/schedule-next").json()
    assert r["status"] in ("optimal", "feasible")
    assert len(r["play_unit_ids"]) == 12

    # Verify no player double-booked at the same slot.
    state = client.get("/tournament").json()
    pu_by_id = {p["id"]: p for p in state["play_units"]}
    by_slot: dict[int, set[str]] = {}
    for a in state["assignments"]:
        pu = pu_by_id[a["play_unit_id"]]
        slot_players = by_slot.setdefault(a["slot_id"], set())
        for token in (pu["side_a"] or []) + (pu["side_b"] or []):
            assert token not in slot_players, (
                f"player {token} double-booked at slot {a['slot_id']}"
            )
            slot_players.add(token)


def test_match_action_start_finish_reset():
    client = TestClient(app)
    client.post(
        "/tournament",
        json={
            "courts": 2,
            "total_slots": 20,
            "events": [
                {
                    "id": "RR",
                    "format": "rr",
                    "participants": _participants(4),
                }
            ],
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
            "courts": 2,
            "total_slots": 20,
            "events": [
                {
                    "id": "RR",
                    "format": "rr",
                    "participants": _participants(4),
                }
            ],
        },
    )
    r = client.delete("/tournament")
    assert r.status_code == 200
    r = client.get("/tournament")
    assert r.status_code == 404
