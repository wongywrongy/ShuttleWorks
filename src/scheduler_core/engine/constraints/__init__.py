"""Constraint plugin protocol + registry for the CP-SAT engine.

Background
----------
Every CP-SAT constraint type used to be a private ``_add_*`` method on
``CPSATScheduler`` (in ``cpsat_backend.py``). Adding a new constraint
required editing that ~700-LOC class. This module formalises the
constraint surface as a plugin so:

1. Each constraint owns its own file and parameters.
2. A coordinator (``CPSATScheduler.build()``) walks a list of
   ``ConstraintSpec``s, instantiates the plugin from the registry,
   and calls ``apply(ctx)``.
3. A future application (room scheduling, OR scheduling, …) reuses
   the engine by composing a different list of constraints; the
   engine layer does not need to change.

The plugin contract is intentionally tiny — every plugin gets the
solver model + the inputs (matches, players, config) + the variable
container, and is free to mutate the model. The mutable bookkeeping
(slack dicts, ``locked_matches`` set, ``infeasible_reasons`` list)
is exposed as attributes on the context so plugins can register
slack variables that the objective plugin reads later.

Plugins are pure functions in spirit: ``apply()`` is the only place
the model is mutated. Diagnostics extraction (e.g., per-constraint
violation counts) lives on the same plugin instance for a future
extension; today's plugins do not implement it.
"""
from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

CONSTRAINT_REGISTRY: dict[str, type["Constraint"]] = {}


def register_constraint(cls: type["Constraint"]) -> type["Constraint"]:
    """Decorator: register a Constraint class under ``cls.name``.

    Importing the constraint module is enough to register it — call
    sites use the registry to look up plugins by name.
    """
    if not getattr(cls, "name", None):
        raise ValueError(f"{cls.__name__} is missing required `name` attribute")
    CONSTRAINT_REGISTRY[cls.name] = cls
    return cls


@runtime_checkable
class ConstraintContext(Protocol):
    """The mutable workspace exposed to constraint plugins.

    ``CPSATScheduler`` satisfies this protocol via duck typing — its
    own attributes match the names below. A future engine
    implementation could provide a smaller dedicated context object
    without changing any plugin body.

    The slack dicts and lists are *mutable* — plugins append to them,
    and the objective plugin reads them. This is intentional: keeping
    the soft-constraint slack bookkeeping next to the constraint that
    creates it lets each plugin be self-contained.
    """
    model: Any            # cp_model.CpModel
    config: Any           # ScheduleConfig
    matches: dict         # dict[str, Match]
    players: dict         # dict[str, Player]
    previous_assignments: dict  # dict[str, PreviousAssignment]
    svars: Any            # SchedulingVars
    locked_matches: set
    infeasible_reasons: list
    rest_slack: dict
    proximity_min_slack: dict
    proximity_max_slack: dict
    overlap_slack: list

    def _player_matches(self) -> dict: ...
    def _allowed_starts(self, match: Any) -> Any: ...


class Constraint(Protocol):
    """Plugin protocol for a CP-SAT constraint or objective component.

    Plugins are constructed once per build with the parameters the
    adapter chose (e.g. ``RestBetweenMatches(min_rest_slots=6)``),
    then ``apply(ctx)`` mutates the model. Name must match the key
    used in ``ConstraintSpec.name``.
    """
    name: str

    def __init__(self, **params: Any) -> None: ...
    def apply(self, ctx: ConstraintContext) -> None: ...


def load(spec: "ConstraintSpec") -> Constraint:  # noqa: F821 (forward ref)
    """Look up ``spec.name`` in the registry and instantiate with ``spec.params``."""
    cls = CONSTRAINT_REGISTRY.get(spec.name)
    if cls is None:
        raise KeyError(
            f"Unknown constraint plugin: {spec.name!r}. "
            f"Registered: {sorted(CONSTRAINT_REGISTRY.keys())}"
        )
    return cls(**spec.params)
