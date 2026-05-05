"""Engine configuration: which constraints to apply, with which parameters.

``EngineConfig`` lists ``ConstraintSpec``s by name + params; the
coordinator (``CPSATScheduler.build()``) walks the list and dispatches
through ``constraints.load()`` to the registry.

The legacy ``ScheduleConfig`` dataclass keeps tournament-wide scalars
(court_count, total_slots, intervals, breaks). Per-constraint toggles
and weights move into ``ConstraintSpec.params``. Adapters that already
hold a ``ScheduleConfig`` use ``EngineConfig.from_legacy(config)`` to
get the standard constraint list with parameters pulled from the
existing flat-dataclass shape.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Mapping

from scheduler_core.domain.models import ScheduleConfig, SolverOptions


@dataclass(frozen=True)
class ConstraintSpec:
    """Declarative entry for one constraint plugin.

    ``name`` keys into ``CONSTRAINT_REGISTRY`` (set by
    ``@register_constraint``). ``params`` are forwarded to the plugin
    constructor verbatim. ``enabled=False`` skips the plugin without
    deleting the spec — handy for A/B turning constraints off.
    """
    name: str
    params: Mapping[str, Any] = field(default_factory=dict)
    enabled: bool = True


@dataclass(frozen=True)
class EngineConfig:
    """Top-level engine configuration.

    ``schedule`` keeps the existing ``ScheduleConfig`` shape so old
    callers don't break. ``constraints`` is the new pluggable surface.
    ``solver`` are the solver-tuning knobs (time limit, workers, seed).
    """
    schedule: ScheduleConfig
    constraints: List[ConstraintSpec]
    solver: SolverOptions = field(default_factory=SolverOptions)

    @classmethod
    def from_legacy(cls, config: ScheduleConfig, solver: SolverOptions | None = None) -> "EngineConfig":
        """Build an ``EngineConfig`` mirroring the implicit constraint
        set the legacy ``CPSATScheduler`` applied unconditionally.

        This is the back-compat path: every existing test constructs a
        ``ScheduleConfig`` and expects the same constraints to fire.
        New callers that want explicit control should construct
        ``EngineConfig`` directly.
        """
        specs: List[ConstraintSpec] = [
            ConstraintSpec(name="court_capacity"),
            ConstraintSpec(
                name="player_no_overlap",
                params={
                    "allow_overlap": config.allow_player_overlap,
                    "overlap_penalty": config.player_overlap_penalty,
                },
            ),
            ConstraintSpec(name="availability"),
            ConstraintSpec(name="locks_and_pins"),
            ConstraintSpec(name="freeze_horizon"),
            ConstraintSpec(
                name="rest",
                params={
                    "default_rest_slots": config.default_rest_slots,
                    "soft_enabled": config.soft_rest_enabled,
                    "default_penalty": config.rest_slack_penalty,
                },
            ),
            ConstraintSpec(
                name="game_proximity",
                params={
                    "enabled": config.enable_game_proximity,
                    "min_spacing": config.min_game_spacing_slots,
                    "max_spacing": config.max_game_spacing_slots,
                    "penalty": config.game_proximity_penalty,
                },
            ),
            ConstraintSpec(
                name="objective",
                params={
                    "disruption_penalty": config.disruption_penalty,
                    "court_change_penalty": config.court_change_penalty,
                    "late_finish_penalty": config.late_finish_penalty,
                    "compact_enabled": config.enable_compact_schedule,
                    "compact_mode": config.compact_schedule_mode,
                    "compact_penalty": config.compact_schedule_penalty,
                    "target_finish_slot": config.target_finish_slot,
                    "soft_rest_enabled": config.soft_rest_enabled,
                    "rest_slack_penalty": config.rest_slack_penalty,
                    "game_proximity_enabled": config.enable_game_proximity,
                    "game_proximity_penalty": config.game_proximity_penalty,
                    "allow_player_overlap": config.allow_player_overlap,
                    "player_overlap_penalty": config.player_overlap_penalty,
                },
            ),
        ]
        return cls(schedule=config, constraints=specs, solver=solver or SolverOptions())
