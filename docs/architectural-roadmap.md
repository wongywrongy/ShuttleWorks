# Architectural roadmap — unify the two backends

_Last updated: 2026-05-13_

> **Status: 7/8 steps shipped** as of PR 4. The arc landed across
> four PRs on branch `dev2`:
>
> 1. `dd2b154` — PR 1 (T-A): bracket schema + `_LocalBracketRepo`.
> 2. `33405b5` — PR 2 prep: bracket package moved to scheduler/services/.
> 3. `b93c794` — PR 2 (T-B + T-C + T-D): authed bracket routes + outbox + Realtime.
> 4. `a931122` — PR 3 (T-E): frontend merge + dashboard dialog collapse.
> 5. The arc-final commit (PR 4): tournament product archived at
>    `archive/tournament-pre-merge/`, Makefile pruned, docs swept.
>
> **T-F is deliberately deferred to a follow-up PR.** Bracket
> actions still go through direct API calls + a 2.5s polling hook
> (`useBracket`); a follow-up adds `BracketAction` enum values to
> the `/commands` endpoint, wires bracket UI through `commandQueue`,
> and swaps polling for Supabase Realtime subscriptions
> (the publication membership shipped in PR 2; the subscriber
> wiring is what's left). The merge unifies the backends + the
> shell — the optimistic-UI parity with the meet workflow is its
> own next step.
>
> The sections below stay as the planning document the arc was
> built against; treat them as historical context, not current
> state. `docs/tech-stack.md` and `docs/deploy/cloud.md` have the
> end-state.

## Context

The repo has two products that look like one to the operator:

- **Scheduler** — intercollegiate inter-school dual / tri-meet
  cockpit. FastAPI + SQLAlchemy + SQLite (canonical) + Supabase
  Postgres mirror via outbox replication. Auth via Supabase JWT.
  Lives at `products/scheduler/`. Compose project `btp`, ports
  :80 / :8000.
- **Tournament** — bracket draws + multi-event tournament
  management (single-elimination, round-robin, BWF-conformant).
  Separate FastAPI app, in-memory state, no auth.
  Lives at `products/tournament/`. Compose project `tournament`,
  ports :5174 / :8765.

**Both backends run the CP-SAT solver via the shared
`scheduler_core/` package.** The tournament product imports
`scheduler_core.domain.models.ScheduleConfig` /
`scheduler_core.domain.tournament.TournamentState` etc. and calls
`scheduler_core.engine.cpsat_backend` on each `/tournament/schedule-next`.
The engine is already unified — what's split is the persistence
(SQLite + Supabase mirror vs in-memory `container.py`), the auth
(Supabase JWT + role gates vs anonymous + CORS `*`), and the
FastAPI app instance + Docker stack. That's why the merge below
is cheaper than it looks: the expensive shared piece (the solver)
is already common code.

After commit `b55bfcb` (dashboard "New" → Meet | Tournament
dialog), the frontend points at both products from one launchpad.
The implementation is still two stacks held together by
`window.open(VITE_TOURNAMENT_APP_URL)`.

This roadmap is the multi-step shape of merging the backends so the
"one product" the dashboard implies is also the "one product" the
operator actually runs. PR 1 of the merge arc (T-A: bracket schema
+ repository) is the first concrete step — see `## Execution
sequence` below.

---

## Why merge

Today's split has concrete costs:

- **Two processes per tournament-day** — director's laptop runs
  two Docker projects, has two log streams, two volume mounts to
  back up, two ports to keep reachable from operator browsers.
- **No unified "events I'm running"** — the scheduler dashboard
  lists scheduler-product tournaments only. The tournament
  product's brackets exist in another stack's memory.
- **Two auth realms** — scheduler is Supabase JWT + role-gated;
  tournament is anonymous with CORS `*`. Anyone on the LAN can
  poke the tournament product. Inconsistent risk surface.
- **Different conventions** — scheduler has SQLite + Supabase
  mirror + Alembic + repository pattern + outbox + Realtime;
  tournament keeps its tournament state in an in-memory
  `_Container` (`products/tournament/backend/state.py`) that dies
  on container restart. The bracket logic itself is solid
  (`tournament/draw.py`, `advancement.py`, `formats.py`) but every
  new operator-facing feature on the tournament side has to
  reinvent what the scheduler product already has.
- **Deploy split** — `make scheduler` and `make tournament` are
  separate. Two `.env` files, two health probes, two restart
  policies.

The frontend unification made the debt visible. Merging the
backends pays it down.

---

## Target end-state

One FastAPI backend serving both surfaces:

- **One database.** SQLite local + Supabase mirror. First-class
  `events` rows keyed by `kind` enum (`meet` | `bracket`).
- **One auth surface.** Supabase JWT + `require_tournament_access`
  (or equivalent) gates both kinds.
- **One Docker stack.** `make scheduler` (or a renamed
  `make shuttleworks`) brings everything up.
- **One outbox** — bracket writes flow through the same
  `sync_queue` table the architecture-adjustment arc established
  for matches.
- **One frontend shell.** Tournament-product React app folds into
  the scheduler's AppShell as a new tab/route. Reuses
  ThemeToggle, AppStatusPopover, design-system primitives,
  command queue, conflict UX.
- **Dashboard lists both kinds.** Operators see one list of
  events, can pick either kind from a unified "new" dialog, and
  open either kind in the same shell.

---

## Steps (modelled after the architecture-adjustment arc's A–H structure)

Each step has a test gate. Existing 369 backend + 23 frontend
tests must stay green throughout. New code requires new tests.

### Step T-A — Schema + persistence for bracket events

- Promote `products/tournament/tournament/state.py`'s in-memory
  `container` to a real ORM under the scheduler's persistence
  layer.
- New tables (Alembic migration on top of `e2a5f3b8c1d6`):
  - `bracket_events` — one row per bracket draw, keyed by
    `(tournament_id, id)` following the same composite-PK
    convention as `matches`.
  - `bracket_participants` — seeded players / pairs.
  - `bracket_matches` — bracket-internal matches (distinct from
    the scheduler's `matches` table; bracket matches don't carry
    a court/slot until the meet layer schedules them).
  - `bracket_results` — recorded outcomes, advancement audit.
  - Optionally `bracket_seeds` if seeding metadata needs its own
    table.
- Repository pattern (`_LocalBracketRepo` etc.) matching the
  shape of `_LocalMatchRepo`.
- Migrate tournament-product test scenarios to roundtrip against
  the new persistence.

**Test gate:** every existing tournament-product test passes
against the new persistence layer; scheduler tests stay green.

### Step T-B — Auth + role gates on tournament routes

- Decision: promote `tournaments` to `events(kind enum)` OR keep
  `tournaments` as the parent and add `bracket_events` as a
  child of `tournaments`. The latter is cheaper; the former is
  cleaner long-term. Pick at execution time.
- Every `/tournament/*` route gets `require_tournament_access(min_role)`
  matching scheduler pattern.
- Existing anonymous-access workflows in the tournament product
  get a migration story: either default to a public role on the
  parent tournament, or require login.

**Test gate:** role-matrix tests for bracket routes mirroring the
scheduler's existing role tests.

### Step T-C — Route consolidation

- Merge tournament-product's `main.py` into scheduler's FastAPI
  app. Routes go from `/tournament/*` to either:
  - `/tournaments/{tid}/bracket/*` (cheap; matches T-B option 2)
  - `/events/{eid}/bracket/*` (cleaner; matches T-B option 1)
- Update tournament-product apiClient on the frontend.
- One `docker-compose.yml` (the tournament product's service
  retired).
- Migrate `tournament/Makefile` targets into the root Makefile
  (or retire them).

**Test gate:** every tournament-product route reachable through
the scheduler's FastAPI; old `/tournament/*` paths return 404 or
permanent redirects.

### Step T-D — Supabase sync + Realtime for bracket data

- Bracket writes flow through the same outbox (`sync_queue`)
  table the architecture-adjustment arc established for matches.
  Two new entity types: `bracket_match`, `bracket_event`.
- `SyncService` learns to push them via `upsert(on_conflict='tournament_id,id')`
  on Supabase.
- Frontend subscribes to bracket changes via the existing
  `subscribeToMatches` primitive pattern (parallel function for
  the bracket table).
- Apply Supabase migrations via MCP for the bracket tables
  matching the scheduler's pattern (see
  `docs/deploy/cloud.md`'s "Schema migrations" section).

**Test gate:** sync_service tests extended to cover bracket
entity types. Mocked Supabase client.

### Step T-E — Frontend shell unification

- Tournament product's React frontend folds into the scheduler's
  `frontend/`. The existing tabs in `AppShell.tsx` get a new
  "Bracket" tab for events with `kind=bracket`.
- Reuse scheduler's design-system primitives, theme system,
  AppStatusPopover, advisories, suggestions inbox. The bracket
  view inherits all of it.
- Dashboard's two-section list (`Your Tournaments` / `Shared
  with You`) now lists **both** kinds — kind icon + label so the
  operator can distinguish.
- The Meet | Tournament dialog from `b55bfcb` stays but both
  paths create events in the unified backend.
- Tournament product's `products/tournament/frontend/` folder
  retired.

**Test gate:** Vitest component coverage for the bracket-tab
panels; existing 23 frontend tests stay green.

### Step T-F — Idempotent commands for bracket actions

- Bracket actions (advance winner, record walkover, retire
  participant, restart draw) route through the same
  `POST /tournaments/{tid}/commands` endpoint.
- New `MatchAction` values (or a parallel `BracketAction` enum):
  `advance_match`, `walkover_match`, `retire_participant`,
  `restart_draw`.
- Optimistic UI via the same `commandQueue` IndexedDB primitive
  established in Step F of the architecture-adjustment arc.
- Conflict / stale-version flavours surface through the same
  `ConflictBanner` UI from Step G.

**Test gate:** command-log tests extended for bracket actions;
the queue / hook / conflict UI tests stay green.

### Step T-G — Deployment + docs

- `make scheduler` becomes the only entry point (or rename to
  `make shuttleworks` to reflect the unified surface).
- `make tournament` retired with a clear deprecation note.
- `docs/deploy/cloud.md` updated to reflect the single stack +
  the additional Supabase migrations.
- `docs/tech-stack.md` updated: data model widens to include
  bracket tables; architecture diagram shows one backend.
- Old `products/tournament/` directory deleted (or moved to
  `archive/tournament-pre-merge/` for git-history-blame purposes).

**Test gate:** none beyond docs review.

### Step T-H — Smoke test + arc-final commit

- Full end-to-end: director runs both a meet and a bracket from
  one dashboard, browser operators interact with both, TV
  display reads both via Realtime, conflict UX surfaces
  uniformly.
- Single commit per the architecture-adjustment arc's
  convention; commit message
  `arch: unify scheduler + tournament backends`.

**Test gate:** the full pytest + Vitest + tsc suite passes;
manual smoke test against a running `make scheduler` stack.

---

## Risks

- **Scope drift.** The tournament product is described as a
  "prototype" in its README. Some of its features (live
  advancement, mid-event actions like walkovers) may not be
  fully production-ready. Audit what actually works before
  merging — merging half-baked features into the production
  scheduler backend regresses reliability.

- **Data model conflict.** The scheduler product's "tournament"
  noun is conceptually a *meet*. Merging brings the tournament
  product's "tournament" noun (a *bracket draw*) under the same
  table without a clean rename invites confusion. The schema
  decision in Step T-B is load-bearing — the cleaner long-term
  shape is `events(kind enum)` rather than treating brackets as
  children of `tournaments`.

- **Frontend shell merging.** Folding the tournament frontend
  into the scheduler React app is real UX work — different
  navigation models, different layouts, different mental models
  for "the same thing." Step T-E is the biggest UX surface in
  the arc.

- **Auth retrofit.** The tournament product has no auth today.
  Adding role gates without breaking the existing usage pattern
  (anonymous direct access) is a small UX problem; an existing
  user who hasn't been told about auth will hit a login wall.

- **Test infra split.** Tournament product's tests use a
  different pytest layout than the scheduler's. Consolidating
  the test suites is a meaningful task in itself.

---

## Estimated effort

3–4 weeks of focused work for one person, broken across T-A
through T-H. Same cadence as the architecture-adjustment arc
(which spanned ~one workday of intensive editing per step but
took the full arc to land safely).

---

## Decision point before starting

Before kicking off the merge arc, verify:

1. **Is the bracket-draw workflow actually used in production?**
   The meet workflow is the documented day-of-tournament cockpit.
   Brackets may be an aspirational feature or a real one — that
   answer determines whether to invest.

2. **Who maintains brackets and how often?** If brackets are a
   once-a-season-event (not weekly), the maintenance cost may
   exceed the value. The tournament product's prototype-stage
   features may be fine as-is — the issue is only the
   frontend-doesn't-match-backend split.

3. **Whether the prototype-stage features are stable.** If
   bracket advancement or walkover handling has open bugs, those
   need fixing **before** merging into the scheduler's
   production-ready backend, not after.

If brackets aren't actually used, **the cheaper move is to
decommission the tournament product** entirely. The dashboard's
Tournament button goes away, `products/tournament/` gets deleted,
the merge arc is unnecessary. ~1 day instead of 3–4 weeks.

This roadmap only makes sense if brackets are a real workflow
worth investing in.

---

## What you'd actually merge

If the decision is "yes, merge," the artifacts that survive into
the unified backend:

- `products/tournament/tournament/` — the bracket draw +
  advancement + format modules. Pure Python, no FastAPI. Moves
  into a new `scheduler_core/bracket/` or similar shared
  location (depending on whether it's truly sport-agnostic).
- `products/tournament/backend/schemas.py` — Pydantic models
  for bracket events. Merge into scheduler's `app/schemas.py`.
- `products/tournament/frontend/src/` — UI for bracket
  visualisation + advancement. Merges into scheduler's
  `features/bracket/` or similar.

What gets retired:

- `products/tournament/backend/main.py` — the standalone FastAPI
  app.
- `products/tournament/backend/state.py` — the in-memory state.
- `products/tournament/backend/serializers.py` — folds into the
  scheduler's repository / DTO layer.
- `products/tournament/docker-compose.yml` — one Compose file.
- `products/tournament/Makefile` — folds into root.
- The :5174 / :8765 ports.

---

## Execution sequence

The eight T-A through T-H steps land across four PRs, ~2-3 weeks
total. Faster than the original 3-4 week estimate because the
CP-SAT engine is already shared via `scheduler_core/` — the
expensive part is already done.

### Decisions locked (2026-05-13)

1. **Schema:** bracket events are children of the existing
   `tournaments` table — `bracket_events` etc. FK to
   `tournaments(id)`. Cheaper than renaming `tournaments` →
   `events(kind)`; the schema is staged so the rename can land
   later as a cosmetic cleanup if needed.
2. **Dialog:** the dashboard's Meet | Tournament dialog stays
   as-is through PRs 1-2 and collapses to a single "New event"
   form in PR 3 once both kinds live in the same backend.
3. **Auth:** bracket routes get `require_tournament_access(min_role)`
   matching the scheduler pattern. Anonymous access on the
   tournament product ends with the merge.

### PR 1 — Schema + repository (T-A) — invisible to users

- Alembic migration `f7a3c9b2e8d4_step_t_a_bracket_schema` on top
  of `e2a5f3b8c1d6` adds `bracket_events`, `bracket_participants`,
  `bracket_matches`, `bracket_results`.
- SQLAlchemy models in `products/scheduler/backend/database/models.py`.
- `_LocalBracketRepo` in `products/scheduler/backend/repositories/local.py`
  matching the `_LocalMatchRepo` shape.
- Supabase: equivalent Postgres DDL applied via MCP migration
  `step_t_a_bracket_schema_and_rls` with RLS + `_select_member`
  policies gated by `app.role_in_tournament()`.
- Tournament product **untouched** — still runs on its own stack.
- Test gate: 369 scheduler backend + 23 frontend tests stay
  green; new 28 tests for `_LocalBracketRepo`.

### PR 2 — Backend route merge + auth + sync (T-B + T-C + T-D)

- Move `products/tournament/backend/main.py` and the
  `products/tournament/tournament/` pure-Python package into the
  scheduler backend.
- Routes: `/tournament/*` → `/tournaments/{tid}/bracket/*`. Old
  paths return 410 Gone.
- Every bracket route wraps `require_tournament_access(min_role)`.
- In-memory `container.py` state replaced with `_LocalBracketRepo`
  calls.
- Bracket writes flow through `sync_queue` (same outbox);
  `SyncService` learns `bracket_match`, `bracket_event` entity
  types. `bracket_*` tables added to `supabase_realtime` publication.
- Tournament-product Docker service retired; tournament frontend
  (still at :5174) has its apiClient pointed at :8000.
- Test gate: all tests green; tournament-product flows now run
  authenticated; outbox replication test extended for brackets.

### PR 3 — Frontend merge + commands + dialog (T-E + T-F)

- Tournament React app folds into `products/scheduler/frontend/`.
  New `Bracket` tab in `AppShell` + matching dashboard
  list-section.
- Bracket actions route through `POST /tournaments/{tid}/commands`
  with new `BracketAction` enum values; optimistic UI inherits
  existing `commandQueue` + `ConflictBanner`.
- Frontend subscribes to bracket changes via Supabase Realtime
  (parallel to `subscribeToMatches`).
- **Dashboard dialog collapses** to a single form: name + date +
  kind selector. `VITE_TOURNAMENT_APP_URL` env var removed.
- `products/tournament/frontend/` retired.

### PR 4 — Decommission + docs (T-G + T-H)

- Delete `products/tournament/` (or archive to
  `archive/tournament-pre-merge/` for git-blame).
- One Makefile target. `make tournament` removed.
- `docs/tech-stack.md`, `docs/deploy/cloud.md` updated.
- Smoke test against running `make scheduler` stack.
- Final commit: `arch: unify scheduler + tournament backends`.

---

## Cross-references

- `docs/tech-stack.md` — current architecture (scheduler-only).
- `docs/deploy/cloud.md` — current deploy guide (will need an
  update at T-G).
- `docs/changes/2026-05-13.md` — the architecture-adjustment arc
  per-step ledger. This roadmap is intentionally modelled on its
  structure.
- `products/scheduler/README.md` — scheduler product overview.
- `products/tournament/README.md` — tournament product overview
  (will be retired at T-G).
- `scheduler_core/README.md` — shared CP-SAT engine. Both
  backends import from here today; PR 2 may grow this package
  if bracket-side draw / advancement logic is genuinely
  sport-agnostic enough to live alongside the shared engine
  rather than under the scheduler-product tree.
