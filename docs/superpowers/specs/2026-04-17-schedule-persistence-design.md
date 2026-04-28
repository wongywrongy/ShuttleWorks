# Schedule persistence + solver determinism — design

**Status:** approved for implementation
**Date:** 2026-04-17
**Scope:** one single-operator tournament per deployment

## Problem

Two user-reported issues, both about schedule stability over time:

1. **Refreshing the browser loses the generated schedule.** The Zustand store persists `config`, `groups`, `players`, and `matches` to `localStorage`, but deliberately excludes `schedule` and `scheduleStats` (`frontend/src/store/appStore.ts:397-403`). On reload the schedule is gone.
2. **Clicking "Generate" again produces a different schedule even when nothing changed.** CP-SAT in `src/scheduler_core/engine/cpsat_backend.py:610` runs with `num_search_workers = 4` and no `random_seed`, so parallel workers race and tied objective values break differently each run.

The user also asked for server-side file persistence rather than a browser-local store, with the same idiom as the existing `backend/api/match_state.py`.

## Goals

- **Schedule survives a browser refresh**, a closed tab, a different browser on the same machine, and a container restart.
- **Re-generate is reproducible** — identical config / players / matches produce a byte-identical schedule.
- **Edits after a generated schedule is saved don't silently destroy it.** The schedule stays; a visible "stale" badge tells the user it may be out of date.
- **No user-facing save button** — persistence is background/auto.
- **No multi-tournament chrome** (picker, rename, delete). One tournament per deployment for v1.

## Non-goals

- Multi-tenant or multi-tournament (picker UI, tournament list, rename/delete).
- Multi-user concurrency — if two browsers edit concurrently, last-writer-wins is acceptable.
- Undo / revision history.
- Diff-based partial saves.

## Architecture

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  React app (browser)     │        │  FastAPI backend         │
│                          │        │                          │
│  Zustand store           │        │  /tournament/state       │
│    ├─ hydrate on mount ◀─┼────────┼─ GET                     │
│    └─ debounced PUT ─────┼────────┼▶ PUT  ◀─► data/          │
│                          │        │              tournament. │
│  stale badge when        │        │              json        │
│  `scheduleIsStale`       │        │                          │
└──────────────────────────┘        └──────────────────────────┘
                                               │
                                          docker volume
```

### State model — `data/tournament.json`

Single canonical document, versioned for future migrations.

```json
{
  "version": 1,
  "updatedAt": "2026-04-17T20:00:00Z",
  "config": { ... },
  "groups": [ ... ],
  "players": [ ... ],
  "matches": [ ... ],
  "schedule": { ... } | null,
  "scheduleStats": { ... } | null,
  "scheduleIsStale": false
}
```

**`matchStates` is out of scope for this file.** Live-operations state stays in the existing `/match-states` endpoints (`match_states.json`), which already has its own persistence. Keeping them separate avoids two sources of truth for the same object.

### Backend

New router `backend/api/tournament_state.py`, registered in `backend/app/main.py`.

| Endpoint | Semantics |
|---|---|
| `GET  /tournament/state` | Return the JSON file contents. `200` with body on success, `204` with no body when file is missing (treated as "first launch") so the frontend can cleanly branch. |
| `PUT  /tournament/state` | Replace the file with the request body. `updatedAt` is stamped server-side. `200` on success. |

File layout:
- Path: `<BACKEND_DATA_DIR>/tournament.json`
- `BACKEND_DATA_DIR` env var, defaults to `/app/data`
- Backend calls `os.makedirs(..., exist_ok=True)` on startup so the directory always exists
- Writes are atomic: `tmp.json` → `os.replace(tmp.json, tournament.json)`

### Docker

`docker-compose.yml` mounts `./data` into the backend container so the JSON survives container recreation:

```yaml
backend:
  volumes:
    - ./data:/app/data
```

Add `./data/` to `.gitignore`.

### Solver determinism

In `backend/api/schedule.py`, where `SolverOptions` is constructed for both `/schedule` and `/schedule/stream`:

```diff
 SolverOptions(
-    time_limit_seconds=30,
-    num_workers=4,
-    log_progress=False,
+    time_limit_seconds=30,
+    num_workers=1,
+    random_seed=42,
+    log_progress=False,
 )
```

Extend `scheduler_core.domain.models.SolverOptions`:

```python
@dataclass
class SolverOptions:
    time_limit_seconds: float = 5.0
    num_workers: int = 1           # was 4
    random_seed: int = 42          # new
    log_progress: bool = False
```

Plumb `random_seed` in `CPSATScheduler.solve()` (`src/scheduler_core/engine/cpsat_backend.py:608-613`):

```python
solver.parameters.max_time_in_seconds = self.solver_options.time_limit_seconds
solver.parameters.num_search_workers = self.solver_options.num_workers
solver.parameters.random_seed = self.solver_options.random_seed
solver.parameters.log_search_progress = self.solver_options.log_progress
```

Expose optional overrides in `backend/app/schemas.py` (both request DTOs), so future "Fast mode" is a single field flip:

```python
class SolverOptionsDTO(BaseModel):
    timeLimitSeconds: Optional[float] = None
    numWorkers: Optional[int] = None
    randomSeed: Optional[int] = None
```

Not wired to any UI in v1; the default `1 worker + seed 42` stands.

### Frontend

In `frontend/src/store/appStore.ts`:

**Added state:**
```ts
scheduleIsStale: boolean;
setScheduleStale: (stale: boolean) => void;
```

**Removed/changed state invalidations.** Currently these all do `schedule: null`:

```ts
setConfig:    (config)    => set({ config, schedule: null, scheduleStats: null }),
addPlayer:    (player)    => set(s => ({ players: [...], schedule: null })),
updatePlayer: (id, patch) => set(s => ({ players: [...], schedule: null })),
deletePlayer, importPlayers, setPlayers, addMatch, updateMatch, deleteMatch, importMatches, setMatches
```

New behavior: each of these sets `scheduleIsStale: true` and **does not touch `schedule`**. The schedule is preserved until explicitly replaced by `setSchedule(...)`.

**`setSchedule(non-null)`** clears `scheduleIsStale: false`.

**Partialize** is removed entirely — server is authoritative; localStorage is removed as a first-class source of truth (but not deleted — it's used only for the one-time migration on first load; see Migration below).

### Hydration + persistence wiring

New `hooks/useTournamentState.ts` mounted once at app root:

1. On mount: `GET /tournament/state`
   - `200`: hydrate Zustand with the returned payload
   - `204`: read `localStorage['scheduler-storage']` — if present, POST it as initial state; otherwise just leave the Zustand defaults
   - network error: fall back to Zustand defaults; surface a toast
2. Subscribe to the Zustand store
3. On any persisted-field change (`config`, `groups`, `players`, `matches`, `schedule`, `scheduleStats`, `scheduleIsStale`), debounce 500 ms and `PUT /tournament/state` with the full payload
4. A `hydrationDone` flag prevents the first hydration setState from triggering an echo PUT

### UI — stale schedule banner

On `SchedulePage` and the Live tab, when `scheduleIsStale === true`:

```
┌──────────────────────────────────────────────────────────────┐
│ ⚠ Schedule is out of date since your last edit.              │
│   [Re-solve]  [Keep anyway]                                  │
└──────────────────────────────────────────────────────────────┘
```

- "Re-solve" triggers the existing `generateSchedule()` flow; on success, `scheduleIsStale` clears
- "Keep anyway" clears `scheduleIsStale` without re-solving (user knows better; prints are already out)

### Migration

First load logic in `useTournamentState` handles legacy users:

```ts
const existing = await getTournamentState();        // GET
if (existing) {
  hydrateStore(existing);
} else {
  const legacy = readLocalStorage('scheduler-storage');
  if (legacy) {
    const seeded = { ...legacy.state, version: 1, scheduleIsStale: false };
    await putTournamentState(seeded);               // seed file
    hydrateStore(seeded);
  }
  // else: fresh install, defaults apply
}
```

After migration, subsequent writes go to the server. The `scheduler-storage` localStorage key is left alone (harmless leftover).

## Data flow

```
User edits a player
    ↓
Zustand state updates (addPlayer)
    ↓
scheduleIsStale = true
    ↓
debounced PUT /tournament/state (500 ms)
    ↓
Backend writes data/tournament.json atomically
    ↓
UI shows stale badge
```

```
User clicks Re-solve
    ↓
generateSchedule() → POST /schedule/stream
    ↓
Solver produces deterministic schedule (seed=42, workers=1)
    ↓
setSchedule(result) → scheduleIsStale = false
    ↓
debounced PUT writes new schedule
```

## Error handling

- **Network fails on GET at launch**: continue with Zustand defaults, show a yellow "Working offline" badge until the next successful PUT clears it.
- **Network fails on PUT**: keep queue in memory, retry on next change; badge "Unsaved changes" until success.
- **Backend file is corrupt JSON**: backend returns `500` with `{detail: "corrupt state"}`; frontend shows a modal offering "Reset tournament" (delete file + reload defaults) or "Import JSON" (user-provided backup).
- **PUT body exceeds reasonable size (10 MB)**: rejected by backend; frontend keeps retrying won't work, so it surfaces the error directly.

## Testing

### Backend

`src/tests/test_tournament_state.py` (pytest):

- `test_get_missing_file_returns_204`
- `test_put_creates_file_and_get_returns_it`
- `test_put_overwrites_previous`
- `test_put_writes_atomically` — patch `os.replace`, verify intermediate `.tmp` never observable
- `test_updated_at_stamped_server_side` — user-supplied `updatedAt` ignored
- `test_solver_determinism` — run the same `ScheduleRequest` twice with default `SolverOptions(num_workers=1, random_seed=42)`, assert byte-identical assignments list

### Frontend

New Playwright spec `e2e/tests/06-persistence.spec.ts`:

- `survives_refresh` — create a tournament, solve, refresh the page, schedule still rendered
- `edit_marks_stale` — add a player after solving, assert stale badge visible, schedule blocks still present
- `resolve_clears_stale` — from stale state, click Re-solve, stale badge gone
- `deterministic_regenerate` — solve twice, assert identical `assignments` array in Zustand (hash comparison)

Existing specs remain green.

## Rollout

One commit per section in this order:

1. Backend: `SolverOptions` defaults (num_workers=1, random_seed=42) + wire to solver params
2. Backend: `/tournament/state` endpoint + tests
3. Docker volume mount + `data/` in `.gitignore`
4. Frontend: Zustand `scheduleIsStale` + stop clearing `schedule` on edits
5. Frontend: `useTournamentState` hook + migration
6. Frontend: stale banner UI on Schedule + Live tabs
7. Playwright: persistence spec

Each step is independently shippable — after step 1 users already get determinism; after 2–5 they get persistence; after 6 they get the stale UX.

## Files touched

- `backend/api/tournament_state.py` — new
- `backend/app/main.py` — register router
- `backend/api/schedule.py` — solver option defaults
- `backend/app/schemas.py` — `SolverOptionsDTO` additions
- `src/scheduler_core/domain/models.py` — `SolverOptions.random_seed`
- `src/scheduler_core/engine/cpsat_backend.py` — plumb `random_seed`
- `docker-compose.yml` — volume mount
- `.gitignore` — `data/`
- `frontend/src/hooks/useTournamentState.ts` — new
- `frontend/src/store/appStore.ts` — slice changes, remove partialize, flip invalidation
- `frontend/src/api/client.ts` — `getTournamentState`, `putTournamentState`
- `frontend/src/features/schedule/StaleBanner.tsx` — new
- `frontend/src/pages/SchedulePage.tsx` + `features/live/LiveTab.tsx` — mount banner
- `frontend/src/app/AppShell.tsx` — mount `useTournamentState`
- `e2e/tests/06-persistence.spec.ts` — new
- `src/tests/test_tournament_state.py` — new
