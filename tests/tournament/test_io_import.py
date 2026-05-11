"""Tests for tournament.io.import_matches."""
from __future__ import annotations

import pytest

from backend.schemas import ImportTournamentIn
from tournament.io.import_matches import parse_csv_payload, parse_json_payload


def _import_body() -> dict:
    return {
        "courts": 2,
        "total_slots": 20,
        "interval_minutes": 30,
        "rest_between_rounds": 1,
        "time_limit_seconds": 5,
        "events": [
            {
                "id": "MS",
                "discipline": "MS",
                "format": "se",
                "participants": [
                    {"id": "p1", "name": "Alice"},
                    {"id": "p2", "name": "Bob"},
                    {"id": "p3", "name": "Carla"},
                    {"id": "p4", "name": "Dani"},
                ],
                "rounds": [
                    [
                        {
                            "id": "MS-R0-0", "side_a": ["p1"], "side_b": ["p4"],
                            "duration_slots": 1,
                        },
                        {
                            "id": "MS-R0-1", "side_a": ["p2"], "side_b": ["p3"],
                            "duration_slots": 1,
                        },
                    ],
                    [
                        {
                            "id": "MS-R1-0",
                            "feeder_a": "MS-R0-0",
                            "feeder_b": "MS-R0-1",
                            "duration_slots": 1,
                        }
                    ],
                ],
            }
        ],
    }


def test_json_import_builds_runnable_tournament():
    body = ImportTournamentIn(**_import_body())
    slot = parse_json_payload(body)

    assert len(slot.draws) == 1
    assert "MS" in slot.draws
    draw = slot.draws["MS"]
    assert len(draw.rounds) == 2
    assert draw.rounds[0] == ["MS-R0-0", "MS-R0-1"]
    assert draw.rounds[1] == ["MS-R1-0"]

    # Schedule it: should solve cleanly for R0.
    r = slot.driver.schedule_next_round()
    assert r.scheduled
    assert set(r.play_unit_ids) == {"MS-R0-0", "MS-R0-1"}


def test_json_import_rejects_unknown_participant():
    body = _import_body()
    body["events"][0]["rounds"][0][0]["side_a"] = ["ghost"]
    pyd = ImportTournamentIn(**body)
    with pytest.raises(ValueError, match="unknown participant"):
        parse_json_payload(pyd)


def test_json_import_rejects_bad_feeder():
    body = _import_body()
    body["events"][0]["rounds"][1][0]["feeder_a"] = "MS-R0-99"
    pyd = ImportTournamentIn(**body)
    with pytest.raises(ValueError, match="feeders"):
        parse_json_payload(pyd)


def test_csv_import():
    csv_body = (
        "event_id,format,round,match_index,side_a,side_b,feeder_a,feeder_b,duration_slots\n"
        "MS,se,0,0,p1,p4,,,1\n"
        "MS,se,0,1,p2,p3,,,1\n"
        "MS,se,1,0,,,MS-R0-0,MS-R0-1,1\n"
    )
    slot = parse_csv_payload(
        csv_body,
        courts=2,
        total_slots=20,
        interval_minutes=30,
        rest_between_rounds=1,
        start_time=None,
        time_limit_seconds=5.0,
    )
    draw = slot.draws["MS"]
    assert [list(r) for r in draw.rounds] == [
        ["MS-R0-0", "MS-R0-1"],
        ["MS-R1-0"],
    ]
    assert {p.id for p in slot.state.participants.values()} == {
        "p1", "p2", "p3", "p4"
    }


def test_csv_import_doubles_pipe_syntax():
    csv_body = (
        "event_id,format,round,match_index,side_a,side_b,feeder_a,feeder_b,duration_slots\n"
        "XD,rr,0,0,a|b,c|d,,,1\n"
    )
    slot = parse_csv_payload(
        csv_body,
        courts=1,
        total_slots=10,
        interval_minutes=30,
        rest_between_rounds=1,
        start_time=None,
        time_limit_seconds=5.0,
    )
    pu = slot.state.play_units["XD-R0-0"]
    assert pu.side_a == ["a", "b"]
    assert pu.side_b == ["c", "d"]


def test_csv_import_rejects_non_contiguous_rounds():
    csv_body = (
        "event_id,format,round,match_index,side_a,side_b,feeder_a,feeder_b,duration_slots\n"
        "MS,se,0,0,p1,p2,,,1\n"
        "MS,se,2,0,,,MS-R0-0,MS-R0-0,1\n"
    )
    with pytest.raises(ValueError, match="contiguous"):
        parse_csv_payload(
            csv_body,
            courts=1,
            total_slots=10,
            interval_minutes=30,
            rest_between_rounds=1,
            start_time=None,
            time_limit_seconds=5.0,
        )
