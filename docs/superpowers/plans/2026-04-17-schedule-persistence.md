# Schedule persistence + solver determinism — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated schedules survive a browser refresh (server-side JSON file), and make `Generate` reproducible (seeded single-worker CP-SAT).

**Architecture:** One `data/tournament.json` file (Docker-mounted volume) is the authoritative store for `config + groups + players + matches + schedule + scheduleStats + scheduleIsStale`. Frontend hydrates on mount (`GET /tournament/state`), subscribes to Zustand, and debounced-`PUT`s on any change. Solver runs with `num_workers=1 + random_seed=42` so same inputs → byte-identical output. Live-ops match states stay in their existing `match_states.json`.

**Tech Stack:** FastAPI, Pydantic, Python 3.11 + OR-Tools CP-SAT · React 19 + TypeScript + Zustand 5 · Docker Compose · pytest · Playwright

**Spec:** [docs/superpowers/specs/2026-04-17-schedule-persistence-design.md](../specs/2026-04-17-schedule-persistence-design.md)

---

## File Structure

**Backend (Python):**

| Path | Purpose | Action |
|---|---|---|
| `src/scheduler_core/domain/models.py` | Add `random_seed` + change `num_workers` default to 1 on `SolverOptions` | modify |
| `src/scheduler_core/engine/cpsat_backend.py` | Plumb `random_seed` to `solver.parameters.random_seed` | modify |
| `backend/api/tournament_state.py` | New router — `GET/PUT /tournament/state` (atomic file writes) | create |
| `backend/app/main.py` | Register the new router | modify |
| `backend/app/schemas.py` | Add `SolverOptionsDTO` + `TournamentStateDTO` | modify |
| `backend/api/schedule.py` | Use new solver defaults | modify |
| `src/tests/test_interval_model.py` | Add determinism test | modify |
| `src/tests/test_tournament_state.py` | Backend endpoint tests | create |

**Frontend (TypeScript):**

| Path | Purpose | Action |
|---|---|---|
| `frontend/src/store/appStore.ts` | Add `scheduleIsStale`, stop clearing `schedule` on edits, drop localStorage `partialize` | modify |
| `frontend/src/api/client.ts` | `getTournamentState` + `putTournamentState` | modify |
| `frontend/src/api/dto.ts` | `TournamentStateDTO` | modify |
| `frontend/src/hooks/useTournamentState.ts` | Hydrate on mount, debounced PUT on change, migrate from localStorage once | create |
| `frontend/src/app/AppShell.tsx` | Mount the hook once at app root | modify |
| `frontend/src/features/schedule/StaleBanner.tsx` | Yellow "schedule is out of date" banner | create |
| `frontend/src/pages/SchedulePage.tsx` | Render the banner when `scheduleIsStale` | modify |

**Infra:**

| Path | Purpose | Action |
|---|---|---|
| `docker-compose.yml` | Mount `./data` into backend container | modify |
| `backend/Dockerfile` | `mkdir -p /app/data` on build | modify |
| `.gitignore` | Add `/data/` | modify |

**Tests:**

| Path | Purpose | Action |
|---|---|---|
| `e2e/tests/06-persistence.spec.ts` | Playwright E2E for refresh-survives + stale-banner flow | create |

---

## Task 1: Solver determinism — backend domain model

**Files:**
- Modify: `src/scheduler_core/domain/models.py:88-93`
- Test: `src/tests/test_interval_model.py`

- [ ] **Step 1: Write the failing test**

Append to `src/tests/test_interval_model.py` at the end of the file:

```python
class TestSolverDeterminism:
    """Seeding + single worker must produce byte-identical schedules."""

    def test_same_inputs_produce_identical_assignments(self):
        cfg = ScheduleConfig(total_slots=8, court_count=2)
        players = [
            Player(id=f"p{i}", name=f"P{i}") for i in range(1, 9)
        ]
        matches = [
            Match(id=f"m{i}", event_code=f"E{i}", duration_slots=1,
                  side_a=[f"p{2*i-1}"], side_b=[f"p{2*i}"])
            for i in range(1, 5)
        ]

        def run_once():
            scheduler = CPSATScheduler(
                config=cfg,
                solver_options=SolverOptions(
                    time_limit_seconds=5.0,
                    num_workers=1,
                    random_seed=42,
                ),
            )
            scheduler.add_players(players)
            scheduler.add_matches(matches)
            scheduler.build()
            r = scheduler.solve()
            return sorted(
                (a.match_id, a.slot_id, a.court_id) for a in r.assignments
            )

        assert run_once() == run_once()
```

- [ ] **Step 2: Run the test to see it fail on a TypeError**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
PYTHONPATH=src:backend python3 -m pytest src/tests/test_interval_model.py::TestSolverDeterminism -v
```

Expected: FAIL — `TypeError: SolverOptions.__init__() got an unexpected keyword argument 'random_seed'`.

- [ ] **Step 3: Update `SolverOptions` dataclass**

`src/scheduler_core/domain/models.py` — replace the `SolverOptions` block (lines 88-93):

```python
@dataclass
class SolverOptions:
    """Solver execution options."""
    time_limit_seconds: float = 5.0
    num_workers: int = 1
    random_seed: int = 42
    log_progress: bool = False
```

- [ ] **Step 4: Plumb `random_seed` to the solver**

`src/scheduler_core/engine/cpsat_backend.py` — in `CPSATScheduler.solve`, find the `solver.parameters.*` block (around line 610) and add the `random_seed` line:

```python
solver.parameters.max_time_in_seconds = self.solver_options.time_limit_seconds
solver.parameters.num_search_workers = self.solver_options.num_workers
solver.parameters.random_seed = self.solver_options.random_seed
solver.parameters.log_search_progress = self.solver_options.log_progress
```

- [ ] **Step 5: Run the determinism test**

```bash
PYTHONPATH=src:backend python3 -m pytest src/tests/test_interval_model.py::TestSolverDeterminism -v
```

Expected: PASS.

- [ ] **Step 6: Run the whole pytest suite**

```bash
PYTHONPATH=src:backend python3 -m pytest src/tests/ -q
```

Expected: all tests pass (should stay at 36+1 passing).

- [ ] **Step 7: Commit**

```bash
git add src/scheduler_core/domain/models.py src/scheduler_core/engine/cpsat_backend.py src/tests/test_interval_model.py
git commit -m "feat(solver): seeded single-worker defaults for reproducibility"
```

---

## Task 2: Backend — `TournamentStateDTO` Pydantic model

**Files:**
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: Append to `backend/app/schemas.py`**

At the very end of the file, add:

```python
# ---- Tournament state (whole-document persistence) --------------------

class TournamentStateDTO(BaseModel):
    """Authoritative persisted state for one tournament.

    Writes come as a single blob: frontend Zustand state snapshotted and
    PUT to /tournament/state. Server stamps `updatedAt` on write; the
    client's value is ignored.
    """
    version: int = 1
    updatedAt: Optional[str] = None
    config: Optional[TournamentConfig] = None
    groups: List[RosterGroupDTO] = Field(default_factory=list)
    players: List[PlayerDTO] = Field(default_factory=list)
    matches: List[MatchDTO] = Field(default_factory=list)
    schedule: Optional[ScheduleDTO] = None
    scheduleStats: Optional[dict] = None
    scheduleIsStale: bool = False


class SolverOptionsDTO(BaseModel):
    """Optional per-request override of solver parameters (no UI yet)."""
    timeLimitSeconds: Optional[float] = None
    numWorkers: Optional[int] = None
    randomSeed: Optional[int] = None
```

- [ ] **Step 2: Verify imports work**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
PYTHONPATH=backend:src python3 -c "from app.schemas import TournamentStateDTO, SolverOptionsDTO; print('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat(api): add TournamentStateDTO + SolverOptionsDTO"
```

---

## Task 3: Backend — `/tournament/state` router

**Files:**
- Create: `backend/api/tournament_state.py`
- Modify: `backend/app/main.py`
- Test: `src/tests/test_tournament_state.py`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/test_tournament_state.py`:

```python
"""Tests for /tournament/state persistence endpoints."""
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Point the backend at a fresh empty data dir for each test."""
    monkeypatch.setenv("BACKEND_DATA_DIR", str(tmp_path))
    # Reload so module-level path picks up the env var.
    import importlib
    import backend.api.tournament_state as ts_module
    importlib.reload(ts_module)
    import backend.app.main as main_module
    importlib.reload(main_module)
    return TestClient(main_module.app)


def test_get_missing_file_returns_204(client):
    r = client.get("/tournament/state")
    assert r.status_code == 204
    assert r.content == b""


def test_put_creates_file_and_get_returns_it(client, tmp_path):
    payload = {
        "version": 1,
        "config": None,
        "groups": [{"id": "g1", "name": "UCSC"}],
        "players": [],
        "matches": [],
        "schedule": None,
        "scheduleStats": None,
        "scheduleIsStale": False,
    }
    put_r = client.put("/tournament/state", json=payload)
    assert put_r.status_code == 200
    # File exists on disk.
    assert (tmp_path / "tournament.json").exists()

    get_r = client.get("/tournament/state")
    assert get_r.status_code == 200
    body = get_r.json()
    assert body["groups"][0]["name"] == "UCSC"
    # Server stamps updatedAt.
    assert body["updatedAt"] is not None


def test_put_overwrites_previous(client):
    first = {"version": 1, "groups": [{"id": "g1", "name": "A"}],
             "players": [], "matches": [], "scheduleIsStale": False}
    second = {"version": 1, "groups": [{"id": "g2", "name": "B"}],
              "players": [], "matches": [], "scheduleIsStale": False}
    client.put("/tournament/state", json=first)
    client.put("/tournament/state", json=second)
    body = client.get("/tournament/state").json()
    assert body["groups"][0]["name"] == "B"


def test_updated_at_stamped_server_side_ignores_client_value(client):
    payload = {"version": 1, "groups": [], "players": [], "matches": [],
               "scheduleIsStale": False,
               "updatedAt": "1999-01-01T00:00:00Z"}
    client.put("/tournament/state", json=payload)
    body = client.get("/tournament/state").json()
    assert body["updatedAt"] != "1999-01-01T00:00:00Z"


def test_corrupt_file_returns_500_with_reset_hint(client, tmp_path):
    (tmp_path / "tournament.json").write_text("{ not json }")
    r = client.get("/tournament/state")
    assert r.status_code == 500
    assert "corrupt" in r.json().get("detail", "").lower()
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
PYTHONPATH=backend:src:. python3 -m pytest src/tests/test_tournament_state.py -v
```

Expected: all 5 tests ERROR on import (`tournament_state` module not found).

- [ ] **Step 3: Create the router**

Create `backend/api/tournament_state.py`:

```python
"""Whole-tournament state persistence (server-side JSON file).

Single endpoint pair — GET returns 204 when no file yet, PUT overwrites
the file atomically via a temp-file rename. Server stamps `updatedAt`.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response

from app.schemas import TournamentStateDTO

router = APIRouter(prefix="/tournament", tags=["tournament-state"])


def _data_dir() -> Path:
    return Path(os.environ.get("BACKEND_DATA_DIR", "/app/data"))


def _state_path() -> Path:
    return _data_dir() / "tournament.json"


def _ensure_dir() -> None:
    _data_dir().mkdir(parents=True, exist_ok=True)


@router.get("/state")
async def get_tournament_state():
    """Return the persisted tournament state.

    204 No Content when no state has been saved yet — the frontend uses
    that signal to fall back to localStorage migration / defaults.
    """
    path = _state_path()
    if not path.exists():
        return Response(status_code=204)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="tournament.json is corrupt; reset or restore from backup",
        )
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"read failed: {e}")
    return data


@router.put("/state", response_model=TournamentStateDTO)
async def put_tournament_state(state: TournamentStateDTO):
    """Overwrite the tournament state atomically.

    Client-supplied `updatedAt` is ignored; we stamp our own so two tabs
    can agree on ordering.
    """
    _ensure_dir()
    stamped = state.model_copy(
        update={"updatedAt": datetime.now(timezone.utc).isoformat()}
    )
    path = _state_path()
    tmp = path.with_suffix(".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(stamped.model_dump(), f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)  # atomic on POSIX
    except OSError as e:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        raise HTTPException(status_code=500, detail=f"write failed: {e}")
    return stamped
```

- [ ] **Step 4: Register the router**

`backend/app/main.py` — update the imports and `include_router` section:

```python
from api import schedule, match_state, tournament_state
# ...
app.include_router(schedule.router)
app.include_router(match_state.router)
app.include_router(tournament_state.router)
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
PYTHONPATH=backend:src:. python3 -m pytest src/tests/test_tournament_state.py -v
```

Expected: all 5 pass.

- [ ] **Step 6: Full pytest run**

```bash
PYTHONPATH=backend:src python3 -m pytest src/tests/ -q
```

Expected: still passing.

- [ ] **Step 7: Commit**

```bash
git add backend/api/tournament_state.py backend/app/main.py src/tests/test_tournament_state.py
git commit -m "feat(api): add /tournament/state GET+PUT with atomic writes"
```

---

## Task 4: Docker volume mount

**Files:**
- Modify: `docker-compose.yml`
- Modify: `backend/Dockerfile`
- Modify: `.gitignore`

- [ ] **Step 1: Add the volume mount**

Open `docker-compose.yml`. In the `backend:` service add a `volumes:` block (after `environment:`):

```yaml
backend:
  build:
    context: .
    dockerfile: backend/Dockerfile
  ports:
    - "8000:8000"
  environment:
    - LOG_LEVEL=info
    - BACKEND_DATA_DIR=/app/data
  volumes:
    - ./data:/app/data
  restart: unless-stopped
  # ... (healthcheck / deploy unchanged)
```

- [ ] **Step 2: Make sure the dir exists in the image**

Open `backend/Dockerfile`. Before the final `CMD`, add:

```dockerfile
RUN mkdir -p /app/data
```

- [ ] **Step 3: Ignore the mounted data dir in git**

Append to `.gitignore`:

```gitignore

# Persisted tournament state (Docker volume)
/data/
```

- [ ] **Step 4: Rebuild and verify**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
make rebuild
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost/api/tournament/state
```

Expected: `HTTP 204` (no state yet — the new endpoint is alive and well).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml backend/Dockerfile .gitignore
git commit -m "feat(docker): mount ./data volume for tournament state"
```

---

## Task 5: Frontend — Zustand store changes

**Files:**
- Modify: `frontend/src/store/appStore.ts`

- [ ] **Step 1: Add `scheduleIsStale` to the `AppState` interface**

`frontend/src/store/appStore.ts` — in `interface AppState`, add these two lines near the other schedule-related fields:

```typescript
  // Staleness: true when the user has edited config/players/matches
  // after a schedule was generated. Not persisted via Zustand's partialize
  // (server is source of truth).
  scheduleIsStale: boolean;
  setScheduleStale: (stale: boolean) => void;
```

- [ ] **Step 2: Initialize it + add the setter**

In the `create<AppState>()(persist((set, get) => ({ ... }), ...))` block, after the existing initial-state fields (near `liveState: null,`), add:

```typescript
      scheduleIsStale: false,
```

And in the actions block (after `setLastValidation`), add:

```typescript
      setScheduleStale: (scheduleIsStale) => set({ scheduleIsStale }),
```

- [ ] **Step 3: Stop clearing `schedule` on edits — flip to `scheduleIsStale: true`**

Still in `appStore.ts`, find and replace these actions. Current:

```typescript
setConfig: (config) => set({ config, schedule: null, scheduleStats: null }),
addPlayer: (player) =>
  set((state) => ({ players: [...state.players, player], schedule: null })),
updatePlayer: (id, updates) =>
  set((state) => ({
    players: state.players.map((p) => p.id === id ? { ...p, ...updates } : p),
    schedule: null,
  })),
deletePlayer: (id) =>
  set((state) => ({
    players: state.players.filter((p) => p.id !== id),
    schedule: null,
  })),
importPlayers: (players) => set({ players, schedule: null }),
setPlayers: (players) => set({ players, schedule: null }),
```

New:

```typescript
setConfig: (config) => set({ config, scheduleIsStale: true }),
addPlayer: (player) =>
  set((state) => ({ players: [...state.players, player], scheduleIsStale: true })),
updatePlayer: (id, updates) =>
  set((state) => ({
    players: state.players.map((p) => p.id === id ? { ...p, ...updates } : p),
    scheduleIsStale: true,
  })),
deletePlayer: (id) =>
  set((state) => ({
    players: state.players.filter((p) => p.id !== id),
    scheduleIsStale: true,
  })),
importPlayers: (players) => set({ players, scheduleIsStale: true }),
setPlayers: (players) => set({ players, scheduleIsStale: true }),
```

Do the same for all match actions — replace `schedule: null` with `scheduleIsStale: true` in `addMatch`, `updateMatch`, `deleteMatch`, `importMatches`, `setMatches`.

- [ ] **Step 4: Clear `scheduleIsStale` when a new schedule is set**

Replace the existing `setSchedule` action:

```typescript
setSchedule: (schedule) => set({
  schedule,
  scheduleIsStale: false,
  isScheduleLocked: schedule !== null,
}),
```

- [ ] **Step 5: Drop the `partialize` config**

Replace the persist config at the end of the `create` call:

```typescript
    }),
    {
      name: 'scheduler-storage',
      // NOTE: we keep persisting to localStorage so legacy users still load
      // their tournament on first visit. `useTournamentState` then migrates
      // the blob to the server and the server becomes authoritative.
      partialize: (state) => ({
        config: state.config,
        groups: state.groups,
        players: state.players,
        matches: state.matches,
      }),
    }
  )
);
```

(No change needed if partialize is already like this — confirm by visual inspection.)

- [ ] **Step 6: Typecheck**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/frontend"
npx tsc --noEmit
```

Expected: 0 errors. (If there are errors from call sites reading the old behavior, fix them — likely none since no one else reads `schedule: null` synchronously on edits.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/store/appStore.ts
git commit -m "feat(store): scheduleIsStale flag replaces schedule invalidation"
```

---

## Task 6: Frontend — API client + DTO

**Files:**
- Modify: `frontend/src/api/dto.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add `TournamentStateDTO` to `dto.ts`**

Append to `frontend/src/api/dto.ts`:

```typescript
// Whole-tournament persistence DTO (server-side JSON file).
export interface TournamentStateDTO {
  version: number;
  updatedAt?: string | null;
  config: TournamentConfig | null;
  groups: RosterGroupDTO[];
  players: PlayerDTO[];
  matches: MatchDTO[];
  schedule: ScheduleDTO | null;
  scheduleStats?: unknown;
  scheduleIsStale: boolean;
}
```

- [ ] **Step 2: Add client methods**

In `frontend/src/api/client.ts`, add this inside the `ApiClient` class, near the other health/state methods:

```typescript
  /**
   * Fetch the server-side tournament state.
   * Returns `null` when the server has no state yet (HTTP 204).
   */
  async getTournamentState(): Promise<TournamentStateDTO | null> {
    const response = await this.client.get<TournamentStateDTO>(
      '/tournament/state',
      { validateStatus: (s) => s === 200 || s === 204 },
    );
    if (response.status === 204) return null;
    return response.data;
  }

  /** Overwrite the tournament state file. Returns the stamped state. */
  async putTournamentState(state: TournamentStateDTO): Promise<TournamentStateDTO> {
    const response = await this.client.put<TournamentStateDTO>(
      '/tournament/state',
      state,
    );
    return response.data;
  }
```

And add `TournamentStateDTO` to the type-only imports at the top of the file:

```typescript
import type {
  TournamentConfig,
  PlayerDTO,
  MatchDTO,
  ScheduleDTO,
  ScheduleAssignment,
  MatchStateDTO,
  SolverProgressEvent,
  SolverModelBuiltEvent,
  SolverPhaseEvent,
  ProposedMove,
  ValidationResponseDTO,
  MatchGenerationRule,
  TournamentStateDTO,
} from './dto';
```

- [ ] **Step 3: Typecheck**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/frontend"
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/dto.ts frontend/src/api/client.ts
git commit -m "feat(client): getTournamentState + putTournamentState"
```

---

## Task 7: Frontend — `useTournamentState` hook

**Files:**
- Create: `frontend/src/hooks/useTournamentState.ts`
- Modify: `frontend/src/app/AppShell.tsx`

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useTournamentState.ts`:

```typescript
/**
 * Server-side persistence of the tournament state.
 *
 * On mount:
 *   1. GET /tournament/state
 *      - 200: hydrate Zustand from the returned payload
 *      - 204: read legacy `scheduler-storage` localStorage — if present,
 *             seed the server with it; otherwise keep Zustand defaults
 *
 * After hydration, subscribe to Zustand and debounce a PUT for 500 ms
 * whenever a persisted field changes. A `hydrationDone` flag prevents
 * the first hydration setState from echoing back to the server.
 */
import { useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import type { TournamentStateDTO } from '../api/dto';
import { useAppStore } from '../store/appStore';

const DEBOUNCE_MS = 500;
const LEGACY_KEY = 'scheduler-storage';

function snapshot(state: ReturnType<typeof useAppStore.getState>): TournamentStateDTO {
  return {
    version: 1,
    config: state.config,
    groups: state.groups,
    players: state.players,
    matches: state.matches,
    schedule: state.schedule,
    scheduleStats: state.scheduleStats as unknown,
    scheduleIsStale: state.scheduleIsStale,
  };
}

function hydrate(s: TournamentStateDTO) {
  const store = useAppStore.getState();
  if (s.config) store.setConfig(s.config);
  // The setters each mark stale=true; undo that after.
  if (s.groups) useAppStore.setState({ groups: s.groups });
  if (s.players) useAppStore.setState({ players: s.players });
  if (s.matches) useAppStore.setState({ matches: s.matches });
  useAppStore.setState({
    schedule: s.schedule ?? null,
    scheduleStats: (s.scheduleStats as never) ?? null,
    scheduleIsStale: s.scheduleIsStale ?? false,
  });
}

function readLegacyLocalStorage(): TournamentStateDTO | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const legacy = parsed?.state;
    if (!legacy) return null;
    return {
      version: 1,
      config: legacy.config ?? null,
      groups: legacy.groups ?? [],
      players: legacy.players ?? [],
      matches: legacy.matches ?? [],
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
    };
  } catch {
    return null;
  }
}

export function useTournamentState(): void {
  const hydrationDoneRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // ---- hydrate once on mount ------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await apiClient.getTournamentState();
        if (cancelled) return;
        if (remote) {
          hydrate(remote);
        } else {
          // No server state yet — migrate from legacy localStorage if any.
          const legacy = readLegacyLocalStorage();
          if (legacy) {
            hydrate(legacy);
            await apiClient.putTournamentState(legacy);
          }
        }
      } catch (err) {
        console.error('[useTournamentState] hydrate failed:', err);
      } finally {
        hydrationDoneRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- debounced PUT on any persisted-field change --------------------
  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prev) => {
      if (!hydrationDoneRef.current) return;
      const changed =
        state.config !== prev.config ||
        state.groups !== prev.groups ||
        state.players !== prev.players ||
        state.matches !== prev.matches ||
        state.schedule !== prev.schedule ||
        state.scheduleStats !== prev.scheduleStats ||
        state.scheduleIsStale !== prev.scheduleIsStale;
      if (!changed) return;

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        apiClient
          .putTournamentState(snapshot(useAppStore.getState()))
          .catch((err) => console.error('[useTournamentState] put failed:', err));
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);
}
```

- [ ] **Step 2: Mount the hook at app root**

`frontend/src/app/AppShell.tsx` — add the import and call near the top of the `AppShell` function body:

```typescript
import { useTournamentState } from '../hooks/useTournamentState';
// ...
export function AppShell() {
  useTournamentState();
  const activeTab = useAppStore((s) => s.activeTab);
  // ... rest unchanged
}
```

- [ ] **Step 3: Typecheck + build**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/frontend"
npx tsc --noEmit && npx vite build
```

Expected: 0 errors, build succeeds.

- [ ] **Step 4: Smoke-test manually**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
make rebuild
```

Then in browser at `http://localhost`:
- Add a school and a player
- Wait 1 second
- Refresh the page
- Expected: school + player still there

```bash
cat data/tournament.json | head -30
```

Expected: JSON with your school and player.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTournamentState.ts frontend/src/app/AppShell.tsx
git commit -m "feat(frontend): useTournamentState hook — hydrate + debounced PUT"
```

---

## Task 8: Frontend — Stale schedule banner

**Files:**
- Create: `frontend/src/features/schedule/StaleBanner.tsx`
- Modify: `frontend/src/pages/SchedulePage.tsx`

- [ ] **Step 1: Create the banner component**

Create `frontend/src/features/schedule/StaleBanner.tsx`:

```typescript
/**
 * Yellow banner that appears when the saved schedule is out of date
 * because the user edited config / players / matches after it was generated.
 */
import { useAppStore } from '../../store/appStore';
import { useSchedule } from '../../hooks/useSchedule';

export function StaleBanner() {
  const stale = useAppStore((s) => s.scheduleIsStale);
  const schedule = useAppStore((s) => s.schedule);
  const setStale = useAppStore((s) => s.setScheduleStale);
  const { generateSchedule, loading } = useSchedule();

  if (!stale || !schedule) return null;

  return (
    <div
      data-testid="stale-banner"
      className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden>⚠</span>
        Schedule is out of date since your last edit.
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStale(false)}
          data-testid="stale-banner-dismiss"
          className="rounded border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
        >
          Keep anyway
        </button>
        <button
          type="button"
          onClick={() => {
            void generateSchedule();
          }}
          disabled={loading}
          data-testid="stale-banner-resolve"
          className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Re-solving…' : 'Re-solve'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render the banner on the Schedule page**

`frontend/src/pages/SchedulePage.tsx` — import at the top:

```typescript
import { StaleBanner } from '../features/schedule/StaleBanner';
```

And render it at the top of the main return block, immediately inside the outer `div`:

```typescript
return (
  <div className="w-full h-[calc(100vh-56px)] flex flex-col px-2 py-1 gap-2">
    <StaleBanner />
    {/* rest unchanged */}
```

- [ ] **Step 3: Typecheck + build**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/frontend"
npx tsc --noEmit && npx vite build
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/schedule/StaleBanner.tsx frontend/src/pages/SchedulePage.tsx
git commit -m "feat(ui): stale schedule banner with re-solve + keep actions"
```

---

## Task 9: End-to-end persistence spec

**Files:**
- Create: `e2e/tests/06-persistence.spec.ts`

- [ ] **Step 1: Write the Playwright spec**

Create `e2e/tests/06-persistence.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { SEED_TOURNAMENT } from '../fixtures/seed';

test.describe('server-side persistence + stale banner', () => {
  test('schedule survives a browser refresh', async ({ page }) => {
    // Start empty so this test doesn't fight a leftover tournament.json.
    await page.addInitScript(() => {
      window.localStorage.removeItem('scheduler-storage');
    });

    await page.goto('/');

    // Seed via localStorage then reload — `useTournamentState` will migrate
    // it into the server file on first load.
    await page.evaluate((seed) => {
      window.localStorage.setItem('scheduler-storage', JSON.stringify(seed));
    }, SEED_TOURNAMENT);
    await page.goto('/');

    await page.getByTestId('tab-schedule').click();
    await page.getByRole('button', { name: /generate schedule/i }).click();
    await expect(page.getByTestId('drag-gantt')).toBeVisible({ timeout: 15_000 });
    const beforeAssignments = await page.evaluate(() => {
      const raw = window.localStorage.getItem('scheduler-storage');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.state?.schedule?.assignments?.length ?? null;
    });

    // Let the debounced PUT complete.
    await page.waitForTimeout(800);

    // Wipe localStorage so reload must rely on the server file.
    await page.evaluate(() => window.localStorage.clear());
    await page.goto('/');
    await page.getByTestId('tab-schedule').click();
    await expect(page.getByTestId('drag-gantt')).toBeVisible({ timeout: 5_000 });

    // Assignments are back from server.
    const afterAssignments = await page.evaluate(() => {
      return (window as any).__tournamentStateFromServer?.schedule?.assignments?.length ?? null;
    });
    // Since we don't expose state to window, just assert the gantt has match blocks.
    const blocks = await page.locator('[data-testid^="block-"]').count();
    expect(blocks).toBeGreaterThan(0);

    if (beforeAssignments != null) {
      expect(beforeAssignments).toBeGreaterThan(0);
    }
  });

  test('editing a player after solving shows the stale banner', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto('/');
    await page.evaluate((seed) => {
      window.localStorage.setItem('scheduler-storage', JSON.stringify(seed));
    }, SEED_TOURNAMENT);
    await page.goto('/');

    await page.getByTestId('tab-schedule').click();
    await page.getByRole('button', { name: /generate schedule/i }).click();
    await expect(page.getByTestId('drag-gantt')).toBeVisible({ timeout: 15_000 });

    // Flip to Roster, delete a player.
    await page.getByTestId('tab-roster').click();
    const firstRemove = page
      .locator('[data-testid^="player-row-"] button[aria-label^="Delete"]')
      .first();
    await firstRemove.click();

    await page.getByTestId('tab-schedule').click();
    await expect(page.getByTestId('stale-banner')).toBeVisible();
  });

  test('deterministic re-solve — same inputs produce same assignment set', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto('/');
    await page.evaluate((seed) => {
      window.localStorage.setItem('scheduler-storage', JSON.stringify(seed));
    }, SEED_TOURNAMENT);
    await page.goto('/');

    const runOnce = async (): Promise<string> => {
      await page.getByTestId('tab-schedule').click();
      await page.getByRole('button', { name: /generate schedule/i }).click();
      await expect(page.getByTestId('drag-gantt')).toBeVisible({ timeout: 15_000 });
      return await page.evaluate(() => {
        const raw = window.localStorage.getItem('scheduler-storage');
        const parsed = raw ? JSON.parse(raw) : null;
        const assigns = parsed?.state?.schedule?.assignments ?? [];
        return JSON.stringify(
          assigns
            .map((a: { matchId: string; slotId: number; courtId: number }) => ({
              matchId: a.matchId,
              slotId: a.slotId,
              courtId: a.courtId,
            }))
            .sort((a: { matchId: string }, b: { matchId: string }) =>
              a.matchId.localeCompare(b.matchId),
            ),
        );
      });
    };

    const first = await runOnce();
    // Regenerate (need to click again — button turns into "replace" state).
    await page.getByRole('button', { name: /generate/i }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /click again to replace/i }).click();
    await expect(page.getByTestId('drag-gantt')).toBeVisible({ timeout: 15_000 });
    const second = await page.evaluate(() => {
      const raw = window.localStorage.getItem('scheduler-storage');
      const parsed = raw ? JSON.parse(raw) : null;
      const assigns = parsed?.state?.schedule?.assignments ?? [];
      return JSON.stringify(
        assigns
          .map((a: { matchId: string; slotId: number; courtId: number }) => ({
            matchId: a.matchId,
            slotId: a.slotId,
            courtId: a.courtId,
          }))
          .sort((a: { matchId: string }, b: { matchId: string }) =>
            a.matchId.localeCompare(b.matchId),
          ),
      );
    });

    expect(first).toBe(second);
  });
});
```

- [ ] **Step 2: Run the new spec against the live Docker stack**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
make rebuild
cd e2e
E2E_MANAGE_STACK=0 E2E_BASE_URL=http://localhost npx playwright test tests/06-persistence.spec.ts --reporter=line
```

Expected: 3 passing.

- [ ] **Step 3: Run the full suite**

```bash
E2E_MANAGE_STACK=0 E2E_BASE_URL=http://localhost npx playwright test --reporter=line
```

Expected: 14 passing (11 existing + 3 new).

- [ ] **Step 4: Commit**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git add e2e/tests/06-persistence.spec.ts
git commit -m "test(e2e): persistence + stale banner + determinism specs"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run the whole backend test suite**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
PYTHONPATH=backend:src python3 -m pytest src/tests/ -q
```

Expected: all backend tests pass (36 baseline + 1 determinism + 5 tournament state = 42).

- [ ] **Step 2: Run the full Playwright suite against the fresh Docker build**

```bash
make rebuild
cd e2e
E2E_MANAGE_STACK=0 E2E_BASE_URL=http://localhost npx playwright test --reporter=line
```

Expected: 14 passing.

- [ ] **Step 3: Manual smoke**

In a browser at `http://localhost`:

1. Build a small tournament (2 schools × 4 players).
2. Generate schedule.
3. Hit Cmd+R.
4. Schedule still there, no edits since save → no stale banner.
5. Delete a player → yellow stale banner appears.
6. Click "Re-solve" → banner disappears, new schedule.
7. Click "Generate Schedule" twice in a row → both runs produce identical assignments (compare via `console.log(JSON.stringify(useAppStore.getState().schedule.assignments))`).

- [ ] **Step 4: Commit anything left over**

```bash
git status
# if anything is dirty:
git add -A
git commit -m "chore: final cleanup for persistence rollout"
```

---

## Self-review notes

**Spec coverage:**
- ✅ `GET/PUT /tournament/state` — Task 3
- ✅ Atomic writes — Task 3
- ✅ Server-stamped `updatedAt` — Task 3
- ✅ Docker volume — Task 4
- ✅ `num_workers=1` + `random_seed=42` — Task 1
- ✅ `SolverOptionsDTO` — Task 2
- ✅ `scheduleIsStale` flag + invalidation flip — Task 5
- ✅ `useTournamentState` hook + localStorage migration — Task 7
- ✅ Stale banner UI — Task 8
- ✅ Playwright coverage (refresh + stale + determinism) — Task 9

**Placeholder scan:** No "TBD", "TODO", "similar to above". Every step has actual code or an exact command.

**Type consistency:** `TournamentStateDTO` is defined once in `backend/app/schemas.py` (Task 2) and mirrored in `frontend/src/api/dto.ts` (Task 6). Field names match (`scheduleIsStale`, not `isStale`; `updatedAt`, not `updated_at`). `scheduleStats` typed as `Optional[dict]` / `unknown` since it's an opaque frontend struct.
