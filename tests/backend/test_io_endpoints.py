"""End-to-end smoke for the import / export endpoints."""
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


def test_import_json_then_schedule_and_export_csv():
    client = TestClient(app)
    payload = {
        "courts": 2,
        "total_slots": 20,
        "interval_minutes": 30,
        "start_time": "2026-05-12T09:00:00",
        "events": [
            {
                "id": "MS",
                "format": "se",
                "participants": [
                    {"id": "p1", "name": "Alice"},
                    {"id": "p2", "name": "Bob"},
                    {"id": "p3", "name": "Carla"},
                    {"id": "p4", "name": "Dani"},
                ],
                "rounds": [
                    [
                        {"id": "MS-R0-0", "side_a": ["p1"], "side_b": ["p4"]},
                        {"id": "MS-R0-1", "side_a": ["p2"], "side_b": ["p3"]},
                    ],
                    [
                        {
                            "id": "MS-R1-0",
                            "feeder_a": "MS-R0-0",
                            "feeder_b": "MS-R0-1",
                        }
                    ],
                ],
            }
        ],
    }
    r = client.post("/tournament/import", json=payload)
    assert r.status_code == 200, r.text
    assert len(r.json()["play_units"]) == 3

    client.post("/tournament/schedule-next")

    r = client.get("/tournament/export.csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    body = r.text
    assert body.splitlines()[0].startswith("event_id,")
    assert "MS-R0-0" in body
    assert "2026-05-12T09:00:00" in body


def test_export_ics_endpoint():
    client = TestClient(app)
    client.post(
        "/tournament",
        json={
            "courts": 2,
            "total_slots": 20,
            "events": [
                {
                    "id": "MS",
                    "format": "rr",
                    "participants": [
                        {"id": "p1", "name": "A"},
                        {"id": "p2", "name": "B"},
                        {"id": "p3", "name": "C"},
                        {"id": "p4", "name": "D"},
                    ],
                }
            ],
        },
    )
    client.post("/tournament/schedule-next")
    r = client.get("/tournament/export.ics")
    assert r.status_code == 200
    assert "text/calendar" in r.headers["content-type"]
    assert r.text.startswith("BEGIN:VCALENDAR")
    assert r.text.count("BEGIN:VEVENT") == 6


def test_import_csv_endpoint():
    client = TestClient(app)
    csv_body = (
        "event_id,format,round,match_index,side_a,side_b,feeder_a,feeder_b,duration_slots\n"
        "MS,se,0,0,p1,p4,,,1\n"
        "MS,se,0,1,p2,p3,,,1\n"
        "MS,se,1,0,,,MS-R0-0,MS-R0-1,1\n"
    )
    r = client.post(
        "/tournament/import.csv?courts=2&total_slots=20",
        content=csv_body,
        headers={"content-type": "text/csv"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["events"]) == 1
    assert len(body["play_units"]) == 3
