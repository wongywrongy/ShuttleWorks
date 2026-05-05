"""End-to-end tests for the layered scheduler driver."""
from __future__ import annotations

from scheduler_core.domain.models import ScheduleConfig, SolverOptions, SolverStatus
from scheduler_core.domain.tournament import (
    Participant,
    TournamentState,
    WinnerSide,
)

from tournament.advancement import record_result
from tournament.formats import generate_round_robin, generate_single_elimination
from tournament.scheduler import TournamentDriver
from tournament.state import register_draw


def _ps(n: int) -> list[Participant]:
    return [Participant(id=f"P{i+1}", name=f"P{i+1}") for i in range(n)]


def _top_seed_wins(pu) -> WinnerSide:
    a = int(pu.side_a[0][1:])
    b = int(pu.side_b[0][1:])
    return WinnerSide.A if a < b else WinnerSide.B


def test_round_robin_schedules_in_one_pass():
    draw = generate_round_robin(_ps(4))
    state = TournamentState()
    register_draw(state, draw)
    config = ScheduleConfig(total_slots=20, court_count=2)
    driver = TournamentDriver(
        state=state,
        draw=draw,
        config=config,
        solver_options=SolverOptions(time_limit_seconds=5.0),
    )

    result = driver.schedule_next_round()
    assert result.scheduled
    # All 6 matches assigned in one solve.
    assert len(state.assignments) == 6
    # No player double-booked at the same slot.
    by_slot: dict[int, set[str]] = {}
    for pu_id, a in state.assignments.items():
        pu = state.play_units[pu_id]
        for s in range(a.slot_id, a.slot_id + a.duration_slots):
            slot_players = by_slot.setdefault(s, set())
            for p in (pu.side_a or []) + (pu.side_b or []):
                assert p not in slot_players, (
                    f"player {p} double-booked at slot {s}"
                )
                slot_players.add(p)


def test_single_elimination_layered_schedule_8_players():
    draw = generate_single_elimination(_ps(8))
    state = TournamentState()
    register_draw(state, draw)

    config = ScheduleConfig(total_slots=40, court_count=2)
    driver = TournamentDriver(
        state=state,
        draw=draw,
        config=config,
        solver_options=SolverOptions(time_limit_seconds=5.0),
        rest_between_rounds=1,
    )

    # Round 0: 4 matches.
    r0 = driver.schedule_next_round()
    assert r0.scheduled
    assert set(r0.play_unit_ids) == set(draw.rounds[0])
    r0_max_end = max(
        a.actual_end_slot for a in state.assignments.values()
    )

    # Record results so R1 becomes ready.
    for pu_id in draw.rounds[0]:
        pu = state.play_units[pu_id]
        record_result(
            state, draw, pu_id, _top_seed_wins(pu),
            finished_at_slot=state.assignments[pu_id].actual_end_slot,
        )

    # Round 1: 2 matches.
    r1 = driver.schedule_next_round()
    assert r1.scheduled
    assert set(r1.play_unit_ids) == set(draw.rounds[1])
    # All R1 starts must be >= r0_max_end + rest.
    for pu_id in draw.rounds[1]:
        a = state.assignments[pu_id]
        assert a.slot_id >= r0_max_end + driver.rest_between_rounds, (
            f"{pu_id} starts at {a.slot_id} but R0 ended at {r0_max_end}"
        )
    r1_max_end = max(
        state.assignments[pu_id].actual_end_slot
        for pu_id in draw.rounds[1]
    )

    for pu_id in draw.rounds[1]:
        pu = state.play_units[pu_id]
        record_result(
            state, draw, pu_id, _top_seed_wins(pu),
            finished_at_slot=state.assignments[pu_id].actual_end_slot,
        )

    # Round 2: final.
    r2 = driver.schedule_next_round()
    assert r2.scheduled
    final_pu_id = draw.rounds[2][0]
    final_a = state.assignments[final_pu_id]
    assert final_a.slot_id >= r1_max_end + driver.rest_between_rounds


def test_no_ready_play_units_returns_empty():
    draw = generate_single_elimination(_ps(4))
    state = TournamentState()
    register_draw(state, draw)
    config = ScheduleConfig(total_slots=20, court_count=2)
    driver = TournamentDriver(
        state=state, draw=draw, config=config,
        solver_options=SolverOptions(time_limit_seconds=2.0),
    )

    # Schedule R0 and R1 (only 4 players => 2 rounds total).
    r0 = driver.schedule_next_round()
    assert r0.scheduled

    for pu_id in draw.rounds[0]:
        pu = state.play_units[pu_id]
        record_result(
            state, draw, pu_id, _top_seed_wins(pu),
            finished_at_slot=state.assignments[pu_id].actual_end_slot,
        )

    r1 = driver.schedule_next_round()
    assert r1.scheduled

    for pu_id in draw.rounds[1]:
        pu = state.play_units[pu_id]
        record_result(
            state, draw, pu_id, _top_seed_wins(pu),
            finished_at_slot=state.assignments[pu_id].actual_end_slot,
        )

    # No more rounds.
    r2 = driver.schedule_next_round()
    assert r2.empty
