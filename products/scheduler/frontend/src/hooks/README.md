# hooks/

Cross-feature hooks. Feature-private hooks live next to their feature
folder. The convention: anything used by ≥2 features lives here.

## Index

| Hook | Purpose |
|---|---|
| `useTournament.ts` | Read-only convenience selectors over the tournament config. |
| `useTournamentState.ts` | Hydrate `appStore` from `/tournament-state` on mount; debounce PUTs back on change. The single owner of that round-trip. |
| `useSchedule.ts` | Trigger `/schedule/stream` (SSE), feed events into the solver-HUD slice, and write the final result into `appStore.schedule`. |
| `useRepair.ts` | Calls `/schedule/repair` and `/schedule/warm-restart`; surfaces loading state for the disruption / re-plan dialogs. |
| `useLiveTracking.ts` | Match status state machine (`scheduled` → `called` → `started` → `finished`). Validates transitions and writes through to `/match-state`. |
| `useLiveOperations.ts` | Drag-target validation + optimistic pin during the live ops flow. |
| `useCurrentSlot.ts` | Wall-clock slot index for the current tournament config, refreshed every minute. |
| `useMatches.ts` | Selectors + helpers over `appStore.matches`. |
| `useRoster.ts` | Selectors over players + groups. |
| `useRosterGroups.ts` | School / group helpers. |
| `usePlayerNames.ts` | `playerId → display name` memoised lookup. |
| `useTrafficLights.ts` | Memoised wrapper over `utils/trafficLight.ts` that computes per-match readiness lights. |
| `useSmoothedAssignments.ts` | Smooth out solver-progress flicker when many partial solutions arrive in quick succession. |
| `useLockGuard.ts` | Block destructive actions while a tournament is locked. |
| `useSearchParamState.ts` | URL-backed local state with debounced history-replace; used by inline search/filter widgets. |
| `useAppliedTheme.ts` | Read theme preference, resolve `system` against `prefers-color-scheme`, toggle `.dark` on `<html>`. |
| `useAppliedDensity.ts` | Reflect density preference onto `<html>` via `data-density`; mount alongside `useAppliedTheme`. |
| `useAnimatedNumber.ts` | Tween a number for the HUD counters. |

## Conventions

- Hooks own optimistic updates and rollback. Components dispatch
  intent ("call this match"); the hook updates the store immediately,
  fires the API call, and reverts the store on failure.
- Hooks should never accept `setState` callbacks from components —
  they read and write the store directly. Components subscribe to
  the resulting state.
- A hook that reads-only should still live here if it does
  non-trivial composition or memoisation. Trivial selectors don't
  need their own hook — reach for `store/selectors.ts`.

## Adding a hook

1. Drop it under `frontend/src/hooks/`.
2. If it talks to the backend, route through
   `frontend/src/api/client.ts` so the request-id middleware + toast
   plumbing wires up automatically.
3. If it mutates `appStore`, call store actions — never `set(...)`
   from outside the store file.
