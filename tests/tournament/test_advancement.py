"""Tests for result recording and bracket advancement."""
from __future__ import annotations

from scheduler_core.domain.tournament import (
    Participant,
    TournamentState,
    WinnerSide,
)

from tournament.advancement import record_result
from tournament.draw import BYE
from tournament.formats import generate_single_elimination
from tournament.state import register_draw


def _ps(n: int) -> list[Participant]:
    return [Participant(id=f"P{i+1}", name=f"P{i+1}") for i in range(n)]


def test_record_result_advances_winner_to_next_round():
    draw = generate_single_elimination(_ps(8))
    state = TournamentState()
    register_draw(state, draw)

    # R0-0: P1 vs P8. P1 wins.
    resolved = record_result(
        state, draw, "M-R0-0", WinnerSide.A, finished_at_slot=2
    )
    # R1-0 has feeders M-R0-0 and M-R0-1; one slot is now P1.
    assert "M-R1-0" in resolved
    slot_a, slot_b = draw.slots["M-R1-0"]
    assert slot_a.participant_id == "P1"
    # M-R0-1 hasn't reported yet.
    assert slot_b.feeder_play_unit_id == "M-R0-1"

    pu = draw.play_units["M-R1-0"]
    assert pu.side_a == ["P1"]
    assert pu.side_b is None


def test_byes_walkover_at_register_time():
    """Top 3 seeds get byes when 5 players in an 8-bracket."""
    draw = generate_single_elimination(_ps(5))
    state = TournamentState()
    register_draw(state, draw)

    # Three R0 PlayUnits should already have walked over.
    walkovers = [
        pu_id for pu_id, r in state.results.items() if r.walkover
    ]
    assert len(walkovers) == 3
    # P1 (top seed) gets a bye -> already advanced into R1.
    # M-R0-0 is P1 vs (bye); seed-1 takes the bye, advancing to M-R1-0.
    pu_r0_0 = draw.play_units["M-R0-0"]
    # The walked-over PlayUnit has at most one real side.
    if pu_r0_0.side_a is None:
        assert pu_r0_0.side_b == ["P1"]
    else:
        assert pu_r0_0.side_a == ["P1"]


def test_chain_of_byes_cascades_winner_through_rounds():
    """3 participants in an 8-bracket: 5 byes. The cascade should
    advance P1, P2, P3 through any bye-only rounds without losing
    them to a 'NONE dependency kills the winner' bug."""
    draw = generate_single_elimination(_ps(3))
    state = TournamentState()
    register_draw(state, draw)

    # After auto_walkover_byes + cascade, P1, P2, P3 should each be
    # somewhere in the bracket — NOT eliminated.
    surviving_players: set[str] = set()
    for pu_id, pu in state.play_units.items():
        if pu_id in state.results:
            continue
        for side in (pu.side_a or [], pu.side_b or []):
            for token in side:
                if token.startswith("P"):
                    surviving_players.add(token)
    assert {"P1", "P2", "P3"} <= surviving_players, (
        f"lost players: {{'P1','P2','P3'}} - {surviving_players}"
    )


def test_double_bye_then_real_winner_does_not_kill_real_player():
    """A R1 PlayUnit with one NONE feeder (double bye) and one A
    feeder (real winner) must NOT be marked NONE — the real winner
    must advance further."""
    draw = generate_single_elimination(_ps(5))
    state = TournamentState()
    register_draw(state, draw)

    # In a 5-in-8 bracket, three R0 PUs walkover top seeds.
    # Find any R1+ PU that has a real side_a or side_b set; it
    # should not be marked NONE.
    nones = [
        pu_id for pu_id, r in state.results.items()
        if r.winner_side == WinnerSide.NONE
    ]
    for pu_id in nones:
        pu = state.play_units[pu_id]
        # A walked-over PU should have either both sides empty
        # (double bye) or be a structural dead end downstream.
        # It must NOT have a real player on either side.
        for side in (pu.side_a or [], pu.side_b or []):
            for token in side:
                assert not token.startswith("P"), (
                    f"{pu_id} marked NONE but still holds player {token}"
                )


def test_full_bracket_walks_to_one_winner():
    """8-player SE: top seed wins every round; final has exactly one winner."""
    draw = generate_single_elimination(_ps(8))
    state = TournamentState()
    register_draw(state, draw)

    # Rounds 0..2; final is M-R2-0.
    for round_index in range(draw.round_count):
        for pu_id in draw.rounds[round_index]:
            if pu_id in state.results:
                continue
            pu = draw.play_units[pu_id]
            if not pu.side_a or not pu.side_b:
                continue  # awaiting an upstream walkover
            # Top seed (smallest number) wins.
            a_seed = int(pu.side_a[0][1:])
            b_seed = int(pu.side_b[0][1:])
            winner = WinnerSide.A if a_seed < b_seed else WinnerSide.B
            record_result(state, draw, pu_id, winner, finished_at_slot=2)

    final_result = state.results["M-R2-0"]
    final_pu = draw.play_units["M-R2-0"]
    expected_winner = (
        final_pu.side_a[0]
        if final_result.winner_side == WinnerSide.A
        else final_pu.side_b[0]
    )
    assert expected_winner == "P1"
