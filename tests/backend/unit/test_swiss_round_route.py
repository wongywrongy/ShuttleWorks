"""S6 — POST /bracket/events/{id}/rounds/next + pair_swiss_round.

Pins:
  1. pair_swiss_round: score groups pair top-down, rematches skipped and
     allowed only as a last resort, bye rotates to the lowest-standing
     never-byed (fallback: lowest overall). Pure + deterministic.
  2. Route gates: 404 unknown event; 409 non-progressive (se) / draft /
     current round incomplete / all K rounds generated.
  3. The append is WIPE-FREE: existing match ids, results, and versions
     are byte-identical before/after; the new round simply appends
     (no solver call, status unchanged).
  4. Round k pairing honors standings; the R1 bye holder doesn't get the
     R2 bye; no R1 pair rematches in R2.
  5. The new units are dependency-free → the existing schedule-next flow
     picks them up.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament

from bracket.formats.swiss import pair_swiss_round
from bracket.standings import StandingRow


# ---- 1. pair_swiss_round ------------------------------------------------------


def _rows(*pids: str) -> list[StandingRow]:
    return [StandingRow(participant_id=pid) for pid in pids]


def test_pair_even_field_pairs_top_down_within_score_groups():
    # a/b lead their score group, c/d trail: greedy top-down pairing
    # keeps each score group internal — (a,b) then (c,d).
    pairs, bye = pair_swiss_round(_rows("a", "b", "c", "d"), set(), set())
    assert bye is None
    assert pairs == [("a", "b"), ("c", "d")]


def test_pair_skips_rematches_when_alternatives_exist():
    priors = {frozenset(("a", "b")), frozenset(("c", "d"))}
    pairs, bye = pair_swiss_round(_rows("a", "b", "c", "d"), priors, set())
    assert bye is None
    assert pairs == [("a", "c"), ("b", "d")]


def test_pair_allows_rematch_only_as_last_resort():
    # a has already played everyone → the nearest opponent (b) repeats.
    priors = {
        frozenset(("a", "b")),
        frozenset(("a", "c")),
        frozenset(("a", "d")),
    }
    pairs, bye = pair_swiss_round(_rows("a", "b", "c", "d"), priors, set())
    assert pairs == [("a", "b"), ("c", "d")]


def test_bye_goes_to_lowest_standing_never_byed():
    pairs, bye = pair_swiss_round(_rows("a", "b", "c"), set(), {"c"})
    assert bye == "b"
    assert pairs == [("a", "c")]


def test_bye_falls_back_to_lowest_when_everyone_has_byed():
    pairs, bye = pair_swiss_round(
        _rows("a", "b", "c"), set(), {"a", "b", "c"}
    )
    assert bye == "c"
    assert pairs == [("a", "b")]


def test_pairing_is_deterministic():
    priors = {frozenset(("a", "c"))}
    first = pair_swiss_round(_rows("a", "b", "c", "d", "e"), priors, {"e"})
    second = pair_swiss_round(_rows("a", "b", "c", "d", "e"), priors, {"e"})
    assert first == second


# ---- Route fixture (pattern from test_format_registry.py) ---------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from bracket import brackets
    from workspaces import tournaments
    from core.exceptions import ConflictError
    from core.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Swiss Round Route Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    return base + ("/" + "/".join(suffix) if suffix else "")


def _players(n: int) -> list[dict]:
    return [{"id": f"p{i}", "name": f"Player {i}"} for i in range(1, n + 1)]


def _create_session(client, tid: str) -> None:
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


def _record(client, tid, snapshot, pu_id, side, score=None):
    """POST /bracket/results with the seen_version from a serialized
    snapshot (the SP-F3 optimistic-concurrency contract)."""
    versions = {p["id"]: p["version"] for p in snapshot["play_units"]}
    r = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": pu_id,
            "winner_side": side,
            "finished_at_slot": 1,
            "walkover": False,
            "score": score,
            "seen_version": versions[pu_id],
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _event(out, event_id="SW"):
    return next(e for e in out["events"] if e["id"] == event_id)


def _units(out, event_id="SW"):
    return {
        p["id"]: p for p in out["play_units"] if p["event_id"] == event_id
    }


def _results(out, event_id="SW"):
    return {
        r["play_unit_id"]: r
        for r in out["results"]
        if r["play_unit_id"].startswith(f"{event_id}-")
    }


def _sets(*pairs):
    return {"sets": [{"sideA": a, "sideB": b} for a, b in pairs]}


# ---- 2..5. End-to-end flow ------------------------------------------------------


def test_swiss_rounds_next_end_to_end(client, tid):
    _create_session(client, tid)

    # 5-player Swiss draw, K=3 (also the default for n=5).
    r = client.post(
        _bracket_url(tid, "events", "SW"),
        json={
            "discipline": "MS", "format": "swiss",
            "participants": _players(5),
            "config": {"swiss_rounds": 3},
        },
    )
    assert r.status_code == 200, r.text
    assert _event(r.json())["config"] == {"swiss_rounds": 3}

    # Gate: draft draws must be generated first.
    r = client.post(_bracket_url(tid, "events", "SW", "rounds", "next"))
    assert r.status_code == 409
    assert "generate the draw first" in r.text

    # Generate — R1 only (real tiny solve). Seed fold with bye to p5.
    r = client.post(
        _bracket_url(tid, "events", "SW", "generate"), json={"wipe": False}
    )
    assert r.status_code == 200, r.text
    out = r.json()
    ev = _event(out)
    assert ev["status"] == "generated"
    assert ev["config"] == {"swiss_rounds": 3}
    assert ev["rounds"] == [["SW-R0-0", "SW-R0-1", "SW-R0-2"]]
    assert ev["segments"] is None
    assert ev["standings"] is not None  # swiss is a has_standings format
    units = _units(out)
    assert (units["SW-R0-0"]["side_a"], units["SW-R0-0"]["side_b"]) == (
        ["p1"], ["p3"],
    )
    assert (units["SW-R0-1"]["side_a"], units["SW-R0-1"]["side_b"]) == (
        ["p2"], ["p4"],
    )
    assert (units["SW-R0-2"]["side_a"], units["SW-R0-2"]["side_b"]) == (
        ["p5"], None,
    )
    # The R1 bye is already walked over at registration.
    assert _results(out)["SW-R0-2"]["walkover"] is True

    # Gate: next round refuses while the current round is incomplete.
    r = client.post(_bracket_url(tid, "events", "SW", "rounds", "next"))
    assert r.status_code == 409
    assert "current round incomplete" in r.text

    # Record R1: p1 beats p3 2-0 (games ratio 1.0), p4 beats p2 2-1.
    out = _record(
        client, tid, out, "SW-R0-0", "A", _sets((21, 10), (21, 12)),
    )
    out = _record(
        client, tid, out, "SW-R0-1", "B",
        _sets((21, 15), (18, 21), (19, 21)),
    )

    # Standings after R1 (BWF chain): p1 (1w, 1.0) > p4 (1w, .67) >
    # p5 (1w bye, 0.0) > p2 (0w, .33) > p3 (0w, 0.0).
    assert [
        row["participant_id"] for row in _event(out)["standings"]
    ] == ["p1", "p4", "p5", "p2", "p3"]

    # Snapshot the full pre-append wire state of the existing units.
    before = client.get(_bracket_url(tid)).json()
    before_units = _units(before)
    before_results = _results(before)

    # ── Round 2 ────────────────────────────────────────────────────────
    r = client.post(_bracket_url(tid, "events", "SW", "rounds", "next"))
    assert r.status_code == 200, r.text
    out = r.json()
    ev = _event(out)
    units = _units(out)

    # Appended, never wiped: every pre-existing unit is byte-identical
    # (ids, slots, sides, versions) and every prior result survives.
    for pu_id, pu in before_units.items():
        assert units[pu_id] == pu, pu_id
    after_results = _results(out)
    for pu_id, res in before_results.items():
        assert after_results[pu_id] == res, pu_id

    # New round appended on the rounds axis; status untouched.
    assert ev["rounds"] == [
        ["SW-R0-0", "SW-R0-1", "SW-R0-2"],
        ["SW-R1-0", "SW-R1-1", "SW-R1-2"],
    ]
    assert ev["status"] == "started"

    # Pairing follows standings; no R1 rematch; the bye rotates to the
    # lowest-standing player who has not had one (p3 — NOT p5 again).
    assert (units["SW-R1-0"]["side_a"], units["SW-R1-0"]["side_b"]) == (
        ["p1"], ["p4"],
    )
    assert (units["SW-R1-1"]["side_a"], units["SW-R1-1"]["side_b"]) == (
        ["p5"], ["p2"],
    )
    assert (units["SW-R1-2"]["side_a"], units["SW-R1-2"]["side_b"]) == (
        ["p3"], None,
    )
    r1_pairs = {frozenset(("p1", "p3")), frozenset(("p2", "p4"))}
    r2_pairs = {
        frozenset((units[f"SW-R1-{m}"]["side_a"][0],
                    units[f"SW-R1-{m}"]["side_b"][0]))
        for m in (0, 1)
    }
    assert not (r1_pairs & r2_pairs)
    assert after_results["SW-R1-2"]["walkover"] is True
    for m in (0, 1, 2):
        pu = units[f"SW-R1-{m}"]
        assert pu["round_index"] == 1
        assert pu["dependencies"] == []
        assert pu["segment"] is None
        assert pu["version"] == 1

    # The new units are dependency-free → the existing schedule-next
    # flow picks up exactly the two playable R2 matches. (_SEED's only
    # match is resulted first so it can't join the ready wave.)
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": "_SEED-R0-0", "winner_side": "A",
              "finished_at_slot": 1},
    )
    r = client.post(_bracket_url(tid, "schedule-next"))
    assert r.status_code == 200, r.text
    assert set(r.json()["play_unit_ids"]) == {"SW-R1-0", "SW-R1-1"}

    # ── Round 3 ────────────────────────────────────────────────────────
    out = client.get(_bracket_url(tid)).json()
    out = _record(client, tid, out, "SW-R1-0", "A")   # p1 beats p4
    out = _record(client, tid, out, "SW-R1-1", "A")   # p5 beats p2

    r = client.post(_bracket_url(tid, "events", "SW", "rounds", "next"))
    assert r.status_code == 200, r.text
    out = r.json()
    units = _units(out)
    # Standings: p1 (2w, 1.0) > p5 (2w, 0.0) > p4 (1w, .67) > p3 (1w
    # bye, 0.0) > p2 (0w). Bye rotates on: p2 has never had one.
    assert (units["SW-R2-0"]["side_a"], units["SW-R2-0"]["side_b"]) == (
        ["p1"], ["p5"],
    )
    assert (units["SW-R2-1"]["side_a"], units["SW-R2-1"]["side_b"]) == (
        ["p4"], ["p3"],
    )
    assert (units["SW-R2-2"]["side_a"], units["SW-R2-2"]["side_b"]) == (
        ["p2"], None,
    )

    # ── Exhaustion ─────────────────────────────────────────────────────
    out = _record(client, tid, out, "SW-R2-0", "A")
    out = _record(client, tid, out, "SW-R2-1", "A")
    r = client.post(_bracket_url(tid, "events", "SW", "rounds", "next"))
    assert r.status_code == 409
    assert "all 3 rounds generated" in r.text


def test_rounds_next_rejects_non_progressive_and_unknown(client, tid):
    _create_session(client, tid)

    r = client.post(_bracket_url(tid, "events", "_SEED", "rounds", "next"))
    assert r.status_code == 409
    assert "not progressive" in r.text

    r = client.post(_bracket_url(tid, "events", "NOPE", "rounds", "next"))
    assert r.status_code == 404
