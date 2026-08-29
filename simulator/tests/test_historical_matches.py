from __future__ import annotations

from pathlib import Path

import pytest

from tournament_sim.historical_matches import (
    HistoricalMatch,
    HistoricalSourceError,
    parse_daily_results_html,
    parse_match_csv,
    source_display_name,
)


def _match(*, side_a=("Alice",), side_b=("Bob",)) -> HistoricalMatch:
    return HistoricalMatch(
        tournament_id="T001",
        event="MS",
        round_code="Final",
        played_on="2026-01-01",
        side_a=side_a,
        side_b=side_b,
        winner_side="A",
        sets=((21, 10), (21, 11)),
        source_url="https://example.test/source",
        source_ref="row-1",
    )


def test_match_identity_preserves_name_evidence_and_ignores_partner_order():
    assert _match(side_a=("João",)).identity != _match(side_a=("Joao",)).identity
    assert _match(side_a=("P. V. Sindhu",)).identity != _match(side_a=("PV Sindhu",)).identity
    assert _match(side_a=("Alice", "Ada")).identity == _match(side_a=("Ada", "Alice")).identity


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (" Daniel  LEUNG [84072] ", "Daniel Leung"),
        ("WANG Zheng Xing [89163]", "Wang Zheng Xing"),
        ("M.R. ARJUN", "M.R. Arjun"),
        ("Divya R.BALASUBRAMANIAN", "Divya R.Balasubramanian"),
        ("Hari Bharathi BASKARAN.P", "Hari Bharathi Baskaran.P"),
        ("O'CONNOR YU-HSUN", "O'Connor Yu-Hsun"),
        ("An Se-young", "An Se-young"),
        ("Nguyễn Thùy Linh", "Nguyễn Thùy Linh"),
    ],
)
def test_source_display_name_removes_archive_formatting_only(raw: str, expected: str):
    assert source_display_name(raw) == expected


def test_match_csv_keeps_main_draw_quarterfinals_and_excludes_qualification(tmp_path: Path):
    source = tmp_path / "matches.csv"
    source.write_text(
        "date,discipline,tournament,tier,round,host_location,team1,team2,winner,score,team1_at_home,team2_at_home\n"
        "2026-01-01,MS,Demo Open,Super 300,Q Qual. QF,Test,Alice,Bob,1,21-10 21-11,False,False\n"
        "2026-01-02,MS,Demo Open,Super 300,QF,Test,Daniel  LEUNG [84072],WANG Zheng Xing [89163],2,18-21 17-21,False,False\n",
        encoding="utf-8",
    )
    matches, digest = parse_match_csv(
        source,
        tournament_names={"T001": "Demo Open"},
        source_url="https://example.test/repo",
    )
    assert len(digest) == 64
    assert len(matches) == 1
    assert matches[0].round_code == "QF"
    assert matches[0].winner_side == "B"
    assert matches[0].sets == ((18, 21), (17, 21))
    assert matches[0].side_a == ("Daniel Leung",)
    assert matches[0].side_b == ("Wang Zheng Xing",)


def test_daily_results_html_preserves_schedule_and_outcome_status(tmp_path: Path):
    source = tmp_path / "daily.html"
    source.write_text(
        """
        <div class="ultp-accordion-title">Tuesday, 14 July: Round of 32</div>
        <h3 class="wp-block-heading">Court 2</h3>
        <table><tbody><tr>
          <td>Match 1</td><td>9:50 AM</td><td>WD</td>
          <td>Alice / Ada (1)</td><td><strong>Bob / Bea</strong> [WO]</td><td>&ndash;</td>
        </tr><tr>
          <td>Match 2</td><td>10:40 AM</td><td>MS</td>
          <td><strong>Chen</strong></td><td>Dana [RET]</td><td>21-19, 15-10</td>
        </tr></tbody></table>
        """,
        encoding="utf-8",
    )
    matches, _ = parse_daily_results_html(
        source,
        tournament_id="T027",
        source_url="https://example.test/daily",
        year=2026,
    )
    assert len(matches) == 2
    assert matches[0].played_on == "2026-07-14"
    assert matches[0].court == "Court 2"
    assert matches[0].local_time == "9:50 AM"
    assert matches[0].side_b == ("Bob", "Bea")
    assert matches[0].walkover is True
    assert matches[0].reason == "walkover"
    assert matches[1].sets == ((21, 19), (15, 10))
    assert matches[1].reason == "retired"


def test_daily_results_html_does_not_guess_walkover_from_bare_dash(tmp_path: Path):
    source = tmp_path / "daily.html"
    source.write_text(
        '<div class="ultp-accordion-title">Tuesday, 14 July: Finals</div>'
        '<h3 class="wp-block-heading">Court 1</h3><table><tr>'
        "<td>Match 1</td><td>9:00 AM</td><td>MS</td><td><strong>Alice</strong></td>"
        "<td>Bob</td><td>&ndash;</td></tr></table>",
        encoding="utf-8",
    )
    with pytest.raises(HistoricalSourceError, match=r"no \[WO\] outcome"):
        parse_daily_results_html(
            source,
            tournament_id="T001",
            source_url="https://example.test/daily",
            year=2026,
        )


def test_match_csv_rejects_duplicate_match_identity(tmp_path: Path):
    source = tmp_path / "matches.csv"
    header = (
        "date,discipline,tournament,tier,round,host_location,team1,team2,winner,"
        "score,team1_at_home,team2_at_home\n"
    )
    row = "2026-01-02,MS,Demo Open,Super 300,Final,Test,Alice,Bob,1,21-10 21-11,False,False\n"
    source.write_text(header + row + row, encoding="utf-8")
    with pytest.raises(HistoricalSourceError, match="duplicate match"):
        parse_match_csv(
            source,
            tournament_names={"T001": "Demo Open"},
            source_url="https://example.test/repo",
        )
