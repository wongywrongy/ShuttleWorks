# scheduler-core

A pure-Python CP-SAT tournament scheduling engine, built on Google
[OR-Tools](https://developers.google.com/optimization). No HTTP, no I/O,
no framework: a library you call with dataclasses and get a feasible (or
provably infeasible) plan back.

The engine was extracted from a tournament-day operator product, so it's
been hardened on real day-of-event constraints: locks/pins, freeze
horizons, court closures, mid-event repair, warm-start re-solves, and
so on. Use it directly in any Python service, queue worker, CLI, or
notebook.

## Install

```bash
pip install -e .
# or, from a checkout, run examples/tests directly without installing:
#   pyproject.toml puts the repo root on sys.path for pytest
```

Requires Python ≥ 3.11. The only runtime dependency is `ortools` (CP-SAT).

## Quickstart

```python
from scheduler_core import (
    schedule,
    SchedulingProblem,
    ScheduleConfig,
    Player,
    Match,
    SolverOptions,
)

problem = SchedulingProblem(
    config=ScheduleConfig(total_slots=10, court_count=2),
    players=[
        Player(id="p1", name="Alice"),
        Player(id="p2", name="Bob"),
    ],
    matches=[
        Match(id="m1", event_code="MS-1", side_a=["p1"], side_b=["p2"]),
    ],
    solver_options=SolverOptions(time_limit_seconds=5.0),
)

result = schedule(problem)
print(result.status.value)               # "optimal"
for a in result.assignments:
    print(a.match_id, a.slot_id, a.court_id)
```

A runnable version lives at [`examples/basic_schedule_core.py`](examples/basic_schedule_core.py).

## Public API at a glance

| Symbol | What it is |
|---|---|
| `schedule(problem, options=None) -> ScheduleResult` | Canonical entry point |
| `SchedulingProblem` (alias `ScheduleRequest`) | Input dataclass |
| `ScheduleConfig` | Slots, courts, penalties, freeze-horizon, etc. |
| `Player`, `Match`, `PreviousAssignment` | Domain dataclasses |
| `SolverOptions` | Time limit, workers, log progress |
| `ScheduleResult` (alias `SchedulingResult`) | Status, assignments, soft violations, infeasible reasons |
| `SolverStatus` | enum: `optimal` / `feasible` / `infeasible` / `not_solved` |
| `ValidationError`, `InfeasibleError`, `FrameworkError` | Engine exception types |

Plus a lower-level surface for advanced use: `CPSATBackend` /
`CPSATScheduler` / `GreedyBackend`, the constraint-plugin assembler
(`SchedulingProblemBuilder`, `BridgeOptions`, `LiveOpsConfig`), and the
live-ops helpers (`reschedule`, `update_actuals`, `apply_freeze_horizon`,
`handle_overrun`, `handle_no_show`, `handle_court_outage`).

Full export list: [`scheduler_core/__init__.py`](scheduler_core/__init__.py).
Architecture details: [`scheduler_core/README.md`](scheduler_core/README.md).
Constraint plugins: [`scheduler_core/engine/README.md`](scheduler_core/engine/README.md).

## Use it elsewhere

The engine takes pure dataclasses and returns pure dataclasses — bring
your own DTO layer at the boundary. See
[**`USAGE.md`**](USAGE.md) for:

- wrapping the engine in a FastAPI service (~30 lines)
- queue-worker / CLI patterns
- mid-event live ops: warm restart, surgical repair, court outage
- adding a custom soft constraint
- testing patterns for downstream apps

## Tests

```bash
pip install -e ".[dev]"
pytest
```

The 54 engine tests cover the model, determinism, candidate collection,
the warm-start and repair solvers, conflict detection, cancellation, and
end-to-end smoke. They run in ~6 seconds on a recent laptop.

## License

MIT.
