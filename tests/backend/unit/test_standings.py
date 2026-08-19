"""S5 — standings: the BWF tie-break chain + EventOut embedding.

Pins:
  1. More wins ranks higher; played/wins/losses/games/points accumulate
     from Sets-mode scores.
  2. A walkover is a win/loss with ZERO games/points — even when a score
     blob is present; a walkover over an empty side counts only for the
     winner. WinnerSide.NONE counts for nobody; BYE is never a row.
  3. Three-way ties refine by games ratio, then points ratio.
  4. An exact two-way tie refines by head-to-head; no meeting falls
     through to participant_id.
  5. Zero denominators never crash and rank below any positive ratio.
  6. Determinism: same inputs (any participant_ids order) → same order.
  7. Serialization: an rr event's EventOut carries standings (surviving
     hydration); an se event's stays None.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament

from scheduler_core.domain.tournament import PlayUnit, Result, WinnerSide

from services.bracket.standings import compute_standings


def _pu(pu_id: str, a: str | None, b: str | None) -> PlayUnit:
    return PlayUnit(
        id=pu_id,
        event_id="E",
        side_a=[a] if a else None,
        side_b=[b] if b else None,
    )


def _res(
    winner: WinnerSide,
    score: dict | None = None,
    walkover: bool = False,
) -> Result:
    return Result(winner_side=winner, score=score, walkover=walkover)


def _sets(*pairs: tuple[int, int]) -> dict:
    return {"sets": [{"sideA": a, "sideB": b} for a, b in pairs]}


def _order(rows) -> list[str]:
    return [r.participant_id for r in rows]


# ---- 1. Wins ordering + accumulation ----------------------------------------


def test_wins_ordering_and_accumulation():
    play_units = {
        "M0": _pu("M0", "p1", "p2"),
        "M1": _pu("M1", "p1", "p3"),
        "M2": _pu("M2", "p2", "p3"),
    }
    results = {
        "M0": _res(WinnerSide.A, _sets((21, 10), (21, 12))),
        "M1": _res(WinnerSide.A, _sets((21, 5), (21, 7))),
        "M2": _res(WinnerSide.A, _sets((21, 15), (19, 21), (21, 18))),
    }
    rows = compute_standings(play_units, results, ["p1", "p2", "p3"])
    assert _order(rows) == ["p1", "p2", "p3"]
    assert [r.position for r in rows] == [1, 2, 3]

    p1, p2, p3 = rows
    assert (p1.played, p1.wins, p1.losses) == (2, 2, 0)
    assert (p1.games_won, p1.games_lost) == (4, 0)
    assert (p1.points_won, p1.points_lost) == (84, 34)
    assert (p2.played, p2.wins, p2.losses) == (2, 1, 1)
    assert (p2.games_won, p2.games_lost) == (2, 3)
    assert (p2.points_won, p2.points_lost) == (83, 96)
    assert (p3.played, p3.wins, p3.losses) == (2, 0, 2)
    assert (p3.games_won, p3.games_lost) == (1, 4)
    assert (p3.points_won, p3.points_lost) == (66, 103)


# ---- 2. Walkovers, NONE, BYE -------------------------------------------------


def test_walkover_is_a_win_with_zero_games_and_points():
    play_units = {
        # Walkover between two real participants, with a stray score
        # blob that must NOT leak into games/points (the pin).
        "W0": _pu("W0", "p1", "p2"),
        # Walkover over an empty side (a bye) — only the winner counts.
        "W1": _pu("W1", "p3", None),
    }
    results = {
        "W0": _res(WinnerSide.A, _sets((21, 0), (21, 0)), walkover=True),
        "W1": _res(WinnerSide.A, walkover=True),
    }
    rows = compute_standings(play_units, results, ["p1", "p2", "p3"])
    by_id = {r.participant_id: r for r in rows}

    assert (by_id["p1"].played, by_id["p1"].wins, by_id["p1"].losses) == (1, 1, 0)
    assert (by_id["p1"].games_won, by_id["p1"].games_lost) == (0, 0)
    assert (by_id["p1"].points_won, by_id["p1"].points_lost) == (0, 0)
    assert (by_id["p2"].played, by_id["p2"].wins, by_id["p2"].losses) == (1, 0, 1)
    assert (by_id["p2"].games_won, by_id["p2"].games_lost) == (0, 0)
    assert (by_id["p3"].played, by_id["p3"].wins, by_id["p3"].losses) == (1, 1, 0)
    # p1/p3 tie on everything and never met → id order (h2h falls through).
    assert _order(rows) == ["p1", "p3", "p2"]


def test_winner_side_none_counts_for_nobody_and_bye_gets_no_row():
    play_units = {"D0": _pu("D0", None, None)}
    results = {"D0": _res(WinnerSide.NONE, walkover=True)}
    rows = compute_standings(
        play_units, results, ["p1", "p2", "__BYE__"]
    )
    assert _order(rows) == ["p1", "p2"]  # BYE sentinel never a row
    for r in rows:
        assert (r.played, r.wins, r.losses) == (0, 0, 0)


# ---- 3. Three-way ties: games ratio, then points ratio -----------------------


def test_three_way_tie_resolved_by_games_ratio():
    # A 1-win cycle: p1 > p2 > p3 > p1, distinct games ratios.
    play_units = {
        "M0": _pu("M0", "p1", "p2"),
        "M1": _pu("M1", "p2", "p3"),
        "M2": _pu("M2", "p3", "p1"),
    }
    results = {
        "M0": _res(WinnerSide.A, _sets((21, 10), (21, 10))),          # p1: 2-0
        "M1": _res(WinnerSide.A, _sets((21, 15), (15, 21), (21, 15))),  # p2: 2-1
        "M2": _res(WinnerSide.A, _sets((21, 15), (15, 21), (21, 15))),  # p3: 2-1
    }
    rows = compute_standings(play_units, results, ["p1", "p2", "p3"])
    # Games: p1 3-2 (.60), p3 3-3 (.50), p2 2-3 (.40).
    assert _order(rows) == ["p1", "p3", "p2"]


def test_three_way_tie_equal_games_resolved_by_points_ratio():
    play_units = {
        "M0": _pu("M0", "p1", "p2"),
        "M1": _pu("M1", "p2", "p3"),
        "M2": _pu("M2", "p3", "p1"),
    }
    results = {
        "M0": _res(WinnerSide.A, _sets((21, 19), (19, 21), (21, 19))),
        "M1": _res(WinnerSide.A, _sets((21, 10), (10, 21), (21, 10))),
        "M2": _res(WinnerSide.A, _sets((21, 15), (15, 21), (21, 15))),
    }
    rows = compute_standings(play_units, results, ["p1", "p2", "p3"])
    by_id = {r.participant_id: r for r in rows}
    # Every player is 1 win + games 3-3 — the games ratio can't split them.
    for r in rows:
        assert r.wins == 1
        assert (r.games_won, r.games_lost) == (3, 3)
    # Points: p2 111-102 (.521) > p1 112-116 (.491) > p3 98-103 (.487).
    assert (by_id["p2"].points_won, by_id["p2"].points_lost) == (111, 102)
    assert _order(rows) == ["p2", "p1", "p3"]


# ---- 4. Two-way tie: head-to-head --------------------------------------------


def test_two_way_tie_resolved_by_head_to_head():
    # No scores at all → every ratio is the guarded 0.0; the 2-groups
    # fall through to their direct meetings.
    play_units = {
        "M0": _pu("M0", "p2", "p1"),
        "M1": _pu("M1", "p1", "p3"),
        "M2": _pu("M2", "p1", "p4"),
        "M3": _pu("M3", "p2", "p3"),
        "M4": _pu("M4", "p4", "p2"),
        "M5": _pu("M5", "p3", "p4"),
    }
    results = {pu_id: _res(WinnerSide.A) for pu_id in play_units}
    rows = compute_standings(play_units, results, ["p1", "p2", "p3", "p4"])
    # p1/p2 both 2 wins — p2 beat p1 directly, so p2 outranks p1 despite
    # the id order; p3/p4 both 1 win — p3 beat p4.
    assert _order(rows) == ["p2", "p1", "p3", "p4"]
    assert [r.position for r in rows] == [1, 2, 3, 4]


# ---- 5. Zero-denominator guards ----------------------------------------------


def test_zero_denominator_ranks_below_any_positive_ratio():
    play_units = {
        "W0": _pu("W0", "pa", "pz1"),  # pa wins by walkover: no games
        "M0": _pu("M0", "pb", "pz2"),  # pb wins 2-0: games ratio 1.0
    }
    results = {
        "W0": _res(WinnerSide.A, walkover=True),
        "M0": _res(WinnerSide.A, _sets((21, 10), (21, 12))),
    }
    rows = compute_standings(
        play_units, results, ["pa", "pb", "pz1", "pz2"]
    )
    # pb (1 win, ratio 1.0) above pa (1 win, ratio 0.0) despite pa < pb;
    # pz2 (0 wins but positive points ratio 22/64) above pz1 (all zero).
    assert _order(rows) == ["pb", "pa", "pz2", "pz1"]


# ---- 6. Determinism -----------------------------------------------------------


def test_determinism_same_input_same_order():
    play_units = {
        "M0": _pu("M0", "p2", "p1"),
        "M1": _pu("M1", "p1", "p3"),
        "M2": _pu("M2", "p1", "p4"),
        "M3": _pu("M3", "p2", "p3"),
        "M4": _pu("M4", "p4", "p2"),
        "M5": _pu("M5", "p3", "p4"),
    }
    results = {pu_id: _res(WinnerSide.A) for pu_id in play_units}
    ids = ["p1", "p2", "p3", "p4"]
    first = compute_standings(play_units, results, ids)
    second = compute_standings(play_units, results, ids)
    reversed_input = compute_standings(play_units, results, list(reversed(ids)))
    expected = [(r.participant_id, r.position) for r in first]
    assert [(r.participant_id, r.position) for r in second] == expected
    assert [(r.participant_id, r.position) for r in reversed_input] == expected


def test_three_way_dead_tie_orders_by_id():
    # h2h applies to EXACT 2-way ties only; a 3-way dead tie is id order.
    play_units = {
        "M0": _pu("M0", "p1", "p2"),
        "M1": _pu("M1", "p2", "p3"),
        "M2": _pu("M2", "p3", "p1"),
    }
    results = {pu_id: _res(WinnerSide.A) for pu_id in play_units}
    rows = compute_standings(play_units, results, ["p3", "p1", "p2"])
    assert _order(rows) == ["p1", "p2", "p3"]


# ---- 7. Serialization: rr exposes standings, se doesn't -----------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import brackets, tournaments
    from app.exceptions import ConflictError
    from app.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Standings Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    return base + ("/" + "/".join(suffix) if suffix else "")


def _players(n: int) -> list[dict]:
    return [{"id": f"p{i}", "name": f"Player {i}"} for i in range(1, n + 1)]


def test_rr_event_exposes_standings_se_event_does_not(client, tid):
    r = client.post(
        _bracket_url(tid),
        json={
            "courts": 2, "total_slots": 64, "rest_between_rounds": 1,
            "interval_minutes": 30, "time_limit_seconds": 2.0,
            "events": [{
                "id": "_SEED", "discipline": "Seed", "format": "se",
                "participants": _players(2), "duration_slots": 1,
            }],
        },
    )
    assert r.status_code == 200, r.text

    r = client.post(
        _bracket_url(tid, "events", "RR"),
        json={"discipline": "WS", "format": "rr", "participants": _players(3)},
    )
    assert r.status_code == 200, r.text
    out = r.json()

    se_ev = next(e for e in out["events"] if e["id"] == "_SEED")
    assert se_ev["standings"] is None

    rr_ev = next(e for e in out["events"] if e["id"] == "RR")
    assert rr_ev["standings"] is not None
    assert [row["participant_id"] for row in rr_ev["standings"]] == [
        "p1", "p2", "p3",
    ]
    assert [row["position"] for row in rr_ev["standings"]] == [1, 2, 3]
    assert all(row["played"] == 0 for row in rr_ev["standings"])

    # Generate (real tiny solve), record one scored result, and check the
    # standings both in the mutation response and after re-hydration.
    r = client.post(
        _bracket_url(tid, "events", "RR", "generate"), json={"wipe": False}
    )
    assert r.status_code == 200, r.text
    rr_units = [
        p for p in r.json()["play_units"] if p["event_id"] == "RR"
    ]
    target = rr_units[0]
    winner = target["side_a"][0]
    r = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": target["id"],
            "winner_side": "A",
            "finished_at_slot": 1,
            "score": {"sets": [
                {"sideA": 21, "sideB": 10}, {"sideA": 21, "sideB": 12},
            ]},
        },
    )
    assert r.status_code == 200, r.text

    def check(out):
        ev = next(e for e in out["events"] if e["id"] == "RR")
        top = ev["standings"][0]
        assert top["participant_id"] == winner
        assert (top["played"], top["wins"], top["losses"]) == (1, 1, 0)
        assert (top["games_won"], top["games_lost"]) == (2, 0)
        assert (top["points_won"], top["points_lost"]) == (42, 22)
        assert top["position"] == 1

    check(r.json())
    r = client.get(_bracket_url(tid))
    assert r.status_code == 200, r.text
    check(r.json())
