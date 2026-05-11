"""Tests for tournament.io.export_schedule and the round-trip property."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.schemas import ImportTournamentIn
from backend.serializers import serialize_tournament
from tournament.io.export_schedule import to_csv, to_ics
from tournament.io.import_matches import parse_json_payload


def _se_4_player_body() -> dict:
    return {
        "courts": 2,
        "total_slots": 20,
        "interval_minutes": 30,
        "rest_between_rounds": 1,
        "time_limit_seconds": 5,
        "start_time": "2026-05-12T09:00:00",
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


def _scheduled_slot():
    """Build, schedule R0, and return the slot."""
    body = ImportTournamentIn(**_se_4_player_body())
    slot = parse_json_payload(body)
    r = slot.driver.schedule_next_round()
    assert r.scheduled
    return slot


def test_csv_export_has_one_row_per_assignment():
    slot = _scheduled_slot()
    csv_text = to_csv(slot)
    lines = csv_text.strip().splitlines()
    # 1 header + 2 R0 matches scheduled = 3 lines.
    assert len(lines) == 3
    header = lines[0].split(",")
    assert "event_id" in header
    assert "court" in header
    assert "start_time" in header


def test_csv_export_includes_absolute_start_time():
    slot = _scheduled_slot()
    csv_text = to_csv(slot)
    assert "2026-05-12T09:00:00" in csv_text


def test_ics_export_well_formed():
    slot = _scheduled_slot()
    ics = to_ics(slot)
    assert ics.startswith("BEGIN:VCALENDAR")
    assert ics.rstrip().endswith("END:VCALENDAR")
    assert ics.count("BEGIN:VEVENT") == 2
    assert ics.count("END:VEVENT") == 2
    assert "PRODID:-//tournament-prototype//EN" in ics


def test_round_trip_export_import_reproduces_schedule():
    """Schedule a tournament, export to JSON-equivalent, reimport, schedule
    again — assignments should match (slot, court) tuples."""
    slot1 = _scheduled_slot()
    out = serialize_tournament(slot1)

    # Rebuild an ImportTournamentIn from the serialized state.
    events_import = []
    by_event_round: dict[str, dict[int, list]] = {}
    for pu in out.play_units:
        by_event_round.setdefault(pu.event_id, {}).setdefault(
            pu.round_index, []
        ).append(pu)

    for ev in out.events:
        ev_rounds = []
        for round_index in range(len(ev.rounds)):
            units = sorted(
                by_event_round[ev.id][round_index], key=lambda x: x.match_index
            )
            round_payload = []
            for pu in units:
                entry: dict = {"id": pu.id, "duration_slots": pu.duration_slots}
                if round_index == 0:
                    entry["side_a"] = pu.side_a
                    entry["side_b"] = pu.side_b
                else:
                    entry["feeder_a"] = pu.dependencies[0]
                    entry["feeder_b"] = pu.dependencies[1]
                round_payload.append(entry)
            ev_rounds.append(round_payload)
        events_import.append({
            "id": ev.id,
            "discipline": ev.discipline,
            "format": ev.format,
            "participants": [
                {"id": p.id, "name": p.name, "members": p.members}
                for p in out.participants
            ],
            "rounds": ev_rounds,
        })

    body2 = ImportTournamentIn(
        courts=out.courts,
        total_slots=out.total_slots,
        interval_minutes=out.interval_minutes,
        rest_between_rounds=out.rest_between_rounds,
        time_limit_seconds=5.0,
        start_time=out.start_time,
        events=events_import,
    )
    slot2 = parse_json_payload(body2)
    r = slot2.driver.schedule_next_round()
    assert r.scheduled

    assert _slot_court_tuples(slot1) == _slot_court_tuples(slot2)


def _slot_court_tuples(slot) -> set:
    return {
        (a.play_unit_id, a.slot_id, a.court_id)
        for a in slot.state.assignments.values()
    }
