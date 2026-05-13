# store/

Four Zustand stores, each aligned with its persistence boundary so a
mutation can never accidentally cross one.

## Stores

| Store | File | Persistence | Scope |
|---|---|---|---|
| `useTournamentStore` | `tournamentStore.ts` | server-side `/tournament-state` (debounced PUTs from `useTournamentState`) | the working tournament |
| `useMatchStateStore` | `matchStateStore.ts` | server-side `/match-state` (immediate PUTs per transition) | live operator state |
| `useUiStore` | `uiStore.ts` | none — never serialised | toasts, solver HUD, drag pins, generation progress, advisory review |
| `usePreferencesStore` | `preferencesStore.ts` | localStorage key `scheduler-app-preferences` | per-device theme + density |

`selectors.ts` holds memoised lookup-map hooks (`usePlayerMap`,
`useMatchMap`, `useGroupMap`, `useAssignmentByMatchId`) that build the
map once per source-array reference so two components reading the same
map share the build.

Theme + density **must not** be wiped when a tournament file is
imported; that's why they live in their own store with their own
storage key.

## Slice ownership

| Slice | Store | Fields |
|---|---|---|
| Tournament config | `useTournamentStore` | `config` |
| Roster | `useTournamentStore` | `groups`, `players` |
| Matches | `useTournamentStore` | `matches` |
| Schedule | `useTournamentStore` | `schedule`, `scheduleIsStale`, `isScheduleLocked` |
| Two-phase commit | `useTournamentStore` | `scheduleVersion`, `scheduleHistory` |
| Live tracking | `useMatchStateStore` | `matchStates`, `liveState` |
| Shell / tabs | `useUiStore` | `activeTab` |
| Solver HUD | `useUiStore` | `solverHud`, `solverLogs` |
| Solver run state | `useUiStore` | `isGenerating`, `generationProgress`, `generationError`, `scheduleStats` |
| Drag-validate | `useUiStore` | `pendingPin`, `lastValidation` |
| Persistence status | `useUiStore` | `persistStatus`, `lastSavedAt`, `lastSaveError` |
| Toasts | `useUiStore` | `toasts` |
| Review pipeline | `useUiStore` | `activeProposal`, `advisories`, `suggestions`, `pendingAdvisoryReview`, `unlockModalState` |

`pushToast` returns the toast id so callers can dismiss it later.
`clearAllData` lives on `useTournamentStore` and also resets the match
and UI stores.

## Persistence boundary

- `useTournamentState` (in `../hooks/`) hydrates `useTournamentStore`
  from the server snapshot on mount and debounces a PUT back ~500 ms
  after any persisted-field change.
- `useLiveTracking` / `useLiveOperations` (in `../hooks/`) round-trip
  `useMatchStateStore` against `/match-state` immediately on every
  transition.
- `useUiStore` is never serialised. A refresh always lands the operator
  on a clean ephemeral slate; that's deliberate.

When adding a new field:

1. Decide which persistence boundary it belongs to and put it in that
   store.
2. If it's frontend-only and should survive a reload, add it to
   `usePreferencesStore` (per-device).
3. If it's ephemeral, leave it in `useUiStore` — refreshes will reset
   it, which is usually what you want for HUD-like state.

## Subscribing

Components should subscribe to the *narrowest possible slice*:

```ts
const matches = useTournamentStore((s) => s.matches);
const setMatches = useTournamentStore((s) => s.setMatches);
```

Selectors that need fields from more than one store should call the
relevant hooks independently rather than trying to combine the
stores — combined views lose Zustand's per-selector re-render
optimisation.
