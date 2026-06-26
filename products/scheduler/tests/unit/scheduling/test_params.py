"""The shared scheduling-parameter builder used by Meet and Bracket."""
from scheduler_core.domain.models import ScheduleConfig

from services.scheduling.params import SchedulingParams, build_schedule_config


def test_build_minimal_bracket_shaped_config():
    cfg = build_schedule_config(
        SchedulingParams(court_count=4, total_slots=20, interval_minutes=15)
    )
    assert isinstance(cfg, ScheduleConfig)
    assert (cfg.court_count, cfg.total_slots, cfg.interval_minutes) == (4, 20, 15)
    assert cfg.current_slot == 0


def test_build_rich_meet_shaped_config_carries_breaks_and_closures():
    cfg = build_schedule_config(
        SchedulingParams(
            court_count=6,
            total_slots=40,
            interval_minutes=30,
            default_rest_slots=2,
            freeze_horizon_slots=3,
            break_slots=[(10, 12)],
            closed_court_windows=[(2, 0, 5)],
            closed_court_ids=[2],
        )
    )
    assert cfg.default_rest_slots == 2
    assert cfg.freeze_horizon_slots == 3
    assert cfg.break_slots == [(10, 12)]
    assert cfg.closed_court_windows == [(2, 0, 5)]
    assert cfg.closed_court_ids == [2]
