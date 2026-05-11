"""Tests for the Draw -> SchedulingProblem adapter."""
from __future__ import annotations

from scheduler_core.domain.models import ScheduleConfig
from scheduler_core.domain.tournament import (
    Participant,
    ParticipantType,
    TournamentState,
)

from tournament.adapter import build_problem
from tournament.draw import BracketSlot, Draw
from tournament.formats import generate_round_robin, generate_single_elimination
from tournament.state import register_draw


def _ps(n: int) -> list[Participant]:
    return [Participant(id=f"P{i+1}", name=f"P{i+1}") for i in range(n)]


def test_build_problem_round_robin_has_all_matches():
    draw = generate_round_robin(_ps(4))
    state = TournamentState()
    register_draw(state, draw)
    config = ScheduleConfig(total_slots=10, court_count=2)
    problem = build_problem(
        state, list(draw.play_units.keys()), config=config
    )
    assert len(problem.matches) == 6
    assert {p.id for p in problem.players} == {"P1", "P2", "P3", "P4"}


def test_build_problem_only_includes_ready_play_units():
    """SE round 0: only round-0 PlayUnits should be passed to the engine."""
    draw = generate_single_elimination(_ps(8))
    state = TournamentState()
    register_draw(state, draw)
    config = ScheduleConfig(total_slots=10, court_count=2)
    ready = list(draw.rounds[0])
    problem = build_problem(state, ready, config=config)
    assert len(problem.matches) == 4
    assert {m.id for m in problem.matches} == set(ready)


def test_team_participant_expands_to_member_players():
    team = Participant(
        id="T1",
        name="Team 1",
        type=ParticipantType.TEAM,
        member_ids=["m1", "m2"],
    )
    other_team = Participant(
        id="T2",
        name="Team 2",
        type=ParticipantType.TEAM,
        member_ids=["m3", "m4"],
    )
    draw = generate_round_robin([team, other_team])
    state = TournamentState()
    register_draw(state, draw)

    config = ScheduleConfig(total_slots=10, court_count=2)
    problem = build_problem(
        state, list(draw.play_units.keys()), config=config
    )

    match = problem.matches[0]
    assert set(match.side_a) == {"m1", "m2"}
    assert set(match.side_b) == {"m3", "m4"}
    assert {p.id for p in problem.players} == {"m1", "m2", "m3", "m4"}


def test_empty_ready_list_raises():
    draw = generate_round_robin(_ps(4))
    state = TournamentState()
    register_draw(state, draw)
    config = ScheduleConfig(total_slots=10, court_count=2)
    import pytest
    with pytest.raises(ValueError):
        build_problem(state, [], config=config)
