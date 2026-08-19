# scheduler_core/

The CP-SAT scheduling engine. Pure Python, no HTTP — invoked from
`products/scheduler/backend/api/schedule*.py` and from the unit tests in `products/scheduler/tests/`.

## Layout

```
scheduler_core/
├── domain/
│   ├── models.py            # dataclasses: Match, Player, Assignment, ScheduleConfig, …
│   ├── tournament.py        # higher-level tournament aggregates
│   └── errors.py            # solver-internal exception types
├── engine/
│   ├── cpsat_backend.py     # interval-variable CP-SAT formulation (canonical)
│   ├── config.py            # EngineConfig + ConstraintSpec — declarative model assembly
│   ├── variables.py         # decision-variable construction helpers
│   ├── constraints/         # constraint plugins (one file per rule, see below)
│   ├── extraction.py        # ScheduleResult ← cp_model.CpSolver
│   ├── validation.py        # post-solve validators (sanity checks)
│   ├── diagnostics.py       # infeasible-reason extraction
│   ├── live_ops.py          # rescheduling helpers + court-outage / overrun handlers
│   ├── repair.py            # solve_repair — slice-bounded warm-started re-solve
│   ├── warm_start.py        # solve_warm_start — full re-solve seeded by existing schedule
│   ├── backends.py          # backend selector (CPSATBackend, GreedyBackend)
│   └── bridge.py            # SchedulingProblemBuilder — TournamentState → ScheduleRequest
├── schedule.py              # public entry: schedule(...) / schedule_from_api(...)
└── _log.py                  # solver logger (scheduler_core._log namespace)
```

`engine/cpsat_backend.py` is the canonical entry. Its module
docstring enumerates every decision variable the model declares;
hard rules and soft penalties live in the constraint plugins under
`engine/constraints/`.

## Constraint plugins

Each constraint owns a single file under `engine/constraints/` and
implements the `Constraint` protocol (declared in
`engine/constraints/__init__.py`). The current set:

| File | Type | What it enforces |
|---|---|---|
| `court_capacity.py` | hard | No two matches share a court at the same time |
| `player_no_overlap.py` | hard | A player is in at most one match at a time |
| `availability.py` | hard | Per-player availability windows (`AddAllowedAssignments`) |
| `locks_and_pins.py` | hard | Manual operator overrides — exact slot/court pins |
| `freeze_horizon.py` | hard | Don't shuffle anything before the cutoff slot |
| `rest.py` | soft | Penalise short rest gaps between a player's matches |
| `game_proximity.py` | soft | Min/max gap between specific match pairs (opt-in) |
| `stay_close.py` | soft | Per-match move penalty vs. a previous assignment (used by repair / warm-restart) |
| `objective.py` | – | Aggregates penalties + makespan / late-finish / no-gaps terms |

`EngineConfig.from_legacy(config)` builds the standard plugin list
from the flat-dataclass `ScheduleConfig` so existing call-sites need
no migration. Adapters that want a custom plugin set construct
`EngineConfig` directly and pass it to `CPSATScheduler`.

## Adding a constraint

1. Drop a new file under `engine/constraints/<name>.py` exporting a
   class that implements the `Constraint` protocol — `apply(model,
   vars, params)` and a `name` attribute.
2. Register it in `engine/constraints/__init__.py` so the loader can
   resolve it by name.
3. Add its `ConstraintSpec(name=..., params={...})` to the relevant
   `EngineConfig` factory (typically inside `config.py` or in an
   adapter).
4. Surface any tunable knobs via `SolverOptions` in
   `domain/models.py`, then through
   `products/scheduler/backend/app/schemas.py` and
   `products/scheduler/frontend/src/api/dto.ts`.
5. Add a unit test under `products/scheduler/tests/` that constructs a
   minimal instance and asserts the new behaviour.

## SolverOptions

`domain/models.SolverOptions` collects tournament-wide weights, time
limits, and feature flags. The frontend's tournament config maps onto
this dataclass in `backend/api/schedule.py`. Defaults live alongside
the field declarations.

## Extraction

`extraction.py` turns the raw `cp_model.CpSolver` state into a
`ScheduleResult` carrying assignments, soft-violations, infeasibility
reasons, repair metadata (`repairedMatchIds` etc.), and solver
statistics. The same dataclass is returned to the HTTP layer and
serialised to `ScheduleDTO`.

## Repair vs. warm-restart

- `engine/repair.py` (`solve_repair`) — bounded slice; pin everything
  outside the slice; warm-start from current. Fast (≤ 5 s for typical
  tournaments). Used by `/schedule/repair`.
- `engine/warm_start.py` (`solve_warm_start`) — whole problem; pin
  finished/in-progress; hint everything else; add a per-match
  stay-close penalty. Used by `/schedule/warm-restart`.

## Tests

```
cd products/scheduler && pytest   # rootdir is products/scheduler; uses the repo .venv
```
