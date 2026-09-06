"""Unit tests for ``shared.court_occupancy`` (contract §4, §10 "Operational
truth" rows).

Two ``playing`` matches on one court must yield exactly one ``disputed``
court, zero ``occupied``, and one ``CourtDispute`` with two claims — never
two occupied courts (D3) and never a court that reads as free (D2).
"""
from __future__ import annotations

from shared.court_occupancy import (
    courts_free,
    derive_court_states,
    derive_disputes,
    disputed_court_count,
    occupied_court_count,
)


def _m(id, status, court_id, **extra):
    return {"id": id, "status": status, "court_id": court_id, **extra}


def test_two_playing_matches_on_one_court_are_one_dispute():
    matches = [
        _m("a", "playing", 1),
        _m("b", "playing", 1),
        _m("c", "playing", 2),
    ]
    states = derive_court_states(matches)
    assert states[1] == "disputed"
    assert states[2] == "occupied"
    assert occupied_court_count(states) == 1
    assert disputed_court_count(states) == 1

    disputes = derive_disputes(matches)
    assert len(disputes) == 1
    dispute = disputes[0]
    assert dispute.court_id == 1
    assert {c.match_key for c in dispute.claims} == {"a", "b"}


def test_a_called_match_does_not_occupy_or_dispute_a_court():
    matches = [_m("a", "called", 1), _m("b", "playing", 2)]
    states = derive_court_states(matches)
    assert 1 not in states  # called does not claim occupancy
    assert states[2] == "occupied"
    assert derive_disputes(matches) == []


def test_disputed_court_is_excluded_from_both_free_and_occupied_counts():
    matches = [_m("a", "playing", 1), _m("b", "playing", 1)]
    states = derive_court_states(matches)
    # 4 physical courts, one disputed, three unclaimed.
    assert courts_free(4, states) == 3
    assert occupied_court_count(states) == 0
    assert disputed_court_count(states) == 1


def test_a_court_nobody_claims_is_free():
    states = derive_court_states([_m("a", "scheduled", None)])
    assert states == {}
    assert courts_free(3, states) == 3


def test_finished_match_leaves_a_court_free_not_occupied():
    matches = [_m("a", "finished", 1)]
    states = derive_court_states(matches)
    assert 1 not in states
    assert courts_free(2, states) == 2
