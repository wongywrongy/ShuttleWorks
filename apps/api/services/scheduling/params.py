"""One place to turn scheduling parameters into an engine ScheduleConfig.

Both the Meet and Bracket modules feed the same structural knobs —
courts, time window (``total_slots``), slot duration, rest, breaks,
court closures, freeze horizon — into the solver. Meet derives them from
``TournamentConfig`` (a day window + interval); Bracket derives the core
few from its session metadata. They share this builder so the mapping of
those shared parameters onto ``ScheduleConfig`` lives once.

Module-specific *objective* tuning (Meet's disruption / proximity /
compact penalties) is **not** modelled here — those are solver-weighting
choices unique to the meet workflow, not the "scheduling parameters" the
two modules have in common. The meet adapter layers them on top of the
config this builder returns (via ``dataclasses.replace``); the bracket
path uses the returned config as-is.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Tuple

from scheduler_core.domain.models import ScheduleConfig


@dataclass(frozen=True)
class SchedulingParams:
    """The structural scheduling parameters shared by Meet and Bracket.

    These are exactly the inputs the spec calls out as common: courts,
    time window, slot duration, and rest — plus the break / closure /
    freeze knobs the engine reads the same way regardless of source
    module.
    """

    court_count: int
    total_slots: int
    interval_minutes: int = 30
    default_rest_slots: int = 1
    freeze_horizon_slots: int = 0
    current_slot: int = 0
    break_slots: List[Tuple[int, int]] = field(default_factory=list)
    closed_court_windows: List[Tuple[int, int, int]] = field(default_factory=list)
    closed_court_ids: List[int] = field(default_factory=list)


def build_schedule_config(params: SchedulingParams) -> ScheduleConfig:
    """Build the structural ``ScheduleConfig`` from shared parameters.

    Only the structural fields are set; every objective-weight field
    keeps its ``ScheduleConfig`` default. Callers that need module-
    specific objective tuning (the meet adapter) layer it on with
    ``dataclasses.replace`` over the result.
    """
    return ScheduleConfig(
        total_slots=params.total_slots,
        court_count=params.court_count,
        interval_minutes=params.interval_minutes,
        default_rest_slots=params.default_rest_slots,
        freeze_horizon_slots=params.freeze_horizon_slots,
        current_slot=params.current_slot,
        break_slots=list(params.break_slots),
        closed_court_windows=list(params.closed_court_windows),
        closed_court_ids=list(params.closed_court_ids),
    )
