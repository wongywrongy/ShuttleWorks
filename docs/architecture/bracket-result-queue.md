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

::: info The recording route is the command endpoint
Result writes go through `POST /tournaments/{tid}/bracket/commands`
(`backend/api/brackets.py::submit_bracket_command`), **not** the legacy
`POST …/bracket/results` (`record_match_result`). The command endpoint
carries the queue's UUID as a first-class idempotency key and checks it
**before** the version guard. The legacy `/results` route still exists for
older callers; the frontend no longer uses it for recording. (The code
comment at `useBracketResultQueue.ts` calls this the "Seam C" command path,
an SP-G1 name — distinct from [data-flow](/architecture/data-flow)'s Seam C,
the still-unwired Operations→Bracket *advancement* edge. This is bracket-owned
recording surfaced through the Operations Run UI, not that edge.)
:::

## The layered idempotency/concurrency stack

A result write passes through four guards, ordered so a duplicate or stale
write records — and advances — nothing.

### 1. Client — UUID dedupe + applied status

`useBracketResultQueue.submit` mints a UUID as the idempotency key,
applies the result optimistically (see below), enqueues the command, then
flushes immediately via `apiClient.recordBracketResultCommand`. `enqueue`
is a no-op if a row with the same id already exists, and a command the
server accepts is marked `applied` so it never reflushes. A double-tap or a
reload-then-retry therefore cannot enqueue — or replay — the same write twice.

### 2. Server guard 1 — command-id replay, before any mutation

`submit_bracket_command` checks the command's UUID against the persisted
`applied_command_ids` set **first**, before the version guard:

```python
# Idempotency guard (MUST precede the seen_version check)
if str(body.id) in session.applied_command_ids:
    return _serialize_session(session)   # replay → current snapshot, no advance
```

A genuine replay of an already-applied command returns the current
tournament snapshot with **200**, advancing nothing. This guard runs first
on purpose: on a replay the downstream version has usually already moved, so
the version guard alone would wrongly 409 — the command-id check short-circuits
before the version is even inspected.

### 3. Server guard 2 — `seen_version`

After the play-unit-exists check (404 if missing), an optional
`seen_version` is compared to the match's current version:

```python
if body.seen_version is not None:
    current_version = session.match_versions.get(body.play_unit_id, 1)
    if body.seen_version != current_version:
        raise ConflictError(match_id=..., current_version=..., seen_version=...)
```

`ConflictError` carries the version fields, so its flat body reports
`error: "stale_version"` (HTTP 409). Because the check runs before
`record_result`, a stale write **records nothing and advances nothing**.

::: info What `seen_version` actually guards
The `version` token lives on the `BracketMatch` row and is bumped only
when **advancement resolves that match's slots** — i.e. when an upstream
winner (or a re-pin) fills its sides. Recording a result does *not* bump
the recorded match's own version. So `seen_version` catches a write against
a match whose sides have changed since the client loaded it. Duplicate
submissions of the *same* command are arbitrated by guard 2 (the command id),
not this version check.
:::

### 4. Advancement — bracket-owned, versions reloaded

Only after the guards pass does `record_result` (pure Python) mutate the
in-memory state and resolve downstream slots. The command id is added to
`applied_command_ids`, then `_persist_result_advancement` writes the recorded
`bracket_results` row and, for each affected downstream match, calls
`update_match` — which bumps that downstream row's `version` —
and `_persist_session_metadata` flushes the applied-id set. The route then
reloads `session.match_versions` so the returned DTO carries the
authoritative tokens, and the next client write starts from a fresh
`seen_version`.

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
flush ──► POST /bracket/commands { id, ..., seen_version }
        │
        ├─ guard 1: command id replayed ─► 200 current snapshot (no advance)
        ├─ guard 2: seen_version stale   ─► 409 stale_version (nothing mutates)
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
