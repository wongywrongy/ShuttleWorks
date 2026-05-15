# Using scheduler-core elsewhere

This guide is for downstream consumers — services, workers, scripts, or
other libraries that want to embed the engine. The
[README](README.md) has the quickstart; this file goes deeper.

## Layering

```
            ┌────────────────────────────┐
            │ Your transport / app code  │  ← FastAPI route, queue handler,
            │   (DTOs, auth, persistence)│    CLI, notebook, anything
            └─────────────┬──────────────┘
                          │  pure dataclasses
            ┌─────────────▼──────────────┐
            │  scheduler_core.schedule(…) │  ← single canonical entry
            │  scheduler_core.engine.*    │  ← constraints, repair, warm start
            └─────────────┬──────────────┘
                          │  ortools.sat.python.cp_model
                          ▼
                       OR-Tools
```

The engine never imports your DTOs. You convert your transport types
(Pydantic, attrs, msgspec, plain dicts) into the engine's dataclasses
at the boundary, call `schedule()`, and convert the result back.

## Wrapping in a FastAPI service

A complete, self-contained adapter is short. Put your DTOs in your own
package; here we use Pydantic inline.

```python
# my_app/scheduling.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from scheduler_core import (
    schedule,
    SchedulingProblem,
    ScheduleConfig,
    Player,
    Match,
    SolverOptions,
    ValidationError,
    InfeasibleError,
)


# DTOs — your transport types. Use whatever shape your clients expect.
class PlayerDTO(BaseModel):
    id: str
    name: str

class MatchDTO(BaseModel):
    id: str
    event_code: str
    side_a: list[str]
    side_b: list[str]

class ScheduleIn(BaseModel):
    total_slots: int
    court_count: int
    time_limit_seconds: float = 5.0
    players: list[PlayerDTO]
    matches: list[MatchDTO]

class AssignmentDTO(BaseModel):
    match_id: str
    slot_id: int
    court_id: int

class ScheduleOut(BaseModel):
    status: str
    assignments: list[AssignmentDTO]


router = APIRouter()

@router.post("/schedule", response_model=ScheduleOut)
def create_schedule(body: ScheduleIn) -> ScheduleOut:
    try:
        result = schedule(SchedulingProblem(
            config=ScheduleConfig(
                total_slots=body.total_slots,
                court_count=body.court_count,
            ),
            players=[Player(id=p.id, name=p.name) for p in body.players],
            matches=[
                Match(
                    id=m.id,
                    event_code=m.event_code,
                    side_a=m.side_a,
                    side_b=m.side_b,
                )
                for m in body.matches
            ],
            solver_options=SolverOptions(time_limit_seconds=body.time_limit_seconds),
        ))
    except ValidationError as e:
        raise HTTPException(400, str(e))
    except InfeasibleError as e:
        raise HTTPException(422, str(e))

    return ScheduleOut(
        status=result.status.value,
        assignments=[
            AssignmentDTO(
                match_id=a.match_id,
                slot_id=a.slot_id,
                court_id=a.court_id,
            )
            for a in result.assignments
        ],
    )
```

That's the whole pattern: DTO → engine dataclass → `schedule()` → DTO.
Keep the conversion functions in one place; the engine's API is small
enough that mapping is mechanical.

## Running it as a queue worker

CP-SAT can run for seconds-to-minutes on hard problems. For interactive
use, prefer a job queue.

```python
# worker.py
from scheduler_core import schedule, SchedulingProblem, SolverOptions

def handle_job(payload: dict) -> dict:
    problem = build_problem_from_payload(payload)        # your code
    result = schedule(problem, options=SolverOptions(time_limit_seconds=30.0))
    return serialize_result(result)                      # your code
```

For cancellation (e.g. when the user closes the tab), use the engine's
`CancelToken`:

```python
from scheduler_core.engine.cancel_token import CancelToken
from scheduler_core.engine.warm_start import solve_warm_start

token = CancelToken()
# trip from any thread (e.g. a websocket disconnect handler)
# token.cancel()
result = solve_warm_start(problem, prev_result, cancel_token=token)
```

## Mid-event live ops

The engine ships with three operator-grade tools, all pure functions on
dataclasses.

### Warm restart — full re-solve, biased to keep things in place

Use after a config change (extra court added, day extended) when you
want the optimal new schedule but minimal disruption.

```python
from scheduler_core.engine.warm_start import solve_warm_start

new_result = solve_warm_start(
    problem=updated_problem,        # new config, same matches
    previous=current_result,        # what's running now
    stay_close_weight=10,           # how strongly to anchor
)
```

### Repair — surgical, slice-bounded re-solve

Use after a single disruption (court closed, match overran) when you
want to disturb the smallest possible time window.

```python
from scheduler_core.engine.repair import solve_repair, RepairSpec

result = solve_repair(
    problem=current_problem,
    spec=RepairSpec(
        from_slot=current_slot,     # don't touch played matches
        to_slot=current_slot + 6,   # only re-solve the next 6 slots
        affected_match_ids={"m17"}, # specifically replan this match
    ),
)
```

### Live-ops helpers

`scheduler_core.engine.live_ops` exports drop-in handlers:

```python
from scheduler_core.engine.live_ops import (
    handle_overrun,        # match m17 went 30 minutes long
    handle_no_show,        # player p23 didn't show up
    handle_court_outage,   # court 3 closed
    apply_freeze_horizon,  # don't replan anything before slot N
    update_actuals,        # mark matches as started/finished from the wall clock
    reschedule,            # convenience wrapper that picks a strategy
)
```

Each returns a new `ScheduleResult` you can present as a proposal,
diff, and commit.

## Adding a custom soft constraint

Constraint plugins live under `scheduler_core/engine/constraints/` —
one file per rule. Each file implements the `Constraint` protocol
declared in `engine/constraints/__init__.py`. The README under
[`scheduler_core/engine/`](scheduler_core/engine/README.md) walks
through adding one end to end.

In short:

1. Create `engine/constraints/your_rule.py`, define a class that fills
   the protocol's three methods (`hard_clauses`, `soft_terms`, `name`).
2. Wire it into `EngineConfig` (either in the default plugin list or
   on a per-call basis).
3. Add a test under `tests/` that solves a fixture problem and asserts
   the new rule fires.

The engine's hard rules and soft penalties are otherwise additive —
you don't need to touch the model or extraction code.

## Testing your downstream app

The engine tests are deterministic given a fixed seed. For your own
service tests, build small fixture problems and assert on the result:

```python
def test_my_service_packs_two_matches_onto_two_courts():
    result = my_service.create_schedule(
        # …two non-overlapping players, two courts, two slots…
    )
    assert result.status == "optimal"
    assert {a.court_id for a in result.assignments} == {1, 2}
```

For `unsolvable` cases, assert on `InfeasibleError` (raised at the
boundary in your handler) or on `result.infeasible_reasons` if you
chose to surface the engine's own diagnostic strings.

## Versioning

This is an extracted library at `0.1.0`. Public API is what
`scheduler_core/__init__.py` re-exports — anything else is internal
and subject to change. If you depend on a deeper symbol (e.g.
`engine.cpsat_backend.CPSATScheduler` directly), pin the version.
