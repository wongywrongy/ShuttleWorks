"""Import the pipe-delimited BWF finals dataset through the HTTP API.

This module deliberately has no product imports.  It is a small, deterministic
adapter from the source file into the bracket import contract.  Keeping the
source parser and the HTTP applier separate makes ``preview`` useful before a
demo database is touched and gives future source formats a stable target.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterable

from .client import SimClient
from .historical_matches import (
    ROUND_LABELS,
    HistoricalMatch,
    SourceCoverage,
    load_source_map,
    ordered_rounds,
    parse_daily_results_html,
    parse_match_csv,
    source_name_key,
    source_team_key,
)
from .rng import command_uuid

_SCORE_RE = re.compile(r"^\s*(\d+)\s*[-–]\s*(\d+)\s*$")
_DEFAULT_RUN_DIR = Path(".local-testing/demo/data/import-runs")
_EVENTS = ("MS", "WS", "MD", "WD", "XD")
_SEED_FORMAT_VERSION = 2
_KNOCKOUT_PREDECESSOR = {
    "R32": "R64",
    "R16": "R32",
    "QF": "R16",
    "SF": "QF",
    "Final": "SF",
}


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

    @property
    def input_sha256(self) -> str:
        payload = {
            "source": self.source_sha256,
            "notes": self.notes_sha256,
            "historicalSources": self.historical_source_hashes,
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
    aliases = {
        source.casefold(): target for source, target in source_map.get("playerAliases", {}).items()
    }

    def team_key(names: tuple[str, ...]) -> tuple[str, ...]:
        return source_team_key(aliases.get(name.casefold(), name) for name in names)

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
        canonical_side_a = tuple(aliases.get(name.casefold(), name) for name in match.side_a)
        canonical_side_b = tuple(aliases.get(name.casefold(), name) for name in match.side_b)
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


def _slug(tournament: Tournament) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", tournament.name.lower()).strip("-")
    return f"{tournament.year}-{value}-{tournament.id.lower()}"[:60]


def _event_payload(
    tournament: Tournament, match: Match, players: dict[str, Player]
) -> tuple[dict, dict[str, Any]]:
    score = parse_score(match.score, line=match.line)
    event_id = f"{tournament.id}-{match.event}"

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
                "duration_slots": 1,
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
    return {
        "id": f"{tournament.id}-{event_code}",
        "discipline": event_code,
        "format": "se",
        "participants": list(participants.values()),
        "rounds": rounds,
        "record_scope": (
            "finals_only" if coverage.availability == "finals_only" else "completed_matches_only"
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
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


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
    prior = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    same_format = bool(prior and prior.get("seedFormatVersion") == _SEED_FORMAT_VERSION)
    same_source = bool(
        same_format
        and prior
        and prior.get("inputSha256", prior.get("sourceSha256"))
        == (dataset.input_sha256 if dataset.historical_matches else dataset.source_sha256)
    )
    if prior and not same_source and not replace:
        if not same_format:
            raise ValueError(f"seed key {seed_key!r} uses an older seed format; use --replace")
        raise ValueError(
            f"seed key {seed_key!r} already has a different source hash; use --replace"
        )
    if prior and same_source and prior.get("status") == "complete" and not replace:
        return {**prior, "noop": True}
    if prior and (replace or prior.get("status") == "reset"):
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
    manifest["inputSha256"] = (
        dataset.input_sha256 if dataset.historical_matches else dataset.source_sha256
    )
    manifest["historicalSourceSha256"] = dataset.historical_source_hashes
    by_tournament = dataset.matches_by_tournament
    historical_by_tournament = dataset.historical_by_tournament
    notes = dataset.notes_by_tournament
    for tournament in dataset.tournaments:
        entry = manifest["tournaments"].setdefault(tournament.id, {})
        if not entry.get("workspaceId"):
            workspace = client.create_tournament(
                f"{tournament.name} ({tournament.year})",
                kind="bracket",
                modules=[
                    {"moduleId": "bracket", "status": "enabled"},
                    {"moduleId": "display", "status": "enabled"},
                ],
                tournament_date=tournament.end_date,
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
            if historical_coverage is not None:
                source_metadata.update(
                    {
                        "sourceUrl": historical_coverage.source_url,
                        "availability": historical_coverage.availability,
                        "importedMatches": historical_coverage.imported,
                        "expectedMainDrawMatches": historical_coverage.expected,
                        "missingMatches": historical_coverage.missing,
                        "sourceSha256": historical_coverage.source_sha256,
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
        rows = by_tournament[tournament.id]
        historical_rows = historical_by_tournament.get(tournament.id, [])
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
                    events.append(
                        _historical_event_payload(
                            tournament,
                            event_code,
                            event_rows,
                            coverage,
                            identities,
                        )
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
            client.import_bracket(
                tid,
                {
                    "courts": 2,
                    "total_slots": 16,
                    "rest_between_rounds": 1,
                    "interval_minutes": 30,
                    "time_limit_seconds": 5,
                    "roster": roster,
                    "events": events,
                },
            )
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
        if not entry.get("entryPage"):
            closed_at = f"{tournament.end_date}T23:59:59+00:00"
            note = notes.get(tournament.id)
            details = (
                f" {note.level_description[:1].upper()}{note.level_description[1:]} "
                f"Draw listing: {note.draw_description}."
                if note is not None
                else ""
            )
            timing = f" {note.timing_note}" if note is not None else ""
            coverage = dataset.historical_coverage.get(tournament.id)
            if coverage is None or coverage.availability == "finals_only":
                archive_description = "the five championship finals only"
            elif coverage.missing == 0:
                archive_description = (
                    f"all {coverage.imported} main-draw match records available from the source"
                )
            else:
                archive_description = (
                    f"{coverage.imported} completed main-draw matches; "
                    f"{coverage.missing} draw rows are unavailable and were not inferred"
                )
            client.upsert_entry_page(
                tid,
                {
                    "slug": entry["slug"],
                    "isOpen": True,
                    "introText": f"Historical BWF match archive: {tournament.name} ({tournament.year}). {tournament.level}, {tournament.prize}, {tournament.host}, {tournament.venue}. This record contains {archive_description}.{details}",
                    "regulationsText": f"Read-only historical results; entries are closed.{timing} Source: {(coverage.source_url if coverage else tournament.source_url)}.",
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
                        "bracketEventId": f"{tournament.id}-{row.event}",
                        "opensAt": f"{tournament.year - 1:04d}-01-01T00:00:00+00:00",
                        "closesAt": closed_at,
                    },
                )
            client.patch_entry_page_publication(
                tid, {"drawsPublished": True, "resultsPublished": True}
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
        expected_ids = {f"{tournament.id}-{row.event}" for row in rows}
        actual_ids = {event.get("id") for event in snapshot.get("events", [])}
        result_ids = {result.get("play_unit_id") for result in snapshot.get("results", [])}
        expected_result_ids = {result["play_unit_id"] for result in entry.get("results", [])}
        expected_result_count = len(historical_rows) if historical_rows else len(rows)
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
