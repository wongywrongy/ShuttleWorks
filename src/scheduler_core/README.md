# scheduler_core/

The CP-SAT scheduling engine. Pure Python, no HTTP — invoked from
`backend/api/schedule.py` and from the unit tests in `src/tests/`.

## Layout

```
scheduler_core/
├── domain/
│   ├── models.py     # dataclasses: Match, Player, Assignment, ScheduleConfig, …
│   ├── tournament.py # higher-level tournament aggregates
│   └── errors.py     # solver-internal exception types
├── engine/
│   ├── cpsat_backend.py  # interval-variable CP-SAT formulation (canonical)
│   ├── variables.py      # decision-variable construction helpers
│   ├── extraction.py     # ScheduleResult ← cp_model.CpSolver
│   ├── validation.py     # post-solve validators (sanity checks)
│   ├── diagnostics.py    # infeasible-reason extraction
│   ├── live_ops.py       # rescheduling helpers + court-outage / overrun handlers
│   ├── backends.py       # backend selector (CPSATBackend, GreedyBackend)
│   └── bridge.py         # SchedulingProblemBuilder — TournamentState → ScheduleRequest
├── schedule.py       # public entry: schedule(...) / schedule_from_api(...)
├── api_compat.py     # legacy DTO compat shims for the FastAPI route
└── _log.py           # solver logger (scheduler_core._log namespace)
```

`engine/cpsat_backend.py` is the canonical entry. Its module docstring
enumerates every decision variable, hard constraint, and soft penalty
the solver applies — read it before changing the model.

## Hard constraints

- Court capacity (no two matches share a court at the same time).
- Player non-overlap (a player can be in only one match at a time).
- Player availability windows (`AddAllowedAssignments`).
- Locks / pins (manual operator overrides).
- Freeze horizon (don't shuffle anything before the cutoff slot).

## Soft constraints (objective penalties)

- Rest slack between a player's matches.
- Disruption from a previous assignment.
- Late finish.
- Court change between consecutive matches for one player.
- Game proximity (min/max gap, opt-in).
- Compact schedule (makespan, finish-by, no-gaps; opt-in).
- Player overlap slack (only when `allow_player_overlap=True`).

## Adding a constraint

1. **Hard** — add a `_build_<name>(self, ...)` helper that takes the
   model and the variable maps from `variables.py`, then call it from
   `_build()`. Hard constraints are unconditional `cp_model` `Add`
   calls.
2. **Soft** — add a penalty term inside `_build()` and accumulate it
   into the objective via `_add_penalty(...)`. Surface a weight knob
   on `SolverOptions` (in `domain/models.py`).
3. Reflect any new knob in `backend/app/schemas.py` and
   `frontend/src/api/dto.ts`.
4. Add a unit test under `src/tests/` that constructs a minimal
   instance and asserts the new behaviour.

## SolverOptions

`domain/models.SolverOptions` collects every weight, time limit, and
feature flag. The frontend's tournament config is mapped onto this
dataclass in `backend/api/schedule.py`. Defaults live alongside the
field declarations.

## Status / extraction

`extraction.py` turns the raw `cp_model.CpSolver` state into a
`ScheduleResult` with assignments, soft-violations, infeasibility
reasons, and solver statistics. The same dataclass is returned to the
HTTP layer and serialised to `ScheduleDTO`.

## Tests

```
cd src && pytest
```

The legacy backend is preserved on disk so parity tests can guard
against subtle regressions when the canonical model is touched.
