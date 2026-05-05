"""Tests for round-robin generation."""
from __future__ import annotations

import pytest

from scheduler_core.domain.tournament import Participant

from tournament.formats import generate_round_robin


def _ps(n: int) -> list[Participant]:
    return [Participant(id=f"P{i+1}", name=f"P{i+1}") for i in range(n)]


@pytest.mark.parametrize("n,expected_matches", [
    (2, 1),
    (3, 3),
    (4, 6),
    (5, 10),
    (6, 15),
    (8, 28),
])
def test_match_count(n, expected_matches):
    draw = generate_round_robin(_ps(n))
    assert len(draw.play_units) == expected_matches


def test_every_pair_plays_once():
    draw = generate_round_robin(_ps(6))
    pairs = set()
    for pu in draw.play_units.values():
        a = pu.side_a[0]
        b = pu.side_b[0]
        pairs.add(frozenset((a, b)))
    assert len(pairs) == 15
    # Every unordered pair appears exactly once.
    expected = {
        frozenset((f"P{i+1}", f"P{j+1}"))
        for i in range(6)
        for j in range(i + 1, 6)
    }
    assert pairs == expected


def test_round_count_even():
    draw = generate_round_robin(_ps(6))
    # Even N -> N-1 rounds.
    assert draw.round_count == 5


def test_round_count_odd():
    draw = generate_round_robin(_ps(5))
    # Odd N -> N rounds (one bye each).
    assert draw.round_count == 5


def test_each_participant_plays_each_round_when_even():
    draw = generate_round_robin(_ps(6))
    for round_play_units in draw.rounds:
        playing = set()
        for pu_id in round_play_units:
            pu = draw.play_units[pu_id]
            playing.add(pu.side_a[0])
            playing.add(pu.side_b[0])
        assert len(playing) == 6


def test_double_round_robin():
    draw = generate_round_robin(_ps(4), rounds=2)
    # 4 players, 2 cycles -> 2 * 6 = 12 matches.
    assert len(draw.play_units) == 12


def test_minimum_two_participants():
    with pytest.raises(ValueError):
        generate_round_robin(_ps(1))


def test_no_dependencies_in_round_robin():
    draw = generate_round_robin(_ps(6))
    for pu in draw.play_units.values():
        assert pu.dependencies == []
