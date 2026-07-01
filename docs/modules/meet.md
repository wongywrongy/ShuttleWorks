# Meet

**Tier-1, user-enableable module.** Meet is the meet-scheduling engine — the single-day
inter-school dual / tri-meet cockpit where the same players play several events back-to-back and a
CP-SAT optimiser assigns courts and time slots. This page is for engineers working on the scheduling
engine itself, its roster/matches intake surfaces, or anything downstream that consumes the schedule
Meet produces.

## What it does

- **Roster authoring** — schools / groups and their players, edited inline (the position grid) and
  via bulk import.
- **CP-SAT-optimised court assignments** across courts, slots, players, rest, and game-spacing
  constraints, with **live SSE solver progress** (phase, current objective, optimality gap) and a
  top-N candidate pool you can swap into without re-solving.
- **The live-planning pipeline** — every change (re-plan, repair, drag-to-reschedule, director
  action) is staged as a **proposal** with a full impact diff *before* it commits:
  optimistic-concurrency-locked, atomic swap, rolling audit history. Plus **advisories** (the
  live-ops alert feed) and a background **suggestions** inbox of pre-computed re-optimisations.

:::info Where the Plan / Run surfaces live
Meet owns the **intake** information architecture — Roster, Matches, and Configuration. The
day-of **Plan** and **Run** boards (formerly *Courts* / *Live*) are owned by the
[Operations module](/modules/operations), not Meet, even though their single-engine rendering
still physically resides under `products/meet/`. See [Where Meet physically lives](#where-meet-physically-lives)
below.
:::

## The intake → engine → emit anatomy

Meet is, at heart, a stateless transform: roster + matches + config go in, a solved schedule comes
out. The solve carries the whole problem in the request body — there is no server-side scheduling
state.

```text
INTAKE                         ENGINE                              EMIT
Roster / Matches / Config  ─▶  POST /schedule (or /schedule/stream) ─▶ ScheduleDTO
  tournamentStore                adapters/badminton.py                  tournamentStore.setSchedule
  { config, players,             prepare_solver_input()                 → scheduleFinalized edge
    matches }                    → scheduler_core ScheduleRequest        → Operations seeds the
                                 → CPSATScheduler solve (threadpool)        live court layout
                                 → result_to_dto()
```

**1. Roster intake.** The `roster/` (position grid), `matches/` (the matches spreadsheet), and
`tournaments/` + `TournamentSetupPage` (Configuration) surfaces author the three solver inputs and
hold them in `tournamentStore`: a `TournamentConfig`, a `PlayerDTO[]`, and a `MatchDTO[]`.

**2. CP-SAT solve.** The frontend posts `{ config, players, matches, previousAssignments }` to
`POST /schedule` (one-shot) or `POST /schedule/stream` (Server-Sent Events). The route surface in
`backend/api/schedule.py` is deliberately thin — DTO ↔ engine conversion lives in
`backend/adapters/badminton.py` (`prepare_solver_input`, `solver_options_for`,
`candidate_pool_size_for`, `result_to_dto`). It builds a `scheduler_core` `ScheduleRequest` and runs
the CPU-bound `CPSATScheduler` solve in a threadpool (`loop.run_in_executor`) so the async event loop
stays responsive. The shared engine is the same `scheduler_core` core that Bracket schedules through —
see [Scheduling unification](/architecture/scheduling-unification) and
[ADR 0006](/decisions/0006-unified-scheduling-core).

**3. Schedule emit.** `result_to_dto` returns a **`ScheduleDTO`** — the court/slot assignments plus a
candidate pool of near-optimal alternatives. The store writes it via `tournamentStore.setSchedule`,
which is the **`scheduleFinalized`** edge that Operations reacts to (Seam A). The streaming variant
emits typed SSE events along the way — `model_built` → `phase` (presolve / search / proving) →
`progress` (each intermediate solution) → `complete` → `done`.

:::tip Feasibility without a solve
Drag-to-reschedule needs an answer in milliseconds, so it does **not** invoke CP-SAT.
`validateMove` posts to the pure-Python `POST /schedule/validate`, which returns a feasibility
verdict for one proposed target — no solver, no proposal yet.
:::

## The proposal, repair, and suggestions pipeline

Nothing mutates the committed schedule directly. Each kind of change becomes a server-stashed
**proposal**, reviewed against a full impact diff, then committed atomically — a two-phase commit
guarded by optimistic concurrency (a `commit` returns `409` if the live schedule advanced since the
proposal was built, forcing a re-review).

| Trigger | apiClient method | Route |
| --- | --- | --- |
| Re-plan from current state | `createWarmRestartProposal` | `POST /tournaments/{id}/schedule/proposals/warm-restart` |
| Repair a disruption | `createRepairProposal` | `POST /tournaments/{id}/schedule/proposals/repair` |
| Drag-to-reschedule (pin one match) | `createManualEditProposal` | `POST /tournaments/{id}/schedule/proposals/manual-edit` |
| Director action (`delay_start`, `insert_blackout`, `remove_blackout`) | `createDirectorActionProposal` | `POST /tournaments/{id}/schedule/director-action` |
| Commit / discard / fetch | `commitProposal` / `cancelProposal` / `getProposal` | `POST` `…/proposals/{pid}/commit` · `DELETE`/`GET` `…/proposals/{pid}` |

Two read-only feeds sit alongside the proposal flow:

- **Advisories** (`getAdvisories` → `GET …/schedule/advisories`, polled on a 15 s cadence) are the
  live-ops alert heuristics computed in `backend/api/schedule_advisories.py`: `overrun`, `no_show`,
  `running_behind`, and the director-aware `start_delay_detected` / `approaching_blackout`. An
  advisory carries a suggested follow-up action (e.g. a repair or warm-restart) but commits nothing.
- **Suggestions** (`getSuggestions` / `applySuggestion` / `dismissSuggestion`) are pre-computed
  re-optimisation proposals stamped by the background `services/suggestions_worker.py`. The worker
  consumes `OPTIMIZE` / `REPAIR` / `PERIODIC` (90 s heartbeat) trigger events and fires speculative
  solves, with cooldown dedup and in-flight cancellation so a stale solve is superseded before the
  operator ever sees it. `applySuggestion` commits the underlying proposal atomically; `dismiss`
  cancels it. Impact scoring for the diff lives in `services/schedule_impact.py`.

## What it owns

| Kind | Owned |
| --- | --- |
| **Nav surfaces** | Roster · Matches · Configuration (`ownedSegments: ['roster', 'matches', 'setup']`) |
| **Backend routes** | `/schedule`, `/schedule/stream`, `/schedule/validate`, `/schedule/warm-restart`; and under `/tournaments/{id}/schedule/`: `advisories`, `proposals/*`, `suggestions/*`, `director-action` |
| **`apiClient` methods** | `generateSchedule`, `generateScheduleWithProgress`, `validateMove`, `createWarmRestartProposal`, `createRepairProposal`, `createManualEditProposal`, `createDirectorActionProposal`, `commitProposal`, `cancelProposal`, `getProposal`, `getAdvisories`, `getSuggestions`, `applySuggestion`, `dismissSuggestion` |
| **Store slices** | the editable document in `tournamentStore` (config, roster, matches, schedule, `scheduleVersion` + history); the review pipeline in `uiStore` (`activeProposal`, `advisories`, `suggestions`) |
| **Frontend code** | `products/meet/` — `roster/`, `matches/`, `tournaments/` + `TournamentSetupPage` (Configuration), `schedule/` + `SchedulePage` (Plan), `MatchControlCenterPage` + `control-center/` (Run), `suggestions/`, `director/`, `setup/`, `exports/` |
| **Backend services** | `adapters/badminton.py` (DTO ↔ engine boundary), `services/suggestions_worker.py` (background re-optimisation), `services/schedule_impact.py` (impact scoring) |

These owned facts are pinned by the `meetContract` descriptor in
`platform/contracts/moduleContract.ts`, whose colocated test asserts every endpoint by function
reference and every DTO against the wire vocabulary — so the table above cannot silently drift from
the code.

## What it produces

- **`ScheduleDTO`** — the solved schedule (court / slot assignments + candidate pool). This is the
  payload of **[Seam A: Meet → Operations](/contracts/meet-operations)**; Operations seeds its live
  court layout from it. The store edge it emits is **`scheduleFinalized`** (= `tournamentStore.setSchedule`).

## What it consumes

- **`TournamentConfig`, `PlayerDTO`, `MatchDTO`** — the three inputs it solves over.
- **`MatchStateDTO`** — live match states (owned by Operations) are read back as solve inputs via
  `getMatchStates`, so a re-plan respects matches already called / started / finished.
- The shared **`/state`** blob (`getTournamentState` / `putTournamentState`) — consumed, not owned;
  it co-lives with control-plane CRUD in the `tournaments` router. See
  [Unified configuration](/architecture/unified-configuration).

Meet **reacts to nothing cross-module** (`reactsTo: []`) — it reads live state on demand as a solve
input rather than subscribing to it.

## Where Meet physically lives

The `schedule` / `live` segments that render the **Plan** and **Run** boards are Operations-owned by
contract, but their *single-engine* rendering still resides inside `products/meet/`:
`MeetProduct.tsx` maps the `schedule` tab to `SchedulePage` and the `live` tab to
`MatchControlCenterPage`. When **both** Meet and Bracket are enabled, `ModuleOutlet` routes those
segments to the unified `OperationsProduct` instead, so the meet-resident surfaces serve only the
meet-only workspace. The first-class `products/operations/` home now exists — this meet-side residue
is the remaining structural overlap, not a contradiction of it. See [Operations](/modules/operations).

The `/schedule*` routes are intentionally **stateless**: each solve re-serialises the whole problem
in the request body. This is simple and robust at meet scale; it is noted as a perf consideration
only for very large problems.

## See also

- [Meet → Operations contract](/contracts/meet-operations) — Seam A, the `ScheduleDTO` handoff in detail.
- [Operations](/modules/operations) — the live-ops module that owns the Plan / Run boards and the match-state machine.
- [Data flow](/architecture/data-flow) — how the command / proposal pipelines and cross-module seams fit together.
- [Scheduling unification](/architecture/scheduling-unification) and [ADR 0006](/decisions/0006-unified-scheduling-core) — the shared `scheduler_core` engine Meet and Bracket both solve through.
- [ADR 0004](/decisions/0004-ortools-cpsat-engine) — why CP-SAT, and [How to add a CP-SAT constraint](/how-to/add-a-cpsat-constraint).
- [ADR 0001](/decisions/0001-four-module-split) — the four-module split that makes Meet a Tier-1 engine.
