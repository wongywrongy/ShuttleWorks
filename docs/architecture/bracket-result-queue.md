# Bracket result command queue

Recording a bracket result — picking a winner, entering a set-by-set
score — routes through an **idempotent client command queue** with an
optimistic UI and inline conflict surfacing. This mirrors the operator
command queue Meet already uses, but the two match models stay separate
([ADR 0006](/decisions/0006-unified-scheduling-core)): Bracket gets its
own parallel queue rather than a shared one. This page describes the
parallel queue, the layered idempotency/concurrency stack, and why
advancement stays bracket-owned.

See [ADR 0007](/decisions/0007-bracket-result-command-queue) for the
decision.

## Why a parallel queue, not the shared one

Meet's queue (`frontend/src/lib/commandQueue.ts`) carries operational
verbs and settles each command against a small status/version envelope.
Bracket's success response is a different shape: the result route returns
the **full tournament DTO** (`BracketTournamentDTO`) — every play unit,
assignment, and result post-write, because a single result can cascade
advancement across the draw. Forcing both into one discriminated union
would couple two genuinely different ok-outcomes, so Bracket gets a
parallel module — `frontend/src/lib/bracketCommandQueue.ts` — that reuses
the same IndexedDB plumbing pattern rather than the same store.

The bracket queue opens its own database (`scheduler-bracket-result-queue`,
object store `bracket-results`), distinct from the meet queue's. A queued
command is a `BracketResultCommand`: a client-generated UUID, the target
play-unit (match) id, `winnerSide`, an optional set-by-set `score`, and
the `seenVersion` the client last observed.

## The layered idempotency/concurrency stack

A result write passes through four guards, ordered so a duplicate or stale
write records — and advances — nothing.

### 1. Client — UUID dedupe + applied status

`useBracketResultQueue.submit` mints a UUID as the idempotency key,
applies the result optimistically (see below), enqueues the command, then
flushes immediately. `enqueue` is a no-op if a row with the same id
already exists, and a command that the server accepts is marked `applied`
so it never reflushes. A double-tap or a reload-then-retry therefore
cannot enqueue — or replay — the same write twice.

### 2. Server guard 1 — `seen_version`, before any mutation

`RecordResultIn` carries an optional `seen_version`. The result route
(`POST /tournaments/{tid}/bracket/results`,
`backend/api/brackets.py::record_match_result`) checks it **first**,
before the already-recorded or advancement paths:

```python
if body.seen_version is not None:
    current_version = session.match_versions.get(body.play_unit_id, 1)
    if body.seen_version != current_version:
        raise ConflictError(match_id=..., current_version=..., seen_version=...)
```

`ConflictError` carries the version fields, so its flat body reports
`error: "stale_version"` (HTTP 409). Because the check runs before
`record_result`, a stale write **records nothing and advances nothing** —
this is the guard that prevents a double-advance. Omitting `seen_version`
keeps the legacy un-guarded behaviour for older callers.

::: info What `seen_version` actually guards
The `version` token lives on the `BracketMatch` row and is bumped only
when **advancement resolves that match's slots** — i.e. when an upstream
winner (or a re-pin) fills its sides. Recording a result does *not* bump
the recorded match's own version (`record_result` writes only the
`bracket_results` row). So `seen_version` catches a write against a match
whose sides have changed since the client loaded it; it is *not* what
arbitrates two operators recording the *same* match — guard 3 is.
:::

### 3. Server guard 2 — already-recorded

If a result already exists for the match, an **exact replay** (same
winner, slot, walkover flag, and score) is popped and re-recorded — an
idempotent no-op for a retried-after-success write. A **non-exact**
re-record is rejected with a bare-`detail` 409 carrying no `error` field;
the client maps any 409 that is not `stale_version` to `conflict`, a
permanent rejection with no retry.

### 4. Advancement — bracket-owned, versions reloaded

Only after the guards pass does `record_result` (pure Python) mutate the
in-memory state and resolve downstream slots.
`_persist_result_advancement` writes the recorded `bracket_results` row
and, for each affected downstream match, calls `update_match` — which
bumps that downstream row's `version`. The route then reloads
`session.match_versions` so the returned DTO carries the authoritative
tokens, and the next client write starts from a fresh `seen_version`.

## Optimistic UI and conflict surfacing

`applyOptimisticResult` (`frontend/src/products/bracket/optimisticResult.ts`)
splices a provisional `ResultDTO` into the tournament DTO so the operator
sees the result land instantly, replacing the old poll. It deliberately
does **not** simulate advancement — downstream slot resolution stays
bracket-owned and arrives only with the committed or refetched DTO.

`useBracketResultQueue` routes the outcome:

| Outcome | Source | Client action |
|---|---|---|
| `ok` | 200 + full DTO | `onSettled(dto)` — replace the view-model authoritatively |
| `staleVersion` | 409 `error: stale_version` (guard 1) | surface inline + refetch the bracket |
| `conflict` | any other 409 (guard 3) | surface inline + refetch |
| `networkError` | anything else | leave the command `pending`; the next flush retries |

`MatchDetailPanel` injects the handlers and renders a conflict as an
inline `BracketInlineNotice` next to the match, so a stale or rejected
write is explained in place rather than swallowed.

## Data flow

```
operator records result
        │
applyOptimisticResult ──► view-model shows provisional result (no advancement)
        │
enqueue(command, UUID)  ──► IndexedDB: scheduler-bracket-result-queue
        │
flush ──► POST /bracket/results { ..., seen_version }
        │
        ├─ guard 1: seen_version stale ─► 409 stale_version (nothing mutates)
        ├─ guard 2: already recorded   ─► exact replay = no-op · else 409 conflict
        └─ guards pass ─► record_result + advancement ─► bump downstream versions
                                  │
                          reload match_versions
                                  │
                       200 full BracketTournamentDTO ─► onSettled
```

## What stays module-specific — and why

The match record is **not** merged. Meet records points
(`match_states.score_side_a/b`) behind a status/version envelope; Bracket
records a `winner_side` plus an opaque format-specific JSON score, fused
to the advancement cascade, and returns the whole tournament. The two
queues share a *pattern* (UUID idempotency, IndexedDB persistence,
optimistic apply, version-checked writes) but not a type — the same
trade-off [ADR 0006](/decisions/0006-unified-scheduling-core) made for the
scheduling core. No migration was needed: `bracket_matches` already had
its `version` column.

## See also

- [ADR 0007 — Bracket results through the command queue](/decisions/0007-bracket-result-command-queue)
- [ADR 0006 — Unified scheduling core, non-merged match record](/decisions/0006-unified-scheduling-core)
- [Scheduling unification](/architecture/scheduling-unification)
- [Bracket module](/modules/bracket) · [Meet module](/modules/meet)
