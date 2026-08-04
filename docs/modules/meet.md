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
  constraints, run as an **async solve job** (submit + poll; the HUD shows `queued` then the solve
  phases) with a top-N candidate pool you can swap into without re-solving.
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
out. Since SP-CLOUD-1 the transform runs as an **async job**: the full problem is snapshotted at
submit into the `solve_jobs` queue, a worker executes it in a killable child subprocess, and the
client polls the job (the legacy synchronous `POST /schedule` and its SSE stream answer
`410 Gone`).

```text
INTAKE                         ENGINE                                 EMIT
Roster / Matches / Config  ─▶  POST …/solve-jobs (202) ─▶ worker  ─▶  ScheduleDTO (job.result)
  tournamentStore                input_snapshot + params                tournamentStore.setSchedule
  { config, players,             → solve_child subprocess               → scheduleFinalized edge
    matches }                    → adapters/badminton.py                → Operations seeds the
                                   prepare_solver_input()                  live court layout
                                 → CPSATScheduler solve
                                 → result_to_dto()          ◀── client polls GET …/solve-jobs/{id}
```

**1. Roster intake.** The `roster/` (position grid), `matches/` (the matches spreadsheet), and
`tournaments/` + `TournamentSetupPage` (Configuration) surfaces author the three solver inputs and
hold them in `tournamentStore`: a `TournamentConfig`, a `PlayerDTO[]`, and a `MatchDTO[]`.

**2. CP-SAT solve (as a job).** The frontend submits `{ config, players, matches,
previousAssignments }` (the `GenerateScheduleRequest`) to `POST /tournaments/{id}/solve-jobs` with
a client-minted `Idempotency-Key` and polls the job to a terminal status (`apiClient.runSolveJob`;
a reload mid-solve re-adopts the active job). The route (`backend/api/solve_jobs.py`) persists the
input snapshot plus determinism params — seed, one search worker, `max_deterministic_time` — and a
worker (`services/solve_worker.py`) claims the job and executes it in a child subprocess
(`services/solve_child.py`), where the DTO ↔ engine conversion still lives in
`backend/adapters/badminton.py` (`prepare_solver_input`, `result_to_dto`). The subprocess is what
makes Cancel real — CP-SAT cannot be preempted in-process, so cancel kills the child. The shared
engine is the same `scheduler_core` core that Bracket schedules through — see
[Scheduling unification](/architecture/scheduling-unification) and
[ADR 0006](/decisions/0006-unified-scheduling-core).

**3. Schedule emit.** `result_to_dto` returns a **`ScheduleDTO`** — the court/slot assignments plus a
candidate pool of near-optimal alternatives — which lands in `job.result`. The polling client
writes it via `tournamentStore.setSchedule`, which is the **`scheduleFinalized`** edge that
Operations reacts to (Seam A). Infeasibility and run-time failure live *inside* the job resource
(`job.error`), not as transport errors; progress is honest-but-coarse job polling (the HUD gains a
`queued` phase) rather than the retired SSE event stream.

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
| **Backend routes** | `/tournaments/{id}/solve-jobs*` (submit / list / get / cancel — the async solve rail), `/schedule/validate`, `/schedule/warm-restart` (`/schedule` + `/schedule/stream` are `410 Gone`); and under `/tournaments/{id}/schedule/`: `advisories`, `proposals/*`, `suggestions/*`, `director-action` |
| **`apiClient` methods** | `submitSolveJob`, `getSolveJob`, `listSolveJobs`, `cancelSolveJob`, `runSolveJob`, `validateMove`, `createWarmRestartProposal`, `createRepairProposal`, `createManualEditProposal`, `createDirectorActionProposal`, `commitProposal`, `cancelProposal`, `getProposal`, `getAdvisories`, `getSuggestions`, `applySuggestion`, `dismissSuggestion` |
| **Store slices** | the editable document in `tournamentStore` (config, roster, matches, schedule, `scheduleVersion` + history); the review pipeline in `uiStore` (`activeProposal`, `advisories`, `suggestions`) |
| **Frontend code** | `products/meet/` — `roster/`, `matches/`, `tournaments/` + `TournamentSetupPage` (Configuration), `schedule/` + `SchedulePage` (Plan), `MatchControlCenterPage` + `control-center/` (Run), `suggestions/`, `director/`, `setup/`, `exports/` |
| **Backend services** | `adapters/badminton.py` (DTO ↔ engine boundary), `services/solve_jobs.py` + `solve_worker.py` + `solve_runner.py` + `solve_child.py` (the job rail), `services/suggestions_worker.py` (background re-optimisation), `services/schedule_impact.py` (impact scoring) |

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

The solve input is still **self-contained**: each submit re-serialises the whole problem into the
job's `input_snapshot`, so the worker never reads live tournament tables and a job re-run
reproduces the original solve. This is simple and robust at meet scale; it is noted as a perf
consideration only for very large problems.

## See also

- [Meet → Operations contract](/contracts/meet-operations) — Seam A, the `ScheduleDTO` handoff in detail.
- [Operations](/modules/operations) — the live-ops module that owns the Plan / Run boards and the match-state machine.
- [Data flow](/architecture/data-flow) — how the command / proposal pipelines and cross-module seams fit together.
- [Scheduling unification](/architecture/scheduling-unification) and [ADR 0006](/decisions/0006-unified-scheduling-core) — the shared `scheduler_core` engine Meet and Bracket both solve through.
- [ADR 0004](/decisions/0004-ortools-cpsat-engine) — why CP-SAT, and [How to add a CP-SAT constraint](/how-to/add-a-cpsat-constraint).
- [ADR 0001](/decisions/0001-four-module-split) — the four-module split that makes Meet a Tier-1 engine.
