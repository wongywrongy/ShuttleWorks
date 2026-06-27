# State management

The frontend state is split across **four Zustand stores**, divided by lifetime and persistence.
The rule across all of them: **components never call the API directly** — they call a hook, the
hook calls `apiClient`, the hook updates the store. That keeps optimistic updates and rollback in
one place.

## The four stores

| Store | File | Persistence | What it owns |
| --- | --- | --- | --- |
| **Tournament** | `store/tournamentStore.ts` | server snapshot — debounced (`500 ms`) `PUT /tournaments/{id}/state` via `useTournamentState` | config, roster (meet + bracket), matches, schedule, lock + version state |
| **Match state** | `store/matchStateStore.ts` | `PUT …/match-states/{id}` (+ `POST …/commands`) on **every** mutation (no debounce) | live match transitions, optimistic command state, conflict records, canonical versions |
| **UI** | `store/uiStore.ts` | none — ephemeral, cleared on refresh | active tab + tournament context, solver HUD, toasts, drag/validate, review pipeline |
| **Preferences** | `store/preferencesStore.ts` | `localStorage` (`scheduler-app-preferences`) | theme + density |

The split is deliberate: tournament state moves between machines via import/export and a server
snapshot; theme and density are per-device and must **not** travel.

### Tournament store

The largest store — the editable workspace document. It owns:

- **Config** (`config`, `setConfig`) — courts, slot duration, day window.
- **Roster** — `groups` and `players` for Meet, plus an isolated `bracketPlayers` set for Bracket
  (with a `bracketRosterMigrated` flag).
- **Matches** (`matches`, add/update/delete/import).
- **Schedule** (`schedule`, `setSchedule`, candidate index) plus staleness (`scheduleIsStale`),
  the lock (`isScheduleLocked`, `lockSchedule`/`unlockSchedule`), and two-phase-commit version
  history (`scheduleVersion`, `scheduleHistory`).
- Utilities: `reset()`, `exportData()`, `importData()`.

`setSchedule` is the store edge that **seam A** (Meet → Operations) reacts to — see
[Data flow](/architecture/data-flow) and the [Meet → Operations contract](/contracts/meet-operations).

### Match-state store

Owns live-ops state and the optimistic command machinery:

- `matchStates` snapshots + the derived `liveState` (with `setCurrentTime` / `setLastSynced`).
- `pendingCommandsByMatchId` — every match with an in-flight idempotent command; `applyOptimisticStatus`
  is the write-through path during an optimistic apply (the canonical server state lands later via
  `setMatchState`).
- `recentConflictsByMatchId` — a server-rejected command leaves a record here so the inline
  conflict banner can render (one entry per match; a second conflict overwrites the first).
- `canonicalVersionsByMatchId` — version tracking for the optimistic-concurrency check.

### UI store

Ephemeral shell + interaction state: `activeTab` and the active tournament's id/kind/status; the
solver HUD and solver logs; the toast queue; drag-validate state (`pendingPin`, `lastValidation`);
persistence status; schedule-generation progress; and the review pipeline (`activeProposal`,
`advisories`, `suggestions`). The `AppTab` union defined here is the surface-key vocabulary the
nav and router use (`setup`, `roster`, `matches`, `schedule`, `live`, `tv`, the `bracket-*`
segments, `overview`, `display-config`, and the `ws-*` admin segments).

### Preferences store

Just `theme` (`light | dark | system`) and `density` (`comfortable | compact`), persisted to
`localStorage`. `useAppliedTheme()` / `useAppliedDensity()` resolve these against the OS preference
and toggle classes on `<html>`.

## Cross-store selectors

`store/selectors.ts` holds memoised lookup-map builders so two components reading the same map
share one build: `usePlayerMap()`, `useMatchMap()`, `useGroupMap()`, `useAssignmentByMatchId()`.
Today these read from the **tournament store** only — they are memoisation helpers, not true
cross-store composition.

## Known debt: `matchStateStore`

The match-state store is the store the architecture flags as carrying debt. Two honest notes:

- **It grew by accretion.** Its optimistic-command and conflict layers were added incrementally
  across feature arcs (the "Step F" pending-command map and "Step G" conflict records) rather than
  from a single up-front design, so the store mixes raw match-state snapshots, derived live view,
  optimistic intent, and conflict UI state in one slice.
- **Overlap with the live-ops concern.** Match state is conceptually owned by the **Operations**
  module, but it lives in a frontend store that Meet, Bracket-live, and Display all read. The
  module-contract layer names this seam (`matchStateChanged`) without yet extracting Operations into
  a standalone slice; the architecture audit lists "extract Operations as a first-class product" as
  a structural bet that would give this state a clean home. See
  [the Operations module](/modules/operations) and [Module contracts](/contracts/).

Separately — and in the **`uiStore`**, not here — there is a confirmed-dead `disruptionSummary`
field: **one writer** (`useDisruptionPublisher`, mounted by the Meet product) and **zero readers**
(the TabBar badge it was meant to feed no longer reads it). It is left in place to keep the
contract layer behaviour-preserving; removal is a separate cleanup.

## How this maps to the backend

| Store | Backend route |
| --- | --- |
| Tournament | `GET/PUT /tournaments/{id}/state` (shared, in the `tournaments` router) |
| Match state | `GET/PUT /tournaments/{id}/match-states/*` + `POST …/commands` (Operations) |
| UI / Preferences | none (client-only) |

See [Backend structure](/architecture/backend-structure) for the route side.
