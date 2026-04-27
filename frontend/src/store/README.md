# store/

Two Zustand stores. The split is deliberate: tournament data is
import/export-portable, theme preference is per-device.

## Stores

| Store | File | Persistence | Scope |
|---|---|---|---|
| `useAppStore` | `appStore.ts` | server-side `/tournament-state` (debounced PUTs from `useTournamentState`) | the working tournament |
| `usePreferencesStore` | `preferencesStore.ts` | localStorage key `scheduler-app-preferences` | per-device theme |

Theme **must not** be wiped when a tournament file is imported; that's
why it lives in its own store with its own storage key. Don't merge the
two.

## `useAppStore` slices

The store is one big object but reads as named slices. Roughly:

| Slice | Fields | Actions |
|---|---|---|
| Shell / tabs | `activeTab` | `setActiveTab` |
| Tournament config | `config` | `setConfig` |
| Roster | `groups`, `players` | `setGroups`/`updateGroup`, `setPlayers`/`updatePlayer` |
| Matches | `matches` | `setMatches`/`updateMatch` |
| Schedule | `schedule`, `scheduleStats`, `scheduleIsStale` | `setSchedule`, `setScheduleStats`, `setScheduleStale` |
| Solver run state | `isGenerating`, `generationProgress`, `generationError` | `setIsGenerating`, `setGenerationProgress`, `setGenerationError` |
| Solver HUD | `solverHud` | `setSolverHud`, `resetSolverHud` |
| Solver log | `solverLogs` | (push helpers, `clearSolverLogs`) |
| Drag-validate | `pendingPin`, `lastValidation` | `setPendingPin`, `setLastValidation` |
| Persistence status | `persistStatus`, `lastSavedAt`, `lastSaveError` | `setPersistStatus`, `setLastSavedAt`, `setLastSaveError` |
| Live tracking | `matchStates`, `currentTime`, `lastSynced` | `setMatchStates`, `setMatchState`, `setCurrentTime`, `setLastSynced` |
| Toasts | `toasts` | `pushToast`, `clearToasts` |
| Whole-store reset | – | `clearAllData` |

`pushToast` returns the toast id so callers can dismiss it later.

## Persistence boundary

`useTournamentState` (in `../hooks/`) is the only consumer that owns
the round-trip with `/tournament-state`. The `partialize` inside
`appStore.ts`'s `persist(...)` controls exactly which fields ride along
— ephemeral fields (`solverHud`, `pendingPin`, `lastValidation`,
`isGenerating`, `toasts`, …) are intentionally excluded so a refresh
doesn't surface stale solver state.

When adding a new field:

1. Decide if it's per-tournament (goes in `useAppStore`) or per-device
   (goes in `usePreferencesStore`).
2. If it should survive a reload, add it to the `partialize` allowlist
   in the same file. If not, leave it out — the default is
   non-persistent for new fields.

## Subscribing

Components should subscribe to the *narrowest possible slice* with a
shallow-equality selector to avoid unnecessary re-renders:

```ts
const matches = useAppStore((s) => s.matches);
const setMatches = useAppStore((s) => s.setMatches);
```

For multiple fields, a shallow selector is fine; for many fields, just
read them individually.
