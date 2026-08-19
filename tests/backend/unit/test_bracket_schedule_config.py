"""schedule_config_for_bracket — bracket consumes the shared config
assembly (rest / freeze / breaks / objective weights) with its
session-owned structural overrides on top."""
from adapters.badminton import schedule_config_for_bracket
from app.schemas import TournamentConfig


def _cfg(**over) -> TournamentConfig:
    base = dict(
        intervalMinutes=30,
        dayStart="09:00",
        dayEnd="18:00",
        breaks=[],
        courtCount=4,
        defaultRestMinutes=60,
        freezeHorizonSlots=3,
    )
    base.update(over)
    return TournamentConfig(**base)


def _build(cfg: TournamentConfig):
    return schedule_config_for_bracket(
        cfg,
        court_count=2,
        total_slots=128,
        interval_minutes=30,
        closed_court_windows=[(1, 0, 4)],
    )


def test_structural_overrides_win():
    sc = _build(_cfg())
    assert sc.total_slots == 128            # session constant, not day window
    assert sc.court_count == 2              # session override
    assert sc.interval_minutes == 30
    assert sc.closed_court_windows == [(1, 0, 4)]
    assert sc.closed_court_ids == []        # baked into the windows already


def test_shared_params_flow_through():
    sc = _build(_cfg(defaultRestMinutes=60, freezeHorizonSlots=3))
    assert sc.default_rest_slots == 2       # 60 min / 30 min slots
    assert sc.freeze_horizon_slots == 3


def test_breaks_map_to_slots():
    sc = _build(
        _cfg(breaks=[{"start": "12:00", "end": "13:00"}])
    )
    assert (6, 8) in sc.break_slots         # 12:00 is slot 6 from 09:00 @30min


def test_objective_weights_flow_through():
    sc = _build(
        _cfg(
            enableCompactSchedule=True,
            enableCourtUtilization=False,
            allowPlayerOverlap=True,
        )
    )
    assert sc.enable_compact_schedule is True
    assert sc.enable_court_utilization is False
    assert sc.allow_player_overlap is True
