# How to build a product on the engine

**Goal:** build your own scheduling product on `scheduler_core` — the pure
CP-SAT engine the ShuttleWorks scheduler itself is built on.

`scheduler_core/` has **no HTTP and no I/O**. It takes dataclasses in and returns
a result dataclass out, so any Python application can drive it. The scheduler in
this repo (`products/scheduler/`) is the worked example; `examples/` holds
product-agnostic engine snippets.

## 1 · Import the domain model

The inputs are plain dataclasses in `scheduler_core/domain/models.py` — `Match`,
`Player`, `Assignment`, `ScheduleConfig`, `SolverOptions`. Build a problem from
your own data by constructing these; no framework, no base classes.

## 2 · Call the public entry

```python
from scheduler_core import schedule          # scheduler_core/schedule.py

result = schedule(matches, players, config)  # → ScheduleResult
```

`schedule(...)` / `schedule_from_api(...)` are the public entry points.
Internally they build an `EngineConfig` (`EngineConfig.from_legacy(config)` gives
the standard plugin set) and run the CP-SAT backend.

## 3 · Read the result

`ScheduleResult` (built in `engine/extraction.py`) carries the assignments,
soft-constraint violations, infeasibility reasons, repair metadata, and solver
statistics — everything the HTTP layer serialises to `ScheduleDTO`.

## 4 · Customise

- **New rules** → [add a CP-SAT constraint](/how-to/add-a-cpsat-constraint); pass
  a custom `EngineConfig` with your plugin set instead of `from_legacy`.
- **Live re-solves** → `engine/repair.py` (`solve_repair`, bounded slice) and
  `engine/warm_start.py` (`solve_warm_start`, whole problem, seeded). Both pin
  in-flight/finished matches so a re-plan never moves a live match.
- **Backends** → `engine/backends.py` selects `CPSATBackend` (canonical) or
  `GreedyBackend`.

## Verify

```bash
cd products/scheduler && pytest   # rootdir is products/scheduler; uses the repo .venv
```

::: tip The non-merged match record
The engine is shared, but each product keeps its own match *record* — Meet stores
points behind a status/version envelope, Bracket stores a winner fused to its
advancement cascade. Reuse the *engine*, not a single match model. See
[ADR 0006](/decisions/0006-unified-scheduling-core).
:::

## See also

- [How to add a CP-SAT constraint](/how-to/add-a-cpsat-constraint)
- [Scheduling unification](/architecture/scheduling-unification)
- [ADR 0004 — OR-Tools CP-SAT engine](/decisions/0004-ortools-cpsat-engine)
