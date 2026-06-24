# SP-B3 — Bracket Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Display module usable on a bracket workspace — seed it `available` (backend + migration) and add a new read-only, modular bracket public display (Live / Draw / Results views, director-selectable) that polls `getBracket`, leaving the meet display untouched.

**Architecture:** Backend mirrors SP-B2 (derive `display: available` for bracket + a migration). Frontend adds `useBracketDisplaySync` (read-only poll of `apiClient.getBracket`), three read-only TV views under `products/display/bracketDisplay/`, and makes `PublicDisplayPage` a thin kind-router: the current meet body is extracted verbatim into `MeetDisplayPage`; a new `BracketDisplayPage` hosts the bracket switcher + views.

**Tech Stack:** Python 3.11 / SQLAlchemy / Alembic / FastAPI; React 19 / TS / Vitest / `@scheduler/design-system`.

## Global Constraints

- Branch `dev/workspace-suite`. `kind` preserved; no route-path changes. Read-only display (no mutations).
- The **meet display is untouched** — its views (`CourtsView`/`ScheduleView`/`StandingsView`), `useDisplaySync`, and derivations move verbatim into `MeetDisplayPage` (mechanical extraction) but their logic does not change.
- Module status vocab `enabled|available|disabled|coming_soon` (backend) / `coming-soon` (frontend). After SP-B3, `display` is `available` for both kinds.
- Auth is unchanged: `GET /tournaments/:id/bracket` is `viewer`-gated exactly like `GET /state`; the bracket display runs in the same logged-in-browser context as the meet display.
- Backend suite green (currently 523 pass / 1 pre-existing psycopg2 `test_config` skip), run with `python3 -m pytest <path> -v` from `products/scheduler`.
- Frontend gate from `products/scheduler/frontend`: `npx tsc -b`, `npx vitest run`, `npm run build`. Per task: run the focused test, then full `vitest run` before committing.
- Bracket DTO shape (`src/api/bracketDto.ts`): `BracketTournamentDTO` = `{ events: EventDTO[], play_units: PlayUnitDTO[], assignments: AssignmentDTO[], results: ResultDTO[], participants: Participant[], courts, ... }`. `EventDTO.rounds: string[][]` (play_unit_ids per round). `AssignmentDTO` = `{ play_unit_id, court_id, started, finished, ... }`. `PlayUnitDTO` = `{ id, event_id, round_index, slot_a/slot_b: { participant_id }, side_a/side_b: string[]|null }`. `ResultDTO` = `{ play_unit_id, winner_side: 'A'|'B'|'none', walkover }`. `Participant` = `{ id, name }`.

---

### Task 1: Backend — derive bracket → `display: available`

**Files:**
- Modify: `products/scheduler/backend/database/models.py` (`derive_modules` bracket branch)
- Test: `products/scheduler/tests/unit/test_workspace_modules.py`

- [ ] **Step 1: Update/add failing tests**

Update `test_derive_modules_status_maps` — the bracket branch display becomes `available`:

```python
    assert derive_modules("bracket") == {
        "bracket": "enabled",
        "display": "available",
        "meet": "available",
    }
```

Add an enable-display-on-bracket test:

```python
def test_enable_display_on_bracket_workspace(client):
    # A bracket workspace now seeds display 'available' (was coming_soon), and
    # bracket is enabled, so the display-dependency rule is satisfied → enabling
    # display succeeds (was 409 MODULE_IMMUTABLE).
    tid = _seed_bracket_tournament(client, "Bracket TV")
    r = client.patch(f"/tournaments/{tid}/modules/display", json={"status": "enabled"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "enabled"
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -k "derive_modules_status_maps or enable_display_on_bracket" -v`
Expected: FAIL — bracket display is still `coming_soon`; the PATCH is 409 `MODULE_IMMUTABLE`.

- [ ] **Step 3: Change the derive bracket branch**

In `derive_modules` (`database/models.py`), the bracket return becomes:

```python
    if kind == "bracket":
        return {"bracket": "enabled", "display": "available", "meet": "available"}
```

(Leave the meet/`None` branch unchanged — it already has `display: available`.) Update the docstring line about bracket display being `coming_soon`/not-built — it is now `available`.

- [ ] **Step 4: Run to verify they pass**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -k "derive_modules_status_maps or enable_display_on_bracket" -v`
Expected: PASS.

- [ ] **Step 5: Full backend suite**

Run: `python3 -m pytest -q`
Expected: green. Update any other derive-path test that asserted bracket→display `coming_soon` (e.g. the `ensure_modules` backfill `bracket_mods` assertion: `display` becomes `available`; and `test_create_without_seed_unchanged` for `kind=bracket`: `display` becomes `available`). Leave `normalize_module_seed` / explicit-seed tests alone. Re-run until green (zero new failures; 1 pre-existing skip).

- [ ] **Step 6: Commit**

```bash
git add products/scheduler/backend/database/models.py products/scheduler/tests/unit/test_workspace_modules.py
git commit -m "feat(modules): derive bracket display as available (enableable), not coming_soon"
```

---

### Task 2: Backend — migration (display coming_soon → available)

**Files:**
- Create: `products/scheduler/backend/alembic/versions/j3e7f9a1b5c8_bracket_display_available.py`
- Test: `products/scheduler/tests/unit/test_workspace_modules.py`

- [ ] **Step 1: Write the SQL-logic test**

```python
def test_migration_flip_display_coming_soon_to_available(client, tid):
    import uuid as _uuid
    from sqlalchemy import text
    from repositories import open_repository

    # Mirrors alembic j3e7f9a1b5c8.upgrade() verbatim.
    FLIP_SQL = (
        "UPDATE workspace_modules SET status = 'available' "
        "WHERE module_id = 'display' AND status = 'coming_soon'"
    )
    with open_repository() as repo:
        t = repo.tournaments.get_by_id(_uuid.UUID(tid))
        repo.modules.ensure_modules(t)
        repo.modules.update(t.id, "display", {"status": "coming_soon"})
        repo.session.execute(text(FLIP_SQL))
        repo.session.commit()
        after = {m.module_id: m.status for m in repo.modules.ensure_modules(t)}
        assert after["display"] == "available"
        assert after["meet"] == "enabled"  # non-display row untouched
```

- [ ] **Step 2: Run to verify it passes (SQL-logic locked)**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py::test_migration_flip_display_coming_soon_to_available -v`
Expected: PASS (the SQL is inline; this locks the flip semantics before the migration mirrors it).

- [ ] **Step 3: Create the migration**

Create `products/scheduler/backend/alembic/versions/j3e7f9a1b5c8_bracket_display_available.py`:

```python
"""bracket display: coming_soon -> available.

SP-B3. Promotes every existing workspace's ``display`` row from
``coming_soon`` to ``available`` (only bracket workspaces seed display as
``coming_soon``), matching ``database.models.derive_modules`` after SP-B3.

Tests build the schema via ``create_all`` and rely on derive-and-persist
(which now seeds ``available``), so they never run this migration —
correctness does NOT depend on it. This migration promotes prod rows that
predate SP-B3.

Revision ID: j3e7f9a1b5c8
Revises: i2d6e8f0a4b7
Create Date: 2026-06-24 00:00:00.000000
"""
from __future__ import annotations

from alembic import op

revision = "j3e7f9a1b5c8"
down_revision = "i2d6e8f0a4b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE workspace_modules SET status = 'available' "
        "WHERE module_id = 'display' AND status = 'coming_soon'"
    )


def downgrade() -> None:
    # Lossy / no-op (same rationale as i2d6e8f0a4b7): cannot distinguish a
    # promoted display row from one seeded 'available' on purpose.
    pass
```

- [ ] **Step 4: Verify SQL match + chaining**

Confirm the migration's UPDATE is character-identical to the test's `FLIP_SQL`, `down_revision == "i2d6e8f0a4b7"` (the current head), `revision` is unique under `alembic/versions/`.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/alembic/versions/j3e7f9a1b5c8_bracket_display_available.py products/scheduler/tests/unit/test_workspace_modules.py
git commit -m "feat(migration): promote existing coming_soon display rows to available"
```

---

### Task 3: Frontend — `modulesForWorkspace` display parity

**Files:**
- Modify: `products/scheduler/frontend/src/platform/domain/moduleModel.ts`
- Test: `products/scheduler/frontend/src/platform/domain/__tests__/moduleModel.test.ts`

- [ ] **Step 1: Update the failing test**

In the `modulesForWorkspace` `bracket` test, `display` becomes `available` (drop the `coming-soon` + note assertions):

```ts
  it('bracket (matches backend derive): Bracket enabled, Meet available, Display available', () => {
    const m = modulesForWorkspace('bracket');
    expect(m.find((x) => x.id === 'bracket')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'meet')!.status).toBe('available');
    expect(m.find((x) => x.id === 'display')!.status).toBe('available');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/platform/domain/__tests__/moduleModel.test.ts`
Expected: FAIL — display is still `coming-soon` for bracket.

- [ ] **Step 3: Update `modulesForWorkspace`**

In the `status` helper, the display branch becomes unconditional `available`:

```ts
  const status = (id: ModuleId): ModuleStatus => {
    if (id === 'display') return 'available';
    const isThisOperator = (id === 'bracket') === isBracket;
    return isThisOperator ? 'enabled' : 'available';
  };
```

Update the doc comment (display is now `available` for both kinds).

- [ ] **Step 4: Run + full suite**

Run: `npx vitest run src/platform/domain/__tests__/moduleModel.test.ts` then `npx vitest run`
Expected: PASS. If the HubPage chip test asserts a bracket row's display chip is "soon", update it — a bracket workspace's display is now `available` (no "soon"); the only remaining "coming-soon" display in tests is an explicit DTO (`modulesFromDto`) case, which is unchanged. Re-run until green.

- [ ] **Step 5: tsc + commit**

Run: `npx tsc -b`
Expected: clean.

```bash
git add products/scheduler/frontend/src/platform/domain/moduleModel.ts products/scheduler/frontend/src/platform/domain/__tests__/moduleModel.test.ts products/scheduler/frontend/src/products/hub/__tests__/HubPage.test.tsx
git commit -m "feat(modules): frontend modulesForWorkspace parity — display available for both kinds"
```

---

### Task 4: `useBracketDisplaySync` — read-only bracket poll

**Files:**
- Create: `products/scheduler/frontend/src/products/display/bracketDisplay/useBracketDisplaySync.ts`
- Test: `products/scheduler/frontend/src/products/display/bracketDisplay/__tests__/useBracketDisplaySync.test.ts`

**Interfaces:**
- Produces: `useBracketDisplaySync(now: Date): { data: BracketTournamentDTO | null; liveStatus: LiveStatus; syncError: string | null }`. Reads `?id=` from the URL, polls `apiClient.getBracket(id)` every 10s, derives `liveStatus` from last-success age (reuse the `LiveStatus` type + thresholds from `../publicDisplay/useDisplaySync`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useBracketDisplaySync } from '../useBracketDisplaySync';
import { apiClient } from '../../../../api/client';

vi.mock('../../../../api/client', () => ({ apiClient: { getBracket: vi.fn() } }));

const wrap = (id: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[`/display?id=${id}`]}>{children}</MemoryRouter>
  );

describe('useBracketDisplaySync', () => {
  beforeEach(() => vi.mocked(apiClient.getBracket).mockReset());

  it('polls getBracket and exposes the data + live status', async () => {
    vi.mocked(apiClient.getBracket).mockResolvedValue({
      events: [], play_units: [], assignments: [], results: [], participants: [],
      courts: 4, total_slots: 0, rest_between_rounds: 0, interval_minutes: 30, start_time: null,
    } as never);
    const { result } = renderHook(() => useBracketDisplaySync(new Date(0)), { wrapper: wrap('t1') });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(apiClient.getBracket).toHaveBeenCalledWith('t1');
    expect(result.current.syncError).toBeNull();
  });

  it('surfaces a sync error and missing-id error', async () => {
    vi.mocked(apiClient.getBracket).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBracketDisplaySync(new Date(0)), { wrapper: wrap('t1') });
    await waitFor(() => expect(result.current.syncError).toBe('boom'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/products/display/bracketDisplay/__tests__/useBracketDisplaySync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Mirror `useDisplaySync` (read `?id=`, poll loop, `LiveStatus` derivation) but store the result in local state and return it. Create `useBracketDisplaySync.ts`:

```ts
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../../api/client';
import type { BracketTournamentDTO } from '../../../api/bracketDto';
import type { LiveStatus } from '../publicDisplay/useDisplaySync';

const POLL_MS = 10_000;
const RECONNECTING_AFTER_MS = 25_000;
const OFFLINE_AFTER_MS = 60_000;

export interface UseBracketDisplaySyncResult {
  data: BracketTournamentDTO | null;
  liveStatus: LiveStatus;
  syncError: string | null;
}

export function useBracketDisplaySync(now: Date): UseBracketDisplaySyncResult {
  const [searchParams] = useSearchParams();
  const tid = searchParams.get('id');
  const [data, setData] = useState<BracketTournamentDTO | null>(null);
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!tid) {
      setSyncError('Missing ?id=<tournament-id> query parameter');
      return;
    }
    let cancelled = false;
    const pull = async () => {
      try {
        const remote = await apiClient.getBracket(tid);
        if (cancelled) return;
        if (remote) setData(remote);
        setLastSyncMs(Date.now());
        setSyncError(null);
      } catch (err) {
        if (cancelled) return;
        setSyncError(err instanceof Error ? err.message : 'Connection lost');
      }
    };
    void pull();
    const t = window.setInterval(() => void pull(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [tid]);

  const liveStatus: LiveStatus = useMemo(() => {
    if (lastSyncMs === null) return syncError ? 'reconnecting' : 'live';
    const age = now.getTime() - lastSyncMs;
    if (age >= OFFLINE_AFTER_MS) return 'offline';
    if (age >= RECONNECTING_AFTER_MS) return 'reconnecting';
    return 'live';
  }, [lastSyncMs, now, syncError]);

  return { data, liveStatus, syncError };
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run src/products/display/bracketDisplay/__tests__/useBracketDisplaySync.test.ts` then `npx tsc -b`
Expected: PASS; tsc clean.

```bash
git add products/scheduler/frontend/src/products/display/bracketDisplay/useBracketDisplaySync.ts products/scheduler/frontend/src/products/display/bracketDisplay/__tests__/useBracketDisplaySync.test.ts
git commit -m "feat(display): useBracketDisplaySync — read-only bracket poll for the TV"
```

---

### Task 5: Bracket display derivations + `BracketLiveView`

Pure derivation helpers (testable without rendering) + the default Live view.

**Files:**
- Create: `products/scheduler/frontend/src/products/display/bracketDisplay/bracketDisplayData.ts`
- Create: `products/scheduler/frontend/src/products/display/bracketDisplay/BracketLiveView.tsx`
- Test: `products/scheduler/frontend/src/products/display/bracketDisplay/__tests__/bracketDisplayData.test.ts`
- Test: `products/scheduler/frontend/src/products/display/bracketDisplay/__tests__/BracketLiveView.test.tsx`

**Interfaces:**
- Produces: `sideLabel(pu, side, participants): string` (resolve a play-unit side to a participant name, '—' when unresolved); `liveMatches(data): { puId, court, sideA, sideB, status: 'on-court'|'called' }[]` (assignments where `!finished`, `started`→'on-court' else 'called', joined to play_units + names); `BracketLiveView({ data }: { data: BracketTournamentDTO })`.

- [ ] **Step 1: Write the failing derivation test**

```ts
import { describe, it, expect } from 'vitest';
import { liveMatches, sideLabel } from '../bracketDisplayData';
import type { BracketTournamentDTO } from '../../../../api/bracketDto';

const data = {
  participants: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
  play_units: [{
    id: 'u1', event_id: 'e1', round_index: 0, match_index: 0,
    side_a: null, side_b: null,
    slot_a: { participant_id: 'p1', feeder_play_unit_id: null },
    slot_b: { participant_id: 'p2', feeder_play_unit_id: null },
    duration_slots: 1, dependencies: [],
  }],
  assignments: [{ play_unit_id: 'u1', slot_id: 0, court_id: 2, duration_slots: 1,
    actual_start_slot: null, actual_end_slot: null, started: true, finished: false }],
  results: [], events: [], courts: 4, total_slots: 0, rest_between_rounds: 0,
  interval_minutes: 30, start_time: null,
} as unknown as BracketTournamentDTO;

describe('bracketDisplayData', () => {
  it('sideLabel resolves a slot participant id to its name', () => {
    expect(sideLabel(data.play_units[0], 'a', data.participants)).toBe('Alice');
    expect(sideLabel(data.play_units[0], 'b', data.participants)).toBe('Bob');
  });
  it('liveMatches lists on-court matches with court + sides', () => {
    const live = liveMatches(data);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ court: 2, sideA: 'Alice', sideB: 'Bob', status: 'on-court' });
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement `bracketDisplayData.ts`**

Run: `npx vitest run src/products/display/bracketDisplay/__tests__/bracketDisplayData.test.ts` → FAIL (module missing). Implement:

```ts
import type { BracketTournamentDTO, PlayUnitDTO, Participant } from '../../../api/bracketDto';

export function sideLabel(pu: PlayUnitDTO, side: 'a' | 'b', participants: Participant[]): string {
  const slot = side === 'a' ? pu.slot_a : pu.slot_b;
  const direct = pu[side === 'a' ? 'side_a' : 'side_b'];
  if (slot.participant_id) {
    const p = participants.find((x) => x.id === slot.participant_id);
    if (p) return p.name;
  }
  if (direct && direct.length) {
    const names = direct.map((id) => participants.find((x) => x.id === id)?.name ?? id);
    return names.join(' / ');
  }
  return '—';
}

export interface LiveRow {
  puId: string; court: number; sideA: string; sideB: string;
  status: 'on-court' | 'called';
}

export function liveMatches(data: BracketTournamentDTO): LiveRow[] {
  const puById = new Map(data.play_units.map((u) => [u.id, u]));
  return data.assignments
    .filter((a) => !a.finished)
    .map((a) => {
      const pu = puById.get(a.play_unit_id);
      return pu
        ? {
            puId: pu.id, court: a.court_id,
            sideA: sideLabel(pu, 'a', data.participants),
            sideB: sideLabel(pu, 'b', data.participants),
            status: a.started ? ('on-court' as const) : ('called' as const),
          }
        : null;
    })
    .filter((r): r is LiveRow => r !== null)
    .sort((x, y) => x.court - y.court);
}
```

Run again → PASS.

- [ ] **Step 3: Write the `BracketLiveView` test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketLiveView } from '../BracketLiveView';
// reuse the same `data` fixture as above (import or inline)

it('renders on-court matches with court + sides; empty state otherwise', () => {
  render(<BracketLiveView data={data} />);
  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
  expect(screen.getByText(/court 2/i)).toBeInTheDocument();
});
```

- [ ] **Step 4: Implement `BracketLiveView.tsx`**

A read-only TV view that maps `liveMatches(data)` into oversized match cards, **following the styling of `../publicDisplay/CourtsView.tsx`** (large type, high contrast, court label, the two sides, an on-court/called status pill). Render an empty state ("No matches on court") when `liveMatches(data)` is empty. Props: `{ data: BracketTournamentDTO }`. No `useBracketApi`, no mutations.

- [ ] **Step 5: Run + full suite + commit**

Run: `npx vitest run src/products/display/bracketDisplay` then `npx vitest run` then `npx tsc -b`
Expected: green; tsc clean.

```bash
git add products/scheduler/frontend/src/products/display/bracketDisplay/bracketDisplayData.ts products/scheduler/frontend/src/products/display/bracketDisplay/BracketLiveView.tsx products/scheduler/frontend/src/products/display/bracketDisplay/__tests__/bracketDisplayData.test.ts products/scheduler/frontend/src/products/display/bracketDisplay/__tests__/BracketLiveView.test.tsx
git commit -m "feat(display): bracket display derivations + BracketLiveView (read-only)"
```

---

### Task 6: `BracketDrawView` (read-only tree)

**Files:**
- Create: `products/scheduler/frontend/src/products/display/bracketDisplay/BracketDrawView.tsx`
- Test: `products/scheduler/frontend/src/products/display/bracketDisplay/__tests__/BracketDrawView.test.tsx`

**Interfaces:**
- Produces: `BracketDrawView({ data, eventId }: { data: BracketTournamentDTO; eventId: string })` — renders the selected event's `rounds` as columns; each play_unit shows both sides; a winner (from `results.winner_side`) is marked. Read-only.

- [ ] **Step 1: Write the failing test**

```tsx
it('renders the event rounds as columns with the matchup sides + marks the winner', () => {
  const eventData = /* fixture: one event with rounds=[['u1']], play_units u1 (p1 vs p2), results [{play_unit_id:'u1', winner_side:'A'}] */;
  render(<BracketDrawView data={eventData} eventId="e1" />);
  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
  // winner marked (e.g. an aria-label or a 'winner' testid on the Alice side)
  expect(screen.getByTestId('draw-winner')).toHaveTextContent('Alice');
});
```

- [ ] **Step 2: Run to verify it fails → implement → pass**

Implement `BracketDrawView.tsx`: look up `event = data.events.find(e => e.id === eventId)`; for each round in `event.rounds`, render a column of the round's play_units (via `puById`), each showing `sideLabel(pu,'a',...)` / `sideLabel(pu,'b',...)`, and mark the winning side from `data.results` (`winner_side === 'A'|'B'`). Style as read-only columns (reference the existing `DrawView` for the column/round visual language, but DO NOT import it — it's interactive). Empty state when the event has no generated rounds. Add a `data-testid="draw-winner"` on the winning side label for the test.

Run: `npx vitest run src/products/display/bracketDisplay/__tests__/BracketDrawView.test.tsx` → PASS.

- [ ] **Step 3: Full suite + tsc + commit**

Run: `npx vitest run` then `npx tsc -b`; green/clean.

```bash
git add products/scheduler/frontend/src/products/display/bracketDisplay/BracketDrawView.tsx products/scheduler/frontend/src/products/display/bracketDisplay/__tests__/BracketDrawView.test.tsx
git commit -m "feat(display): BracketDrawView — read-only bracket tree for the TV"
```

---

### Task 7: `BracketResultsView` (winners / champion)

**Files:**
- Create: `products/scheduler/frontend/src/products/display/bracketDisplay/BracketResultsView.tsx`
- Test: `products/scheduler/frontend/src/products/display/bracketDisplay/__tests__/BracketResultsView.test.tsx`
- Modify: `products/scheduler/frontend/src/products/display/bracketDisplay/bracketDisplayData.ts` (add `eventChampion`)

**Interfaces:**
- Produces: `eventChampion(data, eventId): string | null` (the winner of the event's last-round play_unit, resolved to a participant name, or null if undecided); `BracketResultsView({ data }: { data: BracketTournamentDTO })` — per event: the champion (when decided) + the list of completed results.

- [ ] **Step 1: Write the failing `eventChampion` + view tests**

```ts
it('eventChampion returns the winner of the final round when decided', () => {
  // event e1 rounds=[['u1']] (final), u1 p1 vs p2, result winner_side 'A' → Alice
  expect(eventChampion(eventData, 'e1')).toBe('Alice');
  // undecided → null
  expect(eventChampion(noResultData, 'e1')).toBeNull();
});
```
```tsx
it('shows the champion when an event is decided', () => {
  render(<BracketResultsView data={eventData} />);
  expect(screen.getByTestId('champion-e1')).toHaveTextContent('Alice');
});
```

- [ ] **Step 2: Run to verify they fail → implement → pass**

Add `eventChampion` to `bracketDisplayData.ts`: `event = events.find(...)`; `finalRound = event.rounds.at(-1)`; if it has exactly one play_unit and a result with `winner_side !== 'none'`, return `sideLabel(pu, winner_side === 'A' ? 'a' : 'b', participants)`; else null. Implement `BracketResultsView.tsx`: for each event, render its `discipline` heading, the champion (`eventChampion`) with a `data-testid="champion-<eventId>"` when present, and a list of completed results (play_units with a non-`none` result), each showing the winning side. Empty state when no results. Style per the existing `StandingsView`.

Run the two test files → PASS.

- [ ] **Step 3: Full suite + tsc + commit**

```bash
git add products/scheduler/frontend/src/products/display/bracketDisplay/BracketResultsView.tsx products/scheduler/frontend/src/products/display/bracketDisplay/bracketDisplayData.ts products/scheduler/frontend/src/products/display/bracketDisplay/__tests__/BracketResultsView.test.tsx
git commit -m "feat(display): BracketResultsView — winners/champion for the TV"
```

---

### Task 8: `BracketDisplayPage` + kind-branch in `PublicDisplayPage`

Extract the current meet body into `MeetDisplayPage` (verbatim), add `BracketDisplayPage` (switcher + the three views + `useBracketDisplaySync`), and make `PublicDisplayPage` a thin kind-router.

**Files:**
- Create: `products/scheduler/frontend/src/products/display/MeetDisplayPage.tsx` (the current `PublicDisplayPage` body, moved verbatim)
- Create: `products/scheduler/frontend/src/products/display/bracketDisplay/BracketDisplayPage.tsx`
- Create: `products/scheduler/frontend/src/products/display/useDisplayKind.ts`
- Modify: `products/scheduler/frontend/src/products/display/PublicDisplayPage.tsx` (becomes the router)
- Test: `products/scheduler/frontend/src/products/display/__tests__/PublicDisplayPage.branch.test.tsx`

**Interfaces:**
- Consumes: `useBracketDisplaySync`, `BracketLiveView`/`BracketDrawView`/`BracketResultsView`.
- Produces: `useDisplayKind(): 'meet' | 'bracket' | null` (reads `?id=`, fetches the summary kind via `apiClient.getTournament`, null while loading); `BracketDisplayPage()` (own fullscreen + clock + `?view=live|draw|results` switcher + `?event=` selector); `MeetDisplayPage()` (the unchanged meet display); `PublicDisplayPage()` (router).

- [ ] **Step 1: Write the failing branch test**

```tsx
// Mock useDisplayKind to return 'bracket' and getBracket to return a fixture;
// assert the bracket switcher + default Live view render (a bracket testid),
// NOT the meet 'courts' view. Then mock kind 'meet' and assert the meet path.
```
Mount `PublicDisplayPage` under a `MemoryRouter` at `/display?id=t1`, mocking `useDisplayKind`. For `'bracket'`: expect a `data-testid="bracket-display"` (root of `BracketDisplayPage`) present and the meet `courts` markers absent. For `'meet'`/`null`: expect the meet display (existing markers).

- [ ] **Step 2: Run to verify it fails (no branch yet)**

Run: `npx vitest run src/products/display/__tests__/PublicDisplayPage.branch.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Extract `MeetDisplayPage`**

Move the **entire current body** of `PublicDisplayPage.tsx` into a new `MeetDisplayPage.tsx` (rename the export to `MeetDisplayPage`; keep all imports/logic verbatim — this is a mechanical move, no behavior change).

- [ ] **Step 4: Add `useDisplayKind`**

```ts
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../api/client';

/** Resolve the workspace kind for the standalone display (viewer-gated, same
 *  context the display already runs in). null while loading. */
export function useDisplayKind(): 'meet' | 'bracket' | null {
  const [searchParams] = useSearchParams();
  const tid = searchParams.get('id');
  const [kind, setKind] = useState<'meet' | 'bracket' | null>(null);
  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    void apiClient.getTournament(tid).then((t) => {
      if (!cancelled) setKind((t?.kind as 'meet' | 'bracket') ?? 'meet');
    }).catch(() => { if (!cancelled) setKind('meet'); });
    return () => { cancelled = true; };
  }, [tid]);
  return kind;
}
```
(Confirm `apiClient.getTournament(tid)` exists and returns a summary with `kind`; if the method name differs, use the existing summary fetch.)

- [ ] **Step 5: Add `BracketDisplayPage`**

A standalone page mirroring `MeetDisplayPage`'s chrome (root `data-testid="bracket-display"`, 1 Hz clock, `FullscreenButton`, `LiveStatusPill` fed by `useBracketDisplaySync().liveStatus`), with a `?view=live|draw|results` switcher (default `live`) rendering `BracketLiveView` / `BracketDrawView` / `BracketResultsView` from `useBracketDisplaySync().data`. Draw/Results take a `?event=` selector defaulting to the first event id. Empty state when `data` is null (loading).

- [ ] **Step 6: Make `PublicDisplayPage` the router**

```tsx
import { useDisplayKind } from './useDisplayKind';
import { MeetDisplayPage } from './MeetDisplayPage';
import { BracketDisplayPage } from './bracketDisplay/BracketDisplayPage';

export function PublicDisplayPage() {
  const kind = useDisplayKind();
  // Default to the meet display while kind is loading (null) — unchanged behavior
  // for every existing meet workspace.
  if (kind === 'bracket') return <BracketDisplayPage />;
  return <MeetDisplayPage />;
}
```

- [ ] **Step 7: Run the branch test + full suite + build**

Run: `npx vitest run src/products/display` then `npx vitest run` then `npx tsc -b` then `npm run build`
Expected: the branch test passes; the existing `MeetDisplayPage` (ex-`PublicDisplayPage`) tests pass unchanged (update their import path if they imported `PublicDisplayPage` directly and relied on its body — point them at `MeetDisplayPage`, or keep them on `PublicDisplayPage` with `useDisplayKind` mocked to `'meet'`/null). tsc + build clean.

- [ ] **Step 8: Commit**

```bash
git add products/scheduler/frontend/src/products/display
git commit -m "feat(display): kind-branch PublicDisplayPage; BracketDisplayPage with Live/Draw/Results switcher"
```

---

## Self-Review

**Spec coverage:**
- Backend derive bracket→display available → Task 1. Migration → Task 2. Frontend parity → Task 3. ✓
- Enable display on a bracket workspace via existing PATCH → Task 1 enable test (no rule change). ✓
- `useBracketDisplaySync` read-only poll → Task 4. ✓
- Three modular read-only views (Live/Draw/Results) → Tasks 5/6/7. ✓
- Director view switcher + kind branch + meet untouched (verbatim extraction) → Task 8. ✓
- Auth unchanged (viewer-gated getBracket, same context) → Task 4 uses `apiClient.getBracket`; no auth code touched. ✓

**Placeholder scan:** The view components (Tasks 5–8) specify exact data props, the concrete derivation helpers (with full code + tests), the testids/assertions, and reference the specific existing display component to match for TV styling (`CourtsView`/`DrawView`/`StandingsView`) — the only non-verbatim part is the presentational JSX, which follows a named existing pattern, not a vague instruction. Task 8 Step 4 carries one concrete verification (confirm the `apiClient.getTournament` summary method name).

**Type consistency:** `BracketTournamentDTO`/`PlayUnitDTO`/`AssignmentDTO`/`ResultDTO`/`EventDTO`/`Participant` field names match `src/api/bracketDto.ts` throughout. `sideLabel`/`liveMatches`/`eventChampion` signatures match their tests and the view consumers. `useBracketDisplaySync` returns `{ data, liveStatus, syncError }` consumed by `BracketDisplayPage`. `LiveStatus` is imported from the existing `useDisplaySync`.
