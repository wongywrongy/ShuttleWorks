# Data flow

This page traces how data moves **between** modules and **out** to operators and the public
display. There are three wired cross-module seams, a match-state machine, an idempotent command
pipeline, and a crash-safe outbox. The per-seam detail lives in [Module contracts](/contracts/);
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
`backend/services/match_state.py` (`VALID_TRANSITIONS`), over the `MatchStatus` enum from
`database/models.py`. Edge labels are the operator **command actions**:

```
scheduled ──call──▶ called ──start──▶ playing ──finish──▶ finished
                     ▲   │                └────retire──▶ retired
                     └───┘ (uncall: called → scheduled)
```

`VALID_TRANSITIONS` is exactly: `scheduled → [called]`, `called → [playing, scheduled]`,
`playing → [finished, retired]`, and `finished` / `retired` are terminal (`[]`).

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
                               + enqueue a sync_queue row (all in one commit)

3. Outbox     SyncService background thread drains sync_queue (~5 s poll)
              → pushes entity_type/entity_id/payload to Supabase

4. Realtime   Supabase broadcasts the write to operator browsers + the TV display

5. Conflict   a stale-version / illegal command is rejected; the UI shows a pending badge,
              an auto-dismiss stale-version banner, and a persistent inline conflict banner
              (no modals)
```

The `commands` table is an **audit + idempotency log** (UUID id as the idempotency key,
`applied_at` / `rejected_at` / `rejection_reason`). It is local-only — never mirrored to Supabase.

## The outbox and the cloud mirror

Persistence is **SQLite-first**; Supabase is a mirror populated by an outbox so the system is
crash-safe and works offline.

- **Outbox**: `services/sync_service.py` is a background daemon that polls the `sync_queue` table
  (~5 s) and pushes rows to Supabase. Because the `sync_queue` row is inserted **in the same
  transaction** as the data write, a crash can never leave a write unqueued; recovery is idempotent
  (the next apply re-checks `version`).
- **Entity types mirrored** (`sync_queue.entity_type`): `match`, `tournament`, `bracket_event`,
  `bracket_match`, `bracket_result`, `bracket_participant` (plus delete variants such as
  `bracket_event_delete`). The Supabase tables synced are `matches`, `bracket_events`,
  `bracket_participants`, `bracket_matches`, `bracket_results`.
- **Local-only (never mirrored)**: `commands`, `sync_queue`, `match_states`.
- **Read path for operators / TV**: Supabase Realtime broadcasts the mirrored writes (sub-second),
  with a polling fallback.

The director's tournament can complete cleanly even if Supabase is unreachable for the entire day;
the queue accumulates and drains when connectivity returns. See
[ADR 0003](/decisions/0003-sqlite-as-primary-persistence).

## The persistence flow (read/hydrate)

On the frontend, **hooks are the seam** — components never call the API directly:

```
mount → useTournamentState() hydrates the tournament store from GET /tournaments/{id}/state
      → user mutates the store via actions
      → useTournamentState() debounces (500 ms) a PUT back to /state
      → schedule generation: useSchedule() → /schedule/stream (SSE) → store.setSchedule  (seam A)
      → live ops: useLiveOperations()/useLiveTracking() patch match states,
        each transition flushed via the command queue / a `…/match-states/{id}` PUT immediately
      → display: independent poll of /state + /match-states + /bracket                    (seam D)
```

See [State management](/architecture/state-management) for the store split and
[Backend structure](/architecture/backend-structure) for the route side.
