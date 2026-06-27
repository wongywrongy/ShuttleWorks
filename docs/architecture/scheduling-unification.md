# Scheduling unification (Meet · Bracket)

Meet and Bracket are the same kind of problem — assign matches to courts
and time slots under constraints — solved by the same CP-SAT engine. They
originated as separate apps, which left some duplicated infrastructure
above the engine. This page describes what is shared, what stays
module-specific, and why.

## The engine was already shared

Both modules build a `scheduler_core.domain.models.ScheduleRequest`
(players, courts, a time window, matches) and bottom out at the same
solver (`scheduler_core`) with the same constraint plugins
(`court_capacity`, `player_no_overlap`, `availability`, `locks_and_pins`,
`freeze_horizon`, `rest`, `game_proximity`, `objective`). See
[ADR 0004](/decisions/0004-ortools-cpsat-engine) for the engine itself.

Critically, **neither lineup positions (Meet) nor advancement (Bracket)
is a CP-SAT constraint.** Both modules *pre-resolve* their domain logic
and hand fully-formed matches to the engine:

- **Meet** generates matches that already carry their lineup position
  (`eventRank`, e.g. `MS1`); the side rosters are fixed before the solve.
- **Bracket** schedules one *wave* of "ready" play units at a time — the
  `TournamentDriver` advances `current_slot` past completed rounds and
  only feeds matches whose sides are concrete. Advancement happens
  between solves, not inside one.

So the engine is already module-agnostic. The "different configurations
of the same problem" the two modules need are expressed as *which
matches and players* they hand in — not as separate solvers.

## The shared seam

Two things above the engine were genuinely duplicated and are now shared:

### 1. One scheduling-parameter builder

`backend/services/scheduling/params.py` owns the single mapping from the
structural scheduling parameters — courts, time window (`total_slots`),
slot duration, rest, breaks, court closures, freeze horizon — onto a
`ScheduleConfig`:

```python
from services.scheduling.params import SchedulingParams, build_schedule_config

config = build_schedule_config(
    SchedulingParams(court_count=4, total_slots=20, interval_minutes=15)
)
```

- **Meet** (`adapters/badminton.schedule_config_from_dto`) derives the
  structural numbers from a `TournamentConfig` (a day window + interval),
  calls `build_schedule_config`, then layers its meet-specific solver
  *objective weights* (disruption / proximity / compact penalties) on top
  with `dataclasses.replace`. Those weights are meet tuning, not shared
  scheduling parameters, so they stay in the meet adapter.
- **Bracket** (`api/brackets._hydrate_session` and draw creation) calls
  `build_schedule_config` directly with the core few fields.

### 2. One CP-SAT invocation

Both batch paths invoke the solver through the engine's single entry,
`scheduler_core.schedule(request, *, options=None, candidate_pool_size=0)`:

- **Meet** `POST /schedule` calls it (with the candidate pool for the
  near-optimal collector).
- **Bracket** `TournamentDriver` already called it.

The streaming meet path (`POST /schedule/stream`) drives `CPSATScheduler`
directly instead — it needs per-solution progress callbacks, a streaming
concern, not a second solver.

## Data flow

```
Meet TournamentConfig ┐                              ┌ Bracket session
   schedule_config_   │                              │   _hydrate_session
   from_dto           ▼                              ▼   / draw creation
                build_schedule_config(SchedulingParams)  ← one builder
                              │
                       ScheduleConfig
                              │
        ScheduleRequest (players, matches, config)
                              │
            scheduler_core.schedule(...)               ← one CP-SAT entry
                              │
                        ScheduleResult
```

## What stays module-specific — and why

The match *record* is **not** merged into one model. Each module persists
matches differently, and those differences are exactly the protected
structures:

- **Meet** owns the **position grid** — `eventRank`, `rankCounts`,
  `eventOrder`. Match rosters live in the `tournaments.data` blob; the
  `matches` table holds court/slot/status; `match_states` holds the
  score (two integer points, `sideA`/`sideB`).
- **Bracket** owns the **draw structure** — `BracketSlot` (seeded slots /
  feeders), `dependencies`, round/match indices, and the advancement
  cascade. It persists fully relationally in `bracket_matches` /
  `bracket_results`, where a result is a `winner_side` plus an opaque
  format-specific JSON `score`, fused to advancement.

These two persistence shapes carry different score *semantics* (meet
points vs. bracket winner+advancement) behind different wire DTOs.
Collapsing them into one table or one value object would either contort
one domain into the other or change the frontend contract — and would
swallow the protected position grid / draw structure. The shared,
genuinely-common core (participants, court, slot, status, score) is
therefore documented as a contract each model maps to, not as new code.
See [ADR 0006](/decisions/0006-unified-scheduling-core) for the decision
and the full projection table.

## See also

- [ADR 0004 — OR-Tools CP-SAT engine](/decisions/0004-ortools-cpsat-engine)
- [ADR 0006 — Unified scheduling core, non-merged match record](/decisions/0006-unified-scheduling-core)
- [Bracket schedule streaming](/architecture/bracket-schedule-streaming) — the bracket's SSE + candidate-pool surface over this core
- [Meet module](/modules/meet) · [Bracket module](/modules/bracket)
