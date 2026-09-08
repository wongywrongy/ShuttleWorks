from __future__ import annotations

from pathlib import Path
import json
import re

import pytest

from tournament_sim.seed import (
    _EVENTS,
    DatasetError,
    Tournament,
    _HistoricalIdentityRegistry,
    _demo_setup_sections,
    _demo_dates,
    _demo_entry_window,
    _historical_event_payload,
    _demo_operational_event,
    _demo_plan,
    _write_manifest,
    apply,
    canonical_tournament_name,
    attach_historical_sources,
    complete_demo_historical_draws,
    parse_notes_text,
    parse_score,
    parse_text,
    preview,
    repair_names,
    reset,
    select_tournaments,
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


def test_demo_setup_keeps_real_public_slug_without_dead_regulations_link():
    source = parse_text(
        Path("simulator/fixtures/bwf-recent-completed.txt").read_text(encoding="utf-8")
    )
    tournament = next(item for item in source.tournaments if item.id == "T029")
    setup = _demo_setup_sections(tournament, [], slug="2026-taipei-open-t029")
    assert setup["public-info"]["publicSlug"] == "2026-taipei-open-t029"
    assert "regulationsUrl" not in setup["public-info"]


def test_demo_setup_dates_are_offset_aware_and_match_entry_window():
    source = parse_text(
        Path("simulator/fixtures/bwf-recent-completed.txt").read_text(encoding="utf-8")
    )
    tournament = next(item for item in source.tournaments if item.id == "T029")
    setup = _demo_setup_sections(tournament, [], slug="2026-taipei-open-t029")
    start, end = _demo_dates(tournament, [])
    dates = setup["dates"]

    opening, deadline = _demo_entry_window(
        tournament, "MS", start, demo_seed=True
    )
    assert dates["entryOpening"] == opening
    assert dates["entryDeadline"] == deadline
    for key in (
        "entryOpening",
        "entryDeadline",
        "withdrawalDeadline",
        "drawPublication",
        "tournamentStart",
        "tournamentEnd",
    ):
        assert "+" in dates[key] or dates[key].endswith("Z"), key
    assert dates["tournamentStart"].startswith(start.isoformat())
    assert dates["tournamentEnd"].startswith(end.isoformat())

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


SECOND_SOURCE = """# counts tournaments=2 matches=10 unique_players=6
T|T001|2025|1-6 January|2025-01-06|Demo Open|Paris, France|Demo Hall|Super 100|$110,000|32MS/32WS/32MD/32WD/32XD|https://example.test/t
T|T002|2025|7-12 January|2025-01-12|Second Open|Lyon, France|Second Hall|Super 100|$110,000|32MS/32WS/32MD/32WD/32XD|https://example.test/t2
M|M0001|T001|MS|mens_singles_final|Alice|Bob|21-19, 21-18|https://example.test/m
M|M0002|T001|WS|womens_singles_final|Carol|Dave|21-10, 21-9|https://example.test/m
M|M0003|T001|MD|mens_doubles_final|Alice;Bob|Dave;Eve|Walkover|https://example.test/m
M|M0004|T001|WD|womens_doubles_final|Carol;Eve|Alice;Dave|21-19, 10-21, 21-18|https://example.test/m
M|M0005|T001|XD|mixed_doubles_final|Alice;Carol|Bob;Dave|21-19, 18-21, 21-17|https://example.test/m
M|M0006|T002|MS|mens_singles_final|Bob|Alice|21-19, 21-18|https://example.test/m2
M|M0007|T002|WS|womens_singles_final|Dave|Carol|21-10, 21-9|https://example.test/m2
M|M0008|T002|MD|mens_doubles_final|Dave;Eve|Alice;Bob|Walkover|https://example.test/m2
M|M0009|T002|WD|womens_doubles_final|Alice;Dave|Carol;Eve|21-19, 10-21, 21-18|https://example.test/m2
M|M0010|T002|XD|mixed_doubles_final|Bob;Dave|Alice;Carol|21-19, 18-21, 21-17|https://example.test/m2
P|P0001|Alice
P|P0002|Bob
P|P0003|Carol
P|P0004|Dave
P|P0005|Eve
P|P0006|Nur Izzuddin
"""


def test_select_tournaments_filters_every_tournament_owned_collection():
    dataset = parse_text(SECOND_SOURCE)

    selected = select_tournaments(dataset, ["T002"])

    assert [item.id for item in selected.tournaments] == ["T002"]
    assert {item.tournament_id for item in selected.matches} == {"T002"}
    assert selected.selected_tournament_ids == ("T002",)
    assert preview(selected)["tournamentIds"] == ["T002"]


def test_select_tournaments_rejects_unknown_id():
    with pytest.raises(DatasetError, match="unknown tournament id.*T999"):
        select_tournaments(parse_text(SOURCE), ["T999"])


def test_selected_tournament_ids_are_part_of_the_input_hash():
    dataset = parse_text(SECOND_SOURCE)
    assert select_tournaments(dataset, ["T001"]).input_sha256 != select_tournaments(
        dataset, ["T002"]
    ).input_sha256


def test_manifest_cannot_be_reused_for_a_different_selected_tournament(tmp_path: Path):
    dataset = parse_text(SECOND_SOURCE)
    apply(select_tournaments(dataset, ["T001"]), FakeClient(), seed_key="browser", run_dir=tmp_path)

    with pytest.raises(ValueError, match="different source hash"):
        apply(
            select_tournaments(dataset, ["T002"]),
            FakeClient(),
            seed_key="browser",
            run_dir=tmp_path,
        )


def test_manifest_write_keeps_the_previous_file_if_atomic_replace_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    manifest = tmp_path / "run.json"
    manifest.write_text('{"status":"previous"}\n', encoding="utf-8")

    def fail_replace(_source, _target):
        raise OSError("simulated interrupted replace")

    monkeypatch.setattr("tournament_sim.seed.os.replace", fail_replace)

    with pytest.raises(OSError, match="interrupted replace"):
        _write_manifest(manifest, {"status": "next"})

    assert manifest.read_text(encoding="utf-8") == '{"status":"previous"}\n'
    assert list(tmp_path.glob(".run.json.*.tmp")) == []


class FakeClient:
    def __init__(self, base_url="fake://seed"):
        self.base_url = base_url
        self.created = []
        self.imported = []
        self.commands = []
        self.pages = []
        self.events = []
        self.publications = []
        self.deleted = []
        # The published-entrant layer: a tiny in-memory entries desk, enough
        # for the demo seed's register/confirm/withdraw sequence.
        self.signups = []
        self.entries = {}

    def create_tournament(
        self,
        name,
        kind="meet",
        modules=None,
        tournament_date=None,
        tournament_end_date=None,
        time_zone=None,
    ):
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
        return {"id": f"entry-event-{len(self.events)}"}

    # ---- entrant accounts and the entries desk ---------------------------

    def entrant_signup(self, body, *, expect=(202,)):
        self.signups.append(body["email"])

        class Response:
            status_code = 202

        return Response()

    def entrant_login(self, email, password):
        self._email = email
        return None

    def entrant_me(self):
        return {"id": f"account-{self._email}"}

    def import_entries(self, tid, body):
        rows = self.entries.setdefault(tid, [])
        for submission in body["submissions"]:
            for player in submission["players"]:
                rows.append(
                    {
                        "id": f"entry-{tid}-{len(rows)}",
                        "state": "pending",
                        "playerName": player["fullName"],
                        "entryPlayerId": f"player-{tid}-{player['sourceKey']}",
                    }
                )
        return {"submissions": []}

    def list_entries(self, tid, state=None):
        rows = self.entries.get(tid, [])
        return [row for row in rows if state is None or row["state"] == state]

    def confirm_entry(self, tid, entry_id):
        for row in self.entries.get(tid, []):
            if row["id"] == entry_id:
                row["state"] = "confirmed"
        return {}

    def withdraw_entry(self, tid, entry_id):
        for row in self.entries.get(tid, []):
            if row["id"] == entry_id:
                row["state"] = "withdrawn"
        return {}

    def close(self):
        return None

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
    assert first["seedFormatVersion"] == 3
    assert first["matchCount"] == 5
    assert first["playerCount"] == 5
    assert first["topologyEdgeCount"] == 0
    assert len(client.imported[0][1]["roster"]) == 5
    assert client.publications == [
        (
            "workspace-1",
            {
                "audience": "public",
                # The public person directory is gated on this: without it
                # every ``/e/{slug}/players/{key}`` request 404s.
                "entrantsPublished": True,
                "drawsPublished": True,
                "resultsPublished": True,
            },
        )
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


def test_reset_manifest_can_restart_on_a_new_seed_format(tmp_path: Path):
    dataset = parse_text(SOURCE)
    (tmp_path / "bwf-demo.json").write_text(
        '{"seedKey":"bwf-demo","seedFormatVersion":2,"status":"reset",'
        '"tournaments":{"T001":{"workspaceId":null}}}',
        encoding="utf-8",
    )

    output = apply(dataset, FakeClient(), seed_key="bwf-demo", run_dir=tmp_path)

    assert output["status"] == "complete"
    assert output["seedFormatVersion"] == 3


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
    # Reader-facing copy is organizer prose (public-visual-fixes.md P0). The
    # NOTES file's provenance — the level description and the semicolon draw
    # inventory — is still parsed and still reconciled into the manifest
    # ``source`` block above; it is simply no longer a sentence a spectator
    # reads.
    intro = client.pages[0][1]["introText"]
    assert "Demo Open" in intro
    assert "unavailable" not in intro
    assert "not inferred" not in intro
    assert "BWF Tour development event" not in intro
    assert ";" not in intro
    assert "only five finals are supplied" not in client.pages[0][1]["regulationsText"]
    assert "Source" not in client.pages[0][1]["regulationsText"]


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


def test_live_demo_results_precede_live_wave_and_respect_sessions_and_feeders():
    fixtures = Path(__file__).resolve().parents[1] / "fixtures"
    dataset = parse_text((fixtures / "bwf-recent-completed.txt").read_text(encoding="utf-8"))
    attach_historical_sources(dataset, source_map_path=fixtures / "bwf-full-match-sources.json")
    dataset = select_tournaments(dataset, ["T029"])
    complete_demo_historical_draws(dataset)
    tournament = dataset.tournaments[0]
    rows = dataset.historical_by_tournament["T029"]
    events = [
        _demo_operational_event(
            _historical_event_payload(tournament, event, [row for row in rows if row.event == event], dataset.historical_coverage["T029"]),
            "T029",
        )
        for event in _EVENTS
    ]
    _, _, assignments, live = _demo_plan(tournament, rows, events)
    assigned = {item["play_unit_id"]: item for item in assignments}
    units = {unit["id"]: unit for event in events for round_units in event["rounds"] for unit in round_units}
    completed = [unit for unit in units.values() if unit.get("result") is not None]
    assert len(completed) == 103
    assert len(live) == 6
    assert len({assigned[key]["court_id"] for key in live}) == 6
    for unit in completed:
        placement = assigned[unit["id"]]
        start = placement["slot_id"]
        end = start + placement["duration_slots"]
        assert end < min(assigned[key]["slot_id"] for key in live)
        assert start % 48 + placement["duration_slots"] <= 20  # 09:00–19:00
        for feeder in (unit.get("feeder_a"), unit.get("feeder_b")):
            if feeder:
                assert assigned[feeder]["slot_id"] + assigned[feeder]["duration_slots"] < start
    for court in range(1, 7):
        court_rows = sorted((row for row in assignments if row["court_id"] == court), key=lambda row: row["slot_id"])
        assert all(a["slot_id"] + a["duration_slots"] <= b["slot_id"] for a, b in zip(court_rows, court_rows[1:]))


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
            # F-PAIR-34 / R-PAIR-5: exhausted demo pools still preserve the
            # source-position given name, but fixture sequence bookkeeping
            # never contaminates the stored identity.
            assert side[0] in xd_first or len(side[0].split()) >= 2
            assert side[1] in xd_second or len(side[1].split()) >= 2
            assert "(demo " not in side[0]
            assert "(demo " not in side[1]
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


def test_historical_ids_remove_source_member_ids_and_case_formatting():
    registry = _HistoricalIdentityRegistry("T001")
    assert registry.player_id("Daniel LEUNG [84072]") == registry.player_id("Daniel Leung")
    assert registry.player_id("Arisa IGARASHI") == registry.player_id("Arisa Igarashi")


def test_roster_rows_carry_the_dataset_person_id_with_its_provenance():
    """P6: the cross-tournament identity is the DATASET's own player id.

    Two workspaces, one human: the tournament-scoped roster id differs (a
    re-key of a live bracket is not something a fixture may do), and the
    ``personId`` is identical. That equality is what a public profile joins
    on, so it is asserted here rather than inferred from a name.
    """
    people = {"Aaron Chia": "P0001", "Soh Wooi Yik": "P0002"}
    source = "bwf-recent:abcdef123456"

    def registry_for(tid):
        registry = _HistoricalIdentityRegistry(tid)
        registry.person_ids = people
        registry.person_source = source
        return registry

    first, second = registry_for("T029"), registry_for("T030")
    a29, a30 = first.player_id("Aaron CHIA"), second.player_id("Aaron Chia")
    assert a29 != a30
    row29 = first.players[a29]
    row30 = second.players[a30]
    assert row29["personId"] == row30["personId"] == "P0001"
    assert row29["personSource"] == source

    # Re-running the same registry is a no-op: the record is set once and
    # keeps its identity, so a second seed pass duplicates nobody.
    assert first.player_id("Aaron Chia") == a29
    assert first.players[a29] == row29

    # A name the dataset does not issue an id for carries NO personId. No
    # identifier is invented to make coverage look complete.
    unknown = first.player_id("Nobody In The Table")
    assert "personId" not in first.players[unknown]


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


def test_historical_source_rejects_duplicate_person_after_name_cleanup(tmp_path: Path):
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
        "2025-01-04,MD,Demo Open,Super 100,QF,Test,Alice/ALICE,Dave/Eve,1,21-19 21-18,False,False\n",
        encoding="utf-8",
    )
    with pytest.raises(DatasetError, match="side A repeats a player"):
        attach_historical_sources(
            dataset,
            source_map_path=source_map,
            match_data_path=match_data,
        )


def test_historical_source_rejects_conflicting_normalized_aliases(tmp_path: Path):
    dataset = parse_text(SOURCE)
    source_map = tmp_path / "sources.json"
    source_map.write_text(
        '{"version":1,"github":{"repository":"https://example.test/repo",'
        '"tournaments":{}},"dailyResults":{},"unavailable":{},'
        '"playerAliases":{"DANIEL LEUNG":"Daniel Leung",'
        '"Daniel LEUNG [84072]":"Different Person"}}',
        encoding="utf-8",
    )
    with pytest.raises(DatasetError, match="normalizes to both"):
        attach_historical_sources(dataset, source_map_path=source_map)


# --- P5: canonical tournament names ------------------------------------
#
# One rule: the tournament display name carries no year or date suffix.
# The year stays structured (Setup ``general.season``, the ``dates`` block,
# the workspace date fields, the slug and the manifest's ``source.year``).


def test_canonical_name_strips_only_a_trailing_parenthesised_year():
    assert canonical_tournament_name("Taipei Open (2026)") == "Taipei Open"
    assert canonical_tournament_name("Korea Masters (2026)") == "Korea Masters"
    assert canonical_tournament_name("Taipei Open") == "Taipei Open"
    # A number that carries meaning is not a suffix and is left alone.
    assert canonical_tournament_name("Super 300 Finals") == "Super 300 Finals"
    assert canonical_tournament_name("U.S. Open (2026) Qualifying") == (
        "U.S. Open (2026) Qualifying"
    )
    assert canonical_tournament_name("Yunavero Club Open 2026") == (
        "Yunavero Club Open 2026"
    )


def test_seeded_workspace_and_setup_names_carry_no_year(tmp_path: Path):
    client = FakeClient()
    dataset = parse_text(SOURCE)
    output = apply(dataset, client, seed_key="bwf-demo", run_dir=tmp_path)

    assert client.created[0][1] == "Demo Open"
    # The year is still structured data on the same fixture.
    assert output["tournaments"]["T001"]["source"]["year"] == 2025
    assert output["tournaments"]["T001"]["slug"].startswith("2025-demo-open")

    sections = _demo_setup_sections(
        dataset.tournaments[0], [], slug="2025-demo-open-t001"
    )
    assert sections["general"]["name"] == "Demo Open"
    assert sections["general"]["publicName"] == "Demo Open"
    assert sections["general"]["season"] == "2025"


class RenameClient:
    """Just enough workspace surface for :func:`repair_names`."""

    def __init__(self, workspaces):
        self.workspaces = workspaces
        self.patched = []
        self.setup_patched = []

    def get_tournament(self, tid):
        return self.workspaces.get(tid)

    def update_tournament(self, tid, body):
        self.workspaces[tid].update(body)
        self.patched.append((tid, body))
        return self.workspaces[tid]

    def get_setup(self, tid):
        return {
            "sections": [
                {"key": "general", "data": self.workspaces[tid]["setupGeneral"]}
            ]
        }

    def seed_setup_sections(self, tid, sections):
        self.workspaces[tid]["setupGeneral"] = sections["general"]
        self.setup_patched.append((tid, sections))
        return {}


def _rename_fixture(tmp_path: Path):
    (tmp_path / "bwf-demo.json").write_text(
        json.dumps(
            {
                "seedKey": "bwf-demo",
                "seedFormatVersion": 3,
                "status": "complete",
                "tournaments": {
                    "T001": {
                        "workspaceId": "ws-1",
                        "slug": "2025-demo-open-t001",
                        "source": {"name": "Demo Open", "year": 2025},
                    },
                    "T002": {
                        "workspaceId": "ws-gone",
                        "source": {"name": "Deleted Open", "year": 2025},
                    },
                },
            }
        ),
        encoding="utf-8",
    )
    client = RenameClient(
        {
            "ws-1": {
                "id": "ws-1",
                "name": "Demo Open (2025)",
                "setupGeneral": {
                    "name": "Demo Open (2025)",
                    "publicName": "Demo Open 2025",
                    "season": "2025",
                },
            }
        }
    )
    return client


def test_repair_names_rewrites_seeded_rows_and_is_idempotent(tmp_path: Path):
    client = _rename_fixture(tmp_path)

    first = repair_names(seed_key="bwf-demo", client=client, run_dir=tmp_path)

    assert [row["to"] for row in first["renamed"]] == ["Demo Open"]
    assert first["setupRepaired"] == ["T001"]
    # A workspace the manifest names but the deployment no longer holds is
    # reported, not an error.
    assert first["missingWorkspaces"] == ["T002"]
    assert client.workspaces["ws-1"]["name"] == "Demo Open"
    assert client.workspaces["ws-1"]["setupGeneral"] == {
        "name": "Demo Open",
        "publicName": "Demo Open",
        "season": "2025",
    }

    second = repair_names(seed_key="bwf-demo", client=client, run_dir=tmp_path)

    assert second["renamed"] == []
    assert second["setupRepaired"] == []
    assert second["unchanged"] == ["T001"]
    # No further writes on the second pass — the repair is idempotent.
    assert len(client.patched) == 1
    assert len(client.setup_patched) == 1
    # Ids and slugs are untouched by the repair.
    manifest = status(seed_key="bwf-demo", run_dir=tmp_path)
    assert manifest["tournaments"]["T001"]["workspaceId"] == "ws-1"
    assert manifest["tournaments"]["T001"]["slug"] == "2025-demo-open-t001"


def test_repair_names_ignores_workspaces_the_manifest_does_not_own(tmp_path: Path):
    client = _rename_fixture(tmp_path)
    # A director-authored workspace living in the same deployment.
    client.workspaces["ws-user"] = {
        "id": "ws-user",
        "name": "Yunavero Club Open (2026)",
        "setupGeneral": {"name": "Yunavero Club Open (2026)"},
    }

    repair_names(seed_key="bwf-demo", client=client, run_dir=tmp_path)

    assert client.workspaces["ws-user"]["name"] == "Yunavero Club Open (2026)"
    assert [tid for tid, _ in client.patched] == ["ws-1"]


def test_repair_names_records_a_frozen_setup_section_instead_of_failing(tmp_path: Path):
    """A checked-out tournament freezes Setup; the title still gets fixed.

    ``CONFIG_LOCKED`` is the product's preparation fence, not a repair
    failure — and the workspace ``name`` the fence does not cover is what
    the Hub, the workspace header, the public tier and the venue board all
    render.
    """
    client = _rename_fixture(tmp_path)

    class Locked(Exception):
        status = 409

    def refuse(tid, sections):
        raise Locked()

    client.seed_setup_sections = refuse

    output = repair_names(seed_key="bwf-demo", client=client, run_dir=tmp_path)

    assert [row["to"] for row in output["renamed"]] == ["Demo Open"]
    assert output["setupLocked"] == ["T001"]
    assert output["setupRepaired"] == []
    assert client.workspaces["ws-1"]["name"] == "Demo Open"

    # Re-running renames nothing further; the frozen section stays reported.
    again = repair_names(seed_key="bwf-demo", client=client, run_dir=tmp_path)
    assert again["renamed"] == []
    assert again["setupLocked"] == ["T001"]
