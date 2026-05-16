# Bundle 3 — Bracket URL routing parity (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every meet + bracket sub-tab deep-linkable and refresh-safe by syncing tab clicks to the URL, exposing per-tab URL segments for bracket, and redirecting the legacy `/bracket` URL.

**Architecture:** Routing-only fix. `TabBar` co-fires `navigate(url, { replace: true })` with `setActiveTab` on click. `TournamentPage`'s URL→store sync drops the `'bracket' → 'bracket-setup'` translation since each segment is now exactly its tab id. `App.tsx` gets a legacy redirect for `/tournaments/:id/bracket`. The `BracketTab` component is unchanged; internal dispatch stays in place.

**Tech Stack:** TypeScript + React 18 + react-router-dom v6 + Vitest + @testing-library/react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-15-bundle-3-bracket-url-routing-design.md`
**Branch:** `feat/bundle-3-bracket-url-routing`
**Base SHA:** `9544ebe` (post-spec commit)

---

## File map

| File | Action | Why |
|---|---|---|
| `products/scheduler/frontend/src/app/TabBar.tsx` | modify | `onClick` co-fires `navigate(url, { replace: true })` |
| `products/scheduler/frontend/src/pages/TournamentPage.tsx` | modify | Drop `'bracket' → 'bracket-setup'` mapping; broaden segment allowlist to `MEET_TAB_IDS ∪ BRACKET_TAB_IDS`; switch optimistic-kind to `startsWith('bracket-')` |
| `products/scheduler/frontend/src/app/App.tsx` | modify | Add `<Route path="/tournaments/:id/bracket">` legacy redirect to `bracket-setup` |
| `products/scheduler/frontend/src/pages/TournamentListPage.tsx` | modify | `openTournament` + `handleCreate` segments swap `'bracket'` → `'bracket-setup'` |
| `products/scheduler/frontend/src/lib/bracketTabs.ts` | NO CHANGE | Existing `normalizeActiveTab` already snaps `'bracket'` (the stale sentinel) to `'bracket-setup'` when kind is bracket |
| `products/scheduler/frontend/src/lib/__tests__/TabBar.test.tsx` | create | New test file — tab clicks fire navigate + setActiveTab |
| `products/scheduler/frontend/src/lib/__tests__/TournamentPage.test.tsx` | create | New test file — URL → store sync for all segments, legacy redirect lands on `/bracket-setup` |
| `products/scheduler/frontend/src/lib/__tests__/bracketTabs.test.ts` | modify | Add one test case for `normalizeActiveTab('bracket', 'bracket') → 'bracket-setup'` regression guard |
| `products/scheduler/frontend/src/lib/__tests__/TournamentListPage.test.tsx` | create | New test file — Open button + create flow navigate to right segment for each kind |

---

## Task 1: `TabBar` — tab click fires URL navigation

### Red — failing test

**Files:**
- Create: `products/scheduler/frontend/src/lib/__tests__/TabBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * Tab clicks must update both the active-tab store AND the URL.
 *
 * Today TabBar only sets activeTab; the URL stays at whatever segment
 * the operator deep-linked to. After this bundle, clicking a tab
 * navigates to /tournaments/:id/<tab.id> with replace semantics so
 * refresh + share work and the back button doesn't accumulate.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TabBar } from '../../app/TabBar';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';

/** Renders TabBar mounted under /tournaments/t1/<initialSeg>. The
 *  LocationProbe writes the current path into a ref the test reads. */
function renderTabBar(initialSeg: string, locationRef: { current: string }) {
  function LocationProbe() {
    const loc = useLocation();
    locationRef.current = loc.pathname;
    return null;
  }
  return render(
    <MemoryRouter initialEntries={[`/tournaments/t1/${initialSeg}`]}>
      <Routes>
        <Route
          path="/tournaments/:id/*"
          element={
            <>
              <TabBar />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Reset stores to a known meet-kind tournament with at least one
  // player + one match so no meet tabs are disabled.
  useUiStore.setState({
    activeTab: 'setup',
    activeTournamentKind: 'meet',
    activeTournamentId: 't1',
    bracketDataReady: false,
  });
  useTournamentStore.setState({
    players: [{ id: 'p1', name: 'A', schoolId: 's1', gender: 'M' } as never],
    matches: [{ id: 'm1' } as never],
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      courtCount: 4,
      restBetweenRounds: 0,
      breaks: [],
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      tournamentName: 'Test',
    },
  });
});

describe('<TabBar /> URL sync', () => {
  it('clicking a meet tab navigates to /tournaments/:id/<tab>', () => {
    const loc = { current: '' };
    renderTabBar('setup', loc);
    fireEvent.click(screen.getByTestId('tab-roster'));
    expect(loc.current).toBe('/tournaments/t1/roster');
  });

  it('clicking a meet tab also calls setActiveTab in the store', () => {
    const loc = { current: '' };
    renderTabBar('setup', loc);
    fireEvent.click(screen.getByTestId('tab-matches'));
    expect(useUiStore.getState().activeTab).toBe('matches');
  });

  it('clicking a bracket tab navigates to /tournaments/:id/<bracket-tab>', () => {
    useUiStore.setState({
      activeTab: 'bracket-setup',
      activeTournamentKind: 'bracket',
      bracketDataReady: true,
    });
    const loc = { current: '' };
    renderTabBar('bracket-setup', loc);
    fireEvent.click(screen.getByTestId('tab-bracket-roster'));
    expect(loc.current).toBe('/tournaments/t1/bracket-roster');
    expect(useUiStore.getState().activeTab).toBe('bracket-roster');
  });

  it('clicking a disabled tab is a no-op (no navigate, no setActiveTab)', () => {
    // Schedule is disabled when matches.length === 0
    useTournamentStore.setState({ matches: [] });
    const loc = { current: '' };
    renderTabBar('setup', loc);
    const scheduleTab = screen.getByTestId('tab-schedule');
    fireEvent.click(scheduleTab);
    expect(loc.current).toBe('/tournaments/t1/setup'); // unchanged
    expect(useUiStore.getState().activeTab).toBe('setup'); // unchanged
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/TabBar.test.tsx
```

Expected: the first three navigate-asserting tests fail. The `loc.current` won't change because `onClick` doesn't call `navigate` yet — it only calls `setActiveTab`. The `setActiveTab` assertions (test 2 + test 3 second half) may pass.

### Green — minimal implementation

**Files:**
- Modify: `products/scheduler/frontend/src/app/TabBar.tsx`

- [ ] **Step 3: Add `useNavigate` + `useTournamentId` imports**

At the top of the existing imports in `TabBar.tsx`, add:

```ts
import { useNavigate } from 'react-router-dom';
import { useTournamentId } from '../hooks/useTournamentId';
```

(`useLocation` may already be imported via `react-router-dom`; co-locate the import.)

- [ ] **Step 4: Read the navigate handle inside the component**

In the `TabBar` function body (currently around line 50), add alongside the existing store reads:

```ts
const navigate = useNavigate();
const tid = useTournamentId();
```

Place these near the top of the function (above the `const tabs: TabDef[] = ...` line).

- [ ] **Step 5: Update the `onClick` handler**

Find the existing button render in `TabBar.tsx`:

```tsx
onClick={() => setActiveTab(tab.id)}
```

Replace with:

```tsx
onClick={() => {
  if (tid) {
    navigate(`/tournaments/${tid}/${tab.id}`, { replace: true });
  }
  setActiveTab(tab.id);
}}
```

Note: the `disabled` button attribute already gates click events at the DOM level — disabled tabs don't fire `onClick` at all, so no extra guard needed inside the handler. The existing `disabled={isDisabled}` attribute on the `<button>` element handles this.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/TabBar.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 7: Run the full suite**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: 144 + 4 = 148 tests pass. No existing tests should regress (the new behavior is additive — `setActiveTab` still fires; `navigate` is new but uses `replace` so back-button behavior in existing tests doesn't change).

- [ ] **Step 8: Commit**

```bash
git add products/scheduler/frontend/src/app/TabBar.tsx \
        products/scheduler/frontend/src/lib/__tests__/TabBar.test.tsx
git commit -m "feat(tabbar): tab clicks sync to URL with replace semantics

Co-fires navigate('/tournaments/:id/<tab>', {replace:true}) alongside
the existing setActiveTab on every tab button click. Disabled tabs
remain no-ops via the existing disabled attribute (DOM gates the
event before onClick runs).

replace semantics so tab-switching doesn't accumulate back-button
stops — back from any tab lands where the operator came from
(dashboard, deep link), not on the previous tab.

Audit finding: docs/audits/2026-05-15_user-audit_meet-vs-bracket.md
'URL/state desync — URL stays at /setup?section=share while the tab
bar shows Roster active'."
```

---

## Task 2: `TournamentPage` — drop `'bracket'` translation, broaden segment allowlist

### Red — failing test

**Files:**
- Create: `products/scheduler/frontend/src/lib/__tests__/TournamentPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * URL → store sync for the per-tournament shell.
 *
 * After Bundle 3 the URL trailing segment is the tab id 1:1. Mounting
 * at /tournaments/:id/bracket-roster sets activeTab = 'bracket-roster'
 * (no longer translated through the legacy 'bracket' sentinel).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TournamentPage } from '../../pages/TournamentPage';
import { useUiStore } from '../../store/uiStore';

// Mock useTournamentKind so the page doesn't fetch /tournaments/:id.
vi.mock('../../hooks/useTournamentKind', () => ({
  useTournamentKind: () => undefined,
}));
// Mock AppShell — we only care about the page's own URL→store sync,
// not what AppShell renders.
vi.mock('../../app/AppShell', () => ({
  AppShell: () => null,
}));

function mountAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/tournaments/:id/*" element={<TournamentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({
    activeTab: 'setup',
    activeTournamentKind: null,
    activeTournamentId: null,
  });
});

describe('TournamentPage URL → store sync', () => {
  it('sets activeTab = "bracket-roster" when mounted at /bracket-roster', () => {
    mountAt('/tournaments/t1/bracket-roster');
    expect(useUiStore.getState().activeTab).toBe('bracket-roster');
    expect(useUiStore.getState().activeTournamentKind).toBe('bracket');
  });

  it('sets activeTab = "bracket-events" when mounted at /bracket-events', () => {
    mountAt('/tournaments/t1/bracket-events');
    expect(useUiStore.getState().activeTab).toBe('bracket-events');
    expect(useUiStore.getState().activeTournamentKind).toBe('bracket');
  });

  it('sets activeTab = "setup" when mounted at /setup', () => {
    mountAt('/tournaments/t1/setup');
    expect(useUiStore.getState().activeTab).toBe('setup');
    expect(useUiStore.getState().activeTournamentKind).toBe('meet');
  });

  it('sets activeTab = "tv" when mounted at /tv', () => {
    mountAt('/tournaments/t1/tv');
    expect(useUiStore.getState().activeTab).toBe('tv');
    expect(useUiStore.getState().activeTournamentKind).toBe('meet');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/TournamentPage.test.tsx
```

Expected: the `bracket-roster` and `bracket-events` tests fail. The current `_TAB_SEGMENTS` set only contains `MEET_TAB_IDS ∪ {'bracket'}` — `bracket-roster` is NOT in the set, so the layoutEffect doesn't set activeTab for it. The optimistic-kind check `segment === 'bracket'` is also false for `bracket-roster`, so kind stays `null` (or whatever it was). The two meet-tab tests should pass even today.

### Green

**Files:**
- Modify: `products/scheduler/frontend/src/pages/TournamentPage.tsx`

- [ ] **Step 3: Broaden the allowlist + drop the legacy translation**

Replace the existing `_TAB_SEGMENTS` declaration (currently around lines 27–31) with:

```ts
import { normalizeActiveTab, MEET_TAB_IDS, BRACKET_TAB_IDS } from '../lib/bracketTabs';

// URL-routable trailing segments: every meet tab id + every bracket tab id.
// Legacy `/bracket` is handled by an explicit <Navigate> route in App.tsx;
// by the time we reach this layoutEffect the URL is already /bracket-setup.
const _TAB_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  ...MEET_TAB_IDS,
  ...BRACKET_TAB_IDS,
]);
```

(`BRACKET_TAB_IDS` is exported from `bracketTabs.ts`. Add it to the existing import line.)

- [ ] **Step 4: Replace the layoutEffect body**

Find the `useLayoutEffect` (currently around lines 53–77). Replace its body with:

```ts
useLayoutEffect(() => {
  if (!tid) return;
  const segment = location.pathname.split('/').filter(Boolean).pop();
  if (segment && _TAB_SEGMENTS.has(segment as AppTab)) {
    // Segment IS the tab id, 1:1. No translation.
    useUiStore.getState().setActiveTab(segment as AppTab);
  }
  // Optimistic kind: any bracket-* segment → bracket; otherwise meet.
  // ``useTournamentKind``'s async fetch corrects the optimistic guess
  // if the URL lies (e.g. someone hand-edits the URL to a bracket tab
  // on a meet-kind tournament).
  const optimisticKind: 'meet' | 'bracket' =
    segment && segment.startsWith('bracket-') ? 'bracket' : 'meet';
  useUiStore.getState().setActiveTournamentKind(optimisticKind);
}, [tid, location.pathname]);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/TournamentPage.test.tsx
```

Expected: 4/4 pass.

- [ ] **Step 6: Run the full suite — verify no regression**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: 148 + 4 = 152 tests pass.

- [ ] **Step 7: Commit**

```bash
git add products/scheduler/frontend/src/pages/TournamentPage.tsx \
        products/scheduler/frontend/src/lib/__tests__/TournamentPage.test.tsx
git commit -m "feat(tournament-page): recognize per-tab bracket URL segments

URL trailing segment is now the tab id 1:1 — no special-case mapping
for the legacy /bracket. Allowlist broadens to MEET_TAB_IDS plus
BRACKET_TAB_IDS. Optimistic-kind derivation switches from
segment === 'bracket' to segment.startsWith('bracket-').

Legacy /tournaments/:id/bracket URLs are handled by a separate
<Navigate> route landing on the next commit."
```

---

## Task 3: `App.tsx` — legacy `/bracket` redirect

### Red

**Files:**
- Modify: `products/scheduler/frontend/src/lib/__tests__/TournamentPage.test.tsx` (extend with the redirect test)

- [ ] **Step 1: Add the legacy-redirect test**

Append to the existing `describe('TournamentPage URL → store sync', ...)` block (or add a new sibling describe):

```tsx
describe('legacy /bracket redirect', () => {
  // We need a different test scaffold here because the redirect lives
  // in App.tsx's Routes, not in TournamentPage itself. The page-level
  // tests above mount TournamentPage directly; this test mounts an
  // App-style routing setup that includes the legacy route.
  it('mounting at /tournaments/:id/bracket lands on /bracket-setup', async () => {
    function LocationProbe({ refObj }: { refObj: { current: string } }) {
      const loc = useLocation();
      refObj.current = loc.pathname;
      return null;
    }
    const locRef = { current: '' };
    render(
      <MemoryRouter initialEntries={['/tournaments/t1/bracket']}>
        <Routes>
          <Route
            path="/tournaments/:id/bracket"
            element={<Navigate to="bracket-setup" replace />}
          />
          <Route
            path="/tournaments/:id/*"
            element={
              <>
                <TournamentPage />
                <LocationProbe refObj={locRef} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(locRef.current).toBe('/tournaments/t1/bracket-setup');
    expect(useUiStore.getState().activeTab).toBe('bracket-setup');
  });
});
```

Make sure the imports include:

```tsx
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
```

- [ ] **Step 2: Run to verify failure (or partial pass — see notes)**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/TournamentPage.test.tsx
```

Expected: the new test SHOULD pass even before changing App.tsx — the test's own routing scaffold includes the `<Navigate>` redirect inline. The point of the test is to lock in the redirect behavior; the actual edit to App.tsx is the production wiring. (If the test fails because of how `LocationProbe` interacts with the redirect timing, simplify with a router-aware assertion. The test as written is the minimum that proves the redirect works end-to-end.)

### Green — wire the redirect in App.tsx

**Files:**
- Modify: `products/scheduler/frontend/src/app/App.tsx`

- [ ] **Step 3: Add the legacy redirect Route**

In `App.tsx`'s `<Routes>` block, find the existing per-tournament route (currently the `<Route path="/tournaments/:id/*" element={<AuthGuard><Suspense fallback={<Fallback />}><TournamentPage /></Suspense></AuthGuard>} />` near the bottom).

Add this route IMMEDIATELY BEFORE it:

```tsx
{/* Legacy redirect: pre-Bundle-3 URLs pointed at the bare /bracket
    segment. Redirect them to /bracket-setup so bookmarks and shared
    links don't 404. Replace semantics so the operator's history
    stays clean. */}
<Route
  path="/tournaments/:id/bracket"
  element={<Navigate to="bracket-setup" replace />}
/>
```

Update the imports at the top of `App.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
```

(`Navigate` may already be imported via the existing `<Route path="*" element={<Navigate to="/" replace />}` — verify.)

- [ ] **Step 4: Run tests**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/TournamentPage.test.tsx
```

Expected: still all green. The new App.tsx route mirrors the test scaffold's structure; production now matches the test.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/frontend/src/app/App.tsx
git commit -m "feat(routing): /tournaments/:id/bracket -> /bracket-setup

Legacy redirect for pre-Bundle-3 URLs that pointed at the bare
/bracket segment. <Navigate to=\"bracket-setup\" replace /> sits
ahead of the catch-all per-tournament route so the redirect resolves
before TournamentPage mounts. replace semantics keep the operator's
history clean (no back-button stop on the dead legacy URL)."
```

---

## Task 4: `TournamentListPage` — Open + Create land on `bracket-setup`

### Red

**Files:**
- Create: `products/scheduler/frontend/src/lib/__tests__/TournamentListPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * Dashboard navigation: Open and the post-Create handler must target
 * /bracket-setup for bracket tournaments (was /bracket pre-Bundle-3).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TournamentListPage } from '../../pages/TournamentListPage';
import { apiClient } from '../../api/client';

vi.mock('../../api/client', () => ({
  apiClient: {
    listTournaments: vi.fn(),
    createTournament: vi.fn(),
    deleteTournament: vi.fn(),
  },
}));

// Auth gate / theme / density hooks are no-ops here — we mount the
// page directly without AuthGuard or the wider AppShell.
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'op@example.com' } }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function LocationProbe({ refObj }: { refObj: { current: string } }) {
  const loc = useLocation();
  refObj.current = loc.pathname;
  return null;
}

function mount(refObj: { current: string }) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <TournamentListPage />
              <LocationProbe refObj={refObj} />
            </>
          }
        />
        {/* Catch-all so navigate('/tournaments/t1/bracket-setup') doesn't 404. */}
        <Route path="/tournaments/:id/*" element={<LocationProbe refObj={refObj} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(apiClient.listTournaments).mockResolvedValue([
    {
      id: 'br1', name: 'Bracket A', kind: 'bracket' as const, role: 'owner' as const,
      tournamentDate: null, status: 'draft' as const,
    },
    {
      id: 'me1', name: 'Meet A', kind: 'meet' as const, role: 'owner' as const,
      tournamentDate: null, status: 'draft' as const,
    },
  ] as never);
});

describe('TournamentListPage navigation', () => {
  it('Open on a bracket tournament navigates to /bracket-setup', async () => {
    const loc = { current: '' };
    mount(loc);
    // Wait for the listTournaments mock to resolve and render.
    await waitFor(() => expect(screen.getByText(/Bracket A/i)).toBeInTheDocument());
    const openButtons = screen.getAllByRole('button', { name: /open/i });
    // Order: bracket row first (owner, first in mock list).
    fireEvent.click(openButtons[0]);
    expect(loc.current).toBe('/tournaments/br1/bracket-setup');
  });

  it('Open on a meet tournament navigates to /setup', async () => {
    const loc = { current: '' };
    mount(loc);
    await waitFor(() => expect(screen.getByText(/Meet A/i)).toBeInTheDocument());
    const openButtons = screen.getAllByRole('button', { name: /open/i });
    fireEvent.click(openButtons[1]); // meet row, second in list
    expect(loc.current).toBe('/tournaments/me1/setup');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/TournamentListPage.test.tsx
```

Expected: `Open on a bracket tournament` test fails — `loc.current` is `/tournaments/br1/bracket` (current behavior), not `/tournaments/br1/bracket-setup`.

### Green

**Files:**
- Modify: `products/scheduler/frontend/src/pages/TournamentListPage.tsx`

- [ ] **Step 3: Swap the segment in `openTournament`**

Find lines around 229–241 (the `openTournament` callback). Change:

```ts
const segment = t?.kind === 'bracket' ? 'bracket' : 'setup';
```

to:

```ts
const segment = t?.kind === 'bracket' ? 'bracket-setup' : 'setup';
```

- [ ] **Step 4: Swap the segment in `handleCreate`**

Find the `handleCreate` callback (around lines 263–283). Change:

```ts
const destination = newKind === 'bracket' ? 'bracket' : 'setup';
```

to:

```ts
const destination = newKind === 'bracket' ? 'bracket-setup' : 'setup';
```

- [ ] **Step 5: Run tests**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/TournamentListPage.test.tsx
```

Expected: 2/2 pass.

- [ ] **Step 6: Full suite**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: all green. Total approximately 152 + 2 = 154 tests.

- [ ] **Step 7: Commit**

```bash
git add products/scheduler/frontend/src/pages/TournamentListPage.tsx \
        products/scheduler/frontend/src/lib/__tests__/TournamentListPage.test.tsx
git commit -m "feat(dashboard): Open + Create land on /bracket-setup

openTournament and handleCreate both swap the bracket segment from
'bracket' to 'bracket-setup' so the dashboard lands on a real
sub-tab URL instead of one that immediately redirects.

Test verifies the navigate target for both kinds."
```

---

## Task 5: `bracketTabs` — regression guard for stale `'bracket'` activeTab

### Red

**Files:**
- Modify: `products/scheduler/frontend/src/lib/__tests__/bracketTabs.test.ts`

- [ ] **Step 1: Add the test case**

Find the existing `describe('normalizeActiveTab', ...)` block in `bracketTabs.test.ts`. Add this case at the end of the describe:

```ts
  it('normalizes the legacy "bracket" activeTab to "bracket-setup" on bracket kind', () => {
    // The bare 'bracket' value is reserved as a stale sentinel only —
    // post-Bundle-3 the legacy URL redirects to /bracket-setup, but
    // any code path that still sets activeTab='bracket' (e.g. from a
    // very old stored UI state) must snap to a valid bracket sub-tab.
    expect(normalizeActiveTab('bracket', 'bracket')).toBe('bracket-setup');
  });
```

- [ ] **Step 2: Run the test**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/bracketTabs.test.ts
```

Expected: this MAY pass on first run (the existing `normalizeActiveTab` already snaps unknown bracket tabs to `'bracket-setup'`). If it does pass, the regression guard is just locking in the behavior — no code change needed.

If it fails, read the existing logic in `bracketTabs.ts` and adjust so the `'bracket'` value is treated as not-in-`BRACKET_TAB_IDS` and therefore snapped.

### No code change expected

- [ ] **Step 3: If the test passed in Step 2, just commit the new test**

```bash
git add products/scheduler/frontend/src/lib/__tests__/bracketTabs.test.ts
git commit -m "test(bracket-tabs): regression guard for stale 'bracket' activeTab

Locks in the normalizer's behavior: the bare 'bracket' value (kept
in AppTab as a sentinel for backwards compat) must snap to
'bracket-setup' when kind is bracket. No code change."
```

If the test FAILED in Step 2, fix the normalizer and amend the message:

```bash
git add products/scheduler/frontend/src/lib/bracketTabs.ts \
        products/scheduler/frontend/src/lib/__tests__/bracketTabs.test.ts
git commit -m "fix(bracket-tabs): snap stale 'bracket' activeTab to 'bracket-setup'"
```

---

## Task 6: Manual browser walk-through

No automated assertions for this task — visual + interaction verification.

- [ ] **Step 1: Start vite**

```bash
cd products/scheduler/frontend
npm run dev
```

Note the port.

- [ ] **Step 2: Click into a bracket tournament from the dashboard**

From `http://localhost:<port>/`, click Open on the audit bracket (`Audit Tournament 2026`, id `7fa7210a-b8fb-4301-8b04-8c4c2fb9e43a`).

**Expected URL:** `/tournaments/7fa7210a-b8fb-4301-8b04-8c4c2fb9e43a/bracket-setup` (NOT `/bracket`).

- [ ] **Step 3: Click each bracket tab in order**

Setup → Roster → Events → Draw → Schedule → Live. After each click, confirm the URL trailing segment matches the tab id:

- `/bracket-setup`
- `/bracket-roster`
- `/bracket-events`
- `/bracket-draw`
- `/bracket-schedule`
- `/bracket-live`

- [ ] **Step 4: Hard-refresh on a deep bracket sub-tab**

While on `/bracket-events`, Cmd-R (or Ctrl-R). Should reload onto Events, not snap to Setup.

- [ ] **Step 5: Hand-edit the URL to the legacy `/bracket`**

Replace the segment with `bracket` in the address bar and hit Enter. URL should redirect to `/bracket-setup` without a visible intermediate stop.

- [ ] **Step 6: Browser back-button check**

After clicking through bracket Setup → Roster → Events, hit browser back. You should land on the dashboard (`/`), not on `/bracket-roster`. (Because tab clicks use `replace`, the only history entries are dashboard → bracket-setup → wherever the next nav goes.)

- [ ] **Step 7: Same drill on a meet tournament**

Open `Audit Meet 2026` (id `09fd8396-e836-4d33-bb97-68fbb27a0cc3`). Cycle Setup → Roster → Matches → Schedule → Live → TV. URL updates each time. Hard-refresh on `/tv` lands on TV.

- [ ] **Step 8: Stop vite**

Ctrl-C in the terminal.

- [ ] **Step 9: Push branch + open PR (or merge to local main per user's prefs)**

```bash
git push -u origin feat/bundle-3-bracket-url-routing
gh pr create --base main \
  --title "feat(routing): bracket per-tab URLs + meet tab-click URL sync" \
  --body "$(cat <<'EOF'
Bundle 3 of the meet-vs-bracket audit follow-ups.

Closes the 'going into Setup but URL says /bracket' UX complaint.

Each tab now has a real, deep-linkable URL:
- meet: /setup, /roster, /matches, /schedule, /live, /tv (unchanged segments;
  new on-click navigate so the URL stays in sync)
- bracket: /bracket-setup, /bracket-roster, /bracket-events, /bracket-draw,
  /bracket-schedule, /bracket-live (new per-tab segments)
- /tournaments/:id/bracket -> redirects to /bracket-setup for backwards compat
- Dashboard Open + create-flow land on /bracket-setup directly

Tab clicks use replace semantics so the back-button doesn't accumulate
per-tab stops. Internal BracketTab dispatch is unchanged — this is
routing-only.

See:
- spec: docs/superpowers/specs/2026-05-15-bundle-3-bracket-url-routing-design.md
- plan: docs/superpowers/plans/2026-05-15-bundle-3-bracket-url-routing.md
EOF
)"
```

---

## Spec coverage check

| Spec requirement | Plan task |
|---|---|
| Per-tab URL segments for bracket | Task 2 (URL→store), Task 1 (store→URL) |
| Tab click → URL sync (both kinds) | Task 1 |
| Replace semantics | Task 1 |
| URL → store sync recognizes bracket-* segments | Task 2 |
| Drop `'bracket' → 'bracket-setup'` translation | Task 2 |
| Optimistic-kind switches to `startsWith('bracket-')` | Task 2 |
| Legacy `/bracket` redirects to `/bracket-setup` | Task 3 |
| Dashboard Open → `/bracket-setup` | Task 4 |
| Create flow → `/bracket-setup` | Task 4 |
| `normalizeActiveTab('bracket', 'bracket')` returns `'bracket-setup'` | Task 5 |
| Manual browser walk | Task 6 |

No gaps.
