"""The fictional BWF demo archive must remain importable by the real API."""

from pathlib import Path

from bracket.brackets import ImportTournamentIn
from bracket.io.import_matches import parse_json_payload
from simulator.tournament_sim.seed import (
    _EVENTS,
    _HistoricalIdentityRegistry,
    _demo_court_count,
    _demo_operational_event,
    _demo_plan,
    _demo_setup_sections,
    _slug,
    _historical_event_payload,
    attach_historical_sources,
    complete_demo_historical_draws,
    parse_text,
)
from workspaces.setup import _SECTION_ADAPTER


def test_import_can_install_a_complete_plan_atomically():
    body = ImportTournamentIn.model_validate(
        {
            "courts": 4,
            "total_slots": 32,
            "roster": [{"id": "p1", "name": "A"}, {"id": "p2", "name": "B"}],
            "events": [
                {
                    "id": "MS",
                    "discipline": "MS",
                    "participants": [{"id": "p1", "name": "A"}, {"id": "p2", "name": "B"}],
                    "rounds": [[{"id": "MS-F", "side_a": ["p1"], "side_b": ["p2"]}]],
                }
            ],
            "assignments": [
                {"play_unit_id": "MS-F", "slot_id": 6, "court_id": 2, "duration_slots": 2}
            ],
        }
    )

    session = parse_json_payload(body)

    assignment = session.state.assignments["MS-F"]
    assert (assignment.slot_id, assignment.court_id, assignment.duration_slots) == (6, 2, 2)


def test_import_plan_rejects_a_foreign_match_id():
    body = ImportTournamentIn.model_validate(
        {
            "courts": 1,
            "total_slots": 8,
            "events": [
                {
                    "id": "MS",
                    "participants": [{"id": "p1", "name": "A"}, {"id": "p2", "name": "B"}],
                    "rounds": [[{"id": "MS-F", "side_a": ["p1"], "side_b": ["p2"]}]],
                }
            ],
            "assignments": [{"play_unit_id": "not-this-draw", "slot_id": 0, "court_id": 0}],
        }
    )

    import pytest

    with pytest.raises(ValueError, match="unknown play unit"):
        parse_json_payload(body)


def test_import_plan_rejects_zero_based_court_ids():
    """Court 0 is the negative control for the scheduler's 1..N domain."""
    body = ImportTournamentIn.model_validate(
        {
            "courts": 1,
            "total_slots": 8,
            "events": [
                {
                    "id": "MS",
                    "participants": [{"id": "p1", "name": "A"}, {"id": "p2", "name": "B"}],
                    "rounds": [[{"id": "MS-F", "side_a": ["p1"], "side_b": ["p2"]}]],
                }
            ],
            "assignments": [{"play_unit_id": "MS-F", "slot_id": 0, "court_id": 0}],
        }
    )

    import pytest

    with pytest.raises(ValueError, match="outside 1..1"):
        parse_json_payload(body)


def test_all_complete_demo_tournaments_parse_through_the_api_contract():
    fixtures = Path(__file__).resolve().parents[3] / "simulator" / "fixtures"
    dataset = parse_text((fixtures / "bwf-recent-completed.txt").read_text(encoding="utf-8"))
    attach_historical_sources(
        dataset,
        source_map_path=fixtures / "bwf-full-match-sources.json",
    )
    complete_demo_historical_draws(dataset)

    parsed_matches = 0
    for tournament in dataset.tournaments:
        identities = _HistoricalIdentityRegistry(tournament.id)
        rows = dataset.historical_by_tournament[tournament.id]
        events = [
            _historical_event_payload(
                tournament,
                event,
                [row for row in rows if row.event == event],
                dataset.historical_coverage[tournament.id],
                identities,
            )
            for event in _EVENTS
        ]
        start_time, total_slots, assignments, _ = _demo_plan(tournament, rows, events)
        body = ImportTournamentIn.model_validate(
            {
                "courts": _demo_court_count(tournament.id),
                "total_slots": total_slots,
                "start_time": start_time,
                "roster": identities.roster,
                "events": events,
                "assignments": assignments,
            }
        )
        session = parse_json_payload(body)
        assert set(session.events) == set(_EVENTS)
        assert len(session.state.assignments) == len(session.state.play_units)
        assert {item.court_id for item in session.state.assignments.values()} == set(
            range(1, _demo_court_count(tournament.id) + 1)
        )
        assert len(session.state.results) == sum(
            len(round_units) for event in events for round_units in event["rounds"]
        )
        parsed_matches += len(session.state.results)

    assert parsed_matches == 4_602


def test_demo_operational_overlays_are_scheduled_and_have_expected_results():
    fixtures = Path(__file__).resolve().parents[3] / "simulator" / "fixtures"
    dataset = parse_text((fixtures / "bwf-recent-completed.txt").read_text(encoding="utf-8"))
    attach_historical_sources(dataset, source_map_path=fixtures / "bwf-full-match-sources.json")
    complete_demo_historical_draws(dataset)

    expected_results = {"T029": 50, "T030": 0}
    for tournament_id, result_count in expected_results.items():
        tournament = next(row for row in dataset.tournaments if row.id == tournament_id)
        rows = dataset.historical_by_tournament[tournament_id]
        identities = _HistoricalIdentityRegistry(tournament_id)
        events = [
            _demo_operational_event(
                _historical_event_payload(
                    tournament,
                    code,
                    [row for row in rows if row.event == code],
                    dataset.historical_coverage[tournament_id],
                    identities,
                ),
                tournament_id,
            )
            for code in _EVENTS
        ]
        start_time, total_slots, assignments, live_ids = _demo_plan(tournament, rows, events)
        body = ImportTournamentIn.model_validate(
            {
                "courts": _demo_court_count(tournament_id),
                "total_slots": total_slots,
                "start_time": start_time,
                "roster": identities.roster,
                "events": events,
                "assignments": assignments,
            }
        )
        session = parse_json_payload(body)

        assert len(session.state.play_units) == 155
        assert len(session.state.assignments) == (131 if tournament_id == "T029" else 155)
        assert len(session.state.results) == result_count
        assert len(live_ids) == (6 if tournament_id == "T029" else 0)
        expected_courts = set(range(1, 7 if tournament_id == "T029" else 9))
        assert {item.court_id for item in session.state.assignments.values()} == expected_courts
        if tournament_id == "T029":
            live_units = [session.state.play_units[play_unit_id] for play_unit_id in live_ids]
            assert all(unit.side_a and unit.side_b for unit in live_units)
            assert all(
                participant_id in session.state.participants
                for unit in live_units
                for participant_id in (*unit.side_a, *unit.side_b)
            )
            queued_units = [
                unit
                for unit in session.state.play_units.values()
                if unit.id not in session.state.assignments
                and unit.id not in session.state.results
            ]
            assert len(queued_units) == 24
            assert all(unit.side_a and unit.side_b for unit in queued_units)
        assert all(row.local_time and row.court for row in rows)

        sections = _demo_setup_sections(tournament, rows, slug=_slug(tournament))
        assert set(sections) == {
            "general", "dates", "venue", "events", "rules", "entries", "people", "public-info"
        }
        for key, data in sections.items():
            _SECTION_ADAPTER.validate_python({"section": key, **data})
