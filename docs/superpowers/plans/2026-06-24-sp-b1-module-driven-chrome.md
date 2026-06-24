# SP-B1 — Module-driven chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workspace chrome key off the *active module* instead of the single `kind` — so a multi-module workspace is navigable and a non-enterable module shows an in-shell panel instead of silently snapping — while every single-module Meet/Bracket workspace stays byte-identical.

**Architecture:** `TabBar` renders `tabsForModule(activeModule)`; `TournamentPage` drops its kind-based `normalizeActiveTab` snap; `AppShell` renders a `ModuleUnavailablePanel` instead of `<ModuleOutlet/>` when the active module isn't enterable (which also prevents a non-enterable product from mounting) and gates meet-polling on meet-enabled; `defaultTabForModule` becomes module-keyed and Hub opens via `primaryModuleForOpen`. `ModuleOutlet` already mounts the product by `moduleForTab(activeTab)` — unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Zustand, Vitest + @testing-library/react, `@scheduler/design-system`.

## Global Constraints

- Branch `dev/workspace-suite`. Frontend-only — no backend, no route-path changes.
- `kind` is preserved (workspace identity + chrome fallback); not removed.
- Module ids exactly `meet | bracket | display`; frontend statuses `enabled | available | disabled | coming-soon` (hyphenated). Enterable = `enabled | available` (`isModuleEnterable`).
- **Single-module Meet and Bracket workspaces must be byte/behavior-identical** — same tab ids, disabled prerequisites, routes, polling. This is the acceptance bar.
- Existing design tokens only; no new colors.
- Run all commands from `products/scheduler/frontend`. Gate before declaring done: `npx tsc -b` clean, `npx vitest run` green, `npm run build` clean.
- Per-task: run the focused test file(s) you changed; run the full `npx vitest run` once before committing the task.

---

### Task 1: Module-keyed entry routing (`defaultTabForModule` + `primaryModuleForOpen`)

Make `defaultTabForModule` module-keyed (drop `kind`), add `primaryModuleForOpen`, and update the two callers (AppShell dock-nav line + Hub `openTournament`) so the tree compiles and single-kind routing is unchanged.

**Files:**
- Modify: `src/platform/domain/moduleModel.ts` (`defaultTabForModule` ~line 41; add `primaryModuleForOpen`)
- Modify: `src/app/AppShell.tsx:136` (drop the `kind` arg)
- Modify: `src/products/hub/HubPage.tsx` (`openTournament` ~line 210-217; imports)
- Test: `src/platform/domain/__tests__/moduleModel.test.ts` (rewrite the `defaultTabForModule` block; add `primaryModuleForOpen`)

**Interfaces:**
- Produces: `defaultTabForModule(module: ModuleId): string` (`meet→'setup'`, `bracket→'bracket-setup'`, `display→'tv'`); `primaryModuleForOpen(modules: WorkspaceModule[]): ModuleId`.

- [ ] **Step 1: Rewrite the failing tests**

In `src/platform/domain/__tests__/moduleModel.test.ts`, replace the entire `describe('defaultTabForModule', …)` block (lines 32–43) with:

```ts
describe('defaultTabForModule', () => {
  it('is module-keyed (independent of kind)', () => {
    expect(defaultTabForModule('meet')).toBe('setup');
    expect(defaultTabForModule('bracket')).toBe('bracket-setup');
    expect(defaultTabForModule('display')).toBe('tv');
  });
});

describe('primaryModuleForOpen', () => {
  const wm = (id: 'meet' | 'bracket' | 'display', status: string) =>
    ({ id, label: id, status, note: undefined }) as never;
  it('prefers the first enabled module in meet>bracket>display order', () => {
    expect(
      primaryModuleForOpen([wm('meet', 'enabled'), wm('bracket', 'enabled'), wm('display', 'enabled')]),
    ).toBe('meet');
    expect(
      primaryModuleForOpen([wm('meet', 'coming-soon'), wm('bracket', 'enabled'), wm('display', 'coming-soon')]),
    ).toBe('bracket');
  });
  it('falls back to first available, then first present, then meet', () => {
    expect(
      primaryModuleForOpen([wm('meet', 'available'), wm('bracket', 'available'), wm('display', 'disabled')]),
    ).toBe('meet');
    expect(primaryModuleForOpen([wm('display', 'coming-soon')])).toBe('display');
    expect(primaryModuleForOpen([])).toBe('meet');
  });
});
```

Add `primaryModuleForOpen` to the import at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/platform/domain/__tests__/moduleModel.test.ts`
Expected: FAIL — `primaryModuleForOpen` is not exported, and `defaultTabForModule('meet')` is a type/arity error.

- [ ] **Step 3: Implement in `moduleModel.ts`**

Replace `defaultTabForModule` (lines 38–46) with the module-keyed version, and add `primaryModuleForOpen` after it:

```ts
/** The route segment to navigate to when a module is entered. Purely
 *  module-keyed — the workspace kind no longer participates. */
export function defaultTabForModule(module: ModuleId): string {
  if (module === 'bracket') return 'bracket-setup';
  if (module === 'display') return 'tv';
  return 'setup'; // meet
}

/** The module a workspace should open to: first enabled, else first
 *  available, else first present, in meet → bracket → display precedence.
 *  Reads real module state so a hybrid lands on Meet and a bracket-only
 *  workspace lands on Bracket. */
export function primaryModuleForOpen(modules: WorkspaceModule[]): ModuleId {
  const order: ModuleId[] = ['meet', 'bracket', 'display'];
  const present = order.filter((id) => modules.some((m) => m.id === id));
  const byStatus = (s: ModuleStatus) =>
    present.find((id) => modules.find((m) => m.id === id)?.status === s);
  return byStatus('enabled') ?? byStatus('available') ?? present[0] ?? 'meet';
}
```

(`ModuleId`, `ModuleStatus`, `WorkspaceModule` are already imported at the top of `moduleModel.ts`.)

- [ ] **Step 4: Fix the AppShell caller**

In `src/app/AppShell.tsx:136`, change:

```tsx
          if (tid) navigate(`/tournaments/${tid}/${defaultTabForModule(p, activeTournamentKind)}`, { replace: true });
```

to:

```tsx
          if (tid) navigate(`/tournaments/${tid}/${defaultTabForModule(p)}`, { replace: true });
```

- [ ] **Step 5: Update Hub `openTournament`**

In `src/products/hub/HubPage.tsx`, add to the existing `moduleModel` import (which already imports `modulesForWorkspace, modulesFromDto`): `defaultTabForModule, primaryModuleForOpen`. Replace `openTournament` (~lines 210–217):

```tsx
  const openTournament = useCallback(
    (id: string) => {
      const t = tournaments.find((row) => row.id === id);
      const mods = t?.modules
        ? modulesFromDto(t.modules)
        : modulesForWorkspace(t?.kind ?? 'meet');
      const segment = defaultTabForModule(primaryModuleForOpen(mods));
      navigate(`/tournaments/${id}/${segment}`);
    },
    [navigate, tournaments],
  );
```

- [ ] **Step 6: Run tests + tsc**

Run: `npx vitest run src/platform/domain/__tests__/moduleModel.test.ts src/products/hub` then `npx tsc -b`
Expected: PASS; tsc clean. (The Hub's existing tests still pass — single-kind routing is unchanged: a meet workspace's `modulesForWorkspace('meet')` has meet enabled → `primaryModuleForOpen` → `meet` → `setup`; bracket → `bracket-setup`.)

- [ ] **Step 7: Full suite + commit**

Run: `npx vitest run`
Expected: green.

```bash
git add src/platform/domain/moduleModel.ts src/platform/domain/__tests__/moduleModel.test.ts src/app/AppShell.tsx src/products/hub/HubPage.tsx
git commit -m "feat(modules): module-keyed defaultTabForModule + primaryModuleForOpen; Hub opens by module"
```

---

### Task 2: `tabsForModule` in `bracketTabs.ts`

Co-locate the meet tab rows with the bracket rows and expose `tabsForModule(module)`. This is the single source the TabBar will consume.

**Files:**
- Modify: `src/lib/bracketTabs.ts` (add `MEET_TAB_LABELS`, `MEET_TABS`, `tabsForModule`)
- Test: `src/lib/__tests__/bracketTabs.test.ts` (add a `tabsForModule` block)

**Interfaces:**
- Produces: `MEET_TABS: { id: AppTab; label: string }[]`; `tabsForModule(module: ModuleId): { id: AppTab; label: string }[]`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/bracketTabs.test.ts` (and add `tabsForModule` + `BRACKET_TABS` to the import):

```ts
describe('tabsForModule', () => {
  it('meet → the meet operator tabs (setup..live, no tv)', () => {
    expect(tabsForModule('meet').map((t) => t.id)).toEqual([
      'setup', 'roster', 'matches', 'schedule', 'live',
    ]);
  });
  it('bracket → the bracket tabs', () => {
    expect(tabsForModule('bracket')).toBe(BRACKET_TABS);
  });
  it('display → no operator strip', () => {
    expect(tabsForModule('display')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/bracketTabs.test.ts`
Expected: FAIL — `tabsForModule` is not exported.

- [ ] **Step 3: Implement in `bracketTabs.ts`**

Add a `ModuleId` import at the top: `import type { ModuleId } from '../platform/product-shell/types';`. After the `MEET_OPERATOR_TAB_IDS` definition (~line 56), add:

```ts
/** Display labels for the meet operator tabs (single-sourced here so the
 *  TabBar doesn't redefine the id list). */
export const MEET_TAB_LABELS: Record<Exclude<MeetTabId, 'tv'>, string> = {
  setup: 'Setup',
  roster: 'Roster',
  matches: 'Matches',
  schedule: 'Schedule',
  live: 'Live',
};

/** The `{id,label}` rows the TabBar renders for a meet workspace. */
export const MEET_TABS: { id: AppTab; label: string }[] = MEET_OPERATOR_TAB_IDS.map(
  (id) => ({ id, label: MEET_TAB_LABELS[id] }),
);

/** The TabBar rows for a module: meet → meet operator tabs, bracket → the
 *  bracket tabs, display → [] (single surface reached via the dock / tv
 *  route, no operator strip). */
export function tabsForModule(module: ModuleId): { id: AppTab; label: string }[] {
  if (module === 'bracket') return BRACKET_TABS;
  if (module === 'display') return [];
  return MEET_TABS;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/__tests__/bracketTabs.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` then `npx tsc -b`
Expected: green; tsc clean.

```bash
git add src/lib/bracketTabs.ts src/lib/__tests__/bracketTabs.test.ts
git commit -m "feat(tabs): tabsForModule + co-locate MEET_TABS rows in bracketTabs"
```

---

### Task 3: TabBar renders the active module's tabs

Drive the tab strip + disabled prerequisites off `activeModule` instead of `kind`.

**Files:**
- Modify: `src/app/TabBar.tsx`
- Test: `src/lib/__tests__/TabBar.test.tsx` (add a multi-module case; existing cases stay)

**Interfaces:**
- Consumes: `tabsForModule` (Task 2), `moduleForTab` (existing).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/TabBar.test.tsx`:

```ts
it('renders the ACTIVE MODULE tabs, not the kind tabs (multi-module)', () => {
  // kind=meet but the active tab belongs to bracket → bracket strip.
  useUiStore.setState({
    activeTab: 'bracket-setup',
    activeTournamentKind: 'meet',
    bracketDataReady: true,
  });
  const loc = { current: '' };
  renderTabBar('bracket-setup', loc);
  expect(screen.getByTestId('tab-bracket-roster')).toBeInTheDocument();
  expect(screen.queryByTestId('tab-roster')).toBeNull(); // no meet 'roster' tab
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/TabBar.test.tsx`
Expected: FAIL — current TabBar uses `activeTournamentKind === 'bracket' ? BRACKET_TABS : MEET_TABS`, so `kind='meet'` renders meet tabs and `tab-bracket-roster` is absent.

- [ ] **Step 3: Implement in `TabBar.tsx`**

Replace the local `MEET_TAB_LABELS` (lines 14–21) and `MEET_TABS` (lines 25–28) definitions — delete them — and update the imports + body:

Imports: change line 6 to also pull the shared rows + helper, and import `moduleForTab`:

```ts
import { BRACKET_TABS, MEET_TABS, tabsForModule, type MeetTabId } from '../lib/bracketTabs';
import { moduleForTab } from '../platform/domain/moduleModel';
```
(`MeetTabId` / `BRACKET_TABS` may already be imported; keep `MEET_OPERATOR_TAB_IDS` only if still referenced — it is not after this change, so drop it from the import.)

Change `disabledTabTitle` to take the active module:

```ts
function disabledTabTitle(
  tabId: AppTab,
  module: 'meet' | 'bracket' | 'display',
): string | undefined {
  if (module === 'bracket') return 'Generate a draw first';
  if (tabId === 'matches') return 'Add players first';
  if (tabId === 'schedule' || tabId === 'live') return 'Create matches first';
  return undefined;
}
```

In the component body, derive the active module and tabs, and branch the disabled set on it:

```ts
  const activeModule = moduleForTab(activeTab, activeTournamentKind);
  const tabs: { id: AppTab; label: string }[] = tabsForModule(activeModule);

  const disabledTabs = new Set<AppTab>();
  if (activeModule === 'bracket') {
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
```

In the JSX, update the `title` prop to pass `activeModule`:

```tsx
                title={
                  isDisabled
                    ? disabledTabTitle(tab.id, activeModule)
                    : undefined
                }
```

(Remove the now-unused `MeetTabId` import if `MEET_TAB_LABELS` was its only user; keep it if still referenced.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/__tests__/TabBar.test.tsx`
Expected: PASS — the new multi-module case passes, and the existing cases (meet @ `setup`, bracket @ `bracket-setup`, disabled-tab no-op) stay green because each sets `activeTab` consistently with its module.

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` then `npx tsc -b`
Expected: green; tsc clean.

```bash
git add src/app/TabBar.tsx src/lib/__tests__/TabBar.test.tsx
git commit -m "feat(tabs): TabBar renders the active module's tabs (module-driven, not kind)"
```

---

### Task 4: `ModuleUnavailablePanel` component

A minimal in-shell panel for a non-enterable active module.

**Files:**
- Create: `src/app/workspace/ModuleUnavailablePanel.tsx`
- Test: `src/app/workspace/__tests__/ModuleUnavailablePanel.test.tsx`

**Interfaces:**
- Produces: `ModuleUnavailablePanel(props: { label: string; note?: string; primaryLabel: string; onGoToPrimary: () => void; onOpenSettings?: () => void })`.

- [ ] **Step 1: Write the failing test**

Create `src/app/workspace/__tests__/ModuleUnavailablePanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleUnavailablePanel } from '../ModuleUnavailablePanel';

describe('ModuleUnavailablePanel', () => {
  it('shows the label + note and calls onGoToPrimary', () => {
    const onGo = vi.fn();
    render(
      <ModuleUnavailablePanel
        label="Bracket"
        note="Bracket is not enabled for this workspace yet."
        primaryLabel="Meet"
        onGoToPrimary={onGo}
      />,
    );
    expect(screen.getByTestId('module-unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Bracket/)).toBeInTheDocument();
    expect(screen.getByText(/not enabled for this workspace/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Go to Meet/ }));
    expect(onGo).toHaveBeenCalled();
  });

  it('shows Open Settings only when onOpenSettings is provided', () => {
    const { rerender } = render(
      <ModuleUnavailablePanel label="Display" primaryLabel="Meet" onGoToPrimary={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /Open Settings/ })).toBeNull();
    const onSettings = vi.fn();
    rerender(
      <ModuleUnavailablePanel
        label="Display"
        primaryLabel="Meet"
        onGoToPrimary={() => {}}
        onOpenSettings={onSettings}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Open Settings/ }));
    expect(onSettings).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/workspace/__tests__/ModuleUnavailablePanel.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the component**

Create `src/app/workspace/ModuleUnavailablePanel.tsx`:

```tsx
import { Button } from '@scheduler/design-system';

interface ModuleUnavailablePanelProps {
  /** The unavailable module's display label, e.g. "Bracket". */
  label: string;
  /** Optional enablement note explaining why it's unavailable. */
  note?: string;
  /** Label of the module the "Go to" action routes to. */
  primaryLabel: string;
  onGoToPrimary: () => void;
  /** Provided only when the module is operator-disabled (offers re-enable). */
  onOpenSettings?: () => void;
}

/** Shown in place of the module pane when the active module isn't enterable
 *  (disabled / coming-soon) for this workspace — an explicit, actionable
 *  state instead of a silent misroute. */
export function ModuleUnavailablePanel({
  label,
  note,
  primaryLabel,
  onGoToPrimary,
  onOpenSettings,
}: ModuleUnavailablePanelProps) {
  return (
    <div
      data-testid="module-unavailable"
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p className="text-base font-semibold text-foreground">
        {label} isn&rsquo;t available in this workspace
      </p>
      {note ? <p className="max-w-sm text-sm text-muted-foreground">{note}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={onGoToPrimary}>Go to {primaryLabel}</Button>
        {onOpenSettings ? (
          <Button variant="ghost" onClick={onOpenSettings}>
            Open Settings
          </Button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/workspace/__tests__/ModuleUnavailablePanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` then `npx tsc -b`
Expected: green; tsc clean.

```bash
git add src/app/workspace/ModuleUnavailablePanel.tsx src/app/workspace/__tests__/ModuleUnavailablePanel.test.tsx
git commit -m "feat(shell): ModuleUnavailablePanel for non-enterable active modules"
```

---

### Task 5: AppShell — unavailable guard + meet-enabled polling gate

Render the panel instead of the outlet when the active module isn't enterable, and gate the meet-only polling on meet being enabled.

**Files:**
- Modify: `src/app/AppShell.tsx`
- Test: `src/app/__tests__/AppShell.guard.test.tsx` (new — focused on the guard decision via a small extracted helper, see Step 1)

**Interfaces:**
- Consumes: `isModuleEnterable`, `primaryModuleForOpen`, `defaultTabForModule` (moduleModel), `ModuleUnavailablePanel` (Task 4).

- [ ] **Step 1: Write the failing test (pure decision helper)**

`AppShell` is heavy to mount; extract the guard decision into a pure exported helper and test that directly. Create `src/app/__tests__/AppShell.guard.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveActivePane } from '../AppShell';
import type { WorkspaceModule } from '../../platform/product-shell/types';

const wm = (id: 'meet' | 'bracket' | 'display', status: string): WorkspaceModule =>
  ({ id, label: id[0].toUpperCase() + id.slice(1), status, note: undefined }) as never;

describe('resolveActivePane', () => {
  it('renders the outlet when the active module is enterable', () => {
    const r = resolveActivePane('meet', [wm('meet', 'enabled'), wm('bracket', 'coming-soon'), wm('display', 'available')]);
    expect(r.kind).toBe('outlet');
  });
  it('renders the panel when the active module is coming-soon', () => {
    const r = resolveActivePane('bracket', [wm('meet', 'enabled'), wm('bracket', 'coming-soon'), wm('display', 'available')]);
    expect(r.kind).toBe('panel');
    if (r.kind === 'panel') {
      expect(r.label).toBe('Bracket');
      expect(r.primary).toBe('meet');
      expect(r.canOpenSettings).toBe(false);
    }
  });
  it('panel offers settings only when the module is disabled', () => {
    const r = resolveActivePane('display', [wm('meet', 'enabled'), wm('display', 'disabled')]);
    expect(r.kind).toBe('panel');
    if (r.kind === 'panel') expect(r.canOpenSettings).toBe(true);
  });
  it('renders the outlet when status is unknown/loading (resilient)', () => {
    const r = resolveActivePane('meet', []);
    expect(r.kind).toBe('outlet');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/__tests__/AppShell.guard.test.tsx`
Expected: FAIL — `resolveActivePane` is not exported.

- [ ] **Step 3: Add the helper + wire AppShell**

In `src/app/AppShell.tsx`, add imports:

```ts
import {
  moduleForTab,
  defaultTabForModule,
  modulesForWorkspace,
  primaryModuleForOpen,
  isModuleEnterable,
} from '../platform/domain/moduleModel';
import type { ModuleId, WorkspaceModule } from '../platform/product-shell/types';
import { ModuleUnavailablePanel } from './workspace/ModuleUnavailablePanel';
```

Add the exported pure helper (above the `AppShell` component):

```ts
/** Decide whether the active module's pane is the normal module outlet or
 *  the unavailable panel. Pure — unit-tested in isolation. Unknown/missing
 *  module status (still loading) resolves to the outlet so there's no false
 *  guard before the real module catalog arrives. */
export type ActivePane =
  | { kind: 'outlet' }
  | {
      kind: 'panel';
      label: string;
      note?: string;
      primary: ModuleId;
      primaryLabel: string;
      canOpenSettings: boolean;
    };

export function resolveActivePane(
  activeModule: ModuleId,
  modules: WorkspaceModule[],
): ActivePane {
  const active = modules.find((m) => m.id === activeModule);
  if (!active || isModuleEnterable(active.status)) return { kind: 'outlet' };
  const primary = primaryModuleForOpen(modules);
  const primaryWm = modules.find((m) => m.id === primary);
  return {
    kind: 'panel',
    label: active.label,
    note: active.note,
    primary,
    primaryLabel: primaryWm?.label ?? primary,
    canOpenSettings: active.status === 'disabled',
  };
}
```

In the `AppShell` component body, after `const modules = realModules ?? modulesForWorkspace(activeTournamentKind);` add:

```ts
  const meetEnabled = modules.some((m) => m.id === 'meet' && m.status === 'enabled');
  const pane = resolveActivePane(activeModule, modules);
```

Change the meet-polling gate (line ~130) from:

```tsx
      {activeTournamentKind !== 'bracket' ? <MeetOnlyPollingHooks /> : null}
```

to:

```tsx
      {meetEnabled ? <MeetOnlyPollingHooks /> : null}
```

Replace the `<main>` body (lines ~143–145):

```tsx
        <main id="main" className="min-h-0 flex-1 overflow-hidden">
          {pane.kind === 'outlet' ? (
            <ModuleOutlet />
          ) : (
            <ModuleUnavailablePanel
              label={pane.label}
              note={pane.note}
              primaryLabel={pane.primaryLabel}
              onGoToPrimary={() => {
                if (tid)
                  navigate(`/tournaments/${tid}/${defaultTabForModule(pane.primary)}`, {
                    replace: true,
                  });
              }}
              onOpenSettings={
                pane.canOpenSettings && tid
                  ? () => navigate(`/tournaments/${tid}/settings`)
                  : undefined
              }
            />
          )}
        </main>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/__tests__/AppShell.guard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify single-module polling parity (reasoning + tsc)**

`meetEnabled` for a meet workspace (`modulesForWorkspace('meet')` → meet `enabled`) is `true` → polling runs (identical to `kind !== 'bracket'`). For a bracket workspace (`modulesForWorkspace('bracket')` → meet `coming-soon`) it is `false` → polling off (identical). Run `npx tsc -b`; expected clean.

- [ ] **Step 6: Full suite + commit**

Run: `npx vitest run`
Expected: green.

```bash
git add src/app/AppShell.tsx src/app/__tests__/AppShell.guard.test.tsx
git commit -m "feat(shell): unavailable-module guard + meet-enabled polling gate"
```

---

### Task 6: TournamentPage — drop the kind-snap; remove dead `normalizeActiveTab`

Remove the silent kind-based snap so a non-enterable tab is preserved for the guard, and a valid multi-module tab is never snapped. Then delete the now-unused helper + its tests.

**Files:**
- Modify: `src/pages/TournamentPage.tsx` (remove the `normalizeActiveTab` import + the effect at lines ~84–89)
- Modify: `src/lib/bracketTabs.ts` (remove `normalizeActiveTab`)
- Modify: `src/lib/__tests__/bracketTabs.test.ts` (remove the `normalizeActiveTab` describe blocks + import)
- Test: `src/pages/__tests__/TournamentPage.test.tsx` (add parity + preservation cases — create if absent)

**Interfaces:**
- Consumes: the AppShell guard (Task 5) — a preserved non-enterable tab now renders the panel.

- [ ] **Step 1: Write the failing/parity test**

Create or extend `src/pages/__tests__/TournamentPage.test.tsx`. The point is that `TournamentPage` no longer mutates `activeTab` to snap cross-kind tabs. Mount it under a router and assert the store's `activeTab` is left as the URL segment (not snapped):

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TournamentPage } from '../TournamentPage';
import { useUiStore } from '../../store/uiStore';

// Stub the heavy AppShell + the kind fetch so we test only TournamentPage's
// URL→store syncing (no network, no product mount).
vi.mock('../../app/AppShell', () => ({ AppShell: () => null }));
vi.mock('../../hooks/useTournamentKind', () => ({ useTournamentKind: () => {} }));

function renderAt(seg: string) {
  return render(
    <MemoryRouter initialEntries={[`/tournaments/t1/${seg}`]}>
      <Routes>
        <Route path="/tournaments/:id/*" element={<TournamentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({ activeTab: 'setup', activeTournamentKind: 'meet' });
});

describe('TournamentPage URL→activeTab sync (no kind-snap)', () => {
  it('single-module: the segment becomes activeTab', async () => {
    renderAt('roster');
    await waitFor(() => expect(useUiStore.getState().activeTab).toBe('roster'));
  });
  it('a cross-module tab is PRESERVED (not snapped) so the guard can act', async () => {
    // kind stays meet (mock), URL is a bracket tab → activeTab stays bracket-setup.
    renderAt('bracket-setup');
    await waitFor(() => expect(useUiStore.getState().activeTab).toBe('bracket-setup'));
    // Give any (removed) snap effect a chance to run — it must NOT fire.
    expect(useUiStore.getState().activeTab).toBe('bracket-setup');
  });
});
```

- [ ] **Step 2: Run to verify the preservation case fails on current code**

Run: `npx vitest run src/pages/__tests__/TournamentPage.test.tsx`
Expected: the second test FAILS on current code — the `normalizeActiveTab` effect snaps `bracket-setup` → `setup` for `kind='meet'`.

- [ ] **Step 3: Remove the snap from `TournamentPage.tsx`**

Change the import (line 25) from:

```ts
import { normalizeActiveTab, MEET_TAB_IDS, BRACKET_TAB_IDS } from '../lib/bracketTabs';
```
to:
```ts
import { MEET_TAB_IDS, BRACKET_TAB_IDS } from '../lib/bracketTabs';
```

Delete the snap block (lines ~84–89): the two `useUiStore` selector reads (`activeTab`, `activeTournamentKind`) **that exist only for the snap effect** and the `useEffect` that calls `normalizeActiveTab`. (Leave the earlier `useLayoutEffect` URL-sync and the optimistic-kind set intact — they use `useUiStore.getState()`, not those selector consts.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/pages/__tests__/TournamentPage.test.tsx`
Expected: PASS — both the segment-sync and the preservation cases.

- [ ] **Step 5: Remove the now-dead `normalizeActiveTab`**

`grep -rn "normalizeActiveTab" src` — the only references now are its definition in `bracketTabs.ts` and its tests. Delete the `normalizeActiveTab` function from `src/lib/bracketTabs.ts`, and delete the `describe('normalizeActiveTab', …)` block(s) and the `normalizeActiveTab` import in `src/lib/__tests__/bracketTabs.test.ts` (the block near line 64 and the assertion at ~line 109–110). Re-run `grep -rn "normalizeActiveTab" src` and confirm zero matches.

- [ ] **Step 6: Full suite + tsc + build + commit**

Run: `npx vitest run` then `npx tsc -b` then `npm run build`
Expected: all green/clean.

```bash
git add src/pages/TournamentPage.tsx src/pages/__tests__/TournamentPage.test.tsx src/lib/bracketTabs.ts src/lib/__tests__/bracketTabs.test.ts
git commit -m "feat(routing): drop the kind-snap so the module guard owns non-enterable tabs"
```

---

## Self-Review

**Spec coverage:**
- TabBar renders `tabsForModule(activeModule)` → Task 2 (helper) + Task 3 (TabBar). ✓
- Drop kind-snap from TournamentPage → Task 6. ✓
- Unavailable guard (panel instead of outlet, prevents non-enterable mount) → Task 4 (panel) + Task 5 (guard). ✓
- `defaultTabForModule` module-keyed + `primaryModuleForOpen` + Hub Open → Task 1. ✓
- Meet-polling gate by meet-enabled → Task 5. ✓
- Single-module byte/behavior parity → asserted in Task 3 (existing TabBar tests unchanged), Task 1 (Hub single-kind routing), Task 5 Step 5 (polling parity reasoning), Task 6 (segment-sync parity). ✓
- No uiStore slice / no module-aware normalize (dropped in refine) → not present. ✓
- ModuleOutlet unchanged (already mounts by module) → no task touches it. ✓

**Placeholder scan:** none — every step has the exact code/command. Task 6 Step 5 carries a concrete grep-and-remove contingency (delete only if zero remaining matches), not a vague instruction.

**Type consistency:** `defaultTabForModule(module)` (1 arg) matches its callers in Task 1 (AppShell, Hub) and Task 5 (guard `onGoToPrimary`). `primaryModuleForOpen(WorkspaceModule[]) → ModuleId` matches Task 1 (Hub) + Task 5 (`resolveActivePane`). `tabsForModule(ModuleId)` matches Task 3 consumption. `resolveActivePane(ModuleId, WorkspaceModule[]) → ActivePane` matches its test (Task 5 Step 1) and the AppShell body. `ModuleUnavailablePanel` props match Task 5's usage and Task 4's test.
