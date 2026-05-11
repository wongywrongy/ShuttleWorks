"""
CP-SAT Tournament Scheduling Algorithm.

DEPRECATED: This module is maintained for backward compatibility.
New code should use scheduler_core.schedule or scheduler_core.schedule_from_api.
"""
from app.schemas import ScheduleRequest, ScheduleResponse
from scheduler_core import CPSATScheduler, schedule_from_api


def solve_schedule(request: ScheduleRequest) -> ScheduleResponse:
    """
    Main entry point for scheduling.

    DEPRECATED: Use scheduler_core.schedule_from_api instead.
    Delegates to scheduler_core.
    """
    return schedule_from_api(request)
