"""The fictional BWF demo archive must remain importable by the real API."""

from pathlib import Path

from bracket.brackets import ImportTournamentIn
from bracket.io.import_matches import parse_json_payload
from simulator.tournament_sim.seed import (
    _EVENTS,
    _HistoricalIdentityRegistry,
    _historical_event_payload,
    attach_historical_sources,
    complete_demo_historical_draws,
    parse_text,
)


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
        body = ImportTournamentIn.model_validate(
            {
                "courts": 8,
                "total_slots": 96,
                "roster": identities.roster,
                "events": events,
            }
        )
        session = parse_json_payload(body)
        assert set(session.events) == set(_EVENTS)
        assert len(session.state.results) == sum(
            len(round_units) for event in events for round_units in event["rounds"]
        )
        parsed_matches += len(session.state.results)

    assert parsed_matches == 4_602
