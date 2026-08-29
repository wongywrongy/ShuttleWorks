"""Adapters for locally supplied historical BWF match sources.

Raw third-party data is intentionally not vendored.  The source map pins the
provenance while callers provide a local ``matches.csv`` clone and cached HTML
pages.  Parsers fail closed when a row cannot be represented faithfully.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable

EVENTS = ("MS", "WS", "MD", "WD", "XD")
ROUND_ORDER = {
    "R1": 0,
    "R2": 1,
    "R3": 2,
    "R64": 0,
    "R32": 1,
    "R16": 2,
    "QF": 3,
    "SF": 4,
    "Final": 5,
}
ROUND_LABELS = {
    "R1": "Group round 1",
    "R2": "Group round 2",
    "R3": "Group round 3",
    "R64": "Round of 64",
    "R32": "Round of 32",
    "R16": "Round of 16",
    "QF": "Quarterfinals",
    "SF": "Semifinals",
    "Final": "Finals",
}
_HTML_ROUNDS = {
    "Round of 64": "R64",
    "Round of 32": "R32",
    "Round of 16": "R16",
    "Quarterfinals": "QF",
    "Semifinals": "SF",
    "Finals": "Final",
}
_SEED_RE = re.compile(r"\s*\(\d+\)\s*$")
_SET_RE = re.compile(r"^(\d+)\s*[-–]\s*(\d+)$")


def source_name_key(name: str) -> str:
    """Return the minimally-normalized, source-local player identity.

    Accents, punctuation, and case are evidence-bearing and deliberately stay
    intact.  NFC plus whitespace folding removes only representation noise.
    Known spelling variants must be handled by the source map's explicit alias
    table before this function is called.
    """

    return " ".join(unicodedata.normalize("NFC", name).split())


def source_team_key(names: Iterable[str]) -> tuple[str, ...]:
    """Identity of one singles player or doubles pair.

    Partner order has no bracket meaning, so pair members are sorted.  No
    fuzzy or lossy name normalization is performed.
    """

    return tuple(sorted(source_name_key(name) for name in names))


class HistoricalSourceError(ValueError):
    """A historical source cannot be imported without guessing."""


@dataclass(frozen=True)
class HistoricalMatch:
    tournament_id: str
    event: str
    round_code: str
    played_on: str
    side_a: tuple[str, ...]
    side_b: tuple[str, ...]
    winner_side: str
    sets: tuple[tuple[int, int], ...]
    source_url: str
    source_ref: str
    local_time: str | None = None
    court: str | None = None
    walkover: bool = False
    reason: str | None = None
    # Synthetic rows are used only by the local complete-demo seeder.  They
    # retain the same contract as source rows while making provenance explicit
    # to manifests and tests (the public projection may choose to hide it).
    generated: bool = False

    @property
    def identity(self) -> str:
        raw = json.dumps(
            [
                self.tournament_id,
                self.event,
                self.round_code,
                self.played_on,
                source_team_key(self.side_a),
                source_team_key(self.side_b),
            ],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class SourceCoverage:
    tournament_id: str
    imported: int
    expected: int
    source_url: str
    source_sha256: str
    availability: str
    generated: int = 0

    @property
    def missing(self) -> int:
        return self.expected - self.imported


def load_source_map(path: str | Path) -> dict:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if payload.get("version") != 1:
        raise HistoricalSourceError("historical source map must have version 1")
    return payload


def _split_team(raw: str) -> tuple[str, ...]:
    cleaned = re.sub(r"\[\s*(?:WO|RET|Retired)\s*\]", "", raw, flags=re.I)
    members = tuple(_SEED_RE.sub("", part.strip()) for part in cleaned.split("/") if part.strip())
    if not members or len(members) > 2:
        raise HistoricalSourceError(f"invalid player/pair {raw!r}")
    return members


def _parse_sets(raw: str, *, source_ref: str) -> tuple[tuple[int, int], ...]:
    value = raw.strip()
    if value in {"", "-", "–", "Walkover"}:
        return ()
    value = re.sub(r",?\s*retired\s*$", "", value, flags=re.I)
    parts = [part.strip() for part in (value.split(",") if "," in value else value.split())]
    sets: list[tuple[int, int]] = []
    for part in parts:
        if not part:
            continue
        match = _SET_RE.fullmatch(part)
        if match is None:
            raise HistoricalSourceError(f"{source_ref}: invalid score component {part!r}")
        sets.append((int(match.group(1)), int(match.group(2))))
    if not sets or len(sets) > 3:
        raise HistoricalSourceError(f"{source_ref}: invalid badminton score {raw!r}")
    return tuple(sets)


def _reject_duplicate_matches(matches: Iterable[HistoricalMatch], source: Path) -> None:
    seen: dict[str, str] = {}
    for match in matches:
        prior = seen.get(match.identity)
        if prior is not None:
            raise HistoricalSourceError(
                f"{source}: duplicate match {match.source_ref}; first seen at {prior}"
            )
        seen[match.identity] = match.source_ref


def parse_match_csv(
    path: str | Path,
    *,
    tournament_names: dict[str, str],
    source_url: str,
) -> tuple[list[HistoricalMatch], str]:
    """Read main-draw completed matches for mapped tournaments."""
    source_path = Path(path)
    raw = source_path.read_bytes()
    reverse = {name: tournament_id for tournament_id, name in tournament_names.items()}
    matches: list[HistoricalMatch] = []
    with source_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {
            "date",
            "discipline",
            "tournament",
            "round",
            "team1",
            "team2",
            "winner",
            "score",
        }
        if required - set(reader.fieldnames or []):
            raise HistoricalSourceError(
                f"match CSV is missing columns: {sorted(required - set(reader.fieldnames or []))}"
            )
        for line_no, row in enumerate(reader, start=2):
            tournament_id = reverse.get(row["tournament"])
            if tournament_id is None:
                continue
            round_code = row["round"].strip()
            if round_code.startswith("Q") and round_code not in {"QF"}:
                continue
            if round_code not in ROUND_ORDER:
                raise HistoricalSourceError(
                    f"{source_path}:{line_no}: unsupported main-draw round {round_code!r}"
                )
            event = row["discipline"].strip()
            winner = row["winner"].strip()
            if event not in EVENTS or winner not in {"1", "2"}:
                raise HistoricalSourceError(
                    f"{source_path}:{line_no}: invalid event/winner {event!r}/{winner!r}"
                )
            source_ref = f"{source_path.name}:{line_no}"
            matches.append(
                HistoricalMatch(
                    tournament_id=tournament_id,
                    event=event,
                    round_code=round_code,
                    played_on=row["date"].strip(),
                    side_a=_split_team(row["team1"]),
                    side_b=_split_team(row["team2"]),
                    winner_side="A" if winner == "1" else "B",
                    sets=_parse_sets(row["score"], source_ref=source_ref),
                    source_url=source_url,
                    source_ref=source_ref,
                )
            )
    _reject_duplicate_matches(matches, source_path)
    return matches, hashlib.sha256(raw).hexdigest()


class _DailyResultsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.round_title = ""
        self.court = ""
        self.capture_title = False
        self.capture_court = False
        self.in_row = False
        self.in_cell = False
        self.strong_depth = 0
        self.text: list[str] = []
        self.cell_text: list[str] = []
        self.cell_strong = False
        self.cells: list[tuple[str, bool]] = []
        self.rows: list[tuple[str, str, list[tuple[str, bool]]]] = []

    @staticmethod
    def _classes(attrs: list[tuple[str, str | None]]) -> set[str]:
        return set(dict(attrs).get("class", "").split())

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = self._classes(attrs)
        if tag == "div" and "ultp-accordion-title" in classes:
            self.capture_title = True
            self.text = []
        elif tag in {"h3", "h4"} and "wp-block-heading" in classes:
            self.capture_court = True
            self.text = []
        elif tag == "tr":
            self.in_row = True
            self.cells = []
        elif self.in_row and tag in {"td", "th"}:
            self.in_cell = True
            self.cell_text = []
            self.cell_strong = False
        elif self.in_cell and tag == "strong":
            self.strong_depth += 1
            self.cell_strong = True

    def handle_data(self, data: str) -> None:
        if self.capture_title or self.capture_court:
            self.text.append(data)
        if self.in_cell:
            self.cell_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "strong" and self.strong_depth:
            self.strong_depth -= 1
        elif tag in {"td", "th"} and self.in_cell:
            value = " ".join("".join(self.cell_text).split())
            self.cells.append((value, self.cell_strong))
            self.in_cell = False
        elif tag == "tr" and self.in_row:
            if len(self.cells) == 6 and self.cells[0][0].startswith("Match "):
                self.rows.append((self.round_title, self.court, list(self.cells)))
            self.in_row = False
        elif tag == "div" and self.capture_title:
            self.round_title = " ".join("".join(self.text).split())
            self.capture_title = False
        elif tag in {"h3", "h4"} and self.capture_court:
            heading = " ".join("".join(self.text).split())
            if heading.startswith("Court "):
                self.court = heading
            self.capture_court = False


def parse_daily_results_html(
    path: str | Path,
    *,
    tournament_id: str,
    source_url: str,
    year: int,
) -> tuple[list[HistoricalMatch], str]:
    """Parse the Badminton World Tour daily-results article tables."""
    source_path = Path(path)
    raw = source_path.read_bytes()
    parser = _DailyResultsParser()
    parser.feed(raw.decode("utf-8"))
    output: list[HistoricalMatch] = []
    for index, (title, court, cells) in enumerate(parser.rows, start=1):
        if ": " not in title:
            raise HistoricalSourceError(f"{source_path}: row {index} has no round title")
        if " | " in title:
            date_text, round_label = title.rsplit(" | ", 1)
        else:
            date_text, round_label = title.rsplit(": ", 1)
        round_code = _HTML_ROUNDS.get(round_label)
        if round_code is None:
            raise HistoricalSourceError(f"{source_path}: unsupported round {round_label!r}")
        event = cells[2][0]
        if event not in EVENTS:
            raise HistoricalSourceError(f"{source_path}: row {index} has invalid event {event!r}")
        winner_cells = [side for side in (3, 4) if cells[side][1]]
        if len(winner_cells) != 1:
            raise HistoricalSourceError(f"{source_path}: row {index} must mark exactly one winner")
        side_a_raw, side_b_raw, score_raw = cells[3][0], cells[4][0], cells[5][0]
        lowered = f"{side_a_raw} {side_b_raw} {score_raw}".lower()
        walkover = "[wo]" in lowered
        retired = "retired" in lowered or "[ret]" in lowered
        source_ref = f"{source_path.name}:table-row-{index}"
        if score_raw.strip() in {"-", "–"} and not walkover:
            raise HistoricalSourceError(
                f"{source_ref}: score is unavailable but no [WO] outcome is marked"
            )
        try:
            if date_text.startswith("Day "):
                calendar_text = date_text.split(": ", 1)[1].split(", ", 1)[1]
                parsed_date = datetime.strptime(calendar_text, "%B %d, %Y").date()
            else:
                calendar_text = date_text.split(", ", 1)[1]
                parsed_date = datetime.strptime(calendar_text, "%d %B").replace(year=year).date()
            played_on = parsed_date.isoformat()
        except (IndexError, ValueError) as exc:
            raise HistoricalSourceError(
                f"{source_path}: row {index} has invalid date {date_text!r}"
            ) from exc
        output.append(
            HistoricalMatch(
                tournament_id=tournament_id,
                event=event,
                round_code=round_code,
                played_on=played_on,
                side_a=_split_team(side_a_raw),
                side_b=_split_team(side_b_raw),
                winner_side="A" if winner_cells[0] == 3 else "B",
                sets=() if walkover else _parse_sets(score_raw, source_ref=source_ref),
                source_url=source_url,
                source_ref=source_ref,
                local_time=cells[1][0],
                court=court,
                walkover=walkover,
                reason="walkover" if walkover else ("retired" if retired else None),
            )
        )
    if not output:
        raise HistoricalSourceError(f"{source_path}: no daily-result rows found")
    _reject_duplicate_matches(output, source_path)
    return output, hashlib.sha256(raw).hexdigest()


def ordered_rounds(matches: Iterable[HistoricalMatch]) -> list[str]:
    codes = {match.round_code for match in matches}
    return sorted(codes, key=lambda code: (ROUND_ORDER[code], code))
