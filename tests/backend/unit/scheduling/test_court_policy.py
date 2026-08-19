"""court_policy: the config field, and the promise that `pinned` changes nothing."""
from scheduler_core.domain.models import (
    Match,
    Player,
    ScheduleConfig,
    ScheduleRequest,
    SolverStatus,
)
from scheduler_core.schedule import schedule

from shared.scheduling.params import SchedulingParams, build_schedule_config


def test_default_policy_is_pinned():
    assert ScheduleConfig(total_slots=4, court_count=2).court_policy == "pinned"
    assert ScheduleConfig(total_slots=4, court_count=2).court_overrides == {}


def test_params_builder_carries_the_policy():
    cfg = build_schedule_config(
        SchedulingParams(
            court_count=4,
            total_slots=20,
            court_policy="queue",
            court_overrides={1: "pinned"},
        )
    )
    assert cfg.court_policy == "queue"
    assert cfg.court_overrides == {1: "pinned"}


def _request(**cfg_kw) -> ScheduleRequest:
    cfg = ScheduleConfig(total_slots=8, court_count=2, interval_minutes=30, **cfg_kw)
    return ScheduleRequest(
        config=cfg,
        players=[Player(id=p, name=p) for p in ("a", "b", "c", "d")],
        matches=[
            Match(id="m1", event_code="E", side_a=["a"], side_b=["b"]),
            Match(id="m2", event_code="E", side_a=["c"], side_b=["d"]),
        ],
    )


def test_pinned_is_byte_identical_to_an_unset_policy():
    """The CP2 promise: adding the field changes no existing solve.

    Compares the emitted assignments, not just feasibility — a model that
    solved to a DIFFERENT valid schedule would still be a behaviour change.
    """
    baseline = schedule(_request())
    explicit = schedule(_request(court_policy="pinned"))
    assert baseline.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert [(a.match_id, a.slot_id, a.court_id) for a in baseline.assignments] == [
        (a.match_id, a.slot_id, a.court_id) for a in explicit.assignments
    ]


def test_dto_adapter_carries_the_policy_and_coerces_json_string_keys():
    """The workspace config blob is JSON, so courtOverrides keys arrive as
    strings; Pydantic's Dict[int, ...] coerces them and the adapter passes
    ints through to the engine — both engines share this seam (CP6)."""
    from core.schemas import TournamentConfig
    from shared.sport.badminton import schedule_config_from_dto

    dto = TournamentConfig.model_validate(
        {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "18:00",
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
            "courtPolicy": "queue",
            "courtOverrides": {"1": "pinned"},
        }
    )
    cfg = schedule_config_from_dto(dto)
    assert cfg.court_policy == "queue"
    assert cfg.court_overrides == {1: "pinned"}


def test_dto_adapter_defaults_to_pinned_when_the_blob_predates_the_policy():
    from core.schemas import TournamentConfig
    from shared.sport.badminton import schedule_config_from_dto

    dto = TournamentConfig.model_validate(
        {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "18:00",
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        }
    )
    cfg = schedule_config_from_dto(dto)
    assert cfg.court_policy == "pinned"
    assert cfg.court_overrides == {}
