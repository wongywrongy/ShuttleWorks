# scheduler_core engine

A small CP-SAT scheduling engine for "assign tasks to time slots and
resources under pluggable constraints" problems. The current
production user is a badminton tournament scheduler; the engine
itself is domain-agnostic and parameterised through a plugin layer.

## Core types

All in `domain/models.py`:

| Type | Role |
|---|---|
| `Player` | An actor whose calendar can't double-book. Has availability windows, rest requirements. |
| `Match` | A task to schedule. Has duration, the set of actors involved (`side_a`, `side_b`), and an event code. |
| `Assignment` | A scheduled task: `(match_id, slot_id, court_id, duration_slots)`. |
| `PreviousAssignment` | Optional input: pin a match (locked or partial) at a known slot/court. |
| `ScheduleConfig` | Tournament-wide scalars: total_slots, court_count, interval_minutes, breaks, freeze horizon, current_slot. |
| `SolverOptions` | Time limit, num workers, random seed, log flag. |
| `ScheduleResult` | Output: status, assignments, soft-violation list, runtime stats. |

`Match.side_a` / `side_b` are lists of player IDs — generic enough for
any team-vs-team scheduling. `Match.event_code` is a free string the
engine doesn't inspect.

## Time grid

Slots are integer indices into a discretised day. `ScheduleConfig`
holds:
- `total_slots` — how many slots span the day
- `interval_minutes` — slot length
- `current_slot` — wall-clock pointer (used by FreezeHorizon)
- `break_slots` — `[(start, end)]` ranges that no match may occupy
- `court_count` — how many resources are available

Adapters convert their domain's clock to slots before passing through.

## Plugin architecture

Constraints are pluggable. Each plugin lives in `engine/constraints/`,
implements the `Constraint` Protocol, and registers itself with
`@register_constraint`:

```python
from scheduler_core.engine.constraints import (
    Constraint, ConstraintContext, register_constraint,
)

@register_constraint
class MyConstraint:
    name = "my_constraint"

    def __init__(self, *, weight: int = 10) -> None:
        self.weight = weight

    def apply(self, ctx: ConstraintContext) -> None:
        # ctx.model: cp_model.CpModel
        # ctx.matches: dict[str, Match]
        # ctx.players: dict[str, Player]
        # ctx.svars: SchedulingVars (start[m], end[m], court[m], interval[m], court_interval[(m,c)])
        # ctx.config: ScheduleConfig
        # ctx.previous_assignments: dict[str, PreviousAssignment]
        # ctx.locked_matches: set[str]   (mutable — append match_ids you pin)
        # ctx.infeasible_reasons: list[str]   (mutable — append human messages)
        # ctx.rest_slack / proximity_*_slack / overlap_slack (mutable — slack vars by id)
        ...
```

The `EngineConfig` lists which plugins to apply, with their parameters:

```python
from scheduler_core.engine.config import EngineConfig, ConstraintSpec
from scheduler_core.engine.cpsat_backend import CPSATScheduler

config = EngineConfig(
    schedule=schedule_config,         # tournament-wide scalars
    constraints=[
        ConstraintSpec(name="court_capacity"),
        ConstraintSpec(name="player_no_overlap"),
        ConstraintSpec(name="rest", params={"default_rest_slots": 6}),
        ConstraintSpec(name="my_constraint", params={"weight": 20}),
        ConstraintSpec(name="objective", params={"late_finish_penalty": 0.5}),
    ],
    solver=SolverOptions(time_limit_seconds=30, num_workers=4),
)

scheduler = CPSATScheduler(config)
scheduler.add_matches(matches)
scheduler.add_players(players)
scheduler.set_previous_assignments(previous)
scheduler.build()
result = scheduler.solve()
```

For the legacy code path, `EngineConfig.from_legacy(ScheduleConfig)`
walks the existing `enable_X` flags on a `ScheduleConfig` and produces
the standard constraint list. The bare-`ScheduleConfig` constructor on
`CPSATScheduler` calls this automatically, so existing call sites
continue to work unchanged.

## Built-in plugins

| `name` | File | Purpose |
|---|---|---|
| `court_capacity` | `constraints/court_capacity.py` | At most one match per court per slot. |
| `player_no_overlap` | `constraints/player_no_overlap.py` | No player in two matches at once (hard or soft). |
| `availability` | `constraints/availability.py` | Match starts must lie inside every player's availability windows and outside any break. |
| `locks_and_pins` | `constraints/locks_and_pins.py` | Hard pin slot/court from `previous_assignments`. |
| `freeze_horizon` | `constraints/freeze_horizon.py` | Pin every assignment in `[current_slot, current_slot + freeze_horizon_slots)`. |
| `rest` | `constraints/rest.py` | Pairwise rest enforcement; hard or soft. |
| `game_proximity` | `constraints/game_proximity.py` | Soft min/max spacing between any two matches a player plays. |
| `objective` | `constraints/objective.py` | Composes the soft-penalty objective: rest slack, proximity slack, disruption, court change, late finish, compact schedule, player overlap. |

Order matters: every plugin that creates slack variables (`rest`,
`game_proximity`, `player_no_overlap`) must run before `objective`,
which reads them.

## Determinism

`SolverOptions.random_seed` (default 42) is wired to
`solver.parameters.random_seed`. Combined with sorting input lists by
`id` at the engine boundary and `num_workers=1`, this produces
byte-identical schedules across runs.

For multi-worker speed, OR-Tools doesn't guarantee determinism even
with a fixed seed. Default is multi-worker; opt into determinism via
the configured "Reproducible run" toggle (single-worker mode).

## Adding a new application

The engine has no badminton-specific code in it. To use it for
another problem (room scheduling, OR scheduling, classroom
timetabling):

1. Build a `ScheduleConfig` from your domain's clock.
2. Convert your domain types to `Match` / `Player` (and ignore
   `event_code` if it doesn't apply — it's a free string).
3. Compose a `list[ConstraintSpec]` choosing which built-in plugins
   apply, plus any custom plugins you wrote and registered.
4. Pass to `CPSATScheduler` and solve.

The "adapter" is just (1)–(3); it doesn't need its own framework.

## File map

```
engine/
├── README.md                    # this file
├── __init__.py                  # public re-exports
├── backends.py                  # SchedulingBackend ABC + CPSATBackend wrapper
├── bridge.py                    # PlayUnit-shaped problem builder (legacy; not used by /api)
├── config.py                    # EngineConfig, ConstraintSpec
├── constraints/                 # plugin registry + built-in plugins
│   ├── __init__.py              # protocol + registry + load()
│   ├── court_capacity.py
│   ├── player_no_overlap.py
│   ├── availability.py
│   ├── locks_and_pins.py
│   ├── freeze_horizon.py
│   ├── rest.py
│   ├── game_proximity.py
│   └── objective.py
├── cpsat_backend.py             # CPSATScheduler coordinator + ProgressCallback
├── diagnostics.py               # diagnose_infeasibility
├── extraction.py                # extract_solution
├── live_ops.py                  # PlayUnit-shaped overrun/no-show handlers (legacy)
├── validation.py                # find_conflicts (used by /schedule/validate)
└── variables.py                 # SchedulingVars + create_variables
```
