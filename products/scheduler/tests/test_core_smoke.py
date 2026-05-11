"""Core engine smoke tests - test scheduler_core without FastAPI."""
import pytest

from scheduler_core import (
    CPSATScheduler,
    Match,
    Player,
    ScheduleConfig,
    ScheduleRequest,
    SolverOptions,
    SolverStatus,
)


def test_core_simple_schedule():
    """Test basic scheduling with core domain models."""
    config = ScheduleConfig(
        total_slots=10,
        court_count=2,
    )
    
    players = [
        Player(id="p1", name="Player 1"),
        Player(id="p2", name="Player 2"),
    ]
    
    matches = [
        Match(
            id="m1",
            event_code="MS-1",
            duration_slots=1,
            side_a=["p1"],
            side_b=["p2"],
        )
    ]
    
    request = ScheduleRequest(
        config=config,
        players=players,
        matches=matches,
        solver_options=SolverOptions(time_limit_seconds=5.0),
    )
    
    scheduler = CPSATScheduler(
        config=request.config,
        solver_options=request.solver_options,
    )
    
    scheduler.add_players(request.players)
    scheduler.add_matches(request.matches)
    scheduler.set_previous_assignments(request.previous_assignments)
    
    scheduler.build()
    result = scheduler.solve()
    
    assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]
    assert len(result.assignments) == 1
    assert result.assignments[0].match_id == "m1"
    assert 0 <= result.assignments[0].slot_id < 10
    assert 1 <= result.assignments[0].court_id <= 2


def test_core_player_conflict():
    """Test that player cannot be in two matches at same time."""
    config = ScheduleConfig(
        total_slots=10,
        court_count=4,
    )
    
    players = [
        Player(id="p1", name="Player 1"),
        Player(id="p2", name="Player 2"),
        Player(id="p3", name="Player 3"),
    ]
    
    matches = [
        Match(id="m1", event_code="MS-1", side_a=["p1"], side_b=["p2"]),
        Match(id="m2", event_code="MS-2", side_a=["p1"], side_b=["p3"]),
    ]
    
    request = ScheduleRequest(
        config=config,
        players=players,
        matches=matches,
    )
    
    scheduler = CPSATScheduler(config=request.config)
    scheduler.add_players(request.players)
    scheduler.add_matches(request.matches)
    scheduler.build()
    result = scheduler.solve()
    
    assert result.status in [SolverStatus.OPTIMAL, SolverStatus.FEASIBLE]
    assert len(result.assignments) == 2
    
    # Player 1's matches should be at different slots
    slots = {a.match_id: a.slot_id for a in result.assignments}
    assert slots["m1"] != slots["m2"]


def test_core_infeasible_schedule():
    """Test detection of infeasible schedule."""
    config = ScheduleConfig(
        total_slots=1,  # Only 1 slot
        court_count=1,  # Only 1 court
    )
    
    players = [
        Player(id="p1", name="Player 1"),
        Player(id="p2", name="Player 2"),
        Player(id="p3", name="Player 3"),
    ]
    
    matches = [
        Match(id="m1", event_code="MS-1", side_a=["p1"], side_b=["p2"]),
        Match(id="m2", event_code="MS-2", side_a=["p1"], side_b=["p3"]),  # p1 in both
    ]
    
    request = ScheduleRequest(
        config=config,
        players=players,
        matches=matches,
    )
    
    scheduler = CPSATScheduler(config=request.config)
    scheduler.add_players(request.players)
    scheduler.add_matches(request.matches)
    scheduler.build()
    result = scheduler.solve()
    
    assert result.status == SolverStatus.INFEASIBLE
    assert len(result.infeasible_reasons) > 0
