"""The engine's ``schedule()`` is the single batch entry both modules use.

Task 3 adds ``candidate_pool_size`` so the Meet sync path can stop
constructing ``CPSATBackend`` itself and route through the same entry the
Bracket driver already calls.
"""
from scheduler_core.domain.models import (
    Match,
    Player,
    ScheduleConfig,
    ScheduleRequest,
    SolverStatus,
)
from scheduler_core.schedule import schedule


def _two_match_request() -> ScheduleRequest:
    cfg = ScheduleConfig(total_slots=4, court_count=2, interval_minutes=30)
    return ScheduleRequest(
        config=cfg,
        players=[Player(id=p, name=p) for p in ("a", "b", "c", "d")],
        matches=[
            Match(id="m1", event_code="E", side_a=["a"], side_b=["b"]),
            Match(id="m2", event_code="E", side_a=["c"], side_b=["d"]),
        ],
    )


def test_schedule_solves_without_pool():
    result = schedule(_two_match_request())
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert {a.match_id for a in result.assignments} == {"m1", "m2"}


def test_schedule_accepts_candidate_pool_size():
    result = schedule(_two_match_request(), candidate_pool_size=3)
    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert {a.match_id for a in result.assignments} == {"m1", "m2"}
