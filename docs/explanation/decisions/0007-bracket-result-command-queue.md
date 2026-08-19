# ADR 0007 — Bracket results through the command queue

**Status:** Accepted

## Context

Meet already records match writes through an idempotent client command
queue: a UUID dedupes retries, IndexedDB survives reloads, and an
optimistic UI replaces polling. Bracket result recording did not have
this — a winner pick or a score entry was a bare POST, vulnerable to
double-taps, lost writes on reload, and a poll-driven UI.

Bringing Bracket to parity ran into three facts:

1. **The ok-outcomes differ in shape.** Meet's queue settles each command
   against a small status/version envelope. Bracket's result route
   returns the **full tournament DTO** (`BracketTournamentDTO`), because a
   single result can cascade advancement across the draw. A shared
   discriminated union would couple two genuinely different success
   shapes.

2. **The match models are already kept separate** by
   [ADR 0006](/explanation/decisions/0006-unified-scheduling-core) — Meet stores
   points behind a status/version envelope; Bracket stores `winner_side` +
   opaque JSON score, fused to advancement. That decision stands.

3. **`bracket_matches` already had a `version` column** (default 1),
   intended for optimistic concurrency. Advancement already bumped it on
   each slot resolution via `update_match`. The token existed; nothing
   surfaced it to the client.

## Decision

**Give Bracket the same three guarantees as Meet — idempotency,
optimistic concurrency, reload resilience — via a parallel queue, without
merging the match models.**

Shared (implemented):

- **A parallel queue** — `frontend/src/lib/bracketCommandQueue.ts` with
  its own IndexedDB database (`scheduler-bracket-result-queue`). It reuses
  Meet's queue *pattern* (UUID idempotency key, persisted pending
  commands, immediate best-effort flush, `applied` status so a row never
  reflushes) but carries a bracket `result` command and settles against
  the full-DTO ok-outcome. `useBracketResultQueue` + `applyOptimisticResult`
  add the optimistic apply and inline conflict surfacing in
  `MatchDetailPanel`.
- **An optional `seen_version` on `RecordResultIn`.** The result route
  (`backend/api/brackets.py`) checks it **before** any mutation: a token
  that doesn't match the match's current `version` raises `ConflictError`,
  which serialises to HTTP 409 `error: stale_version`. A stale write
  therefore records nothing and advances nothing. Omitting `seen_version`
  preserves the legacy un-guarded path. **No migration** — the `version`
  column already existed.

Not merged (deliberate):

- The two queues, command shapes, and match tables stay separate. The
  optimistic apply **does not simulate advancement** — downstream slot
  resolution stays bracket-owned and arrives only with the committed or
  refetched DTO. Bracket's score stays an opaque JSON blob + `winner_side`;
  Meet's stays integer points. The queues share a pattern, not a type.

### The 409 flavours map to distinct guards

| Flavour | Guard | Recovery |
|---|---|---|
| `stale_version` | `seen_version` ≠ current match `version` (checked first) | refetch + retry |
| `conflict` | result already recorded, non-exact re-record (bare-`detail` 409) | permanent; no retry |

An exact replay of an already-recorded result is popped and re-recorded —
an idempotent no-op, not a conflict.

::: warning Mind what `seen_version` guards
The `version` token bumps only when advancement resolves a match's slots,
not when its result is recorded. So `seen_version` rejects a write against
a match whose sides changed since load; two operators recording the *same*
match are arbitrated by the already-recorded guard, not the version check.
:::

## Consequences

- **Positive** — bracket result writes are idempotent and reload-safe; a
  double-tap, a flaky network, or a reload-then-retry never double-records
  or double-advances. The operator sees the result land instantly.
- **Positive** — purely additive on the backend: an optional field, an
  early guard, and a token already in the schema. Legacy callers are
  unaffected; no migration.
- **Positive** — a stale or rejected write is surfaced inline at the
  match, not swallowed.
- **Trade-off** — two near-identical queue modules now exist
  (`commandQueue.ts` and `bracketCommandQueue.ts`). We judged a shared
  abstraction worse: it would have to span two different ok-outcomes and
  two different match models, reintroducing exactly the coupling ADR 0006
  rejected. The duplication is honest; the unification would be forced.

## See also

- [Bracket result command queue](/explanation/architecture/bracket-result-queue) (the seam) ·
  [ADR 0006 — Unified scheduling core, non-merged match record](/explanation/decisions/0006-unified-scheduling-core)
- [Bracket module](/reference/modules/bracket) · [Meet module](/reference/modules/meet)
