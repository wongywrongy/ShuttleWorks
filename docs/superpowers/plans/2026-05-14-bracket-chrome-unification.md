# Bracket Chrome Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bracket (tournament-kind) surface navigate Draw / Schedule / Live through the same horizontal top `TabBar` the meet uses, so the two products read as one.

**Architecture:** Populate `BRACKET_TABS` so the existing `TabBar` renders the bracket's three sections; `BracketTabBody` drops `SettingsShell` and dispatches on `activeTab`; a new `BracketViewHeader` (absorbing the deleted `TopBar`'s event selector / counters / export / reset) renders once above the content as the meet's standard per-tab header strip. `SettingsShell` is retained — only as the setup-wizard rail (meet Setup tab, bracket `SetupForm`).

**Tech Stack:** TypeScript · React 19 · Vite · Tailwind 3 · Zustand · `@scheduler/design-system` · Vitest (unit) · Playwright (E2E) · browser-harness (visual verification).

**Reference spec:** `docs/superpowers/specs/2026-05-14-bracket-chrome-unification-design.md` (committed at `dcbe5db`).

**Deviation from spec:** The spec said the `activeTab` normalization effect "lives in `BracketTab`." During planning it became clear `BracketTab` only mounts for bracket-kind tournaments, so it cannot catch the bracket→meet transition (stale `bracket-*` tab when a meet loads). The effect is placed in `pages/TournamentPage.tsx` instead — it already owns URL↔`activeTab`↔kind coordination and observes both transition directions. Same behavior, correct location.

---

## File Structure

```
products/scheduler/frontend/src/
├── store/uiStore.ts                       # MODIFY — AppTab += bracket-* ids; bracketDataReady flag
├── lib/bracketTabs.ts                     # CREATE — tab ids, BRACKET_TABS, pure helpers
├── lib/__tests__/bracketTabs.test.ts      # CREATE — unit tests for the pure helpers
├── pages/TournamentPage.tsx               # MODIFY — activeTab normalization effect
├── app/TabBar.tsx                         # MODIFY — render BRACKET_TABS; bracket disabled logic
├── features/bracket/
│   ├── BracketViewHeader.tsx              # CREATE — per-view header strip (meet pattern)
│   ├── BracketTab.tsx                     # MODIFY — drop SettingsShell; activeTab dispatch; bracketDataReady writer
│   ├── TopBar.tsx                         # DELETE — concerns moved into BracketViewHeader
│   ├── DrawView.tsx                       # MODIFY — remove internal DRAW eyebrow
│   ├── ScheduleView.tsx                   # MODIFY — remove internal SCHEDULE eyebrow
│   └── LiveView.tsx                       # MODIFY — remove internal LIVE eyebrow
└── app/AppShell.tsx                       # UNCHANGED — still renders <BracketTab/> directly
```

`features/settings/SettingsShell.tsx`, `SettingsNav.tsx`, and `features/bracket/SetupForm.tsx` are **unchanged** — `SettingsShell` stays as the setup-wizard rail.

---

## Task 1: uiStore foundation — bracket tab ids + `bracketDataReady` flag

**Files:**
- Modify: `products/scheduler/frontend/src/store/uiStore.ts`

No runtime behavior changes — this only adds type members and a store field that later tasks consume.

- [ ] **Step 1: Extend the `AppTab` type**

In `store/uiStore.ts`, replace the `AppTab` type (currently lines 19-26):

```ts
export type AppTab =
  | 'setup'
  | 'roster'
  | 'matches'
  | 'schedule'
  | 'live'
  | 'bracket'
  | 'tv'
  | 'bracket-draw'
  | 'bracket-schedule'
  | 'bracket-live';
```

(The legacy `'bracket'` member stays — `TournamentPage`'s URL-segment sync still sets it from the `/bracket` route segment before normalization runs.)

- [ ] **Step 2: Add `bracketDataReady` to the `UiState` interface**

Find this block in the `UiState` interface (currently lines 121-123):

```ts
  activeTournamentKind: 'meet' | 'bracket' | null;
  setActiveTournamentKind: (kind: 'meet' | 'bracket' | null) => void;

  // Solver HUD
```

Replace with:

```ts
  activeTournamentKind: 'meet' | 'bracket' | null;
  setActiveTournamentKind: (kind: 'meet' | 'bracket' | null) => void;

  // Whether the active bracket-kind tournament has a generated draw.
  // Written by ``BracketTab`` from ``useBracket().data``; ``null`` when
  // no bracket surface is mounted (meet kind / dashboard). ``TabBar``
  // reads this to disable the Draw/Schedule/Live tabs until a draw
  // exists — ``TabBar`` lives outside ``BracketApiProvider`` so it
  // can't call ``useBracket`` itself.
  bracketDataReady: boolean | null;
  setBracketDataReady: (ready: boolean | null) => void;

  // Solver HUD
```

- [ ] **Step 3: Add `bracketDataReady` to the `INITIAL` type union**

Find this fragment in the `INITIAL` `Pick<>` type (currently lines 188-189):

```ts
  | 'activeTournamentId'
  | 'activeTournamentKind'
  | 'solverHud'
```

Replace with:

```ts
  | 'activeTournamentId'
  | 'activeTournamentKind'
  | 'bracketDataReady'
  | 'solverHud'
```

- [ ] **Step 4: Add `bracketDataReady` to the `INITIAL` object**

Find (currently lines 209-211):

```ts
  activeTournamentId: null,
  activeTournamentKind: null,
  solverHud: DEFAULT_SOLVER_HUD,
```

Replace with:

```ts
  activeTournamentId: null,
  activeTournamentKind: null,
  bracketDataReady: null,
  solverHud: DEFAULT_SOLVER_HUD,
```

- [ ] **Step 5: Add the `setBracketDataReady` setter to the store body**

Find (currently lines 234-236):

```ts
  setActiveTournamentId: (activeTournamentId) => set({ activeTournamentId }),
  setActiveTournamentKind: (activeTournamentKind) => set({ activeTournamentKind }),

  setSolverHud: (patch) =>
```

Replace with:

```ts
  setActiveTournamentId: (activeTournamentId) => set({ activeTournamentId }),
  setActiveTournamentKind: (activeTournamentKind) => set({ activeTournamentKind }),
  setBracketDataReady: (bracketDataReady) => set({ bracketDataReady }),

  setSolverHud: (patch) =>
```

(`reset()` already spreads `...INITIAL`, so `bracketDataReady` resets automatically.)

- [ ] **Step 6: Type-check**

Run: `cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/products/scheduler/frontend" && npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 7: Commit**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git add products/scheduler/frontend/src/store/uiStore.ts
git commit -m "feat(uiStore): bracket-* tab ids + bracketDataReady flag

Adds the three bracket-* tab ids to AppTab and a bracketDataReady
boolean|null flag (+ setter). No behavior change yet — consumed by
the TabBar, BracketTab, and tab-normalization wiring in later tasks."
```

---

## Task 2: `lib/bracketTabs.ts` — pure tab helpers (TDD)

**Files:**
- Create: `products/scheduler/frontend/src/lib/bracketTabs.ts`
- Test: `products/scheduler/frontend/src/lib/__tests__/bracketTabs.test.ts`

The bracket-tab id list, the `BRACKET_TABS` rows for the `TabBar`, and the pure `isBracketTab` / `bracketTabView` / `normalizeActiveTab` helpers. These are the genuinely unit-testable units of this change.

- [ ] **Step 1: Write the failing test**

Create `products/scheduler/frontend/src/lib/__tests__/bracketTabs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  BRACKET_TABS,
  BRACKET_TAB_IDS,
  isBracketTab,
  bracketTabView,
  normalizeActiveTab,
} from '../bracketTabs';

describe('BRACKET_TAB_IDS / BRACKET_TABS', () => {
  it('lists the three bracket sections in order', () => {
    expect(BRACKET_TAB_IDS).toEqual([
      'bracket-draw',
      'bracket-schedule',
      'bracket-live',
    ]);
    expect(BRACKET_TABS.map((t) => t.id)).toEqual([
      'bracket-draw',
      'bracket-schedule',
      'bracket-live',
    ]);
    expect(BRACKET_TABS.map((t) => t.label)).toEqual([
      'Draw',
      'Schedule',
      'Live',
    ]);
  });
});

describe('isBracketTab', () => {
  it('is true for bracket tab ids', () => {
    expect(isBracketTab('bracket-draw')).toBe(true);
    expect(isBracketTab('bracket-schedule')).toBe(true);
    expect(isBracketTab('bracket-live')).toBe(true);
  });
  it('is false for meet tab ids and the legacy "bracket" id', () => {
    expect(isBracketTab('setup')).toBe(false);
    expect(isBracketTab('schedule')).toBe(false);
    expect(isBracketTab('live')).toBe(false);
    expect(isBracketTab('bracket')).toBe(false);
  });
});

describe('bracketTabView', () => {
  it('strips the bracket- prefix to the bare view name', () => {
    expect(bracketTabView('bracket-draw')).toBe('draw');
    expect(bracketTabView('bracket-schedule')).toBe('schedule');
    expect(bracketTabView('bracket-live')).toBe('live');
  });
});

describe('normalizeActiveTab', () => {
  it('snaps a non-bracket tab to bracket-draw when kind is bracket', () => {
    expect(normalizeActiveTab('setup', 'bracket')).toBe('bracket-draw');
    expect(normalizeActiveTab('schedule', 'bracket')).toBe('bracket-draw');
    expect(normalizeActiveTab('bracket', 'bracket')).toBe('bracket-draw');
  });
  it('leaves a bracket tab untouched when kind is bracket', () => {
    expect(normalizeActiveTab('bracket-schedule', 'bracket')).toBeNull();
  });
  it('snaps a bracket-* or legacy "bracket" tab to setup when kind is meet', () => {
    expect(normalizeActiveTab('bracket-live', 'meet')).toBe('setup');
    expect(normalizeActiveTab('bracket', 'meet')).toBe('setup');
  });
  it('leaves a meet tab untouched when kind is meet', () => {
    expect(normalizeActiveTab('roster', 'meet')).toBeNull();
  });
  it('returns null while kind is still loading', () => {
    expect(normalizeActiveTab('setup', null)).toBeNull();
    expect(normalizeActiveTab('bracket-draw', null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/products/scheduler/frontend" && npx vitest run src/lib/__tests__/bracketTabs.test.ts`
Expected: FAIL — `Failed to resolve import "../bracketTabs"` (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `products/scheduler/frontend/src/lib/bracketTabs.ts`:

```ts
/**
 * Bracket top-level tab definitions + pure helpers.
 *
 * The bracket surface navigates Draw / Schedule / Live through the same
 * horizontal ``TabBar`` the meet uses. Tab ids are uniformly
 * ``bracket-`` prefixed so they never collide with the meet's bare
 * ``schedule`` / ``live`` ids and stay unambiguous in dispatch.
 */
import type { AppTab } from '../store/uiStore';

export const BRACKET_TAB_IDS = [
  'bracket-draw',
  'bracket-schedule',
  'bracket-live',
] as const;

export type BracketTabId = (typeof BRACKET_TAB_IDS)[number];

/** ``{ id, label }`` rows for ``TabBar``'s bracket-kind tab list.
 *  Structurally compatible with ``TabBar``'s local ``TabDef`` type. */
export const BRACKET_TABS: { id: BracketTabId; label: string }[] = [
  { id: 'bracket-draw', label: 'Draw' },
  { id: 'bracket-schedule', label: 'Schedule' },
  { id: 'bracket-live', label: 'Live' },
];

/** Meet tab ids — used only to detect a stale ``activeTab`` when a
 *  meet-kind tournament loads. Kept module-private. */
const MEET_TAB_IDS: readonly string[] = [
  'setup',
  'roster',
  'matches',
  'schedule',
  'live',
  'tv',
];

export function isBracketTab(tab: AppTab): tab is BracketTabId {
  return (BRACKET_TAB_IDS as readonly string[]).includes(tab);
}

/** The bare view name a ``bracket-`` tab id maps to — drives the
 *  ``BracketViewHeader`` eyebrow and the content switch. */
export function bracketTabView(
  tab: BracketTabId,
): 'draw' | 'schedule' | 'live' {
  return tab.slice('bracket-'.length) as 'draw' | 'schedule' | 'live';
}

/**
 * Normalize ``activeTab`` when the active tournament kind resolves.
 * ``activeTab`` is shared store state: for a bracket the URL segment
 * is the bare ``/bracket`` (→ ``activeTab`` ``'bracket'``, not a
 * renderable section), and ``activeTab`` can also be stale from a
 * prior tournament of the other kind.
 *
 * Returns the tab id to set, or ``null`` when no change is needed
 * (kind still loading, or the tab is already valid for the kind).
 */
export function normalizeActiveTab(
  activeTab: AppTab,
  kind: 'meet' | 'bracket' | null,
): AppTab | null {
  if (kind === 'bracket' && !isBracketTab(activeTab)) return 'bracket-draw';
  if (kind === 'meet' && !MEET_TAB_IDS.includes(activeTab)) return 'setup';
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/products/scheduler/frontend" && npx vitest run src/lib/__tests__/bracketTabs.test.ts`
Expected: PASS — all assertions in the 5 `describe` blocks green.

- [ ] **Step 5: Type-check**

Run: `cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/products/scheduler/frontend" && npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git add products/scheduler/frontend/src/lib/bracketTabs.ts products/scheduler/frontend/src/lib/__tests__/bracketTabs.test.ts
git commit -m "feat(bracket): pure tab helpers — ids, view derivation, activeTab normalization

bracketTabs.ts: BRACKET_TAB_IDS / BRACKET_TABS, isBracketTab type
guard, bracketTabView (bracket-draw -> draw), and normalizeActiveTab
(snap a stale or bare activeTab onto a valid tab once kind resolves).
Unit-tested with vitest."
```

---

## Task 3: `BracketViewHeader.tsx` — per-view header strip

**Files:**
- Create: `products/scheduler/frontend/src/features/bracket/BracketViewHeader.tsx`

The bracket's per-view header, built to the meet's view-header pattern (`MatchesTab` / `RosterTab`: `border-b border-border bg-card px-4 py-3`, eyebrow + clusters). It absorbs `buckets`, `Counters`, and `ExportMenu` verbatim from `TopBar.tsx`, plus the event `<select>`, format label, and `Reset` button. `TopBar.tsx` is not deleted until Task 4 — the brief duplication is harmless and keeps Task 4 atomic.

- [ ] **Step 1: Create the component**

Create `products/scheduler/frontend/src/features/bracket/BracketViewHeader.tsx`:

```tsx
import { useMemo } from "react";
import { useBracketApi, type BracketApi } from "../../api/bracketClient";
import type { TournamentDTO } from "../../api/bracketDto";
import { Button, StatusBar } from "@scheduler/design-system";

interface Props {
  /** Bare view name — drives the eyebrow. Derived from ``activeTab``
   *  by ``BracketTabBody`` (``bracket-draw`` -> ``draw``). */
  view: "draw" | "schedule" | "live";
  data: TournamentDTO;
  eventId: string;
  onEventId: (id: string) => void;
  onReset: () => void;
}

const VIEW_LABEL: Record<Props["view"], string> = {
  draw: "DRAW",
  schedule: "SCHEDULE",
  live: "LIVE",
};

/**
 * Bracket per-view header strip. Built to the meet's view-header
 * pattern (mirrors ``MatchesTab`` / ``RosterTab``:
 * ``border-b border-border bg-card px-4 py-3``, eyebrow + context on
 * the left, control cluster on the right) so the bracket surface
 * reads with the same chrome rhythm as every meet tab.
 *
 * Rendered once by ``BracketTabBody`` above the Draw/Schedule/Live
 * content switch, parameterised by ``view`` — so the event selector
 * and counters have a single instance and a single ``eventId`` source.
 */
export function BracketViewHeader({
  view,
  data,
  eventId,
  onEventId,
  onReset,
}: Props) {
  const api = useBracketApi();
  const eventCounts = useMemo(() => buckets(data, eventId), [data, eventId]);
  const globalCounts = useMemo(() => buckets(data, null), [data]);

  const selectedEvent = data.events.find((e) => e.id === eventId);
  const formatLabel =
    selectedEvent?.format === "se" ? "Single Elim" : "Round Robin";

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {VIEW_LABEL[view]}
        </span>
        <select
          value={eventId}
          onChange={(e) => onEventId(e.target.value)}
          aria-label="Event"
          className="rounded-sm border border-border bg-bg-elev px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {data.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id} · {e.discipline}
            </option>
          ))}
        </select>
        {selectedEvent && (
          <span className="whitespace-nowrap text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {formatLabel}
          </span>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <Counters event={eventCounts} global={globalCounts} />
        <ExportMenu api={api} />
        <Button variant="outline" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>
    </header>
  );
}

function ExportMenu({ api }: { api: BracketApi }) {
  return (
    <div className="inline-flex rounded-sm border border-border overflow-hidden text-xs">
      <a
        href={api.exportJsonUrl()}
        target="_blank"
        rel="noreferrer"
        className="px-2 py-1 hover:bg-muted/40"
      >
        JSON
      </a>
      <a
        href={api.exportCsvUrl()}
        className="px-2 py-1 border-l border-border hover:bg-muted/40"
      >
        CSV
      </a>
      <a
        href={api.exportIcsUrl()}
        className="px-2 py-1 border-l border-border hover:bg-muted/40"
      >
        ICS
      </a>
    </div>
  );
}

function Counters({
  event,
  global,
}: {
  event: ReturnType<typeof buckets>;
  global: ReturnType<typeof buckets>;
}) {
  // Bracket state -> shared StatusBar tones. Mapping matches scheduler
  // so the same semantic state reads the same color across both
  // surfaces:
  //   done    -> done  (slate, settled)
  //   live    -> green (status-live — in progress)
  //   ready   -> amber (status-called — cued to play)
  //   pending -> idle  (status-idle — not yet scheduled)
  return (
    <div className="flex flex-col items-end font-mono">
      <StatusBar
        items={[
          { tone: "done", label: "DONE", count: event.done },
          { tone: "green", label: "LIVE", count: event.live },
          { tone: "amber", label: "READY", count: event.ready },
          { tone: "idle", label: "PEND", count: event.pending },
        ]}
      />
      <div className="text-3xs uppercase tracking-wider text-ink-faint">
        ALL · {global.done}D · {global.live}L · {global.ready}R
      </div>
    </div>
  );
}

function buckets(data: TournamentDTO, eventId: string | null) {
  const resultsById = new Set(data.results.map((r) => r.play_unit_id));
  const assignmentByPu = new Map(
    data.assignments.map((a) => [a.play_unit_id, a])
  );
  let done = 0;
  let live = 0;
  let ready = 0;
  let pending = 0;
  for (const pu of data.play_units) {
    if (eventId && pu.event_id !== eventId) continue;
    if (resultsById.has(pu.id)) {
      done += 1;
      continue;
    }
    const a = assignmentByPu.get(pu.id);
    if (a?.started && !a.finished) {
      live += 1;
      continue;
    }
    if (a) {
      ready += 1;
      continue;
    }
    pending += 1;
  }
  return { done, live, ready, pending };
}
```

- [ ] **Step 2: Type-check**

Run: `cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/products/scheduler/frontend" && npx tsc -b`
Expected: exit 0, no output. (The component is not imported anywhere yet — that is expected; it is wired in Task 4.)

- [ ] **Step 3: Commit**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git add products/scheduler/frontend/src/features/bracket/BracketViewHeader.tsx
git commit -m "feat(bracket): BracketViewHeader — per-view header strip

New per-view header built to the meet's view-header pattern
(border-b bg-card px-4 py-3, eyebrow + clusters). Absorbs buckets /
Counters / ExportMenu from TopBar plus the event selector, format
label, and Reset button. Not wired yet — BracketTab consumes it in
the next task, which also deletes TopBar."
```

---

## Task 4: Wire the topbar-dominant chrome (atomic structural switch)

**Files:**
- Modify: `products/scheduler/frontend/src/app/TabBar.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/BracketTab.tsx`
- Modify: `products/scheduler/frontend/src/pages/TournamentPage.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/DrawView.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/ScheduleView.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/LiveView.tsx`
- Delete: `products/scheduler/frontend/src/features/bracket/TopBar.tsx`

This is the atomic switch — the surface is broken in intermediate states (tabs that dispatch nothing, or a `BracketTabBody` rendering a deleted component), so all six file changes land in one commit. Each step below is still a single bite-sized action.

- [ ] **Step 1: Rewrite `TabBar.tsx`**

Overwrite `products/scheduler/frontend/src/app/TabBar.tsx` with:

```tsx
import { ArrowLeft } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useTournamentStore } from '../store/tournamentStore';
import { useUiStore, type AppTab } from '../store/uiStore';
import { AppStatusPopover } from '../components/AppStatusPopover';
import { ShuttleWorksMark } from '../components/ShuttleWorksMark';
import { useDisruptions } from '../hooks/useDisruptions';
import { INTERACTIVE_BASE } from '../lib/utils';
import { BRACKET_TABS } from '../lib/bracketTabs';

type TabDef = { id: AppTab; label: string; hint?: string };

/** Tabs shown for a ``kind='meet'`` tournament — the intercollegiate
 *  dual / tri-meet workflow. */
const MEET_TABS: TabDef[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'roster', label: 'Roster' },
  { id: 'matches', label: 'Matches' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'live', label: 'Live' },
  { id: 'tv', label: 'TV' },
];

/** Tabs that surface match-level state — the disruption count badge
 *  rides along on these so an operator on Schedule / Live can see at a
 *  glance that there are pending issues without first navigating to
 *  Matches. The badge counts the SAME disruptions on all three tabs;
 *  it's a global feed, not a per-tab one. */
const DISRUPTION_TABS = new Set<AppTab>(['matches', 'schedule', 'live']);

export function TabBar() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const activeTournamentKind = useUiStore((s) => s.activeTournamentKind);
  const bracketDataReady = useUiStore((s) => s.bracketDataReady);
  const matches = useTournamentStore((s) => s.matches);
  const players = useTournamentStore((s) => s.players);
  const disruptions = useDisruptions();

  // Default to meet tabs while ``activeTournamentKind`` is loading
  // (it's null on first mount before useTournamentKind resolves).
  // Bracket-kind tournaments navigate Draw / Schedule / Live through
  // this same TabBar — same markup, same accent underline.
  const tabs: TabDef[] =
    activeTournamentKind === 'bracket' ? BRACKET_TABS : MEET_TABS;

  const disabledTabs = new Set<AppTab>();
  if (activeTournamentKind === 'bracket') {
    // Draw / Schedule / Live stay disabled until a draw exists — the
    // operator is on the SetupForm wizard until then. ``bracketDataReady``
    // is written by ``BracketTab``; TabBar lives outside
    // ``BracketApiProvider`` and can't call ``useBracket`` itself.
    if (bracketDataReady !== true) {
      disabledTabs.add('bracket-draw');
      disabledTabs.add('bracket-schedule');
      disabledTabs.add('bracket-live');
    }
  } else {
    if (players.length === 0) disabledTabs.add('matches');
    if (matches.length === 0) disabledTabs.add('schedule');
    if (matches.length === 0) disabledTabs.add('live');
  }

  return (
    <nav
      aria-label="Tournament scheduler tabs"
      className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Back-to-dashboard control: an arrow icon-button paired with
            a clickable wordmark. Both navigate to ``/``; redundancy is
            deliberate — the arrow is the discoverable affordance,
            the wordmark click matches web convention (logo = home). */}
        <Link
          to="/"
          aria-label="Back to dashboard"
          title="Back to dashboard"
          className={[
            INTERACTIVE_BASE,
            'inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted-foreground',
            'hover:bg-muted/40 hover:text-foreground',
          ].join(' ')}
        >
          <ArrowLeft size={14} aria-hidden="true" />
        </Link>
        {/* Boxed wordmark — also a Link to the dashboard for parity
            with web-app convention. Hidden on narrow viewports so it
            doesn't compete with the tab strip. */}
        <Link
          to="/"
          aria-label="Back to dashboard"
          title="Back to dashboard"
          className={`${INTERACTIVE_BASE} hidden sm:inline-flex`}
        >
          <ShuttleWorksMark />
        </Link>
        <div
          role="tablist"
          aria-label="Sections"
          className="flex items-center gap-0.5"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isDisabled = disabledTabs.has(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                disabled={isDisabled}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-selected={isActive}
                aria-disabled={isDisabled || undefined}
                title={
                  isDisabled
                    ? activeTournamentKind === 'bracket'
                      ? 'Generate a draw first'
                      : tab.id === 'matches'
                        ? 'Add players first'
                        : tab.id === 'schedule' || tab.id === 'live'
                          ? 'Create matches first'
                          : undefined
                    : undefined
                }
                data-testid={`tab-${tab.id}`}
                className={[
                  INTERACTIVE_BASE,
                  'relative rounded-none px-3 py-2 text-sm font-medium tracking-tight',
                  isActive
                    ? 'text-accent font-semibold'
                    : isDisabled
                      ? 'text-muted-foreground/50'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                ].join(' ')}
              >
                {tab.label}
                {DISRUPTION_TABS.has(tab.id) &&
                disruptions.total > 0 &&
                !isDisabled ? (
                  <span
                    key={`${disruptions.total}-${disruptions.severity}`}
                    aria-label={`${disruptions.total} disruption${disruptions.total === 1 ? '' : 's'}`}
                    title={
                      disruptions.errors > 0 && disruptions.warnings > 0
                        ? `${disruptions.errors} error${disruptions.errors === 1 ? '' : 's'}, ${disruptions.warnings} warning${disruptions.warnings === 1 ? '' : 's'}`
                        : disruptions.errors > 0
                          ? `${disruptions.errors} error${disruptions.errors === 1 ? '' : 's'}`
                          : `${disruptions.warnings} warning${disruptions.warnings === 1 ? '' : 's'}`
                    }
                    className={[
                      'motion-enter-icon ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-3xs font-semibold tabular-nums',
                      disruptions.severity === 'error'
                        ? 'bg-destructive text-destructive-foreground'
                        : 'bg-status-warning/20 text-status-warning',
                    ].join(' ')}
                  >
                    {disruptions.total}
                  </span>
                ) : null}
                <span
                  aria-hidden
                  className={[
                    'absolute inset-x-2 -bottom-[1px] h-0.5 origin-center bg-accent',
                    'transition-transform duration-300 ease-brand',
                    isActive ? 'scale-x-100' : 'scale-x-0',
                  ].join(' ')}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <AppStatusPopover />
      </div>
    </nav>
  );
}
```

Changes from the original: imports `BRACKET_TABS` from `../lib/bracketTabs` (the local empty `const BRACKET_TABS: TabDef[] = []` and its comment are gone); reads `bracketDataReady`; the `disabledTabs` block branches on kind; the `{tabs.length > 0 ? (…) : (…Tournament span…)}` ternary is unwrapped to the bare `<div role="tablist">` (both `tabs` arrays are now non-empty); the disabled `title` gains the bracket case.

- [ ] **Step 2: Rewrite `BracketTab.tsx`**

Overwrite `products/scheduler/frontend/src/features/bracket/BracketTab.tsx` with:

```tsx
/**
 * Bracket tab — the entry point for the bracket surface inside the
 * scheduler shell.
 *
 * Mounts ``BracketApiProvider`` with the tournament_id from the URL
 * so descendant components can call ``useBracketApi()`` without
 * threading the id through props. Holds the selected event id.
 *
 * When no bracket is configured (``data === null`` from the polling
 * hook), renders ``SetupForm`` — the operator can generate a new draw
 * or import a pre-paired CSV / JSON. After create, the bracket
 * navigates Draw / Schedule / Live through the shell's top ``TabBar``
 * (``activeTab`` is a ``bracket-*`` id), with a ``BracketViewHeader``
 * strip above the active view.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { BracketApiProvider, useBracketApi } from '../../api/bracketClient';
import type { BracketTournamentDTO } from '../../api/bracketDto';

import { useBracket } from '../../hooks/useBracket';
import { useUiStore } from '../../store/uiStore';
import { isBracketTab, bracketTabView } from '../../lib/bracketTabs';
import { SetupForm } from './SetupForm';
import { BracketViewHeader } from './BracketViewHeader';
import { DrawView } from './DrawView';
import { ScheduleView } from './ScheduleView';
import { LiveView } from './LiveView';

export function BracketTab() {
  const params = useParams<{ id: string }>();
  if (!params.id) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Missing tournament id in route.
      </div>
    );
  }
  return (
    <BracketApiProvider tournamentId={params.id}>
      <BracketTabBody />
    </BracketApiProvider>
  );
}

function BracketTabBody() {
  const { data, setData, error, refresh } = useBracket();
  const api = useBracketApi();
  const [eventId, setEventId] = useState<string>('');
  const activeTab = useUiStore((s) => s.activeTab);
  const setBracketDataReady = useUiStore((s) => s.setBracketDataReady);

  // Surface "is there a draw?" to the TabBar — it lives outside
  // ``BracketApiProvider`` and can't call ``useBracket`` itself.
  // ``useBracket`` re-creates ``data`` every 2.5s poll, so guard the
  // write to the actual boolean transition — otherwise TabBar
  // re-renders every poll for nothing. Cleared on unmount so a later
  // meet-kind tournament doesn't inherit the flag.
  useEffect(() => {
    const ready = data != null;
    if (useUiStore.getState().bracketDataReady !== ready) {
      setBracketDataReady(ready);
    }
    return () => setBracketDataReady(null);
  }, [data, setBracketDataReady]);

  const handleReset = useCallback(async () => {
    // Only clear the local copy after the server-side DELETE succeeds.
    // The polling hook re-fetches every 2.5s; clearing on failure
    // would let the next poll snap the bracket back into ``data``.
    // The shared axios interceptor already surfaces a toast on
    // failure, so the ``catch`` is a no-op here.
    try {
      await api.remove();
      setData(null);
    } catch {
      // Interceptor already toasted; nothing more to do.
    }
  }, [api, setData]);

  // Keep the selected event valid as data changes (new tournament,
  // event deleted, etc.).
  useEffect(() => {
    if (!data || data.events.length === 0) {
      setEventId('');
      return;
    }
    if (!data.events.find((e) => e.id === eventId)) {
      setEventId(data.events[0].id);
    }
  }, [data, eventId]);

  if (!data) {
    return (
      <div className="min-h-full bg-background">
        <main className="mx-auto max-w-4xl px-6 py-8">
          {error && (
            <div className="mb-6 rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <SetupForm
            onCreated={(t: BracketTournamentDTO) => {
              setData(t);
              if (t.events[0]) setEventId(t.events[0].id);
            }}
          />
        </main>
      </div>
    );
  }

  // ``activeTab`` is normalized to a ``bracket-*`` id by
  // ``TournamentPage`` once kind resolves; fall back to 'draw'
  // defensively for the first render before that effect runs.
  const view = isBracketTab(activeTab) ? bracketTabView(activeTab) : 'draw';

  return (
    <div className="flex h-full flex-col bg-background">
      <BracketViewHeader
        view={view}
        data={data}
        eventId={eventId}
        onEventId={setEventId}
        onReset={handleReset}
      />
      {error && (
        <div className="mx-4 mt-4 rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {/* Re-key on activeTab so each sub-tab switch re-runs the
          ``animate-block-in`` entry — matches the meet's per-tab
          remount. ``BracketViewHeader`` sits OUTSIDE this re-keyed
          div, so the event selector persists across switches. */}
      <div
        key={activeTab}
        className="min-h-0 flex-1 overflow-auto animate-block-in"
      >
        {view === 'draw' && (
          <DrawView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
        {view === 'schedule' && (
          <ScheduleView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
        {view === 'live' && (
          <LiveView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
      </div>
    </div>
  );
}
```

Changes: drops the `SettingsShell` / `SettingsSectionDef` / `TopBar` / Phosphor-icon imports; adds `useUiStore`, `isBracketTab`, `bracketTabView`, `BracketViewHeader`; `BracketTabBody` reads `activeTab`, writes `bracketDataReady`, derives `view`, renders `BracketViewHeader` + an `activeTab`-keyed content `<div>` that dispatches the three views. `BracketTab`, `handleReset`, the event-validity effect, and the `!data` → `SetupForm` branch are unchanged.

- [ ] **Step 3: Add the `activeTab` normalization effect to `TournamentPage.tsx`**

In `products/scheduler/frontend/src/pages/TournamentPage.tsx`, change the import line (currently line 23):

```diff
-import { useUiStore, type AppTab } from '../store/uiStore';
+import { useUiStore, type AppTab } from '../store/uiStore';
+import { normalizeActiveTab } from '../lib/bracketTabs';
```

Then find the end of the existing `useLayoutEffect` block and the `if (!tid)` guard (currently lines 69-71):

```tsx
  }, [tid, location.pathname]);

  if (!tid) {
```

Replace with:

```tsx
  }, [tid, location.pathname]);

  // Once the active tournament kind is known, snap ``activeTab`` onto a
  // tab that's valid for that kind. The URL segment for a bracket is
  // the bare ``/bracket`` (-> activeTab 'bracket', not a renderable
  // section), and ``activeTab`` can also be stale from a prior
  // tournament of the other kind. Runs after the layout effect above
  // sets the optimistic kind, and again when ``useTournamentKind``'s
  // async fetch corrects it.
  const activeTab = useUiStore((s) => s.activeTab);
  const activeTournamentKind = useUiStore((s) => s.activeTournamentKind);
  useEffect(() => {
    const next = normalizeActiveTab(activeTab, activeTournamentKind);
    if (next) useUiStore.getState().setActiveTab(next);
  }, [activeTab, activeTournamentKind]);

  if (!tid) {
```

(`useEffect` is already imported in `TournamentPage.tsx`. The new hooks sit before the `if (!tid)` early return, satisfying the Rules of Hooks.)

- [ ] **Step 4: Remove the internal eyebrow from `DrawView.tsx`**

In `products/scheduler/frontend/src/features/bracket/DrawView.tsx`, replace:

```tsx
    <>
      <div className="px-4 pt-4">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          DRAW
        </span>
      </div>
      {event.format === "se" ? (
```

with:

```tsx
    <>
      {event.format === "se" ? (
```

- [ ] **Step 5: Remove the internal eyebrow from `ScheduleView.tsx`**

In `products/scheduler/frontend/src/features/bracket/ScheduleView.tsx`, replace:

```tsx
    <div className="space-y-4">
      <div className="px-4 pt-4">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          SCHEDULE
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
```

with:

```tsx
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
```

- [ ] **Step 6: Remove the internal eyebrow from `LiveView.tsx`**

In `products/scheduler/frontend/src/features/bracket/LiveView.tsx`, replace:

```tsx
    <div className="space-y-4">
      <div className="px-4 pt-4">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          LIVE
        </span>
      </div>

      <Card variant="frame" className="p-4">
```

with:

```tsx
    <div className="space-y-4">
      <Card variant="frame" className="p-4">
```

- [ ] **Step 7: Verify nothing else imports `TopBar`, then delete it**

Run: `cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine" && grep -rn "bracket/TopBar\|from './TopBar'\|from \"./TopBar\"" products/scheduler/frontend/src`
Expected: empty output (the rewritten `BracketTab.tsx` no longer imports it).

Then delete the file:

```bash
rm "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/products/scheduler/frontend/src/features/bracket/TopBar.tsx"
```

- [ ] **Step 8: Type-check, build, and lint**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
npm run build:scheduler
npm run lint:scheduler
```

Expected: `build:scheduler` runs `tsc -b && vite build` — TypeScript compiles, Vite production build succeeds. `lint:scheduler` — zero errors. If `tsc` reports an unused import in `BracketTab.tsx` or `DrawView.tsx`, remove the now-dead import.

- [ ] **Step 9: Commit**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git add products/scheduler/frontend/src/app/TabBar.tsx \
        products/scheduler/frontend/src/features/bracket/BracketTab.tsx \
        products/scheduler/frontend/src/pages/TournamentPage.tsx \
        products/scheduler/frontend/src/features/bracket/DrawView.tsx \
        products/scheduler/frontend/src/features/bracket/ScheduleView.tsx \
        products/scheduler/frontend/src/features/bracket/LiveView.tsx \
        products/scheduler/frontend/src/features/bracket/TopBar.tsx
git commit -m "refactor(bracket): topbar-dominant chrome — Draw/Schedule/Live as TabBar tabs

The bracket surface navigated a left-rail SettingsShell stepper while
the meet navigated a horizontal top TabBar — the two products read as
different surfaces. This converges the bracket onto the meet's model.

- TabBar renders BRACKET_TABS (Draw/Schedule/Live) through the same
  markup as the meet tabs; they disable until a draw exists, via the
  bracketDataReady store flag BracketTab writes.
- BracketTabBody drops SettingsShell, dispatches on activeTab, and
  renders BracketViewHeader once above an activeTab-keyed content div
  (re-key re-runs animate-block-in, matching the meet's per-tab
  remount; the header sits outside it so the event selector persists).
- TournamentPage normalizes activeTab onto a valid tab once kind
  resolves (the /bracket URL segment and stale cross-kind tabs).
- TopBar.tsx deleted; DrawView/ScheduleView/LiveView drop their
  internal section eyebrows (now carried by BracketViewHeader).

SettingsShell is retained as the setup-wizard rail on both surfaces
(meet Setup tab, bracket SetupForm) — only its misuse as the bracket's
post-creation primary nav is reversed (part of commit 5c8d49e)."
```

---

## Task 5: Verification sweep

**Files:** verification only — fix inline if anything breaks, then commit the fix.

- [ ] **Step 1: Confirm the stack is up**

The frontend (`:80`) and backend (`:8000`) should be running. If not:

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine" && make scheduler
```

- [ ] **Step 2: Browser-harness sweep — pre-creation (disabled tabs + SetupForm)**

Use a bracket-kind tournament with **no** draw generated. (If `test_tournament` already has a draw, reset it via the bracket's Reset button first, or use a fresh bracket-kind tournament id.)

```bash
browser-harness <<'PY'
import time
goto_url("http://localhost/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket")
wait_for_load()
time.sleep(2)
capture_screenshot(path="/tmp/bcu-precreate.png", full=True, max_dim=1800)
print("saved: /tmp/bcu-precreate.png")
PY
```

Inspect `/tmp/bcu-precreate.png`. Expected:
- One `TabBar` row: back-arrow + ShuttleWorks mark + **Draw / Schedule / Live tabs rendered disabled** (muted, `text-muted-foreground/50`) + `AppStatusPopover` on the right.
- `SetupForm` (with its own `SettingsShell` `01 Configuration / 02 Events / 03 Generate` rail) fills the content area.
- No second stacked chrome bar.

- [ ] **Step 3: Browser-harness sweep — post-creation Draw / Schedule / Live, light**

Ensure the bracket has a generated draw (generate one via the SetupForm `Generate` step if needed). Then:

```bash
browser-harness <<'PY'
import time
URLS = [
    ("http://localhost/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket", "/tmp/bcu-draw.png"),
]
for url, out in URLS:
    goto_url(url)
    wait_for_load()
    time.sleep(2)
    capture_screenshot(path=out, full=True, max_dim=1800)
    print("saved:", out)
PY
```

Then, in the same browser session, click the **Schedule** then **Live** tabs in the `TabBar` and screenshot each (`/tmp/bcu-schedule.png`, `/tmp/bcu-live.png`) — read the screenshot for the tab's pixel location, `click_at_xy`, re-screenshot.

For each, verify:
- The `TabBar` shows Draw / Schedule / Live, the active one with the Signal-Orange accent underline.
- Below it, the `BracketViewHeader` strip: eyebrow (`DRAW` / `SCHEDULE` / `LIVE`) + event selector + format label on the left; `DONE / LIVE / READY / PEND` counters + JSON/CSV/ICS export + `Reset` on the right.
- Changing the event selector updates the counters and the view body; the selector does **not** flash or reset when switching tabs.
- Sharp corners, no soft shadows, single chrome row + one header strip.

- [ ] **Step 4: Browser-harness sweep — dark mode**

```bash
browser-harness <<'PY'
import time
js("document.documentElement.classList.add('dark')")
time.sleep(0.5)
goto_url("http://localhost/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket")
wait_for_load()
time.sleep(2)
capture_screenshot(path="/tmp/bcu-draw-dark.png", full=True, max_dim=1800)
js("document.documentElement.classList.remove('dark')")
print("saved: /tmp/bcu-draw-dark.png")
PY
```

Inspect — every token-driven element should flip via the `.dark` selector; no mode-specific breakage.

- [ ] **Step 5: Side-by-side chrome parity vs a meet tab**

```bash
browser-harness <<'PY'
import time
goto_url("http://localhost/tournaments/1200fc74-2436-4163-9868-5054c96f2be5/matches")
wait_for_load()
time.sleep(2)
capture_screenshot(path="/tmp/bcu-meet-matches.png", full=True, max_dim=1800)
print("saved: /tmp/bcu-meet-matches.png")
PY
```

Compare `/tmp/bcu-meet-matches.png` (meet Matches tab) against `/tmp/bcu-draw.png` (bracket Draw). Both should have: the same `TabBar` height / `bg-card` / border / accent-underline treatment, the same `border-b border-border bg-card px-4 py-3` header-strip rhythm, the same corners. Any visible mismatch is fixed inline before the commit in Step 7.

- [ ] **Step 6: Regression tests**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
make test
make test-e2e
```

Expected: `make test` (pytest backend) passes — no backend changes. `make test-e2e` (Playwright) — the suite covers meet tabs, not the bracket; any failure must be in a meet tab and indicates a regression (e.g. the `TabBar` rewrite broke a meet-tab `data-testid`). The meet tab `data-testid`s (`tab-setup`, `tab-roster`, …) are unchanged by this plan — confirm.

- [ ] **Step 7: Run the unit suite and commit any fixes**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine/products/scheduler/frontend" && npx vitest run
```

Expected: PASS (includes `bracketTabs.test.ts` and the pre-existing `commandQueue.test.ts`).

If Steps 2-6 surfaced any layout, dark-mode, or regression issue, fix it inline, re-run the relevant check, then:

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git add -A products/scheduler/frontend/src
git commit -m "fix(bracket): chrome unification sweep follow-ups

<describe the specific fixes — e.g. dark-mode header contrast,
meet-tab testid restored, SetupForm padding under the new shell>"
```

If Steps 2-6 surfaced nothing, there is no commit for this task — the work is complete at Task 4's commit.

---

## End-to-end verification

After all tasks land:

- [ ] **Confirm the commits are in the log**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine" && git log --oneline -6
```

Expected (most recent first): an optional Task-5 fix commit, then `refactor(bracket): topbar-dominant chrome …`, `feat(bracket): BracketViewHeader …`, `feat(bracket): pure tab helpers …`, `feat(uiStore): bracket-* tab ids …`, `docs(spec): bracket chrome unification design`.

- [ ] **Audit grep — no `TopBar`, no `SettingsShell` in `BracketTab`**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git grep -n "TopBar" products/scheduler/frontend/src/features/bracket
git grep -n "SettingsShell" products/scheduler/frontend/src/features/bracket
```

Expected: first is empty. Second returns only `SetupForm.tsx` (the retained setup-wizard usage) — not `BracketTab.tsx`.

- [ ] **Full clean build**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
npm run build:scheduler && npm run lint:scheduler
```

Expected: both green.

---

## Self-review notes (resolved at plan-write time)

1. **Spec coverage:** Every spec section maps to a task. Section 1 TabBar → Task 4 Step 1; Section 1 dispatch in `BracketTabBody` → Task 4 Step 2; Section 1 `activeTab` normalization → Task 2 (pure helper) + Task 4 Step 3 (the effect, placed in `TournamentPage` — see Deviation note in the header); Section 1 `bracketDataReady` pre-creation disabling → Task 1 (store field) + Task 4 Step 1 (TabBar reads) + Step 2 (`BracketTab` writes); Section 2 `BracketViewHeader` → Task 3; Section 2 Option-C realization (single parameterized mount) + data flow → Task 4 Step 2; Section 3 file table → all tasks; visual-treatment + verification → Task 5.
2. **Open risks from spec:** Risk 1 (`animate-block-in` re-key) — resolved: the re-key is the `key={activeTab}` content `<div>` *inside* `BracketTabBody`, not `AppShell`'s `<div key="bracket">`, so `BracketTabBody` (and `eventId`) never unmount; `AppShell` stays untouched. Risk 2 (disabled-tab keyboard) — Task 5 Step 2 + the unchanged `disabled` attr + `aria-disabled` wiring. Risk 3 (`bracketDataReady` on reset) — the Task 4 Step 2 effect derives the flag from `data`, and `handleReset` sets `data` to `null`, so the flag flips to `false` and tabs re-disable; verified in Task 5 Step 2's reset path.
3. **Placeholder scan:** No `TBD` / `TODO` / "add error handling" placeholders. Task 5 Step 7's commit message has an angle-bracket fill-in, but that is a genuine "describe the fixes you made" instruction, not a deferred decision — and the commit only happens if Steps 2-6 found issues.
4. **Type consistency:** `bracketDataReady: boolean | null` and `setBracketDataReady` are consistent across Task 1 (definition), Task 4 Step 1 (`TabBar` read), Task 4 Step 2 (`BracketTab` write). `BracketViewHeader`'s `Props` (`view`, `data`, `eventId`, `onEventId`, `onReset`) in Task 3 match the call-site in Task 4 Step 2. `view: 'draw' | 'schedule' | 'live'` (bare form) is produced by `bracketTabView` (Task 2) and consumed by `BracketViewHeader` (Task 3) — consistent. `BRACKET_TABS` typed `{ id: BracketTabId; label: string }[]` (Task 2) is structurally assignable to `TabBar`'s `TabDef[]` (`id: AppTab` ⊇ `BracketTabId`, `hint?` optional) — Task 4 Step 1 relies on this.
