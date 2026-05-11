"""Tests for BWF-conformant single-elimination bracket generation."""
from __future__ import annotations

from typing import Dict, List

import pytest

from scheduler_core.domain.tournament import Participant

from tournament.draw import BYE
from tournament.formats import generate_single_elimination
from tournament.formats.single_elimination import (
    _bwf_positions,
    _seed_to_position_map,
)


def _seeds(n: int) -> list[Participant]:
    return [Participant(id=f"P{i+1}", name=f"P{i+1}") for i in range(n)]


# ---- _bwf_positions ---------------------------------------------------------


@pytest.mark.parametrize("size", [2, 4, 8, 16, 32, 64, 128, 256])
def test_bwf_positions_is_full_permutation(size):
    """Every seed 1..size appears exactly once."""
    positions = _bwf_positions(size)
    assert len(positions) == size
    assert sorted(positions) == list(range(1, size + 1))


def test_bwf_positions_endpoint_seeds():
    """Seed 1 at top, seed 2 at bottom — they meet only in the final."""
    for size in (2, 4, 8, 16, 32, 64):
        positions = _bwf_positions(size)
        assert positions[0] == 1
        assert positions[size - 1] == 2


def test_bwf_positions_seeds_3_and_4_opposite_quarters():
    """Seeds 3 and 4 land in opposite quarters of opposite halves."""
    for size in (8, 16, 32, 64, 128):
        seed_to_pos = _seed_to_position_map(size)
        pos3 = seed_to_pos[2]
        pos4 = seed_to_pos[3]
        # Different halves
        assert (pos3 < size // 2) != (pos4 < size // 2)
        # Seed 3 not in seed 1's quarter; seed 4 not in seed 2's quarter
        quarter = size // 4
        seed1_quarter = seed_to_pos[0] // quarter
        seed2_quarter = seed_to_pos[1] // quarter
        assert pos3 // quarter != seed1_quarter
        assert pos4 // quarter != seed2_quarter


def test_seeds_5_to_8_in_different_eighths():
    """Seeds 5-8 each land in a different eighth."""
    for size in (16, 32, 64, 128):
        seed_to_pos = _seed_to_position_map(size)
        eighth = size // 8
        eighths = {seed_to_pos[s] // eighth for s in range(4, 8)}
        assert len(eighths) == 4


def test_top_four_seeds_only_meet_in_semifinal_or_later():
    """Seeds 1-4 are all in different quarters, so the earliest meeting
    between any two of them is the semifinal."""
    for size in (8, 16, 32, 64, 128):
        seed_to_pos = _seed_to_position_map(size)
        quarter = size // 4
        quarters = {seed_to_pos[s] // quarter for s in range(0, 4)}
        assert len(quarters) == 4


def test_top_eight_seeds_only_meet_in_quarterfinal_or_later():
    """Seeds 1-8 all in different eighths -> earliest meeting is QF."""
    for size in (16, 32, 64, 128):
        seed_to_pos = _seed_to_position_map(size)
        eighth = size // 8
        eighths = {seed_to_pos[s] // eighth for s in range(0, 8)}
        assert len(eighths) == 8


def test_bwf_positions_deterministic():
    """Same input -> same output across calls."""
    for size in (16, 32, 64):
        a = _bwf_positions(size)
        b = _bwf_positions(size)
        assert a == b


def test_bwf_positions_rejects_non_power_of_two():
    for bad in (0, 1, 3, 5, 7, 9, 30):
        with pytest.raises(ValueError):
            _bwf_positions(bad)


# ---- generate_single_elimination ------------------------------------------


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


def test_final_round_has_one_match():
    draw = generate_single_elimination(_seeds(16))
    assert len(draw.rounds[-1]) == 1


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


def test_seeds_1_and_2_meet_only_in_final():
    """Across many bracket sizes: seeds 1 and 2 are in different halves,
    so the earliest match where they could meet is the final."""
    for n in (8, 16, 32, 64):
        draw = generate_single_elimination(_seeds(n))
        seed_1_pos = _find_first_round_position(draw, "P1")
        seed_2_pos = _find_first_round_position(draw, "P2")
        bracket_size = draw.event.parameters["bracket_size"]
        assert seed_1_pos < bracket_size // 2  # upper half
        assert seed_2_pos >= bracket_size // 2  # lower half


# ---- Bye placement ---------------------------------------------------------


def test_top_seeds_get_byes_when_field_is_under_bracket_size():
    """5 participants in an 8-bracket -> seeds 1,2,3 each get a R1 bye."""
    draw = generate_single_elimination(_seeds(5))
    byes_for = _seeds_with_r1_byes(draw)
    assert byes_for == {"P1", "P2", "P3"}


@pytest.mark.parametrize("n,bracket,expected_byes_for", [
    (3, 4, {"P1"}),
    (5, 8, {"P1", "P2", "P3"}),
    (12, 16, {"P1", "P2", "P3", "P4"}),
    (28, 32, {"P1", "P2", "P3", "P4"}),
])
def test_bye_distribution(n, bracket, expected_byes_for):
    draw = generate_single_elimination(_seeds(n))
    assert draw.event.parameters["bracket_size"] == bracket
    assert _seeds_with_r1_byes(draw) == expected_byes_for


def test_full_field_has_no_byes():
    for n in (4, 8, 16, 32):
        draw = generate_single_elimination(_seeds(n))
        assert _seeds_with_r1_byes(draw) == set()


# ---- seeded_count ----------------------------------------------------------


def test_seeded_count_zero_treats_all_as_unseeded():
    """seeded_count=0 still places everyone, just without seed-tier
    placement guarantees."""
    draw = generate_single_elimination(_seeds(8), seeded_count=0)
    assert draw.event.parameters["seeded_count"] == 0
    # Still produces a valid bracket of size 8 with 4 R1 matches.
    assert len(draw.rounds[0]) == 4


def test_seeded_count_partial():
    """4 of 8 participants seeded; placement still puts seed 1 vs seed 2 in F."""
    draw = generate_single_elimination(_seeds(8), seeded_count=4)
    assert draw.event.parameters["seeded_count"] == 4
    seed_1_pos = _find_first_round_position(draw, "P1")
    seed_2_pos = _find_first_round_position(draw, "P2")
    assert seed_1_pos < 4
    assert seed_2_pos >= 4


def test_seeded_count_out_of_range_raises():
    with pytest.raises(ValueError):
        generate_single_elimination(_seeds(4), seeded_count=-1)
    with pytest.raises(ValueError):
        generate_single_elimination(_seeds(4), seeded_count=5)


# ---- randomize -------------------------------------------------------------


def test_randomize_not_yet_supported():
    with pytest.raises(NotImplementedError):
        generate_single_elimination(_seeds(4), randomize=True)


# ---- Helpers ---------------------------------------------------------------


def _find_first_round_position(draw, participant_id: str) -> int:
    """Return the bracket position (0-indexed) of a participant in R1."""
    for match_index, pu_id in enumerate(draw.rounds[0]):
        pu = draw.play_units[pu_id]
        if pu.side_a and participant_id in pu.side_a:
            return match_index * 2
        if pu.side_b and participant_id in pu.side_b:
            return match_index * 2 + 1
    raise AssertionError(f"{participant_id} not found in R1")


def _seeds_with_r1_byes(draw) -> set:
    """Participants whose R1 opponent is a bye."""
    out = set()
    for pu_id in draw.rounds[0]:
        pu = draw.play_units[pu_id]
        a_empty = not pu.side_a
        b_empty = not pu.side_b
        if a_empty and not b_empty:
            out.update(pu.side_b)
        elif b_empty and not a_empty:
            out.update(pu.side_a)
    return out
