"""Standings computation — the BWF tie-break chain.

Pure, DB-free ranking over one event's resulted play units (BWF General
Competition Regulations, adapted to the play-unit model):

1. more match WINS ranks higher;
2. ties refine by GAMES ratio ``games_won / (games_won + games_lost)``
   (a 0-game record scores ``0.0`` — below any positive ratio; ties
   among zeros fall through to the next criterion);
3. then by POINTS ratio, same zero-denominator guard;
4. a remaining tie of EXACTLY two refines by HEAD-TO-HEAD (the winner of
   their direct meetings ranks higher; no meeting or a split record
   falls through);
5. the final tie-break is ``participant_id`` ascending (determinism).

Counting rules:

- Only resulted units count. ``WinnerSide.NONE`` (double bye / dead
  branch) counts for nobody.
- A WALKOVER counts as a win/loss (``played`` increments for each real
  participant on the unit) but contributes ZERO games/points — even if a
  score blob is somehow present.
- Games/points come from ``Result.score`` in Sets mode:
  ``{'sets': [{'sideA': int, 'sideB': int}, ...]}`` — each set won
  (strictly higher score) is a game; points are the summed scores.
  A missing/None score contributes nothing.
- The BYE sentinel never gets a row; ``participant_ids`` should be the
  event's real participants.

Embedded in ``EventOut.standings`` for ``has_standings`` formats (round
robin, Swiss) and consumed by the Swiss pairing step, so it must stay
cheap: one pass over the results plus an ``n log n`` sort.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Mapping, Sequence, Tuple

from scheduler_core.domain.tournament import (
    PlayUnit,
    PlayUnitId,
    Result,
    WinnerSide,
)

from .draw import BYE

__all__ = ["StandingRow", "compute_standings"]


@dataclass
class StandingRow:
    """One participant's line in an event's standings table."""

    participant_id: str
    played: int = 0
    wins: int = 0
    losses: int = 0
    games_won: int = 0
    games_lost: int = 0
    points_won: int = 0
    points_lost: int = 0
    position: int = 0  # 1-based, assigned after the final sort


def compute_standings(
    play_units: Mapping[PlayUnitId, PlayUnit],
    results: Mapping[PlayUnitId, Result],
    participant_ids: Sequence[str],
) -> List[StandingRow]:
    """Rank ``participant_ids`` over the resulted units of one draw.

    ``results`` may span multiple events (callers pass the whole
    ``TournamentState.results``); anything not keyed in ``play_units``
    is ignored. Returns rows in final standings order with ``position``
    set 1..N.
    """
    rows: Dict[str, StandingRow] = {
        pid: StandingRow(participant_id=pid)
        for pid in participant_ids
        if pid != BYE
    }
    # ``h2h_wins[(winner, loser)]`` — decided direct meetings, for the
    # two-way head-to-head refinement.
    h2h_wins: Dict[Tuple[str, str], int] = {}

    for pu_id, result in results.items():
        pu = play_units.get(pu_id)
        if pu is None:
            continue  # another event's result
        if result.winner_side == WinnerSide.NONE:
            continue  # double bye / dead branch — counts for nobody
        side_a = pu.side_a[0] if pu.side_a else None
        side_b = pu.side_b[0] if pu.side_b else None
        if result.winner_side == WinnerSide.A:
            winner, loser = side_a, side_b
        else:
            winner, loser = side_b, side_a

        win_row = rows.get(winner) if winner is not None else None
        lose_row = rows.get(loser) if loser is not None else None
        if win_row is not None:
            win_row.played += 1
            win_row.wins += 1
        if lose_row is not None:
            lose_row.played += 1
            lose_row.losses += 1
        if win_row is not None and lose_row is not None:
            key = (win_row.participant_id, lose_row.participant_id)
            h2h_wins[key] = h2h_wins.get(key, 0) + 1

        # A walkover is a win with ZERO games/points — pinned; a stray
        # score blob on a walkover must not leak into the ratios.
        if result.walkover or not result.score:
            continue
        for set_score in result.score.get("sets") or []:
            if not isinstance(set_score, dict):
                continue
            pa = set_score.get("sideA")
            pb = set_score.get("sideB")
            if not isinstance(pa, int) or not isinstance(pb, int):
                continue
            a_row = rows.get(side_a) if side_a is not None else None
            b_row = rows.get(side_b) if side_b is not None else None
            if a_row is not None:
                a_row.points_won += pa
                a_row.points_lost += pb
                if pa > pb:
                    a_row.games_won += 1
                elif pb > pa:
                    a_row.games_lost += 1
            if b_row is not None:
                b_row.points_won += pb
                b_row.points_lost += pa
                if pb > pa:
                    b_row.games_won += 1
                elif pa > pb:
                    b_row.games_lost += 1

    ordered = _sort_rows(list(rows.values()), h2h_wins)
    for position, row in enumerate(ordered, start=1):
        row.position = position
    return ordered


def _ratio(won: int, lost: int) -> float:
    """Win ratio with the documented zero-denominator guard: no games
    (or points) at all scores ``0.0`` — it ties with any other zero
    record and ranks below any positive ratio."""
    total = won + lost
    return won / total if total else 0.0


def _chain_key(row: StandingRow) -> Tuple[int, float, float]:
    """The wins → games-ratio → points-ratio refinement key."""
    return (
        row.wins,
        _ratio(row.games_won, row.games_lost),
        _ratio(row.points_won, row.points_lost),
    )


def _sort_rows(
    rows: List[StandingRow], h2h_wins: Dict[Tuple[str, str], int]
) -> List[StandingRow]:
    """Group-wise refinement, realised as a lexicographic sort plus a
    head-to-head pass over the remaining EXACT two-way ties.

    Sorting by ``(-wins, -games_ratio, -points_ratio, id)`` is the
    wins-group → games-ratio → points-ratio refinement; groups still
    tied on all three criteria sit adjacent in id order, and a group of
    exactly two swaps when their direct record favours the second.
    """
    ordered = sorted(
        rows,
        key=lambda r: (
            -r.wins,
            -_ratio(r.games_won, r.games_lost),
            -_ratio(r.points_won, r.points_lost),
            r.participant_id,
        ),
    )
    final: List[StandingRow] = []
    i = 0
    while i < len(ordered):
        j = i + 1
        while j < len(ordered) and _chain_key(ordered[j]) == _chain_key(
            ordered[i]
        ):
            j += 1
        group = ordered[i:j]
        if len(group) == 2:
            first, second = group
            second_beats = h2h_wins.get(
                (second.participant_id, first.participant_id), 0
            )
            first_beats = h2h_wins.get(
                (first.participant_id, second.participant_id), 0
            )
            if second_beats > first_beats:
                group = [second, first]
        final.extend(group)
        i = j
    return final
