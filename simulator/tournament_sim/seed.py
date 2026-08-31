"""Import the pipe-delimited BWF finals dataset through the HTTP API.

This module deliberately has no product imports.  It is a small, deterministic
adapter from the source file into the bracket import contract.  Keeping the
source parser and the HTTP applier separate makes ``preview`` useful before a
demo database is touched and gives future source formats a stable target.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from dataclasses import dataclass, field, replace
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any, Iterable
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo

from .historical_matches import (
    ROUND_LABELS,
    HistoricalMatch,
    SourceCoverage,
    load_source_map,
    ordered_rounds,
    parse_daily_results_html,
    parse_match_csv,
    source_display_name,
    source_name_key,
    source_team_key,
)
from .rng import command_uuid

if TYPE_CHECKING:
    # The parser/preview half is intentionally importable without the optional
    # simulator HTTP dependency. Runtime callers pass a client into apply/reset;
    # only static type checking needs its concrete class here.
    from .client import SimClient

_SCORE_RE = re.compile(r"^\s*(\d+)\s*[-–]\s*(\d+)\s*$")
_DEFAULT_RUN_DIR = Path(".local-testing/demo/data/import-runs")
_EVENTS = ("MS", "WS", "MD", "WD", "XD")
_SEED_FORMAT_VERSION = 3
_DEMO_GENERATOR_VERSION = 5
_DEMO_DEFAULT_COURT_COUNT = 8
_DEMO_LIVE_COURT_COUNT = 6
_DEMO_INTERVAL_MINUTES = 30
_DEMO_LIVE_TOURNAMENT = "T029"
_DEMO_UPCOMING_TOURNAMENT = "T030"
# Clean, deterministic surnames used only when a custom/demo historical
# fixture exhausts its source-local player pool.  They replace the former
# ``(demo 03-1)`` suffixes, which leaked fixture bookkeeping into a person's
# stored display name (F-PAIR-34, R-PAIR-5).
_DEMO_FALLBACK_SURNAMES = (
    "Adler",
    "Bennett",
    "Calder",
    "Delgado",
    "Ellison",
    "Farrell",
    "Gibson",
    "Hawthorne",
    "Ibarra",
    "Jensen",
    "Kessler",
    "Laurent",
    "Mendoza",
    "Navarro",
    "Ortega",
    "Prescott",
    "Quintero",
    "Reeves",
    "Sato",
    "Tremblay",
    "Upton",
    "Varela",
    "Whitaker",
    "Yamada",
)
_KNOCKOUT_PREDECESSOR = {
    "R32": "R64",
    "R16": "R32",
    "QF": "R16",
    "SF": "QF",
    "Final": "SF",
}


def _demo_court_count(tournament_id: str) -> int:
    return (
        _DEMO_LIVE_COURT_COUNT
        if tournament_id == _DEMO_LIVE_TOURNAMENT
        else _DEMO_DEFAULT_COURT_COUNT
    )


class DatasetError(ValueError):
    """A source error with one or more human-actionable line diagnostics."""

    def __init__(self, diagnostics: list[str]):
        self.diagnostics = diagnostics
        super().__init__("\n".join(diagnostics))


@dataclass(frozen=True)
class Tournament:
    id: str
    year: int
    date_range: str
    end_date: str
    name: str
    host: str
    venue: str
    level: str
    prize: str
    draw_format: str
    source_url: str
    line: int = field(compare=False)


@dataclass(frozen=True)
class Match:
    id: str
    tournament_id: str
    event: str
    event_label: str
    winner_players: tuple[str, ...]
    runner_up_players: tuple[str, ...]
    score: str
    source_url: str
    line: int = field(compare=False)


@dataclass(frozen=True)
class Player:
    id: str
    name: str
    line: int = field(compare=False)


@dataclass(frozen=True)
class TournamentNote:
    tournament_id: str
    name: str
    year: int
    dates: str
    end_date: str
    host: str
    venue: str
    level: str
    level_description: str
    prize: str
    draw_format: str
    draw_description: str
    timing_note: str
    source_url: str
    line: int = field(compare=False)


@dataclass(frozen=True)
class Score:
    sets: tuple[tuple[int, int], ...]
    retired: bool = False
    walkover: bool = False

    def to_api(self) -> dict[str, list[dict[str, int]]]:
        return {"sets": [{"sideA": a, "sideB": b} for a, b in self.sets]}


@dataclass
class Dataset:
    tournaments: list[Tournament]
    matches: list[Match]
    players: list[Player]
    source_text: str
    source_sha256: str
    declared_counts: dict[str, int] = field(default_factory=dict)
    notes: list[TournamentNote] = field(default_factory=list)
    notes_text: str | None = None
    notes_sha256: str | None = None
    historical_matches: list[HistoricalMatch] = field(default_factory=list)
    historical_coverage: dict[str, SourceCoverage] = field(default_factory=dict)
    historical_source_hashes: dict[str, str] = field(default_factory=dict)
    demo_generator_version: int | None = None
    selected_tournament_ids: tuple[str, ...] = ()

    @property
    def input_sha256(self) -> str:
        payload = {
            "source": self.source_sha256,
            "notes": self.notes_sha256,
            "historicalSources": self.historical_source_hashes,
            "demoGeneratorVersion": self.demo_generator_version,
            "selectedTournamentIds": self.selected_tournament_ids,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()

    @property
    def matches_by_tournament(self) -> dict[str, list[Match]]:
        out: dict[str, list[Match]] = {t.id: [] for t in self.tournaments}
        for match in self.matches:
            out.setdefault(match.tournament_id, []).append(match)
        return out

    @property
    def players_by_id(self) -> dict[str, Player]:
        return {player.id: player for player in self.players}

    @property
    def notes_by_tournament(self) -> dict[str, TournamentNote]:
        return {note.tournament_id: note for note in self.notes}

    @property
    def historical_by_tournament(self) -> dict[str, list[HistoricalMatch]]:
        return _group_by(self.historical_matches, lambda match: match.tournament_id)


def _error(line: int, message: str) -> str:
    return f"line {line}: {message}"


def _split_players(value: str, line: int, field_name: str) -> tuple[str, ...]:
    names = tuple(part.strip() for part in value.split(";") if part.strip())
    if not names:
        raise DatasetError([_error(line, f"{field_name} must contain a player")])
    return names


def parse_score(raw: str, *, line: int) -> Score:
    """Parse BWF final notation, retaining retirement and walkover status."""
    value = raw.strip()
    lowered = value.lower()
    if lowered == "walkover":
        return Score(sets=(), walkover=True)
    retired = "(retired)" in lowered
    value = re.sub(r"\s*\(retired\)\s*$", "", value, flags=re.I).strip()
    parts = tuple(part.strip() for part in value.split(",") if part.strip())
    if not parts:
        raise DatasetError([_error(line, f"invalid score {raw!r}")])
    parsed: list[tuple[int, int]] = []
    for part in parts:
        match = _SCORE_RE.match(part)
        if not match:
            raise DatasetError([_error(line, f"invalid score set {part!r}")])
        left, right = int(match.group(1)), int(match.group(2))
        if left < 0 or right < 0 or left == right:
            raise DatasetError([_error(line, f"invalid score set {part!r}")])
        parsed.append((left, right))
    if len(parsed) > 3:
        raise DatasetError([_error(line, "a badminton final cannot contain more than three sets")])
    return Score(sets=tuple(parsed), retired=retired)


def parse_text(text: str) -> Dataset:
    """Parse and cross-check a complete ``T|``, ``M|`` and ``P|`` file.

    Blank lines and ``#`` comments are preserved in ``source_text`` but do
    not become records.  Every record keeps its source line for diagnostics.
    Names in match rows are resolved against the P table exactly; notably,
    near-duplicates such as ``Nur Izzuddin`` and ``Nur Izzudin`` remain
    separate players.
    """
    tournaments: list[Tournament] = []
    matches: list[Match] = []
    players: list[Player] = []
    diagnostics: list[str] = []
    seen: dict[str, int] = {}
    declared_counts: dict[str, int] = {}

    for line_no, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            if line.startswith("# counts "):
                for part in line.removeprefix("# counts ").split():
                    if "=" in part:
                        key, value = part.split("=", 1)
                        try:
                            declared_counts[key] = int(value)
                        except ValueError:
                            diagnostics.append(_error(line_no, f"invalid count {part!r}"))
            continue
        fields = raw.split("|")
        kind = fields[0] if fields else ""
        expected = {"T": 12, "M": 9, "P": 3}.get(kind)
        if expected is None:
            diagnostics.append(_error(line_no, f"unknown record type {kind!r}"))
            continue
        if len(fields) != expected:
            diagnostics.append(
                _error(
                    line_no, f"{kind} record has {len(fields) - 1} fields; expected {expected - 1}"
                )
            )
            continue
        record_id = fields[1].strip()
        if not record_id:
            diagnostics.append(_error(line_no, "record id is empty"))
            continue
        if record_id in seen:
            diagnostics.append(
                _error(line_no, f"duplicate id {record_id!r}; first seen on line {seen[record_id]}")
            )
            continue
        seen[record_id] = line_no
        try:
            if kind == "T":
                year = int(fields[2])
                date.fromisoformat(fields[4])
                tournaments.append(
                    Tournament(
                        record_id,
                        year,
                        fields[3],
                        fields[4],
                        fields[5],
                        fields[6],
                        fields[7],
                        fields[8],
                        fields[9],
                        fields[10],
                        fields[11],
                        line_no,
                    )
                )
            elif kind == "M":
                _ = parse_score(fields[7], line=line_no)
                if fields[2].strip() not in {t.id for t in tournaments}:
                    diagnostics.append(
                        _error(line_no, f"match references unknown tournament {fields[2]!r}")
                    )
                if fields[3].strip() not in _EVENTS:
                    diagnostics.append(_error(line_no, f"unknown event code {fields[3]!r}"))
                matches.append(
                    Match(
                        record_id,
                        fields[2].strip(),
                        fields[3].strip(),
                        fields[4].strip(),
                        _split_players(fields[5], line_no, "winner_players"),
                        _split_players(fields[6], line_no, "runner_up_players"),
                        fields[7].strip(),
                        fields[8].strip(),
                        line_no,
                    )
                )
            else:
                players.append(Player(record_id, fields[2].strip(), line_no))
        except DatasetError as exc:
            diagnostics.extend(exc.diagnostics)
        except (TypeError, ValueError) as exc:
            diagnostics.append(_error(line_no, str(exc)))

    tournament_ids = {t.id for t in tournaments}
    player_names = {p.name for p in players}
    by_name: dict[str, list[Player]] = _group_by(players, lambda p: p.name)
    for name, records in by_name.items():
        if len(records) > 1:
            diagnostics.append(
                _error(
                    records[1].line,
                    f"player name {name!r} is ambiguous; P ids must identify it uniquely",
                )
            )
    for match in matches:
        if match.tournament_id not in tournament_ids:
            diagnostics.append(
                _error(match.line, f"match references unknown tournament {match.tournament_id!r}")
            )
        for name in (*match.winner_players, *match.runner_up_players):
            if name not in player_names:
                diagnostics.append(
                    _error(match.line, f"match player {name!r} is absent from P records")
                )
    for tournament_id, rows in _group_by(matches, lambda m: m.tournament_id).items():
        events = [m.event for m in rows]
        if len(rows) != 5:
            tournament_line = next(
                (t.line for t in tournaments if t.id == tournament_id), rows[0].line
            )
            diagnostics.append(
                _error(
                    tournament_line,
                    f"tournament {tournament_id} has {len(rows)} matches; expected five finals",
                )
            )
        if set(events) != set(_EVENTS) or len(set(events)) != len(events):
            diagnostics.append(
                _error(
                    rows[0].line,
                    f"tournament {tournament_id} must have one each of MS, WS, MD, WD and XD",
                )
            )
    for key, expected in declared_counts.items():
        actual = {
            "tournaments": len(tournaments),
            "matches": len(matches),
            "unique_players": len(players),
        }.get(key)
        if actual is not None and actual != expected:
            diagnostics.append(f"declared counts: {key}={expected}, parsed {actual}")
    if diagnostics:
        raise DatasetError(diagnostics)
    return Dataset(
        tournaments,
        matches,
        players,
        text,
        hashlib.sha256(text.encode("utf-8")).hexdigest(),
        declared_counts,
    )


def _group_by(rows: Iterable[Any], key) -> dict[Any, list[Any]]:
    out: dict[Any, list[Any]] = {}
    for row in rows:
        out.setdefault(key(row), []).append(row)
    return out


def parse_notes_text(text: str, tournaments: Iterable[Tournament]) -> list[TournamentNote]:
    """Parse and strictly reconcile the human-readable ``TNOTE`` companion.

    The prose fixture is intentionally redundant with the pipe-delimited
    source.  Treating that redundancy as assertions catches transcription
    drift while retaining the extra level, draw and timing explanations as
    provenance instead of attempting to infer scheduling data that is not
    present.
    """
    source_by_id = {tournament.id: tournament for tournament in tournaments}
    lines = text.splitlines()
    starts = [index for index, raw in enumerate(lines) if raw.startswith("TNOTE|")]
    diagnostics: list[str] = []
    notes: list[TournamentNote] = []
    seen: dict[str, int] = {}

    for position, start in enumerate(starts):
        stop = starts[position + 1] if position + 1 < len(starts) else len(lines)
        block = [(i + 1, lines[i].strip()) for i in range(start, stop) if lines[i].strip()]
        header_line, header = block[0]
        header_fields = header.split("|")
        if len(header_fields) != 4:
            diagnostics.append(_error(header_line, "TNOTE header must have id, name and year"))
            continue
        _, tournament_id, name, raw_year = header_fields
        if tournament_id in seen:
            diagnostics.append(
                _error(
                    header_line,
                    f"duplicate TNOTE {tournament_id!r}; first seen on line {seen[tournament_id]}",
                )
            )
            continue
        seen[tournament_id] = header_line
        fields: dict[str, tuple[int, str]] = {}
        for line_no, value in block[1:]:
            if ": " not in value:
                diagnostics.append(_error(line_no, f"invalid TNOTE field {value!r}"))
                continue
            key, field_value = value.split(": ", 1)
            if key in fields:
                diagnostics.append(_error(line_no, f"duplicate TNOTE field {key!r}"))
            fields[key] = (line_no, field_value)
        required = {"Dates", "Location", "Level", "Prize", "Draw format", "Timing note", "Source"}
        missing = sorted(required - fields.keys())
        if missing:
            diagnostics.append(_error(header_line, f"missing TNOTE fields: {', '.join(missing)}"))
            continue
        try:
            year = int(raw_year)
            dates_match = re.fullmatch(
                r"(.+); completion date (\d{4}-\d{2}-\d{2})\.", fields["Dates"][1]
            )
            location_match = re.fullmatch(r"(.+)\. Venue: (.+)\.", fields["Location"][1])
            if dates_match is None:
                raise DatasetError([_error(fields["Dates"][0], "invalid Dates field")])
            if location_match is None:
                raise DatasetError([_error(fields["Location"][0], "invalid Location field")])
            level, level_description = fields["Level"][1].removesuffix(".").split(" - ", 1)
            draw_format, draw_description = (
                fields["Draw format"][1].removesuffix(".").split(" - ", 1)
            )
            note = TournamentNote(
                tournament_id=tournament_id,
                name=name,
                year=year,
                dates=dates_match.group(1),
                end_date=dates_match.group(2),
                host=location_match.group(1),
                venue=location_match.group(2),
                level=level,
                level_description=level_description,
                prize=fields["Prize"][1].removesuffix("."),
                draw_format=draw_format,
                draw_description=draw_description,
                timing_note=fields["Timing note"][1],
                source_url=fields["Source"][1],
                line=header_line,
            )
        except DatasetError as exc:
            diagnostics.extend(exc.diagnostics)
            continue
        except (TypeError, ValueError) as exc:
            diagnostics.append(_error(header_line, f"invalid TNOTE block: {exc}"))
            continue
        source = source_by_id.get(tournament_id)
        if source is None:
            diagnostics.append(
                _error(header_line, f"TNOTE references unknown tournament {tournament_id!r}")
            )
            continue
        expected_dates = f"{source.date_range} {source.year}"
        comparisons = {
            "name": (note.name, source.name),
            "year": (note.year, source.year),
            "dates": (note.dates, expected_dates),
            "completion date": (note.end_date, source.end_date),
            "location": (note.host, source.host),
            "venue": (note.venue, source.venue),
            "level": (note.level, source.level),
            "prize": (note.prize, source.prize),
            "draw format": (note.draw_format, source.draw_format),
            "source": (note.source_url, source.source_url),
        }
        for label, (actual, expected) in comparisons.items():
            if actual != expected:
                diagnostics.append(
                    _error(
                        header_line,
                        f"{tournament_id} {label} {actual!r} does not match source {expected!r}",
                    )
                )
        notes.append(note)

    missing_ids = sorted(set(source_by_id) - set(seen))
    if missing_ids:
        diagnostics.append(f"TNOTE companion is missing tournaments: {', '.join(missing_ids)}")
    if diagnostics:
        raise DatasetError(diagnostics)
    return notes


def load_file(path: str | Path, notes_path: str | Path | None = None) -> Dataset:
    source = Path(path).read_text(encoding="utf-8")
    dataset = parse_text(source)
    if notes_path is not None:
        notes_text = Path(notes_path).read_text(encoding="utf-8")
        dataset.notes = parse_notes_text(notes_text, dataset.tournaments)
        dataset.notes_text = notes_text
        dataset.notes_sha256 = hashlib.sha256(notes_text.encode("utf-8")).hexdigest()
    return dataset


def attach_historical_sources(
    dataset: Dataset,
    *,
    source_map_path: str | Path,
    match_data_path: str | Path | None = None,
    daily_results_paths: dict[str, str | Path] | None = None,
) -> Dataset:
    """Attach completed-match archives while retaining finals-only fallbacks.

    The bulk CSV intentionally remains a caller-owned local file because its
    upstream repository does not provide a formal redistribution license.
    Missing rows are represented in coverage metadata; they are never inferred
    from bracket progression.
    """
    source_map = load_source_map(source_map_path)
    archive: list[HistoricalMatch] = []
    hashes: dict[str, str] = {
        "sourceMap": hashlib.sha256(Path(source_map_path).read_bytes()).hexdigest()
    }
    source_url_by_tournament: dict[str, str] = {}
    provided_tournaments: set[str] = set()

    github = source_map["github"]
    aliases: dict[str, str] = {}
    alias_conflicts: list[str] = []
    for source, target in source_map.get("playerAliases", {}).items():
        key = source_name_key(source).casefold()
        canonical = source_display_name(target)
        prior = aliases.get(key)
        if (
            prior is not None
            and source_name_key(prior).casefold() != source_name_key(canonical).casefold()
        ):
            alias_conflicts.append(
                f"player alias {source!r} normalizes to both {prior!r} and {canonical!r}"
            )
        aliases[key] = canonical
    if alias_conflicts:
        raise DatasetError(alias_conflicts)

    def canonical_name(name: str) -> str:
        cleaned = source_display_name(name)
        return aliases.get(source_name_key(cleaned).casefold(), cleaned)

    def team_key(names: tuple[str, ...]) -> tuple[str, ...]:
        return source_team_key(canonical_name(name) for name in names)

    if match_data_path is not None:
        csv_matches, csv_hash = parse_match_csv(
            match_data_path,
            tournament_names=github["tournaments"],
            source_url=github["repository"],
        )
        archive.extend(csv_matches)
        hashes["matchDataCsv"] = csv_hash
        csv_tournament_ids = {match.tournament_id for match in csv_matches}
        source_url_by_tournament.update(
            {tournament_id: github["repository"] for tournament_id in csv_tournament_ids}
        )
        provided_tournaments.update(csv_tournament_ids)

    for tournament_id, path in sorted((daily_results_paths or {}).items()):
        config = source_map["dailyResults"].get(tournament_id)
        if config is None:
            raise DatasetError(
                [f"daily results supplied for unmapped tournament {tournament_id!r}"]
            )
        tournament = next((item for item in dataset.tournaments if item.id == tournament_id), None)
        if tournament is None:
            raise DatasetError([f"daily results reference unknown tournament {tournament_id!r}"])
        page_matches, page_hash = parse_daily_results_html(
            path,
            tournament_id=tournament_id,
            source_url=config["url"],
            year=tournament.year,
        )
        expected = int(config["expectedMainDrawMatches"])
        if len(page_matches) > expected:
            raise DatasetError(
                [
                    f"{tournament_id} source has {len(page_matches)} rows; expected at most {expected}"
                ]
            )
        archive.extend(page_matches)
        hashes[f"dailyResults:{tournament_id}"] = page_hash
        source_url_by_tournament[tournament_id] = config["url"]
        provided_tournaments.add(tournament_id)

    base_finals = dataset.matches_by_tournament
    enriched: list[HistoricalMatch] = []
    for match in archive:
        canonical_side_a = tuple(canonical_name(name) for name in match.side_a)
        canonical_side_b = tuple(canonical_name(name) for name in match.side_b)
        if canonical_side_a != match.side_a or canonical_side_b != match.side_b:
            match = HistoricalMatch(
                **{
                    **match.__dict__,
                    "side_a": canonical_side_a,
                    "side_b": canonical_side_b,
                }
            )
        base = next(
            (
                item
                for item in base_finals.get(match.tournament_id, [])
                if item.event == match.event
            ),
            None,
        )
        if match.round_code == "Final" and base is not None:
            final_score = parse_score(base.score, line=base.line)
            winner_names = match.side_a if match.winner_side == "A" else match.side_b
            runner_up_names = match.side_b if match.winner_side == "A" else match.side_a
            oriented_sets = (
                match.sets
                if match.winner_side == "A"
                else tuple((side_b, side_a) for side_a, side_b in match.sets)
            )
            conflicts: list[str] = []
            if team_key(winner_names) != team_key(base.winner_players):
                conflicts.append(f"winner {winner_names!r} != fixture {base.winner_players!r}")
            if team_key(runner_up_names) != team_key(base.runner_up_players):
                conflicts.append(
                    f"runner-up {runner_up_names!r} != fixture {base.runner_up_players!r}"
                )
            if not final_score.walkover and oriented_sets != final_score.sets:
                conflicts.append(f"score {oriented_sets!r} != fixture {final_score.sets!r}")
            if conflicts:
                raise DatasetError(
                    [
                        f"{match.tournament_id} {match.event} final conflicts with "
                        f"{base.id}: {'; '.join(conflicts)}"
                    ]
                )
            if final_score.retired and match.reason is None:
                match = HistoricalMatch(
                    **{
                        **match.__dict__,
                        "reason": "retired",
                    }
                )
        enriched.append(match)
    archive = enriched

    normalized_identities: dict[tuple[str, str, str], HistoricalMatch] = {}
    duplicate_identities: list[str] = []
    for match in archive:
        key = (match.tournament_id, match.event, match.identity)
        if key in normalized_identities:
            duplicate_identities.append(
                f"{match.tournament_id} {match.event} has duplicate match "
                f"{match.identity!r} after player-name normalization"
            )
        else:
            normalized_identities[key] = match
    if duplicate_identities:
        raise DatasetError(duplicate_identities)

    final_groups = _group_by(
        (match for match in archive if match.round_code == "Final"),
        lambda match: (match.tournament_id, match.event),
    )
    duplicate_finals = [
        f"{tournament_id} {event} has {len(matches)} source finals"
        for (tournament_id, event), matches in final_groups.items()
        if len(matches) != 1
    ]
    if duplicate_finals:
        raise DatasetError(duplicate_finals)

    # A final is the minimum verified record for every event. This adds the
    # omitted T013 WD walkover and keeps T029/T030 useful without implying that
    # their unavailable earlier rounds were recovered.
    for tournament in dataset.tournaments:
        for base in base_finals[tournament.id]:
            if (tournament.id, base.event) in final_groups:
                continue
            score = parse_score(base.score, line=base.line)
            archive.append(
                HistoricalMatch(
                    tournament_id=tournament.id,
                    event=base.event,
                    round_code="Final",
                    played_on=tournament.end_date,
                    side_a=base.winner_players,
                    side_b=base.runner_up_players,
                    winner_side="A",
                    sets=score.sets,
                    source_url=base.source_url,
                    source_ref=base.id,
                    walkover=score.walkover,
                    reason="walkover" if score.walkover else ("retired" if score.retired else None),
                )
            )
            source_url_by_tournament.setdefault(tournament.id, base.source_url)

    # A cached daily page must be from this tournament, not merely parseable.
    # Finals reconciliation above pins identity/scores; the date window and
    # five-discipline check pin the page's temporal and event coverage.
    for tournament_id in daily_results_paths or {}:
        tournament = next(item for item in dataset.tournaments if item.id == tournament_id)
        page_rows = [match for match in archive if match.tournament_id == tournament_id]
        latest = date.fromisoformat(tournament.end_date)
        earliest = date.fromordinal(latest.toordinal() - 7)
        if any(
            not earliest <= date.fromisoformat(match.played_on) <= latest for match in page_rows
        ):
            raise DatasetError(
                [f"{tournament_id} daily results contain dates outside its tournament window"]
            )
        final_events = {match.event for match in page_rows if match.round_code == "Final"}
        if final_events != set(_EVENTS):
            raise DatasetError(
                [f"{tournament_id} daily results must contain one verified final per event"]
            )

    participant_errors: list[str] = []
    for match in archive:
        side_a = [source_name_key(name).casefold() for name in match.side_a]
        side_b = [source_name_key(name).casefold() for name in match.side_b]
        if len(side_a) != len(set(side_a)):
            participant_errors.append(
                f"{match.source_ref}: side A repeats a player after name normalization"
            )
        if len(side_b) != len(set(side_b)):
            participant_errors.append(
                f"{match.source_ref}: side B repeats a player after name normalization"
            )
        if set(side_a) & set(side_b):
            participant_errors.append(
                f"{match.source_ref}: the same player appears on both sides after name normalization"
            )
    if participant_errors:
        raise DatasetError(participant_errors)

    coverage: dict[str, SourceCoverage] = {}
    grouped = _group_by(archive, lambda match: match.tournament_id)
    for tournament in dataset.tournaments:
        sizes = {
            event: int(size)
            for size, event in re.findall(r"(\d+)(MS|WS|MD|WD|XD)", tournament.draw_format)
        }
        expected = 75 if tournament.id == "T010" else sum(size - 1 for size in sizes.values())
        imported = len(grouped.get(tournament.id, []))
        if imported > expected:
            raise DatasetError(
                [f"{tournament.id} source has {imported} rows; expected at most {expected}"]
            )
        if tournament.id not in provided_tournaments:
            availability = "finals_only"
        elif imported == expected:
            availability = "complete"
        else:
            availability = "completed_matches_only"
        coverage[tournament.id] = SourceCoverage(
            tournament_id=tournament.id,
            imported=imported,
            expected=expected,
            source_url=source_url_by_tournament.get(tournament.id, tournament.source_url),
            source_sha256=(
                hashes[f"dailyResults:{tournament.id}"]
                if f"dailyResults:{tournament.id}" in hashes
                else (
                    hashes["matchDataCsv"]
                    if tournament.id in github["tournaments"] and "matchDataCsv" in hashes
                    else dataset.source_sha256
                )
            ),
            availability=availability,
        )

    dataset.historical_matches = archive
    dataset.historical_coverage = coverage
    dataset.historical_source_hashes = hashes
    return dataset


def complete_demo_historical_draws(dataset: Dataset) -> Dataset:
    """Fill the local demo archive into complete, deterministic draw trees.

    The checked-in fixture intentionally contains championship finals and the
    optional local archives contain whatever rows were available from their
    source.  That is useful for a provenance audit, but it makes a poor public
    demo: a visitor should be able to browse every round of every event.  This
    opt-in pass preserves every supplied row and creates only the missing
    bracket nodes.  Generated rows have a stable ``demo-generated:`` source
    reference and ``generated=True`` so the distinction never gets lost in a
    manifest or test fixture.

    This is deliberately a simulator concern.  It is not a historical-data
    claim and must only be enabled for the fictional demo seed.
    """
    if not dataset.historical_matches:
        return dataset

    existing = list(dataset.historical_matches)
    generated: list[HistoricalMatch] = []

    # Keep generated entrants in the same discipline-shaped pools as the
    # supplied rows.  This matters in a public demo: an all-purpose pool can
    # accidentally put a women's singles name in men's doubles.  The source
    # fixture is already the authority for these pools; the fallback names
    # are only used for an empty/custom fixture.
    event_names: dict[str, list[str]] = {}
    event_position_names: dict[str, list[list[str]]] = {}
    for event in _EVENTS:
        event_names[event] = sorted(
            {
                name
                for match in existing
                if match.event == event
                for name in (*match.side_a, *match.side_b)
            }
        )
        width = 2 if event in {"MD", "WD", "XD"} else 1
        event_position_names[event] = [
            sorted(
                {
                    side[position]
                    for match in existing
                    if match.event == event
                    for side in (match.side_a, match.side_b)
                    if len(side) > position
                }
            )
            for position in range(width)
        ]
    fallback_names = [player.name for player in dataset.players] or [
        "Alex Mercer",
        "Mina Park",
        "Noah Chen",
        "Sofia Laurent",
        "Ethan Rao",
        "Hana Ito",
        "Lucas Meyer",
        "Iris Tan",
    ]
    for event in _EVENTS:
        if not event_names[event]:
            event_names[event] = list(fallback_names)
        event_position_names[event] = [
            position_pool or list(event_names[event])
            for position_pool in event_position_names[event]
        ]
    generated_people: dict[str, set[str]] = {event: set() for event in _EVENTS}

    def person_key(name: str) -> str:
        return source_name_key(name).casefold()

    def generated_result(
        tournament: Tournament,
        event: str,
        round_code: str,
        number: int,
    ) -> tuple[tuple[tuple[int, int], ...], str]:
        """Return a stable, plausible score and match day for a demo-only row."""
        digest = hashlib.sha256(f"{tournament.id}:{event}:{round_code}:{number}".encode()).digest()
        first_loser = 10 + digest[0] % 10
        second_loser = 10 + digest[1] % 10
        if digest[2] % 4 == 0:
            deciding_loser = 9 + digest[3] % 11
            sets = ((17 + digest[4] % 3, 21), (21, second_loser), (21, deciding_loser))
        else:
            sets = ((21, first_loser), (21, second_loser))

        days_before_final = {
            "R64": 5,
            "R32": 4,
            "R16": 3,
            "QF": 2,
            "SF": 1,
            "R1": 4,
            "R2": 3,
            "R3": 2,
            "Final": 0,
        }.get(round_code, 0)
        played_on = date.fromisoformat(tournament.end_date) - timedelta(days=days_before_final)
        return sets, played_on.isoformat()

    def required_rounds(tournament: Tournament, event: str) -> dict[str, int]:
        advertised = next(
            (
                int(size)
                for size, code in re.findall(r"(\d+)(MS|WS|MD|WD|XD)", tournament.draw_format)
                if code == event
            ),
            32,
        )
        if tournament.id == "T010":
            return {"R1": 4, "R2": 4, "R3": 4, "SF": 2, "Final": 1}
        rounds = {"R32": 16, "R16": 8, "QF": 4, "SF": 2, "Final": 1}
        if advertised == 48:
            rounds = {"R64": 16, **rounds}
        return rounds

    def generated_side(
        tournament_id: str,
        event: str,
        round_code: str,
        number: int,
        blocked: Iterable[str] = (),
    ) -> tuple[str, ...]:
        # Keep generated people source-looking and stable, while ensuring two
        # sides of one match cannot accidentally be the same participant.
        seed = sum(ord(char) for char in f"{tournament_id}:{event}:{round_code}:{number}")
        width = 2 if event in {"MD", "WD", "XD"} else 1
        blocked_names = {person_key(name) for name in blocked}
        selected: list[str | None] = [None] * width
        for position in range(width):
            pool = event_position_names[event][position]
            offset = (seed * 7 + number * (width + 1)) % len(pool)
            for step in range(len(pool) * 2):
                candidate = pool[(offset + step) % len(pool)]
                key = person_key(candidate)
                if key in blocked_names or key in generated_people[event]:
                    continue
                selected[position] = candidate
                blocked_names.add(key)
                generated_people[event].add(key)
                break
        if any(candidate is None for candidate in selected):
            # A custom fixture may have a tiny pool.  Keep it usable while
            # retaining its source-local discipline category.  A plausible
            # clean name is stored as the identity; fixture sequence data
            # never becomes an operator-facing parenthetical suffix.
            for position, candidate in enumerate(selected):
                if candidate is not None:
                    continue
                pool = event_position_names[event][position]
                source_name = pool[(seed + number + position) % len(pool)]
                given_name = source_display_name(source_name).split()[0]
                surname_count = len(_DEMO_FALLBACK_SURNAMES)
                offset = (seed + number * (width + 1) + position) % surname_count
                replacement = None
                # Single and compound surnames provide 576 deterministic,
                # human-readable identities per given name before failure.
                for step in range(surname_count * surname_count):
                    first = _DEMO_FALLBACK_SURNAMES[(offset + step) % surname_count]
                    cycle = step // surname_count
                    surname = (
                        first
                        if cycle == 0
                        else f"{first}-{_DEMO_FALLBACK_SURNAMES[(offset + cycle) % surname_count]}"
                    )
                    proposed = f"{given_name} {surname}"
                    key = person_key(proposed)
                    if key in blocked_names or key in generated_people[event]:
                        continue
                    replacement = proposed
                    blocked_names.add(key)
                    generated_people[event].add(key)
                    break
                if replacement is None:
                    raise DatasetError(
                        [f"{tournament_id} {event}: clean demo identity pool exhausted"]
                    )
                selected[position] = replacement
        return tuple(candidate for candidate in selected if candidate is not None)

    def make_generated(
        tournament: Tournament,
        event: str,
        round_code: str,
        number: int,
        side_a: tuple[str, ...] | None = None,
        side_b: tuple[str, ...] | None = None,
    ) -> HistoricalMatch:
        left = side_a or generated_side(tournament.id, event, round_code, number * 2)
        if side_a:
            generated_people[event].update(person_key(name) for name in side_a)
        right = side_b or generated_side(
            tournament.id,
            event,
            round_code,
            number * 2 + 1,
            blocked=left,
        )
        # Avoid a generated pair containing the same person twice.  This is
        # only a display seed, but malformed doubles make the public roster
        # look broken.
        if source_team_key(left) == source_team_key(right):
            right = generated_side(tournament.id, event, round_code, number * 2 + 17)
        sets, played_on = generated_result(tournament, event, round_code, number)
        return HistoricalMatch(
            tournament_id=tournament.id,
            event=event,
            round_code=round_code,
            played_on=played_on,
            side_a=left,
            side_b=right,
            winner_side="A",
            sets=sets,
            source_url=tournament.source_url,
            source_ref=f"demo-generated:{tournament.id}:{event}:{round_code}:{number:02d}",
            generated=True,
        )

    for tournament in dataset.tournaments:
        for event in _EVENTS:
            generated_people[event].clear()
            required = required_rounds(tournament, event)
            # Work backwards from the final.  Every synthetic predecessor is
            # assigned a winner equal to an unmatched concrete side in its
            # child round, so the normal exact winner-feeder inference can wire
            # it without rewriting any supplied source row.
            round_codes = list(required)
            for index in range(len(round_codes) - 2, -1, -1):
                predecessor_code = round_codes[index]
                child_code = round_codes[index + 1]
                rows = [
                    row
                    for row in (existing + generated)
                    if row.tournament_id == tournament.id
                    and row.event == event
                    and row.round_code == predecessor_code
                ]
                child_rows = [
                    row
                    for row in (existing + generated)
                    if row.tournament_id == tournament.id
                    and row.event == event
                    and row.round_code == child_code
                ]
                winners = {
                    source_team_key(row.side_a if row.winner_side == "A" else row.side_b)
                    for row in rows
                }
                unmatched_sides = [
                    side
                    for child in sorted(child_rows, key=_historical_sort_key)
                    for side in (child.side_a, child.side_b)
                    if source_team_key(side) not in winners
                ]
                missing = required[predecessor_code] - len(rows)
                for number in range(missing):
                    winner = unmatched_sides[number] if number < len(unmatched_sides) else None
                    generated.append(
                        make_generated(
                            tournament,
                            event,
                            predecessor_code,
                            len(rows) + number,
                            side_a=winner,
                        )
                    )
            # The first round (R32/R64/R1) has no predecessor to satisfy;
            # fill any remaining holes with deterministic concrete matches.
            first_code = round_codes[0]
            rows = [
                row
                for row in (existing + generated)
                if row.tournament_id == tournament.id
                and row.event == event
                and row.round_code == first_code
            ]
            for number in range(len(rows), required[first_code]):
                generated.append(make_generated(tournament, event, first_code, number))

    # Every demo match carries a court and a local start time, including
    # source finals whose upstream archive did not publish those fields. The
    # assignment is intentionally deterministic and visibly plausible: eight
    # courts, half-hour waves beginning at 09:00 on each match day.
    completed = existing + generated
    enriched: list[HistoricalMatch] = []
    for tournament in dataset.tournaments:
        tournament_rows = [row for row in completed if row.tournament_id == tournament.id]
        by_day = _group_by(tournament_rows, lambda row: row.played_on)
        for played_on in sorted(by_day):
            ordered = sorted(
                by_day[played_on],
                key=lambda row: (
                    ROUND_LABELS.get(row.round_code, row.round_code),
                    row.event,
                    row.identity,
                ),
            )
            for index, match in enumerate(ordered):
                wave = index // _DEMO_DEFAULT_COURT_COUNT
                local = (datetime.combine(date.min, time(9, 0)) + timedelta(
                    minutes=wave * _DEMO_INTERVAL_MINUTES * 2
                )).strftime("%H:%M")
                enriched.append(
                    replace(
                        match,
                        local_time=match.local_time or local,
                        court=(
                            match.court
                            or f"Court {(index % _DEMO_DEFAULT_COURT_COUNT) + 1}"
                        ),
                    )
                )

    dataset.historical_matches = enriched
    dataset.demo_generator_version = _DEMO_GENERATOR_VERSION
    for tournament in dataset.tournaments:
        coverage = dataset.historical_coverage.get(tournament.id)
        if coverage is not None:
            generated_count = sum(1 for match in generated if match.tournament_id == tournament.id)
            dataset.historical_coverage[tournament.id] = SourceCoverage(
                **{**coverage.__dict__, "generated": generated_count}
            )
    return dataset


def _slug(tournament: Tournament) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", tournament.name.lower()).strip("-")
    return f"{tournament.year}-{value}-{tournament.id.lower()}"[:60]


def _event_payload(
    tournament: Tournament, match: Match, players: dict[str, Player]
) -> tuple[dict, dict[str, Any]]:
    score = parse_score(match.score, line=match.line)
    # Event IDs are scoped by workspace in the API.  Keep the public code
    # canonical (MS/WS/MD/WD/XD) and reserve tournament-qualified IDs for
    # globally unique play-unit IDs below.
    event_id = match.event

    def participant(side: str, names: tuple[str, ...]) -> dict:
        source_player_ids = [
            next(p.id for p in players.values() if p.name == name) for name in names
        ]
        if len(names) == 1:
            return {"id": source_player_ids[0], "name": names[0]}
        return {
            "id": f"{match.id}-{side}",
            "name": " / ".join(names),
            "members": source_player_ids,
        }

    participants = [
        participant("winner", match.winner_players),
        participant("runner-up", match.runner_up_players),
    ]
    winner_id = participants[0]["id"]
    runner_id = participants[1]["id"]
    payload = {
        "id": event_id,
        "discipline": match.event,
        "format": "se",
        "participants": participants,
        "rounds": [
            [{"id": match.id, "side_a": [winner_id], "side_b": [runner_id], "duration_slots": 1}]
        ],
    }
    result = {
        "play_unit_id": match.id,
        "winner_side": "A",
        "walkover": score.walkover,
        "score": None if score.walkover else score.to_api(),
        "reason": "walkover" if score.walkover else ("retired" if score.retired else None),
    }
    return payload, result


@dataclass
class _HistoricalIdentityRegistry:
    """Tournament-local, collision-checked identities for people and pairs."""

    tournament_id: str
    players: dict[str, dict] = field(default_factory=dict)
    _owners: dict[str, str] = field(default_factory=dict)

    def _id(self, prefix: str, payload: list[Any]) -> str:
        owner = json.dumps(
            [self.tournament_id, prefix, payload],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        identifier = f"{prefix}-{hashlib.sha256(owner.encode('utf-8')).hexdigest()}"
        prior = self._owners.setdefault(identifier, owner)
        if prior != owner:
            raise DatasetError(
                [
                    f"{self.tournament_id}: SHA-256 identity collision for "
                    f"{prefix} records {prior!r} and {owner!r}"
                ]
            )
        return identifier

    def player_id(self, name: str) -> str:
        canonical = source_name_key(name)
        identifier = self._id("player", [canonical])
        existing = self.players.setdefault(
            identifier,
            {"id": identifier, "name": canonical},
        )
        if existing["name"] != canonical:
            raise DatasetError(
                [
                    f"{self.tournament_id}: player id {identifier!r} maps to "
                    f"both {existing['name']!r} and {canonical!r}"
                ]
            )
        return identifier

    def participant(self, names: tuple[str, ...]) -> dict:
        canonical_names = tuple(sorted(source_name_key(name) for name in names))
        member_ids = sorted(self.player_id(name) for name in canonical_names)
        if len(member_ids) == 1:
            return dict(self.players[member_ids[0]])
        identifier = self._id("pair", member_ids)
        return {
            "id": identifier,
            "name": " / ".join(canonical_names),
            "members": member_ids,
        }

    @property
    def roster(self) -> list[dict]:
        return [self.players[player_id] for player_id in sorted(self.players)]


def _historical_sort_key(match: HistoricalMatch) -> tuple[str, str, str, str]:
    return (
        match.played_on,
        match.court or "",
        match.local_time or "",
        match.source_ref,
    )


def _winning_team_key(match: HistoricalMatch) -> tuple[str, ...]:
    return source_team_key(match.side_a if match.winner_side == "A" else match.side_b)


def _infer_winner_feeders(
    tournament_id: str,
    matches: list[HistoricalMatch],
) -> tuple[dict[tuple[str, str], str], dict[str, int]]:
    """Infer only exact, adjacent-round winner advancement.

    The returned map is ``(target match identity, side) -> source match
    identity``. Missing rows, missing walkovers, aliases not explicitly
    curated upstream, and ambiguous identities remain disconnected.
    """

    by_round: dict[str, list[HistoricalMatch]] = _group_by(matches, lambda match: match.round_code)
    provisional: dict[tuple[str, str], str] = {}
    ambiguous_sides = 0
    for target in matches:
        predecessor = _KNOCKOUT_PREDECESSOR.get(target.round_code)
        if predecessor is None:
            continue
        if tournament_id == "T010" and target.round_code != "Final":
            continue
        for side, names in (("A", target.side_a), ("B", target.side_b)):
            target_key = source_team_key(names)
            candidates = [
                source
                for source in by_round.get(predecessor, [])
                if _winning_team_key(source) == target_key
            ]
            if len(candidates) == 1:
                provisional[(target.identity, side)] = candidates[0].identity
            elif len(candidates) > 1:
                ambiguous_sides += 1

    # A single-elimination winner advances into at most one downstream side.
    # If corrupt/duplicated target rows claim it twice, discard every claim
    # instead of choosing by input order.
    targets_by_source = _group_by(provisional.items(), lambda item: item[1])
    duplicated_sources = {
        source_id for source_id, items in targets_by_source.items() if len(items) > 1
    }
    feeders = {
        target: source for target, source in provisional.items() if source not in duplicated_sources
    }

    return feeders, {
        "inferred": len(feeders),
        "ambiguous": ambiguous_sides + len(duplicated_sources),
    }


def _order_matches_by_topology(
    round_codes: list[str],
    matches: list[HistoricalMatch],
    feeders: dict[tuple[str, str], str],
) -> dict[str, list[HistoricalMatch]]:
    """Order proven parents beside their already-ordered child matches."""

    ordered = {
        round_code: sorted(
            (match for match in matches if match.round_code == round_code),
            key=_historical_sort_key,
        )
        for round_code in round_codes
    }
    for target_code in reversed(round_codes):
        predecessor = _KNOCKOUT_PREDECESSOR.get(target_code)
        if predecessor not in ordered:
            continue
        desired_ids: list[str] = []
        for target in ordered[target_code]:
            for side in ("A", "B"):
                source_id = feeders.get((target.identity, side))
                if source_id is not None and source_id not in desired_ids:
                    desired_ids.append(source_id)
        source_by_id = {match.identity: match for match in ordered[predecessor]}
        proven = [source_by_id[source_id] for source_id in desired_ids if source_id in source_by_id]
        remainder = [match for match in ordered[predecessor] if match.identity not in desired_ids]
        ordered[predecessor] = proven + remainder
    return ordered


def _historical_event_payload(
    tournament: Tournament,
    event_code: str,
    matches: list[HistoricalMatch],
    coverage: SourceCoverage,
    identities: _HistoricalIdentityRegistry | None = None,
) -> dict:
    """Build one non-schedulable event from independently completed rows."""
    participants: dict[str, dict] = {}
    identities = identities or _HistoricalIdentityRegistry(tournament.id)

    def side_id(names: tuple[str, ...]) -> str:
        participant = identities.participant(names)
        participant_id = participant["id"]
        existing = participants.setdefault(participant_id, participant)
        if existing != participant:
            raise DatasetError(
                [
                    f"{tournament.id} {event_code}: participant id "
                    f"{participant_id!r} has conflicting source identities"
                ]
            )
        return participant_id

    round_codes = ordered_rounds(matches)
    feeders, topology = _infer_winner_feeders(tournament.id, matches)
    ordered = _order_matches_by_topology(round_codes, matches, feeders)
    unit_ids = {
        match.identity: f"{tournament.id}-{event_code}-{match.round_code}-{match.identity}"
        for match in matches
    }
    rounds: list[list[dict]] = []
    for round_code in round_codes:
        round_units: list[dict] = []
        for match in ordered[round_code]:
            unit = {
                "id": unit_ids[match.identity],
                "side_a": [side_id(match.side_a)],
                "side_b": [side_id(match.side_b)],
                "feeder_a": (
                    unit_ids[feeders[(match.identity, "A")]]
                    if (match.identity, "A") in feeders
                    else None
                ),
                "feeder_b": (
                    unit_ids[feeders[(match.identity, "B")]]
                    if (match.identity, "B") in feeders
                    else None
                ),
                "duration_slots": 2,
                "played_on": match.played_on,
                "local_time": match.local_time,
                "court_label": match.court,
                "source_url": match.source_url,
                "source_ref": match.source_ref,
                "result": {
                    "winner_side": match.winner_side,
                    "score": (
                        None
                        if match.walkover
                        else {
                            "sets": [
                                {"sideA": side_a, "sideB": side_b} for side_a, side_b in match.sets
                            ]
                        }
                    ),
                    "walkover": match.walkover,
                    "reason": match.reason,
                },
            }
            round_units.append({key: value for key, value in unit.items() if value is not None})
        rounds.append(round_units)

    advertised = next(
        (
            int(size)
            for size, code in re.findall(r"(\d+)(MS|WS|MD|WD|XD)", tournament.draw_format)
            if code == event_code
        ),
        None,
    )
    expected_match_count = (
        15
        if tournament.id == "T010"
        else (advertised - 1 if advertised is not None else len(matches))
    )
    complete_event = len(matches) == expected_match_count
    return {
        # Event IDs are workspace-scoped; the public-facing event code should
        # remain the familiar BWF abbreviation rather than leaking fixture
        # implementation IDs into the entrant and console surfaces.
        "id": event_code,
        "discipline": event_code,
        "format": "se",
        "participants": list(participants.values()),
        "rounds": rounds,
        # Keep the historical-record import path even for a complete demo:
        # 48-entry draws legitimately contain byes in R32, which the normal
        # full-draw path rejects because it requires two feeder IDs.  The
        # public layer can use expected/imported counts to present these as
        # complete while the API retains concrete bye-side participants.
        "record_scope": (
            "completed_matches_only"
            if complete_event
            else (
                "finals_only"
                if coverage.availability == "finals_only"
                else "completed_matches_only"
            )
        ),
        "historical": True,
        "advertised_size": advertised,
        "round_labels": [ROUND_LABELS[code] for code in round_codes],
        "round_codes": round_codes,
        "topology_scope": ("proven_winner_advancement" if topology["inferred"] else "none"),
        "topology_edge_count": topology["inferred"],
        "imported_match_count": len(matches),
        "expected_match_count": expected_match_count,
        "source_url": coverage.source_url,
        "identity_scope": "source_local_name",
    }


def _run_path(run_dir: Path, key: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", key).strip(".-")
    if not safe:
        raise ValueError("seed key must contain at least one alphanumeric character")
    return run_dir / f"{safe}.json"


def _write_manifest(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        temporary = None
        # Persist the directory entry where the platform supports directory
        # fsync. The file replacement is already atomic if this is unavailable.
        try:
            directory_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def preview(dataset: Dataset) -> dict:
    """Return a JSON-safe dry-run summary without contacting the API."""
    warnings: list[str] = []
    for match in dataset.matches:
        score = parse_score(match.score, line=match.line)
        if score.walkover:
            warnings.append("walkover result")
        elif score.retired:
            warnings.append("retired result")
    output = {
        "sourceSha256": dataset.source_sha256,
        "tournaments": len(dataset.tournaments),
        "matches": len(dataset.matches),
        "players": len(dataset.players),
        "events": len(dataset.matches),
        "tournamentIds": [t.id for t in dataset.tournaments],
        "warnings": warnings,
    }
    if dataset.notes_sha256 is not None:
        output["notes"] = len(dataset.notes)
        output["notesSha256"] = dataset.notes_sha256
    if dataset.historical_matches:
        output["historicalMatches"] = len(dataset.historical_matches)
        output["inputSha256"] = dataset.input_sha256
        output["coverage"] = {
            tournament_id: {
                "imported": item.imported,
                "expected": item.expected,
                "missing": item.missing,
                "availability": item.availability,
            }
            for tournament_id, item in dataset.historical_coverage.items()
        }
    return output


def select_tournaments(dataset: Dataset, tournament_ids: Iterable[str]) -> Dataset:
    """Return a deterministic subset after the source has been fully validated.

    Selection deliberately happens after parsing, provenance attachment and
    demo draw completion. A browser fixture therefore exercises the same
    canonical data builder as the long-lived demo database while paying the
    API/import cost for only the workspaces it actually asserts.
    """

    requested = tuple(dict.fromkeys(value.strip() for value in tournament_ids if value.strip()))
    if not requested:
        raise DatasetError(["--tournament requires at least one tournament id"])

    available = {tournament.id for tournament in dataset.tournaments}
    unknown = sorted(set(requested) - available)
    if unknown:
        raise DatasetError(
            [
                "unknown tournament id(s): "
                + ", ".join(unknown)
                + "; available ids: "
                + ", ".join(sorted(available))
            ]
        )

    selected = set(requested)
    matches = [match for match in dataset.matches if match.tournament_id in selected]
    used_names = {
        name
        for match in matches
        for name in (*match.winner_players, *match.runner_up_players)
    }
    return replace(
        dataset,
        tournaments=[t for t in dataset.tournaments if t.id in selected],
        matches=matches,
        players=[player for player in dataset.players if player.name in used_names],
        notes=[note for note in dataset.notes if note.tournament_id in selected],
        historical_matches=[
            match for match in dataset.historical_matches if match.tournament_id in selected
        ],
        historical_coverage={
            tournament_id: coverage
            for tournament_id, coverage in dataset.historical_coverage.items()
            if tournament_id in selected
        },
        selected_tournament_ids=tuple(sorted(selected)),
    )


def _demo_timezone(tournament: Tournament) -> str:
    location = tournament.host.casefold()
    zones = (
        (("taiwan", "taipei"), "Asia/Taipei"),
        (("south korea", "iksan", "asan"), "Asia/Seoul"),
        (("japan", "tokyo", "kumamoto"), "Asia/Tokyo"),
        (("china", "hangzhou", "changzhou"), "Asia/Shanghai"),
        (("india", "cuttack", "guwahati", "lucknow"), "Asia/Kolkata"),
        (("malaysia", "kuala lumpur"), "Asia/Kuala_Lumpur"),
        (("indonesia", "jakarta"), "Asia/Jakarta"),
        (("thailand", "bangkok"), "Asia/Bangkok"),
        (("singapore",), "Asia/Singapore"),
        (("macau",), "Asia/Macau"),
        (("australia", "sydney"), "Australia/Sydney"),
        (("canada", "markham"), "America/Toronto"),
        (("california", "united states"), "America/Los_Angeles"),
        (("denmark", "odense"), "Europe/Copenhagen"),
        (("france", "cesson", "orléans"), "Europe/Paris"),
        (("germany", "saarbrücken", "mülheim"), "Europe/Berlin"),
        (("england", "birmingham"), "Europe/London"),
        (("switzerland", "basel"), "Europe/Zurich"),
    )
    return next((zone for needles, zone in zones if any(value in location for value in needles)), "UTC")


def _demo_dates(tournament: Tournament, rows: list[HistoricalMatch]) -> tuple[date, date]:
    # These two dates are the narrative anchors for the private demo clock.
    if tournament.id == _DEMO_LIVE_TOURNAMENT:
        return date(2026, 7, 28), date(2026, 8, 2)
    if tournament.id == _DEMO_UPCOMING_TOURNAMENT:
        return date(2026, 8, 4), date(2026, 8, 9)
    end = date.fromisoformat(tournament.end_date)
    starts = [date.fromisoformat(row.played_on) for row in rows]
    return (min(starts) if starts else end), end


def _demo_setup_sections(
    tournament: Tournament,
    rows: list[HistoricalMatch],
    *,
    slug: str,
) -> dict[str, dict]:
    start, end = _demo_dates(tournament, rows)
    timezone_name = _demo_timezone(tournament)
    courts = [
        {
            "id": f"court-{number}",
            "name": f"Court {number}",
            "group": "TV courts" if number <= 2 else "Field courts",
            "available": True,
            "notes": "Instant-review court" if number <= 2 else "Standard competition court",
        }
        for number in range(1, _demo_court_count(tournament.id) + 1)
    ]
    sessions = [
        {
            "id": f"day-{index + 1}",
            "date": day.isoformat(),
            "name": "Finals" if day == end else f"Competition day {index + 1}",
            "startTime": "09:00",
            "endTime": "19:00" if day < end else "17:00",
            "courtIds": [court["id"] for court in courts],
            "notes": "Doors open 60 minutes before first scheduled match.",
        }
        for index in range((end - start).days + 1)
        for day in [start + timedelta(days=index)]
    ]
    event_names = {
        "MS": "Men's singles",
        "WS": "Women's singles",
        "MD": "Men's doubles",
        "WD": "Women's doubles",
        "XD": "Mixed doubles",
    }
    events = [
        {
            "id": code,
            "name": event_names[code],
            "code": code,
            "discipline": code,
            "category": "Open",
            "eligibility": "BWF member in good standing; one entry per discipline.",
            "capacity": 32,
            "entryFeeMinor": 7500 if code in {"MD", "WD", "XD"} else 5000,
            "status": "published" if tournament.id == _DEMO_UPCOMING_TOURNAMENT else "complete" if end < date(2026, 7, 31) else "open",
        }
        for code in _EVENTS
    ]
    opening = start - timedelta(days=90)
    deadline = start - timedelta(days=14)
    withdrawal = start - timedelta(days=10)
    draw_publication = start - timedelta(days=7)
    map_query = quote_plus(f"{tournament.venue}, {tournament.host}")
    safe_slug = slug.removesuffix(f"-{tournament.id.lower()}")
    return {
        "general": {
            "name": f"{tournament.name} ({tournament.year})",
            "publicName": f"{tournament.name} {tournament.year}",
            "organizer": "ShuttleWorks BWF Demo Circuit",
            "tournamentNumber": tournament.id,
            "tournamentType": tournament.level.lower().replace(" ", "-"),
            "season": str(tournament.year),
            "status": "active",
            "timezone": timezone_name,
        },
        "dates": {
            "entryOpening": f"{opening.isoformat()}T09:00:00",
            "entryDeadline": f"{deadline.isoformat()}T23:59:00",
            "withdrawalDeadline": f"{withdrawal.isoformat()}T23:59:00",
            "drawPublication": f"{draw_publication.isoformat()}T12:00:00",
            "tournamentStart": f"{start.isoformat()}T09:00:00",
            "tournamentEnd": f"{end.isoformat()}T19:00:00",
            "dailySessions": sessions,
        },
        "venue": {
            "venueName": tournament.venue,
            "address": f"{tournament.venue}, {tournament.host}",
            "mapLink": f"https://www.google.com/maps/search/?api=1&query={map_query}",
            "courts": courts,
            "accessibilityNotes": "Step-free spectator entrance, accessible seating, and an accessible changing room are available.",
        },
        "events": {"events": events},
        "rules": {
            "format": "single-elimination",
            "scoring": "badminton",
            "setsToWin": 2,
            "pointsPerSet": 21,
            "deuceEnabled": True,
            "defaultRestMinutes": 30,
            "drawSize": 32,
            "seedCount": 8,
            "separationPolicy": "Separate seeded entries and avoid same-association first-round matches where practical.",
            "walkoverPolicy": "Report to control 30 minutes before play; ten-minute grace period after court call.",
            "retirementPolicy": "The umpire records the completed score and retirement reason before the next match is called.",
        },
        "entries": {
            "registrationMethod": "online",
            "partnerRules": "Doubles partners must confirm the pairing before the entry deadline.",
            "paymentRequired": True,
            "refundPolicy": "Full refund before the withdrawal deadline; no refund after draws are published.",
            "waitlistEnabled": True,
            "organizerApprovalRequired": True,
            "requiredFields": ["name", "email", "phone", "association", "bwf-id"],
        },
        "people": {
            "contacts": [
                {"id": "director", "role": "tournament-director", "name": "Mei Lin", "email": "director@example.test", "phone": "+886 2 5550 0101", "public": True},
                {"id": "referee", "role": "referee", "name": "Daniel Park", "email": "referee@example.test", "phone": "+82 2 5550 0192", "public": False},
                {"id": "venue", "role": "venue-operations", "name": "Aisha Rahman", "email": "venue@example.test", "phone": "+60 3 5550 0124", "public": False},
            ]
        },
        "public-info": {
            "publicSlug": slug,
            "visibility": "public",
            "description": f"Fictional, badminton-plausible demo of the {tournament.level} {tournament.name} at {tournament.venue}.",
            "regulationsUrl": f"https://example.test/{safe_slug}/regulations.pdf",
            "logoUrl": f"https://example.test/{safe_slug}/logo.svg",
            "bannerUrl": f"https://example.test/{safe_slug}/banner.jpg",
        },
    }


def _demo_operational_event(event: dict, tournament_id: str) -> dict:
    if tournament_id not in {_DEMO_LIVE_TOURNAMENT, _DEMO_UPCOMING_TOURNAMENT}:
        return event
    output = {**event, "record_scope": "full_draw", "historical": False}
    output.pop("topology_scope", None)
    output.pop("topology_edge_count", None)
    completed_rounds = {"R64", "R32", "R16", "QF"}
    for round_code, units in zip(output.get("round_codes") or [], output["rounds"]):
        for index, unit in enumerate(units):
            # Taipei is deliberately caught during the opening round: ten of
            # sixteen matches per discipline are complete, six remain. That
            # leaves six concrete-participant matches live and another 24
            # concrete matches waiting before the feeder-dependent rounds.
            taipei_opening_complete = round_code == "R32" and index < 10
            if (
                tournament_id == _DEMO_UPCOMING_TOURNAMENT
                or round_code not in completed_rounds
                or (
                    tournament_id == _DEMO_LIVE_TOURNAMENT
                    and not taipei_opening_complete
                )
            ):
                unit.pop("result", None)
    return output


def _parse_demo_time(value: str | None) -> time:
    for pattern in ("%H:%M", "%I:%M %p", "%I.%M %p"):
        try:
            return datetime.strptime(value or "", pattern).time()
        except ValueError:
            continue
    return time(9, 0)


def _demo_plan(
    tournament: Tournament,
    rows: list[HistoricalMatch],
    events: list[dict],
) -> tuple[str, int, list[dict], list[str]]:
    start, end = _demo_dates(tournament, rows)
    zone = ZoneInfo(_demo_timezone(tournament))
    start_at = datetime.combine(start, time(9, 0), tzinfo=zone)
    court_count = _demo_court_count(tournament.id)
    assignments: list[dict] = []
    live_candidates: list[str] = []
    if tournament.id == _DEMO_LIVE_TOURNAMENT:
        by_event = [
            [
                unit["id"]
                for round_code, units in zip(
                    event.get("round_codes") or [], event["rounds"]
                )
                if round_code == "R32"
                for unit in units
                if unit.get("result") is None
            ]
            for event in events
        ]
        # One live match from every discipline, then a second MS match, gives
        # all six courts distinct, concrete work without making the floor look
        # artificially single-discipline.
        live_candidates = [group[0] for group in by_event if group]
        live_candidates.extend(by_event[0][1:2] if by_event else [])
        live_candidates = live_candidates[:court_count]
    live_position = {play_unit_id: index for index, play_unit_id in enumerate(live_candidates)}
    pending_round_index: dict[str, int] = {}
    for event in events:
        round_codes = event.get("round_codes") or []
        for round_index, units in enumerate(event["rounds"]):
            round_code = round_codes[round_index] if round_index < len(round_codes) else ""
            for index, unit in enumerate(units):
                played_on = date.fromisoformat(unit.get("played_on") or start.isoformat())
                local = _parse_demo_time(unit.get("local_time"))
                minute_offset = max(
                    0,
                    (played_on - start).days * 24 * 60
                    + local.hour * 60
                    + local.minute
                    - 9 * 60,
                )
                court_match = re.search(r"(\d+)", unit.get("court_label") or "")
                # Scheduler courts are operator-facing and one-based. Keep the
                # imported plan in the same 1..court_count domain so no surface
                # ever renders a synthetic "Court 0".
                court_id = (
                    ((int(court_match.group(1)) - 1) if court_match else index)
                    % court_count
                ) + 1
                slot_id = minute_offset // _DEMO_INTERVAL_MINUTES
                if tournament.id == _DEMO_LIVE_TOURNAMENT and unit.get("result") is None:
                    if unit["id"] in live_position:
                        position = live_position[unit["id"]]
                        slot_id = 152  # 2026-07-31 13:00 Asia/Taipei
                        court_id = position + 1
                    else:
                        position = pending_round_index.get(round_code, 0)
                        pending_round_index[round_code] = position + 1
                        if round_code == "R32":
                            slot_id = 154 + 2 * (position // court_count)
                        elif round_code == "R16":
                            slot_id = 192 + 2 * (position // court_count)
                        elif round_code == "QF":
                            slot_id = 206 + 2 * (position // court_count)
                        elif round_code == "SF":
                            slot_id = 240 + 2 * (position // court_count)
                        else:  # Finals
                            slot_id = 246 + 2 * (position // court_count)
                        court_id = (position % court_count) + 1
                    # Keep the remaining concrete R32 wave in the live-day
                    # queue. Its source row still carries the planned court
                    # and local time (and every later round stays on Plan), but
                    # an Operations assignment means "physically on court",
                    # so importing these 24 as assigned would truthfully leave
                    # the queue empty while six matches are playing.
                    if round_code == "R32" and unit["id"] not in live_position:
                        continue
                assignments.append(
                    {
                        "play_unit_id": unit["id"],
                        "slot_id": slot_id,
                        "court_id": court_id,
                        "duration_slots": int(unit.get("duration_slots") or 2),
                    }
                )
    total_slots = max(
        (end - start).days * 48 + 48,
        max((item["slot_id"] + item["duration_slots"] for item in assignments), default=1),
    )
    return start_at.isoformat(), total_slots, assignments, live_candidates


def apply(
    dataset: Dataset,
    client: SimClient,
    *,
    seed_key: str,
    run_dir: Path = _DEFAULT_RUN_DIR,
    replace: bool = False,
) -> dict:
    """Apply one complete dataset, checkpointing each phase in a manifest."""
    path = _run_path(run_dir, seed_key)
    input_hash = (
        dataset.input_sha256
        if dataset.historical_matches or dataset.selected_tournament_ids
        else dataset.source_sha256
    )
    prior = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    # A guarded reset is explicit permission to start this seed key over. It
    # must remain usable across a format upgrade; otherwise the operator has
    # deleted the scoped workspaces yet is told to use --replace against a
    # manifest whose workspace ids have already been cleared.
    if prior and prior.get("status") == "reset":
        prior = None
    same_format = bool(prior and prior.get("seedFormatVersion") == _SEED_FORMAT_VERSION)
    same_source = bool(
        same_format
        and prior
        and prior.get("inputSha256", prior.get("sourceSha256"))
        == input_hash
    )
    if prior and not same_source and not replace:
        if not same_format:
            raise ValueError(f"seed key {seed_key!r} uses an older seed format; use --replace")
        raise ValueError(
            f"seed key {seed_key!r} already has a different source hash; use --replace"
        )
    if prior and same_source and prior.get("status") == "complete" and not replace:
        return {**prior, "noop": True}
    if prior and replace:
        for old in prior.get("tournaments", {}).values():
            old_tid = old.get("workspaceId")
            if old_tid:
                client.delete_tournament(old_tid)
        prior = None
    players = dataset.players_by_id
    manifest = prior or {
        "seedKey": seed_key,
        "seedFormatVersion": _SEED_FORMAT_VERSION,
        "sourceSha256": dataset.source_sha256,
        "status": "running",
        "tournaments": {},
    }
    manifest["seedFormatVersion"] = _SEED_FORMAT_VERSION
    manifest["sourceSha256"] = dataset.source_sha256
    manifest["notesSha256"] = dataset.notes_sha256
    manifest["inputSha256"] = input_hash
    manifest["historicalSourceSha256"] = dataset.historical_source_hashes
    manifest["selectedTournamentIds"] = list(dataset.selected_tournament_ids)
    by_tournament = dataset.matches_by_tournament
    historical_by_tournament = dataset.historical_by_tournament
    notes = dataset.notes_by_tournament
    for tournament in dataset.tournaments:
        entry = manifest["tournaments"].setdefault(tournament.id, {})
        rows = by_tournament[tournament.id]
        historical_rows = historical_by_tournament.get(tournament.id, [])
        demo_seed = dataset.demo_generator_version is not None and bool(historical_rows)
        demo_start, demo_end = _demo_dates(tournament, historical_rows) if demo_seed else (
            date.fromisoformat(tournament.end_date),
            date.fromisoformat(tournament.end_date),
        )
        if not entry.get("workspaceId"):
            workspace = client.create_tournament(
                f"{tournament.name} ({tournament.year})",
                kind="bracket",
                modules=[
                    {"moduleId": "bracket", "status": "enabled"},
                    {"moduleId": "display", "status": "enabled"},
                ],
                tournament_date=demo_start.isoformat(),
                tournament_end_date=demo_end.isoformat() if demo_seed else None,
                time_zone=_demo_timezone(tournament) if demo_seed else None,
            )
            entry["workspaceId"] = workspace["id"]
            entry["slug"] = _slug(tournament)
            historical_coverage = dataset.historical_coverage.get(tournament.id)
            source_metadata = {
                "tournamentId": tournament.id,
                "year": tournament.year,
                "dateRange": tournament.date_range,
                "endDate": tournament.end_date,
                "name": tournament.name,
                "host": tournament.host,
                "venue": tournament.venue,
                "level": tournament.level,
                "prize": tournament.prize,
                "drawFormat": tournament.draw_format,
                "sourceUrl": tournament.source_url,
                "historical": True,
                "recordScope": (
                    "finals_only"
                    if historical_coverage is None
                    or historical_coverage.availability == "finals_only"
                    else "completed_matches_only"
                ),
                "identityScope": "source_local_name",
            }
            if demo_seed:
                source_metadata["operationalDemoState"] = (
                    "in_progress"
                    if tournament.id == _DEMO_LIVE_TOURNAMENT
                    else "upcoming"
                    if tournament.id == _DEMO_UPCOMING_TOURNAMENT
                    else "complete"
                )
            if historical_coverage is not None:
                source_metadata.update(
                    {
                        "sourceUrl": historical_coverage.source_url,
                        "availability": historical_coverage.availability,
                        "importedMatches": historical_coverage.imported,
                        "expectedMainDrawMatches": historical_coverage.expected,
                        "missingMatches": historical_coverage.missing,
                        "sourceSha256": historical_coverage.source_sha256,
                        "generatedMatches": historical_coverage.generated,
                    }
                )
            note = notes.get(tournament.id)
            if note is not None:
                source_metadata.update(
                    {
                        "levelDescription": note.level_description,
                        "drawDescription": note.draw_description,
                        "timingNote": note.timing_note,
                    }
                )
            entry["source"] = source_metadata
            _write_manifest(path, manifest)
        tid = entry["workspaceId"]
        if demo_seed and not entry.get("setupSeeded"):
            client.seed_setup_sections(
                tid,
                _demo_setup_sections(tournament, historical_rows, slug=entry["slug"]),
            )
            entry["setupSeeded"] = True
            _write_manifest(path, manifest)
        if not entry.get("bracketImported"):
            events = []
            results = []
            roster: list[dict] = []
            if historical_rows:
                coverage = dataset.historical_coverage[tournament.id]
                identities = _HistoricalIdentityRegistry(tournament.id)
                for event_code in _EVENTS:
                    event_rows = [row for row in historical_rows if row.event == event_code]
                    if not event_rows:
                        raise ValueError(
                            f"historical source has no {event_code} rows for {tournament.id}"
                        )
                    event_payload = _historical_event_payload(
                            tournament,
                            event_code,
                            event_rows,
                            coverage,
                            identities,
                        )
                    events.append(
                        _demo_operational_event(event_payload, tournament.id)
                        if demo_seed
                        else event_payload
                    )
                roster = identities.roster
            else:
                for row in rows:
                    event, result = _event_payload(tournament, row, players)
                    events.append(event)
                    result["event_id"] = event["id"]
                    results.append(result)
                used_names = {
                    name for row in rows for name in (*row.winner_players, *row.runner_up_players)
                }
                roster = [
                    {"id": player.id, "name": player.name}
                    for player in players.values()
                    if player.name in used_names
                ]
            import_body = {
                    "courts": _demo_court_count(tournament.id) if demo_seed else 2,
                    "total_slots": 16,
                    "rest_between_rounds": 1,
                    "interval_minutes": _DEMO_INTERVAL_MINUTES,
                    "time_limit_seconds": 5,
                    "roster": roster,
                    "events": events,
                }
            if demo_seed:
                start_time, total_slots, assignments, live_match_ids = _demo_plan(
                    tournament, historical_rows, events
                )
                import_body.update(
                    {
                        "start_time": start_time,
                        "total_slots": total_slots,
                        "assignments": assignments,
                    }
                )
                entry["liveMatchIds"] = live_match_ids
            client.import_bracket(tid, import_body)
            if results:
                imported = client.get_bracket(tid)
                units = {unit["event_id"]: unit for unit in imported.get("play_units", [])}
                for result in results:
                    unit = units.get(result["event_id"])
                    if unit is None:
                        raise ValueError(
                            f"imported bracket has no final for {result['event_id']!r}"
                        )
                    result["play_unit_id"] = unit["id"]
            entry["bracketImported"] = True
            entry["results"] = results
            entry["matchCount"] = len(historical_rows) if historical_rows else len(rows)
            entry["playerCount"] = len(roster)
            entry["topologyEdgeCount"] = sum(
                int(event.get("topology_edge_count") or 0) for event in events
            )
            if historical_rows:
                entry["expectedResultCount"] = sum(
                    1
                    for event in events
                    for event_round in event["rounds"]
                    for unit in event_round
                    if unit.get("result") is not None
                )
            _write_manifest(path, manifest)
        if not entry.get("resultsRecorded"):
            for result in entry["results"]:
                body = {
                    "id": command_uuid(0, seed_key, tournament.id, result["play_unit_id"]),
                    "kind": "record_result",
                    **{k: v for k, v in result.items() if k != "event_id"},
                }
                body = {key: value for key, value in body.items() if value is not None}
                client.bracket_command(tid, body)
            entry["resultsRecorded"] = True
            _write_manifest(path, manifest)
        if demo_seed and not entry.get("liveMatchesStarted"):
            for play_unit_id in entry.get("liveMatchIds", []):
                client.bracket_match_action(tid, play_unit_id, "start")
            entry["liveMatchesStarted"] = True
            _write_manifest(path, manifest)
        if not entry.get("entryPage"):
            closed_at = (
                f"{(demo_start - timedelta(days=14)).isoformat()}T23:59:59+00:00"
                if demo_seed
                else f"{tournament.end_date}T23:59:59+00:00"
            )
            note = notes.get(tournament.id)
            details = (
                f" {note.level_description[:1].upper()}{note.level_description[1:]} "
                f"Draw listing: {note.draw_description}."
                if note is not None
                else ""
            )
            coverage = dataset.historical_coverage.get(tournament.id)
            demo_state = (
                "Tournament in progress"
                if tournament.id == _DEMO_LIVE_TOURNAMENT and demo_seed
                else "Upcoming tournament"
                if tournament.id == _DEMO_UPCOMING_TOURNAMENT and demo_seed
                else "Completed tournament"
            )
            intro_text = (
                f"{demo_state}: {tournament.name} ({tournament.year}). {tournament.level}, {tournament.prize}, {tournament.host}, {tournament.venue}. Browse the published draws and available results across all five events.{details}"
                if demo_seed
                else f"Completed tournament: {tournament.name} ({tournament.year}). {tournament.level}, {tournament.prize}, {tournament.host}, {tournament.venue}. Browse the complete published draws and results across all five events.{details}"
            )
            regulations_text = (
                f"Fictional operational demo; entries are closed and match details are populated for visual testing. Source reference: {(coverage.source_url if coverage else tournament.source_url)}."
                if demo_seed
                else f"Read-only completed tournament; entries are closed. Source: {(coverage.source_url if coverage else tournament.source_url)}."
            )
            client.upsert_entry_page(
                tid,
                {
                    "slug": entry["slug"],
                    "isOpen": True,
                    "introText": intro_text,
                    "regulationsText": regulations_text,
                    "waiverRequired": False,
                    "collectPhone": False,
                    "venueName": tournament.venue,
                    "venueAddress": f"{tournament.host}; {tournament.date_range}; {tournament.draw_format}",
                },
            )
            for row in rows:
                client.create_entry_event(
                    tid,
                    {
                        "code": row.event,
                        "discipline": row.event_label,
                        "entryType": "doubles" if row.event in {"MD", "WD", "XD"} else "singles",
                        "bracketEventId": row.event,
                        "opensAt": f"{tournament.year - 1:04d}-01-01T00:00:00+00:00",
                        "closesAt": closed_at,
                    },
                )
            client.patch_entry_page_publication(
                tid,
                {
                    "drawsPublished": True,
                    "resultsPublished": tournament.id != _DEMO_UPCOMING_TOURNAMENT or not demo_seed,
                },
            )
            projection = client.entry_page_projection(entry["slug"])
            if projection.status_code != 200:
                raise ValueError(
                    f"public entry projection for {entry['slug']!r} returned {projection.status_code}"
                )
            entry["entryPage"] = True
            token = client.display_token(tid)
            entry["displayToken"] = token.get("token")
            entry["urls"] = {
                "console": f"/tournaments/{tid}/bracket",
                "entrant": f"/e/{entry['slug']}",
                "display": token.get("url", f"/display?token={token.get('token', '')}"),
            }
            _write_manifest(path, manifest)
        snapshot = client.get_bracket(tid)
        expected_ids = {row.event for row in rows}
        actual_ids = {event.get("id") for event in snapshot.get("events", [])}
        result_ids = {result.get("play_unit_id") for result in snapshot.get("results", [])}
        expected_result_ids = {result["play_unit_id"] for result in entry.get("results", [])}
        expected_result_count = int(
            entry.get("expectedResultCount")
            if entry.get("expectedResultCount") is not None
            else len(historical_rows) if historical_rows else len(rows)
        )
        result_mismatch = len(snapshot.get("results", [])) != expected_result_count or (
            not historical_rows and result_ids != expected_result_ids
        )
        if not expected_ids.issubset(actual_ids) or result_mismatch:
            raise ValueError(
                f"bracket read-back for {tournament.id} does not contain all imported results"
            )
    manifest["matchCount"] = sum(
        int(entry.get("matchCount") or 0) for entry in manifest["tournaments"].values()
    )
    manifest["playerCount"] = sum(
        int(entry.get("playerCount") or 0) for entry in manifest["tournaments"].values()
    )
    manifest["topologyEdgeCount"] = sum(
        int(entry.get("topologyEdgeCount") or 0) for entry in manifest["tournaments"].values()
    )
    manifest["status"] = "complete"
    _write_manifest(path, manifest)
    return manifest


def status(*, seed_key: str, run_dir: Path = _DEFAULT_RUN_DIR) -> dict:
    path = _run_path(run_dir, seed_key)
    if not path.exists():
        raise FileNotFoundError(f"no import run for seed key {seed_key!r}")
    return json.loads(path.read_text(encoding="utf-8"))


def reset(
    *, seed_key: str, client: SimClient, run_dir: Path = _DEFAULT_RUN_DIR, confirm: str
) -> dict:
    if confirm != seed_key:
        raise ValueError("reset requires --confirm equal to the seed key")
    path = _run_path(run_dir, seed_key)
    manifest = status(seed_key=seed_key, run_dir=run_dir)
    deleted: list[str] = []
    for entry in manifest.get("tournaments", {}).values():
        tid = entry.get("workspaceId")
        if tid:
            client.delete_tournament(tid)
            deleted.append(tid)
            entry["workspaceId"] = None
    manifest["status"] = "reset"
    manifest["deletedWorkspaceIds"] = deleted
    _write_manifest(path, manifest)
    return manifest
