# Bracket schedule streaming (SSE + candidate pool)

Bracket's "schedule next round" gained the same live-solve treatment Meet
already had (SP-F1). The solver runs over Server-Sent Events so the
operator watches CP-SAT climb, then picks from a pool of near-optimal
schedules before anything is written. This page describes the stream, the
candidate pool, and the deliberate solve/commit split.

The shared scheduling core under both modules is documented in
[Scheduling unification](/architecture/scheduling-unification); this page
covers the bracket-specific streaming surface layered on top.

## Two routes, not one

The batch endpoint `POST /tournaments/{tid}/bracket/schedule-next` still
exists and persists in one shot. The streaming work adds two routes that
split solving from persisting:

| Route | Solves | Persists | Returns |
|---|---|---|---|
| `POST .../bracket/schedule-next/stream` | yes | **no** | SSE event stream (ends with the candidate pool) |
| `POST .../bracket/schedule-next/commit` | no | yes | the tournament DTO |

The stream computes a candidate pool but writes nothing. The operator
chooses a candidate, then `commit` persists exactly that choice
(candidate-selection-before-commit). Both routes are operator-gated and
live in `backend/api/brackets.py`.

### The stream — `schedule-next/stream`

`schedule_next_round_stream` mirrors the meet's `POST /schedule/stream`
event shape exactly. It hydrates the bracket session, builds the next
ready wave via `TournamentDriver.prepare_next_round_problem()` (the same
ready-set / `current_slot` computation the batch path uses), then drives
`CPSATScheduler` directly inside a worker thread so it can stream
per-solution progress.

The worker emits events onto a bounded `asyncio.Queue`
(`_SSE_QUEUE_MAX = 512`). The consumer loop serialises each as
`data: {json}\n\n`. The wire event sequence is:

| Event | When | Carries |
|---|---|---|
| `model_built` | once, after `scheduler.build()` | model stats (`numMatches`, `numPlayers`, `numIntervals`, `numVariables`, `courtCount`, …) |
| `phase` | on transition | `presolve` → `search` → `proving` |
| `progress` | each intermediate solution | `solution_count`, `elapsed_ms`, objective |
| `complete` | once, on success | `result`: a `ScheduleNextRoundOut` with the candidate pool |
| `error` | on solver exception | `message` (the literal string `"solver failed"`) |
| `done` | always last | — (stream terminator) |

Phase transitions are precise: `presolve` fires right after
`model_built`; `search` fires on the first `progress` callback; `proving`
is injected by the consumer immediately before `complete`, and **only**
when the solver returned the `optimal` status.

::: info Bounded queue, not a lossy stream
`model_built`, every `phase`, and `done` are emitted as *critical* — they
are always enqueued. `progress` events are best-effort: if the queue is
full they are silently dropped (`QueueFull` is swallowed). Under
backpressure the operator may miss intermediate solution counts, but never
a lifecycle event. The terminal `complete`/`error`/`done` always arrive.
:::

There are two `done`s, and only one is on the wire. The worker's `finally`
puts an internal `{"type": "done"}` on the queue to signal "thread
finished"; the consumer catches it and then emits the real terminal wire
events (`complete` or `error`, followed by the terminal `done`). The
client never sees the internal marker.

Client disconnects are polled, not pushed: when the queue is idle the
consumer calls `await http_request.is_disconnected()` on a one-second
timeout and cancels the solve worker if the client has gone away.

### The candidate pool

`candidate_pool_size` is threaded into the bracket solve and resolved by
`_resolve_candidate_pool_size` in this precedence:

1. the `candidate_pool_size` query parameter (when `>= 1`), else
2. the persisted `bracket_session.candidate_pool_size` (when `>= 1`), else
3. the shared default, `_DEFAULT_CANDIDATE_POOL_SIZE = 5`.

The resolved size is passed straight to `scheduler.solve(...,
candidate_pool_size=pool_size)`. The kept near-optimal solutions are
serialised by `_candidates_from_schedule_result` into
`BracketScheduleCandidate` rows — each a `solution_id`, an
`objective_score`, a `found_at_seconds`, and the list of assignment cells
(`play_unit_id`, `slot_id`, `court_id`, `duration_slots`). `candidates[0]`
is the best one found. This mirrors the meet's `ScheduleCandidate` in the
bracket's snake_case wire dialect. The batch `schedule-next` route leaves
`candidates` empty to preserve its existing wire shape.

### The commit — `schedule-next/commit`

`commit_next_round` takes a `CommitRoundIn` (the chosen candidate's
assignment cells) and persists them into the session blob. It
re-validates every cell against the live state before writing:

- the `play_unit_id` must exist (404 otherwise), and
- it must currently be in `find_ready_play_units(state)` — unassigned,
  unplayed, both sides resolved (409 otherwise).

So a stale or foreign payload cannot pin a match that is already played or
already scheduled. This re-check is the teeth behind the
solve-then-commit split: the stream's candidate is a *proposal*, and the
commit re-proves it against the round's current reality.

## Data flow

```
operator clicks "Schedule next round (N)"
            │
   POST .../schedule-next/stream          ← solves, persists NOTHING
            │
   SSE: model_built → phase → progress… → complete{candidates} → done
            │
   operator picks a candidate in the modal
            │
   POST .../schedule-next/commit{assignments}   ← re-validates + persists
            │
   tournament DTO (re-fetched into the view)
```

## The frontend surface

The operator entry point is the **`Schedule next round (N)`** button in
`BracketViewHeader.tsx`, shown on the schedule and live views whenever
there are matches ready to schedule. `N` is the count of ready play units,
computed client-side with the same predicate as the backend's
`find_ready_play_units` so the button never appears when the solver would
do nothing.

Clicking it opens `BracketScheduleModal.tsx`, which walks three phases:

- **solving** — opens the SSE stream
  (`api.scheduleNextWithProgress`) and renders live progress: current
  phase, solutions-found count, match count, and elapsed seconds.
- **choosing** — once `complete` lands with a usable result
  (`optimal`/`feasible` and at least one candidate), it lists the
  candidates. Each row shows its objective score, when it was found, and —
  for non-best candidates — how many cells moved versus the best
  candidate, so the operator can favour a low-disruption pick.
- **committing** — selecting a candidate posts it via `api.commitRound`,
  toasts the count of scheduled matches, and re-fetches the bracket.

The client (`scheduleNextBracketRoundWithProgress` in `api/client.ts`)
talks to the stream with a raw `fetch` + `ReadableStream` reader and
parses `data:` frames by hand — not the browser `EventSource`. It posts to
`${API_BASE_URL}/.../schedule-next/stream`, i.e. the backend URL directly.

::: warning Live progress needs the backend directly in dev
The Vite dev proxy (`/api` → `http://localhost:8000` in
`frontend/vite.config.ts`) buffers `text/event-stream` responses, so live
progress only streams when the frontend talks to the backend URL directly.
In production the frontend already points at the backend URL, so the
stream flows. In local dev, point `API_BASE_URL` at the backend rather
than through the proxy to see incremental progress; through the proxy the
solve still completes but progress arrives in one batch at the end.
:::

## What stays bracket-specific — and why

The streaming *mechanism* is copied from Meet deliberately rather than
extracted: both endpoints drive `CPSATScheduler` directly for the same
reason (per-solution progress callbacks are a streaming concern, not a
second solver), but they sit over different domain models — Meet's
position grid versus Bracket's draw structure and ready-wave advancement
(see [Scheduling unification](/architecture/scheduling-unification)). The
candidate DTOs differ in case convention (`camelCase` for Meet, snake_case
for Bracket) because each preserves its module's existing wire contract.
The shared part — the engine and the parameter builder — is the part that
was actually unified; the SSE envelope is a mirrored shape, not shared
code.

## See also

- [Scheduling unification](/architecture/scheduling-unification) — the shared CP-SAT core under both modules
- [ADR 0006 — Unify the scheduling core; do not merge the match record](/decisions/0006-unified-scheduling-core)
- [Bracket module](/modules/bracket) · [Meet module](/modules/meet)
