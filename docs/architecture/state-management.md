# State management

How the scheduler frontend holds state and writes it back to the server. For frontend
contributors adding stores, hooks, or surfaces. The state is split across **four Zustand stores**,
divided by lifetime and persistence; the rule across all of them is that **components never call
the API directly** — they call a hook, the hook calls `apiClient`, the hook updates the store. That
keeps optimistic updates and rollback in one place.

## The four stores

Four stores live under `products/scheduler/frontend/src/store/`, each aligned with a persistence
boundary so a mutation can never accidentally cross one.

| Store | File | Persistence | What it owns |
| --- | --- | --- | --- |
| **Tournament** | `tournamentStore.ts` | server snapshot — debounced (`500 ms`) `PUT /tournaments/{id}/state` via `useTournamentState` | config, roster (meet + bracket), matches, schedule, lock + two-phase-commit version state, plan-finalized flag |
| **Match state** | `matchStateStore.ts` | `PUT …/match-states/{id}` per transition + `POST …/commands` per optimistic command (no debounce) | live match transitions, optimistic command state, conflict records, canonical versions |
| **UI** | `uiStore.ts` | none — ephemeral, cleared on refresh | active tab + tournament context, solver HUD, toasts, drag/validate, persist status, review pipeline |
| **Preferences** | `preferencesStore.ts` | `localStorage` (`scheduler-app-preferences`) | theme + density |

The split is deliberate: tournament state moves between machines via import/export and a server
snapshot; theme and density are per-device and must **not** travel. Each store exposes its own
`reset()` so a wipe of one slice never reaches across the persistence boundary.

### Tournament store

The largest store — the editable workspace document. It owns:

- **Config** (`config`, `setConfig`) — courts, slot duration, day window. `setConfig` only marks the
  schedule stale when a *scheduling* field changes; pure display knobs (`scoringFormat`, the `tv*`
  render settings) are listed in `NON_SCHEDULING_KEYS` and never trip the stale flag or the lock guard.
- **Roster** — `groups` and `players` for Meet, plus an isolated `bracketPlayers` set for Bracket
  (with a `bracketRosterMigrated` flag). Bracket roster data is kept separate from `players` by design.
- **Matches** (`matches`, `addMatch`/`updateMatch`/`deleteMatch`/`importMatches`/`setMatches`).
- **Schedule** (`schedule`, `setSchedule`, `setActiveCandidateIndex`) plus staleness (`scheduleIsStale`),
  the lock (`isScheduleLocked`, `lockSchedule`/`unlockSchedule`), and the two-phase-commit version
  history (`scheduleVersion`, `scheduleHistory`).
- **Plan-finalized** (`planFinalized`, `setPlanFinalized`) — the operations Run gate: the director's
  signal that the committed plan is ready to run. Mirrored into the persisted snapshot.
- Utilities: `reset()`, `exportData()`, `importData()`.

`setSchedule` is the store edge that **seam A** (Meet → Operations) reacts to — see
[Data flow](/architecture/data-flow) and the [Meet → Operations contract](/contracts/meet-operations).

:::warning Include the v2 fields in every PUT
`useTournamentState`'s `snapshot()` serialises `scheduleVersion`, `scheduleHistory`, and
`planFinalized` on **every** PUT. Omitting them lets Pydantic's defaults (`0` / `[]` / `false`)
overwrite the server's committed values whenever an operator edits an unrelated config field — which
silently wipes the proposal-commit audit trail and the Run gate. See `snapshot()` in
`hooks/useTournamentState.ts`.
:::

### Match-state store

Owns live-ops state and the optimistic command machinery. It is written immediately on every
transition (no debounce) because the mutations carry operator intent that must not be lost:

- `matchStates` snapshots + the derived `liveState` (with `setCurrentTime` / `setLastSynced`).
- `pendingCommandsByMatchId` — every match with an in-flight idempotent command;
  `applyOptimisticStatus` is the write-through path during an optimistic apply (the canonical server
  state lands later via `setMatchState`).
- `recentConflictsByMatchId` — a server-rejected command leaves a `ConflictRecord` here so the inline
  conflict banner can render (one entry per match; a second conflict overwrites the first, no log).
- `canonicalVersionsByMatchId` — version tracking for the optimistic-concurrency check; the command
  queue reads it to stamp `seen_version` on outbound commands.

The status enum the store speaks is the legacy four-state machine (`scheduled` → `called` →
`started` → `finished`); `useCommandQueue` translates the backend's canonical statuses (`playing`,
`retired`, …) back into it on the way in.

### UI store

Ephemeral shell + interaction state, never serialised. A refresh always lands the operator on a
clean slate, which is deliberate. It holds:

- **Shell + tournament context** — `activeTab`, plus `activeTournamentId`, `activeTournamentKind`
  (`meet | bracket`), `activeTournamentStatus` (`draft | active | archived`), and `bracketDataReady`.
  These are stamped on mount by `useTournamentState` and `useTournamentKind` / `BracketTab`, and let
  module-level helpers and the shell chrome reason about the active tournament without React Router params.
- **Solver HUD + logs** — `solverHud`, `solverLogs`, and the generation lifecycle
  (`isGenerating`, `generationProgress`, `generationError`, `scheduleStats`).
- **Drag-validate** — `pendingPin`, `lastValidation`.
- **Persist status** — `persistStatus` (`idle | dirty | saving | error`), `lastSavedAt`, `lastSaveError`.
- **Toasts** — `toasts` (`pushToast` returns the id so callers can dismiss later).
- **Review pipeline** — `activeProposal`, `advisories`, `suggestions`, `pendingAdvisoryReview`,
  `unlockModalState`; plus bracket-surface UI bits (`bracketSelectedMatchId`,
  `bracketScheduleEventFilter`).

The `AppTab` union defined here is the surface-key vocabulary the nav and router use: `setup`,
`roster`, `matches`, `schedule`, `live`, `tv`, the `bracket-*` segments (`bracket-setup`,
`bracket-roster`, `bracket-events`, `bracket-draws`, `bracket-draw`, `bracket-matches`,
`bracket-schedule`, `bracket-live`), the shell segments `overview` and `display-config`, and the
`ws-*` workspace-admin segments (`ws-venue`, `ws-members`, `ws-sharing`, `ws-modules`, `ws-sync`,
`ws-settings`).

### Preferences store

Just `theme` (`light | dark | system`) and `density` (`comfortable | compact`), persisted to
`localStorage` under `scheduler-app-preferences` via Zustand's `persist` middleware.
`useAppliedTheme()` / `useAppliedDensity()` resolve these against the OS preference and toggle
classes / `data-density` on `<html>`. They live in their own store with their own key so a
tournament import/export can never clobber a director's per-device UI choices.

## The hooks seam

Hooks under `products/scheduler/frontend/src/hooks/` are the only code that talks to the backend
and the only code that mutates a store from outside the store file. The convention:

- **Components dispatch intent**, hooks own the round-trip. A component calls `submit('call_to_court', …)`;
  the hook applies the optimistic store update, fires the API call through `api/client.ts`, and
  reverts the store on failure.
- **Hooks never accept `setState` callbacks** from components — they read and write the store
  directly, and components subscribe to the resulting state.
- Anything talking to the backend routes through `apiClient` so the request-id middleware and toast
  plumbing wire up automatically.

The persistence hooks are the owners of each store's server round-trip: `useTournamentState`
hydrates the tournament store on mount and debounces the PUT back; `useLiveTracking` /
`useLiveOperations` round-trip the match-state store against `/match-states` immediately on every
transition. Read-only composition (`usePlayerNames`, `useTrafficLights`, `useMatches`, …) lives here
too when it does non-trivial memoisation.

## Optimistic command queues

Two operator write paths run through IndexedDB-backed queues so a command survives a reload or a
brief disconnect, and the queue's idempotency key lets the backend deduplicate a replay. Each queue
is wrapped by a hook that exposes a single `submit`.

| Queue | Hook | Backend route | View-model |
| --- | --- | --- | --- |
| Match commands | `useCommandQueue` | `POST /tournaments/{id}/commands` | writes through `matchStateStore` |
| Bracket results | `useBracketResultQueue` | `POST /tournaments/{id}/bracket/commands` | injected by the caller |

`useCommandQueue.submit(action, matchId, payload?)` (in `hooks/useCommandQueue.ts`) drives the
operator surfaces (call-to-court, start, finish, assign-court, postpone, …):

```text
1. mint a UUID command id (the idempotency key)
2. applyOptimisticStatus + setPendingCommand    (store reflects the action instantly)
3. enqueue the command in IndexedDB, then flush  (best-effort)
4. route the outcome:
   200 ok            -> clearPendingCommand, write authoritative state, cache the new version
   409 stale_version -> recordConflict, refetch from server (roll back on refetch failure)
   409 conflict      -> recordConflict, refetch (permanent rejection)
   network error     -> leave pending; the next flush retries
```

The version stamped on each command (`seen_version`) comes from `canonicalVersionsByMatchId`; on a
cache miss the hook cold-reads the match's version via the legacy match-state route's ETag.

`useBracketResultQueue.submit(input)` (in `hooks/useBracketResultQueue.ts`) mirrors this for bracket
result writes, routing through the Operations command endpoint (`kind: 'record_result'`). Bracket
has **no** match-state store — its match model is separate per [ADR 0006](/decisions/0006-unified-scheduling-core) —
so the optimistic-apply / settle / conflict callbacks are injected by the caller; the hook owns only
the queue, the UUID, the flush, and the outcome routing. See
[Bracket result queue](/architecture/bracket-result-queue) and
[ADR 0007](/decisions/0007-bracket-result-command-queue) for the backend side.

## Cross-store selectors

`store/selectors.ts` holds memoised lookup-map builders so two components reading the same map share
one build: `usePlayerMap()`, `useMatchMap()`, `useGroupMap()`, `useAssignmentByMatchId()`. Each
builds the map once per source-array reference (Zustand keeps array refs stable until a mutation),
so the O(n) build is paid once between updates rather than per render. Today these read from the
**tournament store** only — they are memoisation helpers, not true cross-store composition. Selectors
that genuinely need fields from two stores should call each store's hook independently; combining
stores loses Zustand's per-selector re-render optimisation.

## Known debt: `matchStateStore`

The match-state store is the store the architecture flags as carrying debt. Two honest notes:

- **It grew by accretion.** Its optimistic-command and conflict layers were added incrementally
  across feature arcs (the "Step F" pending-command map and "Step G" conflict records) rather than
  from a single up-front design, so the store mixes raw match-state snapshots, the derived live view,
  optimistic intent, and conflict UI state in one slice.
- **Overlap with the live-ops concern.** Match state is conceptually owned by the **Operations**
  module, but it lives in a frontend store that Meet, Bracket-live, and Display all read. The
  module-contract layer names this seam (`matchStateChanged`) without yet extracting Operations into
  a standalone slice; the architecture audit lists "extract Operations as a first-class product" as a
  structural bet that would give this state a clean home. See [the Operations module](/modules/operations)
  and [Module contracts](/contracts/).

## How this maps to the backend

| Store / path | Backend route |
| --- | --- |
| Tournament | `GET/PUT /tournaments/{id}/state` (shared, in the `tournaments` router) |
| Match state | `GET/PUT /tournaments/{id}/match-states` (+ `/{matchId}`) (Operations) |
| Match commands | `POST /tournaments/{id}/commands` (optimistic operator writes) |
| Bracket results | `POST /tournaments/{id}/bracket/commands` (record-result commands) |
| UI / Preferences | none (client-only) |

See [Backend structure](/architecture/backend-structure) for the route side.

## See also

- [Data flow](/architecture/data-flow) — how a write travels store → seam → consumer.
- [Operations module](/modules/operations) — the live-ops surface that reads the match-state store.
- [Bracket result queue](/architecture/bracket-result-queue) — the bracket write path in depth.
- [Backend structure](/architecture/backend-structure) — the routers behind these stores.
- [ADR 0007 — Bracket result command queue](/decisions/0007-bracket-result-command-queue)
- [ADR 0009 — Universal match contract](/decisions/0009-universal-match-contract)
