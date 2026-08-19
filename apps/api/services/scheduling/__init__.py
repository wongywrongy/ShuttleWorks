"""Shared scheduling seam used by both the Meet and Bracket modules.

The CP-SAT engine (``scheduler_core``) is already module-agnostic — both
modules pre-resolve fully-formed matches and hand them to the same solver
and the same constraint plugins. This package owns the small *backend*
layer above the engine that was duplicated when Meet and Bracket
originated as separate apps: the one place scheduling parameters become an
engine ``ScheduleConfig``.

The single batch CP-SAT entry both modules invoke is the engine's own
``scheduler_core.schedule`` — see ``docs/architecture/scheduling-unification.md``.
"""
from services.scheduling.params import SchedulingParams, build_schedule_config

__all__ = ["SchedulingParams", "build_schedule_config"]
