"""Tests for single-elimination bracket generation."""
from __future__ import annotations

import pytest

from scheduler_core.domain.tournament import Participant

from tournament.draw import BYE
from tournament.formats import generate_single_elimination
from tournament.formats.single_elimination import _seed_order


def _seeds(n: int) -> list[Participant]:
    return [Participant(id=f"P{i+1}", name=f"P{i+1}") for i in range(n)]


def test_seed_order_size_8():
    # Standard seeded bracket: 1v8, 4v5, 2v7, 3v6 in round 1, with
    # 1 and 2 only meeting in the final.
    assert _seed_order(8) == [1, 8, 4, 5, 2, 7, 3, 6]


def test_seed_order_size_4():
    assert _seed_order(4) == [1, 4, 2, 3]


def test_seed_order_size_16():
    order = _seed_order(16)
    assert order == [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]


@pytest.mark.parametrize("n,expected_size,expected_rounds", [
    (2, 2, 1),
    (3, 4, 2),
    (4, 4, 2),
    (5, 8, 3),
    (8, 8, 3),
    (16, 16, 4),
    (32, 32, 5),
    (64, 64, 6),
])
def test_round_count(n, expected_size, expected_rounds):
    draw = generate_single_elimination(_seeds(n))
    assert draw.round_count == expected_rounds
    assert draw.event.parameters["bracket_size"] == expected_size


def test_round_one_pairings_eight_seeds():
    draw = generate_single_elimination(_seeds(8))
    r0 = draw.rounds[0]
    pairings = []
    for pu_id in r0:
        slot_a, slot_b = draw.slots[pu_id]
        pairings.append((slot_a.participant_id, slot_b.participant_id))
    assert pairings == [
        ("P1", "P8"),
        ("P4", "P5"),
        ("P2", "P7"),
        ("P3", "P6"),
    ]


def test_byes_appended_to_top_seeds():
    """5 participants → 8-bracket; top 3 seeds get byes."""
    draw = generate_single_elimination(_seeds(5))
    r0 = draw.rounds[0]
    bye_count = 0
    for pu_id in r0:
        pu = draw.play_units[pu_id]
        slot_a, slot_b = draw.slots[pu_id]
        if slot_a.is_bye or slot_b.is_bye:
            bye_count += 1
    assert bye_count == 3  # 8 - 5 = 3 byes


def test_dependencies_form_correct_dag():
    """Each non-R0 PlayUnit has exactly two dependencies, one per side."""
    draw = generate_single_elimination(_seeds(16))
    for round_index in range(1, draw.round_count):
        for pu_id in draw.rounds[round_index]:
            pu = draw.play_units[pu_id]
            assert len(pu.dependencies) == 2
            slot_a, slot_b = draw.slots[pu_id]
            assert slot_a.feeder_play_unit_id in pu.dependencies
            assert slot_b.feeder_play_unit_id in pu.dependencies


def test_minimum_two_participants():
    with pytest.raises(ValueError):
        generate_single_elimination([])
    with pytest.raises(ValueError):
        generate_single_elimination(_seeds(1))


def test_final_round_has_one_match():
    draw = generate_single_elimination(_seeds(16))
    assert len(draw.rounds[-1]) == 1
