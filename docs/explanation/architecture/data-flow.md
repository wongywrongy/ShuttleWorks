# Data flow

This page traces how data moves **between** modules and **out** to operators and the public
display. There are three wired cross-module seams in the module graph (plus the Entries commit
seam, which is a different shape — see below), a match-state machine, an idempotent command
pipeline, and primary-store persistence. The per-seam detail lives in [Module contracts](/reference/contracts/);
this page is the whole-system picture.

## The three wired seams

The module-architecture design names four seams; **three are wired** and one is deliberately left
unwired.

| Seam | Direction | Named edge | Transport today | Payload | Status |
| --- | --- | --- | --- | --- | --- |
| **A** | Meet → Operations | `scheduleFinalized` | store-subscription edge (`tournamentStore.setSchedule`) + ~5 s match-state poll | `ScheduleDTO` → `MatchStateDTO` | **wired** |
| **B** | Bracket → Operations | `drawGenerated` | ~2.5 s poll (`GET …/bracket`) | `BracketTournamentDTO` | **wired** |
| **C** | Operations → Bracket (advancement) | *(none)* | none — advancement is intra-bracket | none | **unwired, out of scope** |
| **D** | Operations → Display | `matchStateChanged` | dual poll: ~5 s match-state + ~10 s tournament-state | `MatchStateDTO`, `TournamentStateDTO`, `BracketTournamentDTO` | **wired** |

::: info A fourth wired edge sits outside this lettering
The [Entries](/reference/modules/entries) module added `entriesCommitted` (Entries → Meet | Bracket) in
2026-08. It is deliberately unlettered here because it is not the same kind of edge: the four above
are poll or store-subscription edges that move continuously, while the commit seam is an
**operator-pressed, server-side write** that turns confirmed entries into roster players and then
stops. It runs before an event rather than during one, which is also why the offline guarantee is
unaffected: nothing on event day reads an entry row. See
[the commit seam](/reference/modules/entries#the-commit-seam).
:::

::: warning Seam C is intentionally not wired
Bracket advancement (recording a result via `POST …/bracket/commands`) materialises the winner
**locally**, with no call into Operations. Wiring a bracket-origin match finish to feed advancement would be *new
cross-module runtime behaviour* and is deferred to its own behaviour-change PR. The module-contract
test asserts this seam stays unwired, so it cannot be silently claimed. Do not confuse it with the
three task-level contract pages (Meet → Operations, Bracket → Operations, Operations → Display),
which are seams A, B, and D.
:::

```
   Meet engine ──ScheduleDTO──▶ ┐
   (seam A: scheduleFinalized)  │
                                ├──▶ Operations ──MatchStateDTO──▶ Display
   Bracket engine ──Bracket────▶┘   (live layout +     (seam D: matchStateChanged,
   (seam B: drawGenerated)          match-state machine) poll-only, read-only)
   TournamentDTO
```

## The match-state machine

Operations owns the live status of every match. The canonical transitions live in
`apps/api/src/operations/match_state.py` (`VALID_TRANSITIONS`), over the `MatchStatus` enum from
`apps/api/src/db/models.py`. Edge labels are the operator **command actions**:

```
scheduled ──call──▶ called ──start──▶ playing ──finish──▶ finished
                     ▲   │              │  └───────retire──▶ retired
                     └───┘              └──postpone──▶ scheduled
     (uncall: called → scheduled; postpone: playing → scheduled)
```

`VALID_TRANSITIONS` is exactly: `scheduled → [called]`, `called → [playing, scheduled]`,
`playing → [finished, retired, scheduled]` (the last edge is `postpone`), and
`finished` / `retired` are terminal (`[]`).

- **Terminal states**: `finished`, `retired`.
- **`LOCKED_STATUSES`** = `{ called, playing, finished, retired }`. The solver **pins** matches in
  these states so a re-plan never moves a match that is already in flight or done.
- Illegal transitions return **409** with a structured rejection body.

::: info `playing` (canonical) vs `started` (operator-facing)
The canonical enum values are the literal strings `scheduled` · `called` · **`playing`** ·
`finished` · **`retired`** (this is what `matches.status` stores and what the solver locks on). The
**operator-facing live-ops vocabulary** is slightly different: the frontend normalises every match
to an `OperationalMatch.status` of `scheduled | called | `**`started`**` | finished`, where
**`started` is the label for the canonical `playing`** (and bracket-origin rows never surface
`retired`). So `BACKEND.md`'s "`scheduled / called / started / finished`" describes the operator
surface; this state machine describes the canonical enum underneath it. They are the same machine,
named at two layers.
:::

Live status persists in the `match_states` table and is written on **every transition with no
debounce** — these mutations carry operator intent that must not be coalesced away.

## The command pipeline (write path)

Operator actions (call / start / finish / retire / uncall) flow through an **idempotent command
queue** rather than direct state writes. This gives optimistic UI with safe conflict handling.

```
1. Frontend   useCommandQueue.submit(action, matchId)
              → mint a UUID idempotency key
              → applyOptimisticStatus(matchId, target)   ← UI updates immediately
              → enqueue in IndexedDB
              → POST /tournaments/{id}/commands

2. Backend    process_command (single transaction):
              • idempotency — an existing `applied` command row → return the prior result
              • rejection   — an existing `rejected` row → bounce
              • version     — matches.version == the seen version?
              • transition  — assert_valid_transition(current, target)
              • apply        — write the match row + insert the commands row
                               (both in one commit)

3. Read       operator browsers and the TV display pick the change up on their
              next poll (the Display module's projection routes)

4. Conflict   a stale-version / illegal command is rejected; the UI shows a pending badge,
              an auto-dismiss stale-version banner, and a persistent inline conflict banner
              (no modals)
```

The `commands` table is an **audit + idempotency log** (UUID id as the idempotency key,
`applied_at` / `rejected_at` / `rejection_reason`).

## Persistence and the read path

Persistence is **single-store**: SQLite in local mode, Postgres in cloud mode. There is no
replication layer and no second copy — a write is durable as soon as its transaction commits.

- **One write path.** `repositories/local.py` owns it, and every method commits its own
  transaction, so a returned row is always persisted.
- **Read path for operators / TV**: polling. Operator surfaces poll the API; the public display
  polls the Display module's capability-token projection routes (`/display/{token}/*`). There is
  no push channel.
- **Recovery**: `tournament_backups` (list / create / restore) holds full JSON snapshots of
  workspace state, restorable in-product.

The tournament completes cleanly with no network at all — nothing in the write path reaches out.
See [ADR 0003](/explanation/decisions/0003-sqlite-as-primary-persistence).

::: tip Removed in SP-CLOUD-3
A `sync_queue` outbox used to mirror writes to a Supabase Postgres project, read back via Supabase
Realtime. It was removed entirely: one-way with no restore path, its consumers already replaced by
the polling projection routes, and never operated. See
[ADR 0012](/explanation/decisions/0012-remove-the-supabase-mirror).
:::

Identity and sessions are self-hosted (see
[Backend structure → Auth & tenancy](/explanation/architecture/backend-structure#auth-tenancy-sp-cloud-2)),
and the public spectator read path is the capability-token projection (`/display/{token}/*`),
not a Supabase channel.

## The persistence flow (read/hydrate)

On the frontend, **hooks are the seam** — components never call the API directly:

```
mount → useTournamentState() hydrates the tournament store from GET /tournaments/{id}/state
      → user mutates the store via actions
      → useTournamentState() debounces (500 ms) a PUT back to /state
      → schedule generation: useSchedule() → POST /tournaments/{id}/solve-jobs (202)
        → poll the job (~0.5–2 s backoff) to a terminal status → store.setSchedule  (seam A)
      → live ops: useLiveOperations()/useLiveTracking() patch match states,
        each transition flushed via the command queue / a `…/match-states/{id}` PUT immediately
      → display: independent poll of /state + /match-states + /bracket                    (seam D)
        (public spectators poll the token projection: /display/{token}/{state,match-states,bracket})
```

The solve is asynchronous end-to-end (SP-CLOUD-1): `apiClient.runSolveJob` submits with a
client-minted `Idempotency-Key`, polls `GET …/solve-jobs/{job_id}` with backoff, and a reload
mid-solve **re-adopts** the active job (`listSolveJobs` → `pollSolveJob`) instead of losing it;
Cancel aborts the poll *and* requests a server-side cancel that kills the solve subprocess. The
retired `/schedule/stream` SSE path is gone — progress is honest-but-coarse job polling, no CP-SAT
ever runs inside an HTTP request.

See [State management](/explanation/architecture/state-management) for the store split and
[Backend structure](/explanation/architecture/backend-structure) for the route side.
