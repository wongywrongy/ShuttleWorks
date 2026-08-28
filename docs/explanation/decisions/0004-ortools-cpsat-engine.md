# ADR 0004 — OR-Tools CP-SAT as the scheduling engine

**Status:** Accepted

## Context

The hard problem in a meet is the schedule: assign every match to a court and a time slot such that no
player is double-booked, courts are never over capacity, players get adequate rest between their
events, the same player's games are reasonably spaced, availability and blackout windows are
respected, and matches already in flight are not moved. These are interacting **combinatorial
constraints** with an objective (minimise makespan / late finishes, honour soft preferences) — not
something a hand-rolled greedy heuristic handles well, especially when an operator needs to re-plan or
repair mid-event in seconds.

We needed a solver that expresses hard and soft constraints declaratively, returns provably good
assignments, supports warm-starting from an existing schedule, and is embeddable with no service of
its own.

## Decision

Use **Google OR-Tools CP-SAT** with an **interval-variable formulation**, packaged as a pure-Python
engine in **`packages/scheduler-core/scheduler_core/`** — no HTTP, no I/O. Its shape:

- **Decision variables** enumerated explicitly (the interval/court/slot formulation).
- A **constraint-plugin architecture** (`engine/constraints/`, each implementing the `Constraint`
  protocol): hard constraints (`court_capacity`, `player_no_overlap`, `availability`,
  `locks_and_pins`, `freeze_horizon`) whose violation is infeasible, and soft penalties
  (`rest`, `game_proximity`, `stay_close`) aggregated in `objective.py`.
- **Configuration-driven** via `EngineConfig` (built from a flat `ScheduleConfig`), so a custom
  adapter can assemble its own plugin set.
- **Repair and warm-start** (`repair.py`, `warm_start.py`) that reuse the `stay_close` penalty to
  prefer keeping the current schedule — the basis of the live proposal/repair pipeline.

The FastAPI layer keeps CP-SAT out of the request path. Since SP-CLOUD-1 the meet batch solve
runs as an **async job** in a child subprocess (`apps/api/src/solve_rail/solve_child.py`) claimed off the
`solve_jobs` queue — a kill is the only reliable cancel for CP-SAT — while the bracket
`schedule-next` routes still solve off the request thread. The solve input stays self-contained
(the full problem rides in the job's `input_snapshot`).

### The determinism knob (SP-CLOUD-1)

The one engine change the solve rail required: `SolverOptions` gained an **additive, optional
`max_deterministic_time`** field (`packages/scheduler-core/scheduler_core/domain/models.py`), and `CPSATScheduler.solve`
sets `solver.parameters.max_deterministic_time` when — and only when — it is provided
(`engine/cpsat_backend.py`). Deterministic time is a host-speed-independent budget: a solve
stopped by it halts at the same search point on any machine, so the result stays reproducible
across hosts, with `time_limit_seconds` demoted to an outer wall-clock backstop. This was a
user-sanctioned exception to the "engine unchanged" rule of the cloud program — everything else
in `scheduler_core` is untouched by SP-CLOUD-1/2.

## Consequences

- **Positive** — constraints are **declarative and composable**; adding a rule is a new plugin, not a
  rewrite. The solver returns optimal/near-optimal assignments with infeasibility reasons.
- **Positive** — warm-start + repair make live re-planning fast and *minimally disruptive*, which the
  proposal pipeline depends on; in-flight matches are pinned, not moved.
- **Positive** — the engine being **pure Python with no I/O** makes it reusable (the scheduler is just
  the worked example) and trivially testable.
- **Negative / cost** — CP-SAT is a heavyweight dependency and a solve can take seconds; the system is
  built around that (the async solve-job rail with polling progress, a top-N candidate pool, SSE
  progress on the bracket round solve, subprocess isolation so cancel is a kill). It also interacts
  with the SQLite-locking tuning noted in [ADR 0003](/explanation/decisions/0003-sqlite-as-primary-persistence).

## See also

- `packages/scheduler-core/scheduler_core/engine/README.md` (engine internals: variables, constraints, soft penalties) · [Meet module](/reference/modules/meet)
