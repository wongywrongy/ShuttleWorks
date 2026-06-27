# System overview

ShuttleWorks is described as **four architectural modules** over a shared CP-SAT engine and a
single SQLite-backed persistence layer. This page is the map: what each module owns, what it
produces, and what it consumes. The seams *between* modules are documented in
[Module contracts](/contracts/).

## Two tiers of module

```
              ┌─────────────────────── Workspace ───────────────────────┐
              │                                                          │
  Tier 1      │   ┌────────┐        ┌─────────┐              ┌────────┐  │
 (user,       │   │  Meet  │        │ Bracket │              │Display │  │
  enableable) │   └───┬────┘        └────┬────┘              └───▲────┘  │
              │       │ ScheduleDTO      │ BracketTournamentDTO  │       │
              │       ▼                  ▼                       │       │
  Tier 2      │   ┌──────────────────────────────────┐  MatchStateDTO   │
 (architectural│  │           Operations             │──────────┘       │
  always-on)  │   │   (court layout + live status)   │                  │
              │   └──────────────────────────────────┘                  │
              └──────────────────────────────────────────────────────────┘
                       all over  scheduler_core (CP-SAT)  +  SQLite
```

- **Tier 1 — user-facing modules**: `Meet`, `Bracket`, `Display`. These appear in the module
  catalog, have a row in the `workspace_modules` table, and are members of the `ModuleId` union
  (`'meet' | 'bracket' | 'display'`).
- **Tier 2 — architectural module**: `Operations`. It owns real nav, routes, and a store slice,
  but it is **always-on and has no enable flag**. In code it is the `'operations'` arm of
  `ArchModuleId = ModuleId | 'operations'`.

This split is declared, and **test-enforced**, in
`frontend/src/platform/contracts/moduleContract.ts` — see [Module contracts](/contracts/).

## What each module owns

| Module | Owns (nav surfaces) | Owns (backend routes) | Produces | Consumes |
| --- | --- | --- | --- | --- |
| **Meet** | Roster · Matches · Configuration | `/schedule*`, `…/schedule/proposals/*`, `…/advisories`, `…/suggestions/*`, `…/director-action` | `ScheduleDTO` | `TournamentConfig`, `PlayerDTO`, `MatchDTO`, `MatchStateDTO` |
| **Bracket** | Roster · Draws · Matches · Configuration | `…/bracket*` (draws, schedule-next, results, match-action, import/export) | `BracketTournamentDTO` (carrying `PlayUnitDTO` / `AssignmentDTO` / `ResultDTO`) | `BracketCreateIn`, `EventIn`, `ResultDTO` |
| **Operations** | Courts · Live (for the active engine) | `…/match-states*`, `…/commands` | `MatchStateDTO` | `ScheduleDTO`, `BracketTournamentDTO` |
| **Display** | Preview · Configuration | *(none — poll-only)* | *(none)* | `TournamentStateDTO`, `MatchStateDTO`, `BracketTournamentDTO` |

A few things worth internalising:

- **Meet and Bracket are the two engines.** They are mutually exclusive *as the active engine* in
  a workspace today — the left-nav "Operations" section points at whichever engine is running
  (`schedule`/`live` for Meet, `bracket-schedule`/`bracket-live` for Bracket).
- **Operations is the live-ops layer.** It turns an engine's *plan* (a `ScheduleDTO` or a
  `BracketTournamentDTO`) into a *court layout of live matches*, and it owns the match-state
  machine (call → start → finish/score) and the idempotent command queue.
- **Display owns no backend route.** It is strictly read-only and **polls** — it consumes the
  persisted tournament state, the live match states, and the bracket snapshot.
- **`/state` is shared, not owned by Meet.** The persisted tournament blob (`GET/PUT …/state`)
  lives in the control-plane `tournaments` router and is *consumed* by Meet, not owned by it.

## What each module produces (the DTO vocabulary)

The cross-module wire vocabulary is a small, typed set of DTOs:

- `ScheduleDTO` — the solved meet schedule (court/slot assignments). **Meet → Operations.**
- `BracketTournamentDTO` — the full bracket snapshot (events, play-units, assignments, results,
  participants). **Bracket → Operations and → Display.**
- `MatchStateDTO` — live match status + timestamps + score. **Operations → Meet and → Display.**
- `TournamentStateDTO` — the persisted workspace state blob. **shared → Display.**

These four are the substance of the [module contracts](/contracts/).

## The shared foundation

Everything sits on two shared layers:

- **`scheduler_core/`** — a pure-Python CP-SAT engine (OR-Tools), no HTTP and no I/O. Both Meet
  schedules and Bracket round scheduling call into it. See
  [ADR 0004](/decisions/0004-ortools-cpsat-engine) and `scheduler_core/README.md`.
- **SQLite via SQLAlchemy 2.0** — the canonical persistence, with Alembic migrations, fronted by
  `repositories/local.py` (`LocalRepository`). A background outbox mirrors writes to Supabase. See
  [ADR 0003](/decisions/0003-sqlite-as-primary-persistence) and [Data flow](/architecture/data-flow).

## Where to go next

- [Workspace model](/architecture/workspace-model) — what a workspace is, how modules are persisted, the status lifecycle.
- [Data flow](/architecture/data-flow) — how a plan becomes a live court and reaches the display.
- [State management](/architecture/state-management) — the four Zustand stores.
- [Backend structure](/architecture/backend-structure) — routes, models, migrations, signals.
- [Module contracts](/contracts/) — the three wired seams, made explicit.
