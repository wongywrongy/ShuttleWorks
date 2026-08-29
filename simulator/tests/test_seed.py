from __future__ import annotations

from pathlib import Path
import re

import pytest

from tournament_sim.seed import (
    _EVENTS,
    DatasetError,
    Tournament,
    _HistoricalIdentityRegistry,
    _historical_event_payload,
    apply,
    attach_historical_sources,
    complete_demo_historical_draws,
    parse_notes_text,
    parse_score,
    parse_text,
    preview,
    reset,
    status,
)
from tournament_sim.historical_matches import HistoricalMatch, SourceCoverage


SOURCE = """# counts tournaments=1 matches=5 unique_players=6
T|T001|2025|1-6 January|2025-01-06|Demo Open|Paris, France|Demo Hall|Super 100|$110,000|32MS/32WS/32MD/32WD/32XD|https://example.test/t
M|M0001|T001|MS|mens_singles_final|Alice|Bob|21–19, 21-18|https://example.test/m
M|M0002|T001|WS|womens_singles_final|Carol|Dave|21–10, 21–9|https://example.test/m
M|M0003|T001|MD|mens_doubles_final|Alice;Bob|Dave;Eve|Walkover|https://example.test/m
M|M0004|T001|WD|womens_doubles_final|Carol;Eve|Alice;Dave|21–19, 10–21, 21–18|https://example.test/m
M|M0005|T001|XD|mixed_doubles_final|Alice;Carol|Bob;Dave|21–19, 18–21, 21–17 (retired)|https://example.test/m
P|P0001|Alice
P|P0002|Bob
P|P0003|Carol
P|P0004|Dave
P|P0005|Eve
P|P0006|Nur Izzuddin
"""

NOTES = """# companion test fixture
TNOTE|T001|Demo Open|2025
Dates: 1-6 January 2025; completion date 2025-01-06.
Location: Paris, France. Venue: Demo Hall.
Level: Super 100 - BWF Tour development event.
Prize: $110,000.
Draw format: 32MS/32WS/32MD/32WD/32XD - five 32-entry draws.
Timing note: The event ran across the listed window; only five finals are supplied.
Source: https://example.test/t
"""


class FakeClient:
    def __init__(self):
        self.created = []
        self.imported = []
        self.commands = []
        self.pages = []
        self.events = []
        self.publications = []
        self.deleted = []

    def create_tournament(self, name, kind="meet", modules=None, tournament_date=None):
        tid = f"workspace-{len(self.created) + 1}"
        self.created.append((tid, name, kind, tournament_date))
        return {"id": tid}

    def import_bracket(self, tid, body):
        self.imported.append((tid, body))
        return {}

    def get_bracket(self, tid):
        imported_events = self.imported[-1][1]["events"]
        units = [
            {"event_id": event["id"], "id": unit["id"]}
            for event in imported_events
            for event_round in event["rounds"]
            for unit in event_round
        ]
        embedded_results = [
            {"play_unit_id": unit["id"], **unit["result"]}
            for event in imported_events
            for event_round in event["rounds"]
            for unit in event_round
            if unit.get("result") is not None
        ]
        return {
            "play_units": units,
            "events": [{"id": event["id"]} for event in imported_events],
            "results": embedded_results
            + [body for command_tid, body in self.commands if command_tid == tid],
        }

    def bracket_command(self, tid, body):
        self.commands.append((tid, body))
        return {}

    def upsert_entry_page(self, tid, body):
        self.pages.append((tid, body))
        return {}

    def create_entry_event(self, tid, body):
        self.events.append((tid, body))
        return {}

    def patch_entry_page_publication(self, tid, body):
        self.publications.append((tid, body))
        return {}

    def entry_page_projection(self, slug):
        class Response:
            status_code = 200

        return Response()

    def display_token(self, tid):
        return {"token": f"display-{tid}"}

    def delete_tournament(self, tid):
        self.deleted.append(tid)


def test_parse_complete_source_and_preserve_near_duplicate_names():
    dataset = parse_text(SOURCE)
    assert len(dataset.tournaments) == 1
    assert len(dataset.matches) == 5
    assert len(dataset.players) == 6
    assert dataset.players_by_id["P0006"].name == "Nur Izzuddin"
    assert parse_score("21–17, 21-19 (retired)", line=1).retired
    assert parse_score("Walkover", line=1).walkover


def test_supplied_bwf_fixture_has_declared_counts():
    fixture = Path(__file__).resolve().parents[1] / "fixtures" / "bwf-recent-completed.txt"
    dataset = parse_text(fixture.read_text(encoding="utf-8"))
    assert len(dataset.tournaments) == 30
    assert len(dataset.matches) == 150
    assert len(dataset.players) == 232
    assert [t.id for t in dataset.tournaments] == [f"T{i:03d}" for i in range(1, 31)]
    assert [m.id for m in dataset.matches] == [f"M{i:04d}" for i in range(1, 151)]
    assert [p.id for p in dataset.players] == [f"P{i:04d}" for i in range(1, 233)]


def test_supplied_bwf_notes_reconcile_all_thirty_tournaments():
    fixtures = Path(__file__).resolve().parents[1] / "fixtures"
    dataset = parse_text((fixtures / "bwf-recent-completed.txt").read_text(encoding="utf-8"))
    notes = parse_notes_text(
        (fixtures / "bwf-recent-completed-notes.txt").read_text(encoding="utf-8"),
        dataset.tournaments,
    )
    assert [note.tournament_id for note in notes] == [f"T{i:03d}" for i in range(1, 31)]
    assert {note.draw_format for note in notes} == {
        "8MS/8WS/8MD/8WD/8XD",
        "32MS/32WS/32MD/32WD/32XD",
        "48MS/32WS/32MD/32WD/32XD",
    }


def test_notes_companion_is_strictly_reconciled_and_retains_prose():
    dataset = parse_text(SOURCE)
    notes = parse_notes_text(NOTES, dataset.tournaments)
    assert len(notes) == 1
    assert notes[0].tournament_id == "T001"
    assert notes[0].level_description == "BWF Tour development event"
    assert notes[0].draw_description == "five 32-entry draws"
    assert "only five finals" in notes[0].timing_note


@pytest.mark.parametrize(
    ("old", "new", "diagnostic"),
    [
        ("Demo Open", "Wrong Open", "name"),
        ("2025-01-06", "2025-01-07", "completion date"),
        ("Paris, France", "Lyon, France", "location"),
        ("Demo Hall", "Other Hall", "venue"),
        ("Super 100 -", "Super 300 -", "level"),
        ("$110,000.", "$250,000.", "prize"),
        ("32MS/32WS/32MD/32WD/32XD -", "48MS/32WS/32MD/32WD/32XD -", "draw format"),
        ("https://example.test/t", "https://example.test/other", "source"),
    ],
)
def test_notes_companion_rejects_field_drift(old: str, new: str, diagnostic: str):
    with pytest.raises(DatasetError, match=diagnostic):
        parse_notes_text(NOTES.replace(old, new), parse_text(SOURCE).tournaments)


def test_preview_is_write_free():
    dataset = parse_text(SOURCE)
    assert preview(dataset) == {
        "sourceSha256": dataset.source_sha256,
        "tournaments": 1,
        "matches": 5,
        "players": 6,
        "events": 5,
        "tournamentIds": ["T001"],
        "warnings": ["walkover result", "retired result"],
    }


def test_parser_reports_line_and_player_errors():
    with pytest.raises(DatasetError, match="line 3: match player 'Missing' is absent"):
        parse_text(SOURCE.replace("|Alice|Bob|", "|Missing|Bob|"))


def test_apply_checkpoints_and_same_hash_noop(tmp_path: Path):
    client = FakeClient()
    dataset = parse_text(SOURCE)
    first = apply(dataset, client, seed_key="bwf-demo", run_dir=tmp_path)
    assert first["status"] == "complete"
    assert len(client.created) == 1
    assert len(client.imported[0][1]["events"]) == 5
    assert len(client.commands) == 5
    assert len(client.events) == 5
    assert first["seedFormatVersion"] == 2
    assert first["matchCount"] == 5
    assert first["playerCount"] == 5
    assert first["topologyEdgeCount"] == 0
    assert len(client.imported[0][1]["roster"]) == 5
    assert client.publications == [
        ("workspace-1", {"drawsPublished": True, "resultsPublished": True})
    ]
    second = apply(dataset, client, seed_key="bwf-demo", run_dir=tmp_path)
    assert second["noop"] is True
    assert len(client.created) == 1


def test_apply_rejects_changed_hash_and_reset_is_scoped(tmp_path: Path):
    client = FakeClient()
    dataset = parse_text(SOURCE)
    apply(dataset, client, seed_key="bwf-demo", run_dir=tmp_path)
    changed = parse_text(SOURCE.replace("Demo Open", "Changed Open"))
    with pytest.raises(ValueError, match="different source hash"):
        apply(changed, client, seed_key="bwf-demo", run_dir=tmp_path)
    result = reset(seed_key="bwf-demo", client=client, run_dir=tmp_path, confirm="bwf-demo")
    assert result["status"] == "reset"
    assert client.deleted == ["workspace-1"]
    assert status(seed_key="bwf-demo", run_dir=tmp_path)["status"] == "reset"
    reapplied = apply(dataset, client, seed_key="bwf-demo", run_dir=tmp_path)
    assert reapplied["status"] == "complete"
    assert len(client.created) == 2


def test_replace_removes_only_previous_run_workspaces(tmp_path: Path):
    client = FakeClient()
    dataset = parse_text(SOURCE)
    apply(dataset, client, seed_key="bwf-demo", run_dir=tmp_path)
    changed = parse_text(SOURCE.replace("Demo Open", "Changed Open"))
    output = apply(changed, client, seed_key="bwf-demo", run_dir=tmp_path, replace=True)
    assert output["status"] == "complete"
    assert client.deleted == ["workspace-1"]
    assert len(client.created) == 2


def test_replace_rebuilds_even_when_source_hash_is_unchanged(tmp_path: Path):
    client = FakeClient()
    dataset = parse_text(SOURCE)
    apply(dataset, client, seed_key="bwf-demo", run_dir=tmp_path)
    output = apply(dataset, client, seed_key="bwf-demo", run_dir=tmp_path, replace=True)
    assert output["status"] == "complete"
    assert "noop" not in output
    assert client.deleted == ["workspace-1"]
    assert len(client.created) == 2


def test_legacy_manifest_requires_explicit_replace(tmp_path: Path):
    dataset = parse_text(SOURCE)
    (tmp_path / "bwf-demo.json").write_text(
        '{"seedKey":"bwf-demo","sourceSha256":"'
        + dataset.source_sha256
        + '","status":"complete","tournaments":{}}',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="older seed format"):
        apply(dataset, FakeClient(), seed_key="bwf-demo", run_dir=tmp_path)


def test_notes_enrich_manifest_and_label_import_as_finals_only(tmp_path: Path):
    client = FakeClient()
    dataset = parse_text(SOURCE)
    dataset.notes = parse_notes_text(NOTES, dataset.tournaments)
    dataset.notes_text = NOTES
    dataset.notes_sha256 = "notes-hash"
    output = apply(dataset, client, seed_key="bwf-demo", run_dir=tmp_path)
    source = output["tournaments"]["T001"]["source"]
    assert source["historical"] is True
    assert source["recordScope"] == "finals_only"
    assert source["drawDescription"] == "five 32-entry draws"
    assert output["notesSha256"] == "notes-hash"
    assert "complete published draws and results" in client.pages[0][1]["introText"]
    assert "unavailable" not in client.pages[0][1]["introText"]
    assert "not inferred" not in client.pages[0][1]["introText"]
    assert "BWF Tour development event" in client.pages[0][1]["introText"]
    assert "only five finals are supplied" not in client.pages[0][1]["regulationsText"]


def test_historical_archive_embeds_results_and_disables_scheduling_commands(tmp_path: Path):
    client = FakeClient()
    dataset = parse_text(SOURCE)
    source_map = tmp_path / "sources.json"
    source_map.write_text(
        '{"version":1,"github":{"repository":"https://example.test/repo",'
        '"tournaments":{}},"dailyResults":{},"unavailable":{"T001":"finals only"}}',
        encoding="utf-8",
    )
    attach_historical_sources(dataset, source_map_path=source_map)
    output = apply(dataset, client, seed_key="historical", run_dir=tmp_path)
    event = client.imported[0][1]["events"][0]
    assert event["historical"] is True
    assert event["record_scope"] == "finals_only"
    assert event["advertised_size"] == 32
    assert event["round_labels"] == ["Finals"]
    assert event["round_codes"] == ["Final"]
    assert event["topology_scope"] == "none"
    assert event["topology_edge_count"] == 0
    assert event["imported_match_count"] == 1
    assert event["expected_match_count"] == 31
    assert event["rounds"][0][0]["result"]["winner_side"] == "A"
    assert client.commands == []
    assert output["tournaments"]["T001"]["matchCount"] == 5
    assert output["tournaments"]["T001"]["playerCount"] == 5
    assert output["tournaments"]["T001"]["topologyEdgeCount"] == 0


def test_complete_demo_draws_fills_all_events_and_marks_generated_rows(tmp_path: Path):
    fixtures = Path(__file__).resolve().parents[1] / "fixtures"
    dataset = parse_text((fixtures / "bwf-recent-completed.txt").read_text(encoding="utf-8"))
    source_map = fixtures / "bwf-full-match-sources.json"
    attach_historical_sources(dataset, source_map_path=source_map)
    assert len(dataset.historical_matches) == 150
    finals_before = {
        (match.tournament_id, match.event): (
            match.side_a,
            match.side_b,
            match.winner_side,
            match.sets,
        )
        for match in dataset.historical_matches
    }

    complete_demo_historical_draws(dataset)

    assert len(dataset.historical_matches) == 4602
    generated = [match for match in dataset.historical_matches if match.generated]
    assert len({match.sets for match in generated}) > 20
    assert any(len(match.sets) == 3 for match in generated)
    assert all(
        match.played_on
        < next(
            tournament.end_date
            for tournament in dataset.tournaments
            if tournament.id == match.tournament_id
        )
        for match in generated
        if match.round_code != "Final"
    )
    assert sum(match.generated for match in dataset.historical_matches) == 4452
    xd_first = {
        side[0]
        for match in dataset.historical_matches
        if match.event == "XD" and not match.generated
        for side in (match.side_a, match.side_b)
    }
    xd_second = {
        side[1]
        for match in dataset.historical_matches
        if match.event == "XD" and not match.generated
        for side in (match.side_a, match.side_b)
    }
    for match in (row for row in dataset.historical_matches if row.event == "XD"):
        for side in (match.side_a, match.side_b):
            assert side[0] in xd_first or "(demo " in side[0]
            assert side[1] in xd_second or "(demo " in side[1]
    finals_after = {
        (match.tournament_id, match.event): (
            match.side_a,
            match.side_b,
            match.winner_side,
            match.sets,
        )
        for match in dataset.historical_matches
        if not match.generated and match.round_code == "Final"
    }
    assert finals_after == finals_before
    for tournament in dataset.tournaments:
        rows = dataset.historical_by_tournament[tournament.id]
        expected = (
            75
            if tournament.id == "T010"
            else sum(
                int(size) - 1
                for size, _event in re.findall(r"(\d+)(MS|WS|MD|WD|XD)", tournament.draw_format)
            )
        )
        assert len(rows) == expected
        for event in _EVENTS:
            event_rows = [row for row in rows if row.event == event]
            payload = _historical_event_payload(
                tournament,
                event,
                event_rows,
                dataset.historical_coverage[tournament.id],
            )
            assert payload["id"] == event
            assert payload["record_scope"] == "completed_matches_only"
            assert all(
                unit.get("result") is not None
                for round_units in payload["rounds"]
                for unit in round_units
            )
            units = {unit["id"]: unit for round_units in payload["rounds"] for unit in round_units}
            for unit in units.values():
                for side, feeder_key in (("side_a", "feeder_a"), ("side_b", "feeder_b")):
                    feeder_id = unit.get(feeder_key)
                    if feeder_id is None:
                        continue
                    feeder = units[feeder_id]
                    winner_side = feeder["result"]["winner_side"]
                    assert unit[side] == feeder[f"side_{winner_side.lower()}"]
            expected_edges = (
                2
                if tournament.id == "T010"
                else (46 if tournament.id in {"T008", "T009"} and event == "MS" else 30)
            )
            assert payload["topology_edge_count"] == expected_edges
    assert dataset.historical_coverage["T029"].generated == 150


def _historical_match(
    *,
    round_code: str,
    side_a: tuple[str, ...],
    side_b: tuple[str, ...],
    winner_side: str = "A",
    source_ref: str,
    tournament_id: str = "T001",
) -> HistoricalMatch:
    return HistoricalMatch(
        tournament_id=tournament_id,
        event="MS",
        round_code=round_code,
        played_on="2026-01-01",
        side_a=side_a,
        side_b=side_b,
        winner_side=winner_side,
        sets=((21, 10), (21, 11)),
        source_url="https://example.test/source",
        source_ref=source_ref,
    )


def _historical_tournament(tournament_id: str = "T001") -> Tournament:
    return Tournament(
        id=tournament_id,
        year=2026,
        date_range="1 January",
        end_date="2026-01-01",
        name="Demo Open",
        host="Test",
        venue="Hall",
        level="Super 300",
        prize="$1",
        draw_format="32MS/32WS/32MD/32WD/32XD",
        source_url="https://example.test/source",
        line=1,
    )


def _coverage(tournament_id: str = "T001") -> SourceCoverage:
    return SourceCoverage(
        tournament_id=tournament_id,
        imported=3,
        expected=155,
        source_url="https://example.test/source",
        source_sha256="a" * 64,
        availability="completed_matches_only",
    )


def test_historical_payload_infers_exact_adjacent_winners_and_reorders_parents():
    alice = _historical_match(round_code="R16", side_a=("Alice",), side_b=("Ava",), source_ref="z")
    carol = _historical_match(round_code="R16", side_a=("Carol",), side_b=("Cleo",), source_ref="a")
    quarterfinal = _historical_match(
        round_code="QF", side_a=("Alice",), side_b=("Carol",), source_ref="qf"
    )
    registry = _HistoricalIdentityRegistry("T001")
    payload = _historical_event_payload(
        _historical_tournament(),
        "MS",
        [carol, quarterfinal, alice],
        _coverage(),
        registry,
    )
    assert payload["round_codes"] == ["R16", "QF"]
    assert payload["topology_scope"] == "proven_winner_advancement"
    assert payload["topology_edge_count"] == 2
    first_round = payload["rounds"][0]
    assert first_round[0]["source_ref"] == "z"
    assert first_round[1]["source_ref"] == "a"
    target = payload["rounds"][1][0]
    assert target["feeder_a"] == first_round[0]["id"]
    assert target["feeder_b"] == first_round[1]["id"]


def test_historical_payload_never_jumps_a_missing_round_or_group_stage():
    r32 = _historical_match(round_code="R32", side_a=("Alice",), side_b=("Ava",), source_ref="r32")
    qf = _historical_match(round_code="QF", side_a=("Alice",), side_b=("Carol",), source_ref="qf")
    payload = _historical_event_payload(_historical_tournament(), "MS", [r32, qf], _coverage())
    assert payload["topology_edge_count"] == 0
    assert "feeder_a" not in payload["rounds"][1][0]

    group = _historical_match(
        tournament_id="T010",
        round_code="R3",
        side_a=("Alice",),
        side_b=("Ava",),
        source_ref="group",
    )
    semifinal = _historical_match(
        tournament_id="T010",
        round_code="SF",
        side_a=("Alice",),
        side_b=("Carol",),
        source_ref="sf",
    )
    finals_payload = _historical_event_payload(
        _historical_tournament("T010"),
        "MS",
        [group, semifinal],
        _coverage("T010"),
    )
    assert finals_payload["topology_edge_count"] == 0


def test_historical_ids_preserve_names_and_canonicalize_pair_order():
    registry = _HistoricalIdentityRegistry("T001")
    joao = registry.player_id("Joao")
    accented = registry.player_id("João")
    punctuated = registry.player_id("P. V. Sindhu")
    compact = registry.player_id("PV Sindhu")
    assert len({joao, accented, punctuated, compact}) == 4
    pair_a = registry.participant(("João", "Alice"))
    pair_b = registry.participant(("Alice", "João"))
    assert pair_a == pair_b
    assert pair_a["members"] == sorted(pair_a["members"])


def test_historical_identity_hash_collision_fails_closed(monkeypatch):
    class ConstantHash:
        def hexdigest(self):
            return "0" * 64

    monkeypatch.setattr("tournament_sim.seed.hashlib.sha256", lambda _payload: ConstantHash())
    registry = _HistoricalIdentityRegistry("T001")
    registry.player_id("João")
    with pytest.raises(DatasetError, match="SHA-256 identity collision"):
        registry.player_id("Joao")


def test_partial_match_csv_does_not_overstate_tournament_coverage(tmp_path: Path):
    dataset = parse_text(SOURCE)
    source_map = tmp_path / "sources.json"
    source_map.write_text(
        '{"version":1,"github":{"repository":"https://example.test/repo",'
        '"tournaments":{"T001":"Demo Open"}},"dailyResults":{},"unavailable":{}}',
        encoding="utf-8",
    )
    match_data = tmp_path / "matches.csv"
    match_data.write_text(
        "date,discipline,tournament,tier,round,host_location,team1,team2,winner,score,team1_at_home,team2_at_home\n"
        "2025-01-06,MS,Some Other Open,Super 100,Final,Test,Alice,Bob,1,21-19 21-18,False,False\n",
        encoding="utf-8",
    )
    attach_historical_sources(
        dataset,
        source_map_path=source_map,
        match_data_path=match_data,
    )
    coverage = dataset.historical_coverage["T001"]
    assert coverage.availability == "finals_only"
    assert coverage.imported == 5


def test_historical_source_final_must_reconcile_with_fixture(tmp_path: Path):
    dataset = parse_text(SOURCE)
    source_map = tmp_path / "sources.json"
    source_map.write_text(
        '{"version":1,"github":{"repository":"https://example.test/repo",'
        '"tournaments":{"T001":"Demo Open"}},"dailyResults":{},"unavailable":{}}',
        encoding="utf-8",
    )
    match_data = tmp_path / "matches.csv"
    match_data.write_text(
        "date,discipline,tournament,tier,round,host_location,team1,team2,winner,score,team1_at_home,team2_at_home\n"
        "2025-01-06,MS,Demo Open,Super 100,Final,Test,Alice,Bob,1,21-3 21-4,False,False\n",
        encoding="utf-8",
    )
    with pytest.raises(DatasetError, match="final conflicts"):
        attach_historical_sources(
            dataset,
            source_map_path=source_map,
            match_data_path=match_data,
        )
