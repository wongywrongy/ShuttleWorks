# System overview

ShuttleWorks is built as **five architectural modules** over a shared CP-SAT engine and a
single SQLite-backed persistence layer. This page is the map: what each module owns, what it
produces, and what it consumes. The seams *between* modules are documented in
[Module contracts](/reference/contracts/).

## Two tiers of module

```
   ┌──────── public ────────┐   ┌─────────────── Workspace ────────────────┐
   │  the entrant tier /e/  │   │                                          │
   │  (its own SSR app)     │   │  ┌─────────┐                             │
   │        submits ────────┼───┼─▶│ Entries │                             │
   └────────────────────────┘   │  └────┬────┘  entriesCommitted           │
                                │       │ PlayerDTO                        │
  Tier 1                        │  ┌────▼───┐   ┌─────────┐   ┌────────┐   │
 (user, enableable)             │  │  Meet  │   │ Bracket │   │Display │   │
                                │  └───┬────┘   └────┬────┘   └───▲────┘   │
                                │      │ ScheduleDTO │ BracketTournamentDTO │
                                │      ▼             ▼            │        │
  Tier 2                        │  ┌────────────────────┐ MatchStateDTO    │
 (architectural, always-on)     │  │     Operations     │─────────┘        │
                                │  │ (Plan + live Run)  │                  │
                                │  └────────────────────┘                  │
                                └──────────────────────────────────────────┘
                       all over  scheduler_core (CP-SAT)  +  SQLite
```

- **Tier 1 — user-facing modules**: `Meet`, `Bracket`, `Display`, `Entries`. These appear in the
  module catalog, have a row in the `workspace_modules` table, and are members of the `ModuleId`
  union (`'meet' | 'bracket' | 'display' | 'entries'`).
- **Tier 2 — architectural module**: `Operations`. It owns real nav, routes, and a store slice,
  but it is **always-on and has no enable flag**. In code it is the `'operations'` arm of
  `ArchModuleId = ModuleId | 'operations'`.

::: info Entries is Tier-1 but cloud-only
`Entries` joined the Tier-1 set in SP-PROGRAM-1 (2026-08-06). It is the one module that cannot be
enabled in local mode — the seed omits it, an inherited row is filtered at read time, and enabling
it answers `409 MODULE_REQUIRES_CLOUD`. That does **not** put the internet on the critical path for
an event: the cloud dependency ends at commit, and nothing on event day reads an entry row. See
[Entries](/reference/modules/entries).
:::

::: tip There are two frontends
The operator console (`apps/console`) is the React + Vite SPA. The public
[**entrant tier**](/explanation/architecture/entrant-tier) (`apps/entrant`) is a separate
server-rendered React Router app under `/e/` that ships **zero client JavaScript**. It is not a
module — it is a delivery tier in front of the Entries module's public data plane.

Since SP-HOST-1 the two are also two **origins**: the console and `/api/` are served on
`app.<domain>` behind Cloudflare Access, the entrant tier on `play.<domain>` with no Access at
all. They were one hostname split by path, which made them one browser origin sharing one cookie
jar — and `Path=` is not enforced against same-origin script.
:::

This split is declared, and **test-enforced**, in
`frontend/src/platform/contracts/moduleContract.ts` (against its colocated
`moduleContract.test.ts`) — see [Module contracts](/reference/contracts/).

## What each module owns

| Module | Owns (nav surfaces) | Owns (backend routes) | Produces | Consumes |
| --- | --- | --- | --- | --- |
| **Meet** | Roster · Matches · Configuration | `…/solve-jobs*` (the async solve rail), `/schedule/validate`, `…/schedule/proposals/*`, `…/advisories`, `…/suggestions/*`, `…/director-action` | `ScheduleDTO` | `TournamentConfig`, `PlayerDTO`, `MatchDTO`, `MatchStateDTO` |
| **Bracket** | Roster · Draws · Matches · Configuration | `…/bracket*` (draws, schedule-next, results + result-command queue, match-action, import/export) | `BracketTournamentDTO` (carrying `PlayUnitDTO` / `AssignmentDTO` / `ResultDTO`) | `BracketCreateIn`, `EventIn`, `ResultDTO` |
| **Operations** | Plan · Run (for the active engine) | `…/match-states*`, `…/commands` | `MatchStateDTO` | `ScheduleDTO`, `BracketTournamentDTO` |
| **Display** | Preview · Configuration | `/display/{token}/*` (public capability-token projection) | *(none — read-only)* | `TournamentStateDTO`, `MatchStateDTO`, `BracketTournamentDTO` |
| **Entries** | Entries (the desk) | `…/entries*` (desk, confirm, commit), `…/entry-page`, `…/entry-events`, plus the public `/e/api/*` + `/e/account/*` data plane | `PlayerDTO` (via the commit seam, into the roster) | `EntryDTO`, `EntryCommitResultDTO` |

:::info Plan / Run were formerly Courts / Live
The Operations nav labels were renamed: **Plan** (the drag-to-reschedule court board) and **Run**
(the live, day-of control board). Older docs and screenshots may still say *Courts* / *Live*. The
URL segments are unchanged — `schedule`/`live` for Meet, `bracket-schedule`/`bracket-live` for
Bracket — only the labels moved. See [Operations](/reference/modules/operations).
:::

A few things worth internalising:

- **Meet and Bracket are the two engines.** A workspace can enable either or both, but it has at
  most one *active* engine (`WsKind = 'meet' | 'bracket' | null`). The left-nav **Operations**
  section points at the active engine's Plan/Run surfaces (`schedule`/`live` for Meet,
  `bracket-schedule`/`bracket-live` for Bracket); when both engines are enabled those surfaces
  interleave both engines' matches — see [Unified Operations view](/explanation/architecture/unified-operations-view).
- **Operations is the live-ops layer.** It turns an engine's *plan* (a `ScheduleDTO` or a
  `BracketTournamentDTO`) into a *court layout of live matches*, and it owns the match-state
  machine (call → start → finish/retire) and the idempotent command queue
  (`POST …/commands`).
- **Bracket results flow through a command queue.** Recording a bracket result and advancing the
  draw routes through `POST /tournaments/{id}/bracket/commands` (`submit_bracket_command`), an
  idempotent, client-id-keyed command — see
  [Bracket result queue](/explanation/architecture/bracket-result-queue) and
  [ADR 0007](/explanation/decisions/0007-bracket-result-command-queue).
- **The meet batch solve is a job, not a request.** Since SP-CLOUD-1, `POST …/solve-jobs`
  enqueues the full solver input into the DB-backed `solve_jobs` queue and a worker executes it
  in a killable subprocess; the client polls the job (the synchronous `POST /schedule` + its SSE
  stream answer `410 Gone`). See [Backend structure](/explanation/architecture/backend-structure).
- **Display is strictly read-only, and its public link is a capability token.** Inside the shell
  it polls the owner-side endpoints; spectators get `/display?token=…`, backed by the
  unauthenticated `/display/{token}/*` projection routes (SP-CLOUD-2) — a strict field allowlist,
  every route `GET`, minted/rotated by the owner at `…/display-token`.
- **`/state` is shared, not owned by Meet.** The persisted tournament blob (`GET/PUT …/state`)
  lives in the control-plane `tournaments` router and is *consumed* by Meet, not owned by it.
- **Entries is intake, and it never writes the roster behind your back.** The public tier collects
  submissions; an operator confirms them; a commit run turns confirmed entries into roster players,
  re-runnably and idempotently, skipping and *reporting* anything it cannot map rather than
  guessing. See [Entries](/reference/modules/entries).

## What each module produces (the DTO vocabulary)

The cross-module wire vocabulary is a small, typed set of DTOs. They are constrained at
compile time to the `DtoName` union in `moduleContract.ts`, so a renamed or removed DTO is a
type error, not silent drift:

- `ScheduleDTO` — the solved meet schedule (court/slot assignments). **Meet → Operations.**
- `BracketTournamentDTO` — the full bracket snapshot (events, play-units, assignments, results,
  participants). **Bracket → Operations and → Display.**
- `MatchStateDTO` — live match status + timestamps + score. **Operations → Meet and → Display.**
- `TournamentStateDTO` — the persisted workspace state blob. **shared → Display.**
- `PlayerDTO` — a roster player. **Entries → Meet** across the commit seam (`entriesCommitted`),
  alongside `EntryDTO` / `EntryCommitResultDTO` on the desk side.

These are the substance of the [module contracts](/reference/contracts/).

## The shared foundation

Everything sits on two shared layers:

- **`packages/scheduler-core/`** — a pure-Python CP-SAT engine (OR-Tools), no HTTP and no I/O. Both Meet
  schedules and Bracket round scheduling call into it. See
  [ADR 0004](/explanation/decisions/0004-ortools-cpsat-engine) and `packages/scheduler-core/scheduler_core/README.md`.
- **SQLite via SQLAlchemy 2.0** — the canonical persistence, with Alembic migrations, fronted by
  `repositories/local.py` (`LocalRepository`); cloud mode runs the same code against Postgres 16.
  Single-store: there is no replication layer, and identity is self-hosted cookie-session
  auth (SP-CLOUD-2). See
  [ADR 0003](/explanation/decisions/0003-sqlite-as-primary-persistence) and [Data flow](/explanation/architecture/data-flow).

## See also

- [Entrant tier](/explanation/architecture/entrant-tier) — the second frontend: the public site under `/e/`.
- [Workspace model](/explanation/architecture/workspace-model) — what a workspace is, how modules are persisted, the status lifecycle.
- [Data flow](/explanation/architecture/data-flow) — how a plan becomes a live court and reaches the display.
- [State management](/explanation/architecture/state-management) — the Zustand stores behind the modules.
- [Backend structure](/explanation/architecture/backend-structure) — routes, models, migrations, signals.
- [Module contracts](/reference/contracts/) — the wired cross-module seams, made explicit.
- [ADR 0001 — Four-module split](/explanation/decisions/0001-four-module-split) · [ADR 0002 — Workspace as control plane](/explanation/decisions/0002-workspace-as-control-plane)
