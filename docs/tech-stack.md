# ShuttleWorks — Tech Stack
_Last updated: 2026-05-13 (post backend-merge arc)_

This file describes the system as it stands at the end of the
backend-merge arc (PRs 1–4 of T-A through T-H). The arc folded the
prior tournament product into the scheduler — one FastAPI, one
React shell, one Supabase schema, one auth surface — and archived
the standalone tournament backend at
`archive/tournament-pre-merge/`. The architecture-adjustment arc
that preceded it (Steps A–G in `docs/changes/2026-05-13.md`)
shipped the local-first Tauri-sidecar model the backend-merge arc
built on top of; the **Architecture** section below describes the
current end-state.

---

## Decision log (what changed and why)

Cloud-prep arc decisions (still in effect except where noted):

| Decision | Choice | Reason |
|---|---|---|
| Persistence | SQLAlchemy 2.0 sync + SQLite (local) / Postgres (Supabase) | Cloud prep, multi-tournament |
| Auth | Supabase Auth | Cloud requires identity; Supabase bundles auth + Postgres |
| Sharing | Invite links | Simplest multi-user model; no email infra needed |
| Roles | Owner / Operator / Viewer | Minimal RBAC |
| Dashboard | Two-section (Your Tournaments + Shared with You) | Operator's entry point |

Architecture-adjustment arc decisions (this 2026-05-13 rewrite):

| Decision | Choice | Reason |
|---|---|---|
| Backend hosting | **Tauri sidecar on the director's laptop** (FastAPI on local port) — was Fly.io / Render | The director's laptop is the canonical state; cloud-hosted FastAPI was a misalignment with the operator-cockpit reality |
| Source of truth | **SQLite on the director's machine** | Tournament-day reads + writes happen there; Supabase is a mirror |
| Cloud DB role | **Read mirror of SQLite via outbox replication** — was primary | Operators / TV display read; writes still hit the director's local FastAPI |
| Operator write path | **Idempotent command queue (POST /commands)** with optimistic UI | Operators on browsers (any device) push commands; backend dedups; UI reflects pending vs applied vs rejected |
| State machine | **Typed `MatchStatus` enum + transition guard** | Eliminates illegal status changes (e.g. starting a finished match); rejections surface as 409 with structured body |
| Concurrency | **Versioned matches + `If-Match` header on legacy routes / `seen_version` on commands** | Two operators acting on the same match: second one gets a 409 stale_version, refetches |
| Solver locking | **`LockedAssignment` propagated through every solver entry point** | State-machine-locked matches (called / playing / finished / retired) never move under a re-solve |
| Sync mechanism | **Outbox pattern via `sync_queue` table + background worker** — instead of fire-and-forget direct push | Crash-safe: queue row exists iff the data write committed |
| Realtime read path | **Supabase Realtime postgres_changes on `matches`** | Operators + TV display get sub-second updates without polling |
| Conflict UI | **Inline pending badge + auto-dismissing stale-version banner + persistent conflict banner + header connection indicator** — no modals | Operator workflow can't tolerate blocking dialogs during a tournament |

Backend-merge arc decisions (this 2026-05-13 follow-on):

| Decision | Choice | Reason |
|---|---|---|
| Bracket persistence shape | **Children of `tournaments(id)` — `bracket_events` / `bracket_participants` / `bracket_matches` / `bracket_results`** — instead of renaming `tournaments` → `events(kind)` | Cheaper migration. A tournament row now hosts a meet schedule *and/or* a bracket draw; the noun stays as the unit the operator owns |
| Bracket repository | **`_LocalBracketRepo` mirrors `_LocalMatchRepo`** (CRUD + composite-PK + outbox enqueue + optimistic-concurrency `version`) | Reuse the architecture-adjustment arc's primitives instead of re-inventing them |
| Bracket route surface | **`/tournaments/{tid}/bracket/*` with `require_tournament_access` gates** — replaces the legacy product's anonymous `/tournament/*` on a separate stack | Single auth realm, role-gated, lives in the scheduler backend |
| Bracket sync | **Same outbox (`sync_queue`) the matches table uses** — bracket entity types `bracket_event` / `bracket_match` / `bracket_result` join the existing dispatch | Operators on browsers + the public TV display read bracket changes via Realtime exactly the same way they read match changes |
| Bracket frontend | **Folded into the scheduler shell as a `Bracket` tab** — tournament-product React app retired | One app, one auth flow, one ThemeToggle, one ShuttleWorksMark |
| Dashboard New-event dialog | **Single form: name + date + kind (Meet / Bracket) radio** — replaces the prior two-step Meet \| Tournament fork that `window.open`'d a separate stack | Both kinds create the same `tournaments` row; kind only picks the post-create landing tab |
| Bracket pure-Python package | **Moved to `products/scheduler/backend/services/bracket/`** — relative imports internally, both backends imported it during the transition | One source of truth; archives cleanly into `archive/tournament-pre-merge/` once retired |

---

## Full stack

### Director's laptop — Tauri desktop app

| Layer | Choice | Notes |
|---|---|---|
| Shell | Tauri | Wraps the operator UX; ships the FastAPI sidecar |
| Sidecar runtime | Python 3.11 + uvicorn on a local port | Loopback-only by default; LAN-reachable when the operator opts in |
| Framework | FastAPI (sync routes via threadpool) | Same as cloud-prep arc |
| Solver | Google OR-Tools CP-SAT | Same as cloud-prep arc |
| ORM | SQLAlchemy 2.0 (sync) | `DeclarativeBase`, regular `Session` |
| Migrations | Alembic | `alembic upgrade head` on startup |
| DB | SQLite (`./local.db`) | Source of truth |
| Sync | `services/sync_service.py` — outbox replicator | Background daemon thread, drains `sync_queue` every 5 s |
| Config | Pydantic `BaseSettings` | Cloud-mode (`ENVIRONMENT=cloud`) validates Supabase secrets at boot |
| Testing | pytest (sync) | 415 tests at end of arc (369 from the architecture-adjustment arc + 28 bracket repo + 18 bracket route tests) |

### Operators / TV display — browser

| Layer | Choice | Notes |
|---|---|---|
| Framework | React 19 + Vite + TypeScript | Same as cloud-prep arc |
| State | Zustand | Same — plus `pendingCommandsByMatchId`, `recentConflictsByMatchId`, `applyOptimisticStatus` (Step F/G additions) |
| Auth client | `@supabase/supabase-js` | Same |
| Command queue | `src/lib/commandQueue.ts` — IndexedDB persistence | Outbox on the browser side: enqueue + flush, idempotent via client-generated UUIDs |
| Realtime client | `src/lib/realtime.ts` — Supabase postgres_changes subscription | 10 s polling fallback |
| Conflict UX | `PendingBadge`, `ConflictBanner`, `ConnectionIndicator` | Inline; no modals |
| Routing | React Router v6 | Same |
| Testing | Vitest + jsdom + fake-indexeddb + RTL | 23 frontend unit tests at end of arc (was 0). Bracket UI carries zero coverage from its tournament-product origins; follow-up adds vitest for bracket components |

### Infrastructure

| Layer | Choice | Notes |
|---|---|---|
| Cloud DB + Auth | Supabase | Same as cloud-prep arc |
| Cloud DB role | **Read mirror of SQLite** | Reversed from cloud-prep arc — director's SQLite is canonical |
| TV display deploy | Vercel | Unchanged from cloud-prep arc |
| Backend deploy | **None on cloud** — runs as Tauri sidecar | Cloud-prep arc's Fly.io / Render targets are removed |

---

## Architecture

```
Director's laptop — Tauri desktop app
  ├── FastAPI sidecar (uvicorn, local port)
  │     ├── CP-SAT solver (OR-Tools, unchanged from cloud-prep)
  │     ├── SQLite via SQLAlchemy (source of truth)
  │     └── Sync service → Supabase Postgres (background outbox drain)
  │
  └── Tauri WebView (React frontend)
        └── Talks to local FastAPI only

Operators / assistants — browser on any device
  ├── Read via Supabase Realtime (matches table; auth via Supabase JWT)
  └── Write via idempotent POST /commands → director's FastAPI
        (director's machine must be reachable on the operator's network)

Public TV display — Vercel
  └── Reads Supabase Realtime (read-only, no auth required for matches view)

Supabase
  ├── Auth (identity for all users — operators, viewers, director)
  ├── Postgres (cloud mirror of SQLite — not primary, populated by the sync service)
  └── Realtime (broadcasts matches-table changes to operators + TV)
```

**The director's SQLite is the source of truth.** Supabase is a
mirror that exists to give operators + the TV display a low-latency
read path. Operator writes still terminate at the director's
FastAPI; the sync service replicates *out* from there.

---

## Data model (twelve tables + alembic_version)

All tables live in `public` and share the `tournament_id` UUID FK.
Schema migrations live under `products/scheduler/backend/alembic/`;
the chain at end-of-arc is `c6361600d776 → 7a473c9e7048 →
c2e587494c07 → b7e3a9f4c8d2 → d8c4f1a7e6b2 → e2a5f3b8c1d6 →
f7a3c9b2e8d4` (the trailing revision is T-A, adding the four
bracket tables).

### `tournaments`
Per-tournament document. Cloud-prep arc table.
- `id UUID PK`, `owner_id UUID`, `owner_email TEXT`, `name`, `status`,
  `tournament_date TEXT`, `data JSON` (full TournamentStateDTO blob),
  `schema_version`, `created_at`, `updated_at`.

### `matches` (NEW — Step A)
Per-match operational row. Source of truth for `status` (typed enum)
and `version` (optimistic concurrency).
- Composite PK `(tournament_id, id)`.
- `id String(100)`, `court_id Integer NULL`, `time_slot Integer NULL`,
  `status String(20)` (one of: scheduled / called / playing / finished
  / retired), `version Integer DEFAULT 1`, timestamps.
- Index: `(tournament_id, status)` for the solver's locked-match query.

### `match_states` (LEGACY — being replaced)
Pre-arc table. Still receives writes from the legacy `PUT
/tournaments/{tid}/match-states/{match_id}` route (which also
mirrors to `matches`). On the deprecation path — folds into `matches`
once every operator surface migrates to the command queue.
- Composite PK `(tournament_id, match_id)`.
- `status String(20)` (free string: scheduled / called / started /
  finished), `called_at`, `actual_start_time`, `actual_end_time`,
  `score_side_a`, `score_side_b`, `notes`, `original_slot_id`,
  `original_court_id`, `updated_at`.

### `commands` (NEW — Step C)
Idempotent operator command audit log.
- `id UUID PK` (client-generated idempotency key).
- `tournament_id UUID FK CASCADE`, `match_id String(100) NOT NULL`
  (composite FK to matches `(tournament_id, match_id)`).
- `action String(40)`, `payload JSON NULL`, `submitted_by UUID`,
  `created_at`, `applied_at NULL`, `rejected_at NULL`,
  `rejection_reason TEXT NULL`.
- Indices: `(tournament_id, match_id, applied_at)`, `(submitted_by, created_at)`.

### `sync_queue` (NEW — Step E)
Outbox for SQLite → Supabase replication.
- `id UUID PK`, `entity_type String(20)`, `entity_id String(100)`,
  `payload JSON`, `created_at`, `attempts Integer DEFAULT 0`,
  `last_attempt NULL`.
- Index: `(created_at, attempts)`.

### `bracket_events` (NEW — backend-merge arc T-A)
One sub-event (Men's Singles, Women's Doubles, etc.) within a
tournament's bracket session. Composite PK `(tournament_id, id)`.
- `id String(100)` (tournament-scoped event id),
  `discipline String(200)`, `format String(20)` ('se' | 'rr'),
  `duration_slots Int`, `bracket_size Int NULL`,
  `seeded_count Int DEFAULT 0`, `rr_rounds Int NULL`,
  `config JSON DEFAULT '{}'`, `version Int DEFAULT 1`, timestamps.

### `bracket_participants` (NEW — backend-merge arc T-A)
Seeded entrants per event. Composite PK
`(tournament_id, bracket_event_id, id)`.
- `id String(100)`, `name String(255)`, `type String(20)`
  (PLAYER | TEAM), `member_ids JSON DEFAULT '[]'`,
  `seed Int NULL`, `meta JSON DEFAULT '{}'`, timestamps.

### `bracket_matches` (NEW — backend-merge arc T-A)
One PlayUnit row per bracket match. Composite PK
`(tournament_id, bracket_event_id, id)`. Holds the slot tree
(BracketSlot for slot_a / slot_b — either `participant_id` or
`feeder_play_unit_id`) plus `dependencies` / `child_unit_ids` for
the advancement walk.
- `round_index Int`, `match_index Int`, `kind String(20)`
  (MATCH | TIE | BLOCK), `slot_a JSON`, `slot_b JSON`,
  `side_a JSON DEFAULT '[]'`, `side_b JSON DEFAULT '[]'`,
  `dependencies JSON DEFAULT '[]'`, `expected_duration_slots Int`,
  `duration_variance_slots Int DEFAULT 0`,
  `child_unit_ids JSON DEFAULT '[]'`, `meta JSON DEFAULT '{}'`,
  `version Int DEFAULT 1`, timestamps.
- Index: `(tournament_id, bracket_event_id, round_index)` for the
  "list matches by round" query.

### `bracket_results` (NEW — backend-merge arc T-A)
Recorded outcomes. Composite PK
`(tournament_id, bracket_event_id, bracket_match_id)`.
- `winner_side String(10)` ('A' | 'B' | 'NONE'), `score JSON NULL`,
  `finished_at_slot Int NULL`, `walkover Boolean DEFAULT false`,
  `created_at`.

### `tournament_backups`
Opt-in snapshots of `tournaments.data`. Cloud-prep arc table.

### `tournament_members`
Per-tournament role assignment (owner / operator / viewer).
Cloud-prep arc table. Composite PK `(tournament_id, user_id)`.

### `invite_links`
Sharable URL tokens granting a role on a tournament. Cloud-prep arc
table.

### Supabase-managed
`auth.users` lives in Supabase's `auth` schema. The application DB
references user IDs by UUID; emails cache on `tournaments.owner_email`.

---

## State machine (Step A)

```
            ┌────────────┐
            │ scheduled  │
            └────┬───────┘
                 │ call_to_court
                 ▼
            ┌────────────┐ uncall
            │   called   │◀───────┐
            └────┬───────┘        │
                 │ start_match    │
                 ▼                │
            ┌────────────┐        │
            │  playing   │────────┘  (terminal branches below)
            └────┬───────┘
                 │ finish_match | retire_match
                 ▼
       ┌───────────┴────────────┐
       ▼                        ▼
  ┌──────────┐            ┌──────────┐
  │ finished │            │ retired  │   (terminal)
  └──────────┘            └──────────┘
```

The transition table is canonical in
`backend/services/match_state.py::VALID_TRANSITIONS`. Every operator
write that changes status goes through `assert_valid_transition`
(strict — same-state transitions raise; the route boundary
short-circuits when target == current). Illegal transitions raise
`ConflictError` → HTTP 409 with a structured body.

`LOCKED_STATUSES = {called, playing, finished, retired}` — every
match in this set is pinned by the solver (Step B's
`_add_locked_constraints`).

---

## Command flow (Step C + F + G)

```
Operator clicks "Call to court" in browser
    │
    ├── Frontend: useCommandQueue.submit('call_to_court', matchId)
    │     ├── Generate UUID (idempotency key)
    │     ├── applyOptimisticStatus(matchId, 'called')
    │     ├── setPendingCommand(matchId, commandId)
    │     ├── Enqueue in IndexedDB
    │     └── Flush → POST /tournaments/{tid}/commands
    │
    ├── Backend: process_command (5-step pipeline in one txn)
    │     ├── 1. Idempotency check (existing applied row?)
    │     ├── 2. Duplicate rejection check (existing rejected row?)
    │     ├── 3. Version check (matches.version == seen_version?)
    │     ├── 4. Transition guard (current → target legal?)
    │     └── 5. Apply (write match + insert command, commit)
    │
    ├── Backend: outbox enqueue (same transaction as match write)
    │     └── sync_queue row inserted; worker thread drains to Supabase
    │
    └── Supabase Realtime: matches-table change broadcast
          └── Other operators + TV display see the update
```

On a 409 conflict the hook surfaces `recentConflictsByMatchId[matchId]`
which drives the inline ConflictBanner. On stale_version the hook
refetches the canonical match state. Network errors leave the command
pending; ConnectionIndicator's reachability hook flushes the queue on
reconnect.

---

## Conflict UI (Step G)

| Component | Surface | Behaviour |
|---|---|---|
| `PendingBadge` | On match cards | Pulsing amber dot when `pendingCommandsByMatchId[matchId]` is set |
| `ConflictBanner` (stale_version) | Inline on match card | "Updated by someone else — reloaded"; auto-dismiss 4 s |
| `ConflictBanner` (conflict) | Inline on match card | Server's `rejection_reason`; persists until × clicked |
| `ConnectionIndicator` | App header | Green / amber / red derived from FastAPI reachability + Realtime status; red after 60 s of both offline |

No modals. Operator can keep working through any conflict state.

---

## Configuration (`backend/app/config.py`)

```python
class Settings(BaseSettings):
    database_url: str = "sqlite:///./local.db"
    supabase_url: str = ""
    supabase_anon_key: str = ""
    environment: str = "local"   # local | cloud
    cors_origins: list[str] = ["http://localhost:5173"]
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"
    data_dir: str = "./data"
```

A `model_validator(mode="after")` raises at boot when
`environment == "cloud"` and any of `supabase_url` /
`supabase_anon_key` / Postgres `database_url` is missing.

For the sidecar deployment: `environment="local"` keeps everything
on SQLite; `supabase_url` + `supabase_anon_key` are still set in
production-side configs so the sync service can replicate. The
SQLite remains canonical.

---

## Implementation history

| Arc | Step | Status |
|---|---|---|
| Cloud prep | 1 — SQLAlchemy persistence | ✅ |
| Cloud prep | 2 — Multi-tournament API | ✅ |
| Cloud prep | 3 — Environment config | ✅ |
| Cloud prep | 4 — Supabase Auth | ✅ |
| Cloud prep | 5 — Ownership / membership | ✅ |
| Cloud prep | 6 — Dashboard | ✅ |
| Cloud prep | 7 — Invite links | ✅ |
| Cloud prep | 8 — Cloud deployment scaffolding | ✅ (some pieces superseded by arc-adjustment) |
| Cloud prep | Part 1 — Secret hygiene audit | ✅ |
| Arc-adjustment | A — State machine + matches table | ✅ |
| Arc-adjustment | B — Solver locking | ✅ |
| Arc-adjustment | C — Command log + idempotency | ✅ |
| Arc-adjustment | D — ETag enforcement | ✅ |
| Arc-adjustment | E — Supabase sync + Realtime primitive | ✅ |
| Arc-adjustment | F — Command queue (frontend primitive + hook) | ✅ |
| Arc-adjustment | G — Conflict UI (3 components + hooks) | ✅ |
| Arc-adjustment | H — Docs + final test pass + arc commit | ✅ |
| Backend-merge | T-A — Bracket schema + `_LocalBracketRepo` | ✅ (PR 1, `dd2b154`) |
| Backend-merge | (prep) — Pure-Python bracket package moved to scheduler | ✅ (`33405b5`) |
| Backend-merge | T-B + T-C + T-D — Authed bracket routes + outbox + Realtime | ✅ (PR 2, `b93c794`) |
| Backend-merge | T-E — Frontend merge + dashboard dialog collapse | ✅ (PR 3, `a931122`) |
| Backend-merge | T-G + T-H — Decommission tournament product + docs + arc commit | ← this file is part of it |
| Backend-merge | T-F — `BracketAction` enum + commandQueue + Realtime subscription | ⏳ follow-up PR (deliberately deferred to keep PR 3 scope bounded) |

Test counts at end of arc:
- Backend: **415 passed** (`pytest products/scheduler/tests/` — was 369 at end of architecture-adjustment arc; +28 bracket repo tests, +18 bracket route tests)
- Frontend: **23 passed** (`npm run test:run` in `products/scheduler/frontend/` — bracket components are uncovered, carried over verbatim from the tournament product which had zero frontend tests)

The legacy tournament product (`products/tournament/`) is archived at
`archive/tournament-pre-merge/` with a top-level `ARCHIVED.md`
mapping every old path to its new home. Future cleanup PRs can
delete the archive once nobody refers back to it.
