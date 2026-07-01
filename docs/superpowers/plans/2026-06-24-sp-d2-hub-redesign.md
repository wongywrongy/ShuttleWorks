> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# SP-D2 — Hub Control-Plane Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Hub from a flat list + rail into a control-plane dashboard: a top summary-metrics band, signal-bearing rows with a primary next-action, destructive Delete moved out of the row into an overflow menu, and an action-panel inspector — built on a small set of reusable control-plane primitives.

**Architecture:** Introduce shared control-plane primitives under `src/components/control-plane/` (`MetricStat`, `HealthDot`, `EmptyState`, `Skeleton`, `SectionCard`, `OverflowMenu`). Add pure helpers `hubMetrics.ts` (totals from summaries' `signals`) and `nextAction.ts` (per-workspace next action). Extract `WorkspaceRow` from the `HubPage` megafile and add the next-action + overflow. Restructure `WorkspaceInspector` into action-panel sections. `HubPage` composes a `HubSummaryBar` + rows + inspector with explicit empty/loading states.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind, `@headlessui/react` v2.2.9 (Menu — already a dep), `@scheduler/design-system` (`Button`/`StatusPill`/`Modal`), Vitest + @testing-library/react.

## Global Constraints

- Branch `dev/workspace-suite`. Frontend-only; no backend/route-path changes; `kind` preserved; module status vocabulary unchanged.
- **No new dependency** — `OverflowMenu` uses `@headlessui/react`'s `Menu` (v2.2.9, already installed). Use the v2 API: `Menu` / `MenuButton` / `MenuItems` (with `anchor="bottom end"`) / `MenuItem` (render-prop `{ active, close }`).
- Control-plane visual layer: calm neutral surfaces, hairline `border-border` dividers, tabular-nums metrics, small-caps eyebrows (`tracking-[0.18em]`), restrained single accent for the primary/live state only. Existing design tokens; no new colors. Meet operator surfaces untouched.
- All signal rendering degrades safely when `signals` is absent (older payloads) — reuse `hubSignals.ts` accessors, which already fall back.
- Run from `products/scheduler/frontend`. Per task: run the focused test, then `npx vitest run` before committing. Gate before done: `npx tsc -b`, `npx vitest run`, `npm run build`.

---

### Task 1: Control-plane display primitives

`MetricStat`, `HealthDot`, `EmptyState`, `Skeleton`, `SectionCard`. Small presentational components; `HealthDot` becomes the canonical health→color (replacing `hubSignals.healthDotClass`).

**Files:**
- Create: `src/components/control-plane/MetricStat.tsx`, `HealthDot.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `SectionCard.tsx`, `index.ts`
- Create: `src/components/control-plane/__tests__/controlPlane.test.tsx`
- Modify: `src/products/hub/hubSignals.ts` (remove `healthDotClass`; keep the rest)
- Modify: `src/products/hub/WorkspaceInspector.tsx` (use `<HealthDot>` instead of `healthDotClass`)

**Interfaces:**
- Produces:
  - `healthColorClass(h: WorkspaceHealth): string` and `HealthDot({ health }: { health: WorkspaceHealth })` — a `1.5×1.5` rounded dot.
  - `MetricStat({ label, value, accent? }: { label: string; value: React.ReactNode; accent?: boolean })` — small-caps label over a tabular value; `data-testid="metric-<slug of label>"` not required (callers pass their own testid via an optional `testId` prop).
  - `EmptyState({ title, body, action? }: { title: string; body?: string; action?: React.ReactNode })`.
  - `Skeleton({ rows }: { rows: number })` — `rows` placeholder bars.
  - `SectionCard({ eyebrow, children, right? }: { eyebrow: string; children: React.ReactNode; right?: React.ReactNode })` — hairline-bordered panel with a small-caps eyebrow + optional right slot.
- `WorkspaceHealth` is imported from `../../products/hub/hubSignals` (already exported).

- [ ] **Step 1: Write the failing tests**

`src/components/control-plane/__tests__/controlPlane.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricStat, HealthDot, EmptyState, Skeleton, SectionCard, healthColorClass } from '../index';

describe('control-plane primitives', () => {
  it('MetricStat shows label + value', () => {
    render(<MetricStat label="Active" value={3} testId="m-active" />);
    expect(screen.getByTestId('m-active')).toHaveTextContent('Active');
    expect(screen.getByTestId('m-active')).toHaveTextContent('3');
  });
  it('healthColorClass maps health to a token class', () => {
    expect(healthColorClass('good')).toContain('accent');
    expect(healthColorClass('attention')).toContain('warning');
    expect(healthColorClass('draft')).toContain('muted');
  });
  it('HealthDot renders a dot element', () => {
    const { container } = render(<HealthDot health="attention" />);
    expect(container.querySelector('span[aria-hidden]')).toBeTruthy();
  });
  it('EmptyState shows title + body + action', () => {
    render(<EmptyState title="No workspaces" body="Create one" action={<button>Create</button>} />);
    expect(screen.getByText('No workspaces')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });
  it('Skeleton renders the requested number of rows', () => {
    render(<Skeleton rows={3} />);
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3);
  });
  it('SectionCard shows the eyebrow + children', () => {
    render(<SectionCard eyebrow="MODULES"><p>body</p></SectionCard>);
    expect(screen.getByText('MODULES')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/control-plane/__tests__/controlPlane.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the primitives**

`HealthDot.tsx` (canonical health color — moved from `hubSignals.healthDotClass`):

```tsx
import type { WorkspaceHealth } from '../../products/hub/hubSignals';

export function healthColorClass(h: WorkspaceHealth): string {
  if (h === 'good') return 'bg-accent';
  if (h === 'attention') return 'bg-status-warning';
  return 'bg-muted-foreground/40';
}

export function HealthDot({ health, title }: { health: WorkspaceHealth; title?: string }) {
  return (
    <span
      aria-hidden
      title={title ?? `Health: ${health}`}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthColorClass(health)}`}
    />
  );
}
```

`MetricStat.tsx`:

```tsx
export function MetricStat({
  label,
  value,
  accent,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col gap-0.5">
      <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className={`text-xl font-semibold tabular-nums ${accent ? 'text-accent' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
```

`EmptyState.tsx`:

```tsx
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-base font-semibold text-foreground">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
```

`Skeleton.tsx`:

```tsx
export function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} data-testid="skeleton-row" className="flex items-center gap-4 px-4 py-3">
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
```

`SectionCard.tsx`:

```tsx
export function SectionCard({
  eyebrow,
  children,
  right,
}: {
  eyebrow: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="border-b border-border p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </span>
        {right}
      </div>
      {children}
    </section>
  );
}
```

`index.ts`:

```ts
export { MetricStat } from './MetricStat';
export { HealthDot, healthColorClass } from './HealthDot';
export { EmptyState } from './EmptyState';
export { Skeleton } from './Skeleton';
export { SectionCard } from './SectionCard';
export { OverflowMenu } from './OverflowMenu'; // added in Task 2
```

(Add the `OverflowMenu` export in Task 2; if `index.ts` is created here without it, omit that line until Task 2.)

- [ ] **Step 4: Migrate `healthDotClass` → `HealthDot`**

In `src/products/hub/hubSignals.ts`, delete the `healthDotClass` function (keep `WorkspaceHealth` + all accessors). In `src/products/hub/WorkspaceInspector.tsx`, remove the `healthDotClass` import (it imported from `./hubSignals`) and replace the inline dot:

```tsx
// was: <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${healthDotClass(health)}`} />
<HealthDot health={health} />
```
adding `import { HealthDot } from '../../components/control-plane';`. `grep -rn "healthDotClass" src` must return zero matches afterward (HubPage's row still uses it — it is migrated in Task 4; until then, **keep `healthDotClass` exported** and only migrate the Inspector here, OR migrate both now. Simplest: migrate the Inspector here and HubPage's row in Task 4; keep `healthDotClass` until Task 4, then remove it in Task 4 once the row uses `HealthDot`.)

Decision to avoid a half-migrated state: in THIS task only add the primitives + the Inspector migration, and **leave `hubSignals.healthDotClass` in place** (re-exported), removing it in Task 4 when the row migrates. Update Step-3 `HealthDot.tsx` to NOT duplicate — it defines `healthColorClass`; `hubSignals.healthDotClass` can become `export const healthDotClass = healthColorClass` re-export to avoid two color maps. Implement that re-export now.

- [ ] **Step 5: Run + commit**

Run: `npx vitest run src/components/control-plane` then `npx tsc -b`
Expected: PASS; tsc clean.

```bash
git add src/components/control-plane src/products/hub/hubSignals.ts src/products/hub/WorkspaceInspector.tsx
git commit -m "feat(sp-d2): control-plane display primitives (MetricStat/HealthDot/EmptyState/Skeleton/SectionCard)"
```

---

### Task 2: `OverflowMenu` (Headless UI Menu)

A small accessible overflow ("…") menu for row/inspector actions, using `@headlessui/react` Menu v2.

**Files:**
- Create: `src/components/control-plane/OverflowMenu.tsx`
- Modify: `src/components/control-plane/index.ts` (export it)
- Test: `src/components/control-plane/__tests__/OverflowMenu.test.tsx`

**Interfaces:**
- Produces: `OverflowMenu({ label?, items }: { label?: string; items: OverflowItem[] })` where `OverflowItem = { key: string; label: string; onSelect: () => void; destructive?: boolean; testId?: string }`. Trigger is an icon button (`DotsThree` from `@phosphor-icons/react`) with `aria-label={label ?? 'More actions'}`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverflowMenu } from '../OverflowMenu';

describe('OverflowMenu', () => {
  it('opens and invokes the selected item', () => {
    const onDelete = vi.fn();
    render(
      <OverflowMenu
        items={[
          { key: 'settings', label: 'Settings', onSelect: () => {} },
          { key: 'delete', label: 'Delete', onSelect: onDelete, destructive: true, testId: 'overflow-delete' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByTestId('overflow-delete'));
    expect(onDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/control-plane/__tests__/OverflowMenu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (Headless UI v2 Menu)**

```tsx
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { DotsThree } from '@phosphor-icons/react';

export interface OverflowItem {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  testId?: string;
}

/** A compact accessible "…" action menu (Headless UI Menu v2). Anchored to the
 *  bottom-end of the trigger; items are buttons that close the menu on select. */
export function OverflowMenu({ label, items }: { label?: string; items: OverflowItem[] }) {
  return (
    <Menu>
      <MenuButton
        aria-label={label ?? 'More actions'}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <DotsThree aria-hidden weight="bold" className="h-5 w-5" />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-modal min-w-40 rounded-md border border-border bg-card py-1 shadow-md focus:outline-none"
      >
        {items.map((item) => (
          <MenuItem key={item.key}>
            <button
              type="button"
              data-testid={item.testId}
              onClick={(e) => {
                e.stopPropagation();
                item.onSelect();
              }}
              className={[
                'block w-full px-3 py-1.5 text-left text-sm',
                'data-[focus]:bg-muted/60',
                item.destructive ? 'text-destructive' : 'text-foreground',
              ].join(' ')}
            >
              {item.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
```

Then add `export { OverflowMenu } from './OverflowMenu';` to `index.ts` if not already present.

- [ ] **Step 4: Run + commit**

Run: `npx vitest run src/components/control-plane/__tests__/OverflowMenu.test.tsx` then `npx tsc -b`
Expected: PASS; tsc clean. (If the headless-ui `anchor`-positioned `MenuItems` renders in a portal and the test can't find the item, assert via `screen` still works because Headless UI renders items into the document; if not found, add `{ portal: false }`/`modal={false}` — but the default jsdom render exposes them. Keep the test asserting the click works.)

```bash
git add src/components/control-plane/OverflowMenu.tsx src/components/control-plane/index.ts src/components/control-plane/__tests__/OverflowMenu.test.tsx
git commit -m "feat(sp-d2): OverflowMenu (Headless UI Menu) for safe row/inspector actions"
```

---

### Task 3: `hubMetrics` + `nextAction` pure helpers

**Files:**
- Create: `src/products/hub/hubMetrics.ts`, `src/products/hub/nextAction.ts`
- Test: `src/products/hub/__tests__/hubMetrics.test.ts`, `src/products/hub/__tests__/nextAction.test.ts`

**Interfaces:**
- Consumes: `hubSignals` accessors (`needsAttention`, `collaborationOf`, `moduleCountsOf`), `attentionReasons`.
- Produces:
  - `hubMetrics(list: TournamentSummaryDTO[]): { workspaces: number; attention: number; active: number; shared: number; enabledModules: number; pendingInvites: number }`.
  - `nextActionFor(t: TournamentSummaryDTO): { label: string; reasonCode: string | null }` — from the first attention reason (`NO_ROSTER`→"Add players", `NOT_SCHEDULED`→"Generate schedule", `NO_BRACKET`→"Build the bracket", `NO_MODULES_ENABLED`→"Enable a module", `DISPLAY_NO_SOURCE`→"Enable an operator"), else `{ label: 'Open', reasonCode: null }`.

- [ ] **Step 1: Write the failing tests**

`hubMetrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hubMetrics } from '../hubMetrics';
import type { TournamentSummaryDTO } from '../../../api/dto';

const base = (o: Partial<TournamentSummaryDTO>): TournamentSummaryDTO => ({
  id: 'x', name: 'X', status: 'active', kind: 'meet', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null, ...o,
});
const sig = (o: Partial<NonNullable<TournamentSummaryDTO['signals']>>) => ({
  health: 'good' as const, attention: [], modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 1 },
  setup: {}, collaboration: { memberCount: 1, activeInviteCount: 0 }, ...o,
});

describe('hubMetrics', () => {
  it('totals workspaces / attention / active / shared / enabled modules / pending invites', () => {
    const list = [
      base({ id: 'a', status: 'active', role: 'owner', signals: sig({ health: 'attention', attention: [{ code: 'NO_ROSTER', label: 'x' }], modules: { enabled: 2, available: 1, disabled: 0, comingSoon: 0 }, collaboration: { memberCount: 1, activeInviteCount: 2 } }) }),
      base({ id: 'b', status: 'draft', role: 'viewer', signals: sig({ modules: { enabled: 1, available: 2, disabled: 0, comingSoon: 0 }, collaboration: { memberCount: 1, activeInviteCount: 1 } }) }),
    ];
    const m = hubMetrics(list);
    expect(m.workspaces).toBe(2);
    expect(m.attention).toBe(1); // a (health attention)
    expect(m.active).toBe(1); // a
    expect(m.shared).toBe(1); // b (viewer)
    expect(m.enabledModules).toBe(3); // 2 + 1
    expect(m.pendingInvites).toBe(3); // 2 + 1
  });
});
```

`nextAction.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextActionFor } from '../nextAction';
import type { TournamentSummaryDTO } from '../../../api/dto';

const t = (reason?: string): TournamentSummaryDTO => ({
  id: 'x', name: 'X', status: 'active', kind: 'meet', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null,
  signals: reason
    ? { health: 'attention', attention: [{ code: reason, label: 'l' }], modules: { enabled: 1, available: 0, disabled: 0, comingSoon: 0 }, setup: {}, collaboration: { memberCount: 0, activeInviteCount: 0 } }
    : undefined,
});

describe('nextActionFor', () => {
  it('maps the first attention reason to an action label', () => {
    expect(nextActionFor(t('NO_ROSTER')).label).toBe('Add players');
    expect(nextActionFor(t('NOT_SCHEDULED')).label).toBe('Generate schedule');
    expect(nextActionFor(t('NO_BRACKET')).label).toBe('Build the bracket');
  });
  it('defaults to Open with no reason', () => {
    expect(nextActionFor(t())).toEqual({ label: 'Open', reasonCode: null });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/products/hub/__tests__/hubMetrics.test.ts src/products/hub/__tests__/nextAction.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`hubMetrics.ts`:

```ts
import type { TournamentSummaryDTO } from '../../api/dto';
import { needsAttention, collaborationOf, moduleCountsOf } from './hubSignals';

export interface HubMetrics {
  workspaces: number;
  attention: number;
  active: number;
  shared: number;
  enabledModules: number;
  pendingInvites: number;
}

export function hubMetrics(list: TournamentSummaryDTO[]): HubMetrics {
  let attention = 0, active = 0, shared = 0, enabledModules = 0, pendingInvites = 0;
  for (const t of list) {
    if (needsAttention(t)) attention += 1;
    if (t.status === 'active') active += 1;
    if (t.role !== 'owner') shared += 1;
    enabledModules += moduleCountsOf(t)?.enabled ?? 0;
    pendingInvites += collaborationOf(t)?.activeInviteCount ?? 0;
  }
  return { workspaces: list.length, attention, active, shared, enabledModules, pendingInvites };
}
```

`nextAction.ts`:

```ts
import type { TournamentSummaryDTO } from '../../api/dto';
import { attentionReasons } from './hubSignals';

const REASON_ACTION: Record<string, string> = {
  NO_ROSTER: 'Add players',
  NOT_SCHEDULED: 'Generate schedule',
  NO_BRACKET: 'Build the bracket',
  NO_MODULES_ENABLED: 'Enable a module',
  DISPLAY_NO_SOURCE: 'Enable an operator',
};

export function nextActionFor(t: TournamentSummaryDTO): { label: string; reasonCode: string | null } {
  const first = attentionReasons(t)[0];
  if (first && REASON_ACTION[first.code]) {
    return { label: REASON_ACTION[first.code], reasonCode: first.code };
  }
  return { label: 'Open', reasonCode: null };
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run src/products/hub/__tests__/hubMetrics.test.ts src/products/hub/__tests__/nextAction.test.ts`
Expected: PASS.

```bash
git add src/products/hub/hubMetrics.ts src/products/hub/nextAction.ts src/products/hub/__tests__/hubMetrics.test.ts src/products/hub/__tests__/nextAction.test.ts
git commit -m "feat(sp-d2): hubMetrics + nextActionFor pure helpers"
```

---

### Task 4: Extract `WorkspaceRow` + next-action + overflow Delete

Move the row out of `HubPage`, migrate its health dot to `<HealthDot>`, add the primary next-action button, and move Delete into `<OverflowMenu>` (with the existing confirm modal still owned by `HubPage`).

**Files:**
- Create: `src/products/hub/WorkspaceRow.tsx` (move `ModuleChips` + `WorkspaceRow` here)
- Modify: `src/products/hub/HubPage.tsx` (import the extracted row; remove inline `WorkspaceRow`/`ModuleChips`/`healthDotClass` usage; pass `onOpen`/`onDelete`/`onSettings`)
- Modify: `src/products/hub/hubSignals.ts` (remove the `healthDotClass` re-export now that nothing uses it)
- Test: `src/products/hub/__tests__/WorkspaceRow.test.tsx`

**Interfaces:**
- Consumes: `HealthDot`, `OverflowMenu` (control-plane), `nextActionFor`, `hubSignals` accessors, `ModuleChips` (moved alongside).
- Produces: `WorkspaceRow({ tournament, selected, onSelect, onOpen, onSettings, onDelete }: RowProps)` — `onSettings` is new (navigates to settings); `onDelete?` stays (owner-only; now rendered inside the overflow).

- [ ] **Step 1: Write the failing test**

`WorkspaceRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceRow } from '../WorkspaceRow';
import type { TournamentSummaryDTO } from '../../../api/dto';

const t: TournamentSummaryDTO = {
  id: 't1', name: 'Spring', status: 'active', kind: 'meet', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null,
  modules: [{ moduleId: 'meet', status: 'enabled', config: null }],
  signals: { health: 'attention', attention: [{ code: 'NO_ROSTER', label: 'No players added yet' }], modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 1 }, setup: { roster: false }, collaboration: { memberCount: 1, activeInviteCount: 0 } },
};

describe('WorkspaceRow', () => {
  it('shows the primary next action from signals', () => {
    render(<WorkspaceRow tournament={t} selected={false} onSelect={() => {}} onOpen={() => {}} onSettings={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add players' })).toBeInTheDocument();
  });
  it('Delete lives in the overflow menu, not inline', () => {
    const onDelete = vi.fn();
    render(<WorkspaceRow tournament={t} selected={false} onSelect={() => {}} onOpen={() => {}} onSettings={() => {}} onDelete={onDelete} />);
    // No inline Delete button on the row surface.
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByTestId('overflow-delete'));
    expect(onDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/products/hub/__tests__/WorkspaceRow.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `WorkspaceRow.tsx`**

Move `ModuleChips` and `WorkspaceRow` from `HubPage.tsx` into this file (copy their current bodies). Then: replace the inline health dot span with `<HealthDot health={workspaceHealth(tournament)} />`; add a primary next-action button before the actions (`const action = nextActionFor(tournament)` → a `<Button onClick={onOpen}>{action.label}</Button>`); replace the inline `Open` + `Delete` buttons with the next-action button + an `<OverflowMenu>` carrying Settings (`onSettings`) and, when `onDelete`, a `destructive` Delete with `testId="overflow-delete"`. Keep `role="button"`, `aria-pressed`, keyboard handler, the signal-metrics cluster, role/owner/updated columns, and `StatusPill`. Import `HealthDot`, `OverflowMenu` from `../../components/control-plane`, `nextActionFor` from `./nextAction`, the `hubSignals` accessors, and the design-system `Button`/`StatusPill`.

- [ ] **Step 4: Wire `HubPage` to the extracted row**

In `HubPage.tsx`: delete the local `ModuleChips` + `WorkspaceRow` definitions and the now-unused `healthDotClass`/row imports; `import { WorkspaceRow } from './WorkspaceRow';`; in the list render, pass `onSettings={() => navigate(\`/tournaments/${t.id}/settings\`)}` and keep `onOpen`/`onDelete` (owner-only) wiring + the existing delete confirm modal. Remove the `healthDotClass` re-export from `hubSignals.ts`; `grep -rn "healthDotClass" src` → zero matches.

- [ ] **Step 5: Run focused + full suite**

Run: `npx vitest run src/products/hub/__tests__/WorkspaceRow.test.tsx src/products/hub/__tests__/HubPage.test.tsx` then `npx tsc -b`
Expected: PASS. The existing `HubPage.test` "Open"/Delete assertions may reference the old inline buttons — update them: the row's primary button label is now the next-action (or "Open"), and Delete is reached via the overflow (`more actions` → `overflow-delete`). Update those assertions; keep the navigation expectations.

- [ ] **Step 6: Commit**

```bash
git add src/products/hub/WorkspaceRow.tsx src/products/hub/HubPage.tsx src/products/hub/hubSignals.ts src/products/hub/__tests__/WorkspaceRow.test.tsx src/products/hub/__tests__/HubPage.test.tsx
git commit -m "feat(sp-d2): extract WorkspaceRow; primary next-action + Delete in overflow menu"
```

---

### Task 5: `HubSummaryBar` + Hub empty/loading states

**Files:**
- Create: `src/products/hub/HubSummaryBar.tsx`
- Modify: `src/products/hub/HubPage.tsx` (render the bar; EmptyState + Skeleton)
- Test: `src/products/hub/__tests__/HubSummaryBar.test.tsx`

**Interfaces:**
- Consumes: `hubMetrics` (Task 3), `MetricStat` (Task 1).
- Produces: `HubSummaryBar({ list, onPickFilter }: { list: TournamentSummaryDTO[]; onPickFilter: (id: 'attention' | 'active' | 'shared') => void })` — six `MetricStat`s; the attention/active/shared stats are buttons calling `onPickFilter`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HubSummaryBar } from '../HubSummaryBar';
import type { TournamentSummaryDTO } from '../../../api/dto';

const t = (o: Partial<TournamentSummaryDTO>): TournamentSummaryDTO => ({
  id: 'x', name: 'X', status: 'active', kind: 'meet', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null, ...o,
});

describe('HubSummaryBar', () => {
  it('renders totals and routes a metric click to the filter', () => {
    const onPick = vi.fn();
    render(<HubSummaryBar list={[t({}), t({ role: 'viewer' })]} onPickFilter={onPick} />);
    expect(screen.getByTestId('metric-workspaces')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('metric-attention'));
    expect(onPick).toHaveBeenCalledWith('attention');
  });
});
```

- [ ] **Step 2: Run to verify it fails → implement → pass**

Run: `npx vitest run src/products/hub/__tests__/HubSummaryBar.test.tsx` → FAIL. Implement `HubSummaryBar.tsx`: `const m = hubMetrics(list)`; a horizontal hairline-divided band of `MetricStat`s — `workspaces` (testid `metric-workspaces`), `attention` (button → `onPickFilter('attention')`, testid `metric-attention`, `accent` when `m.attention > 0`), `active` (button → `active`), `shared` (button → `shared`), `enabledModules`, `pendingInvites`. Run again → PASS.

- [ ] **Step 3: Wire into `HubPage` + empty/loading states**

In `HubPage.tsx`: render `<HubSummaryBar list={tournaments} onPickFilter={setActiveFilter} />` under the command bar (above the filter tabs). Replace the bare "Loading…" with `<Skeleton rows={6} />`, and the empty list with `<EmptyState title="No workspaces yet" body="A workspace is your event control plane — it runs modules like Meet, Bracket, and Display." action={<Button onClick={() => navigate('/new')}>Create workspace</Button>} />`. Import `Skeleton`, `EmptyState` from `../../components/control-plane`.

- [ ] **Step 4: Full suite + tsc + build + commit**

Run: `npx vitest run` then `npx tsc -b` then `npm run build`
Expected: all green/clean.

```bash
git add src/products/hub/HubSummaryBar.tsx src/products/hub/HubPage.tsx src/products/hub/__tests__/HubSummaryBar.test.tsx
git commit -m "feat(sp-d2): Hub summary-metrics band + empty/loading states"
```

---

### Task 6: `WorkspaceInspector` → action panel

Restructure the inspector into action-panel sections using `SectionCard`: an **attention checklist** (from `signals.setup` + reasons), the **module map** (existing catalog), **collaboration**, and primary actions (Open / Settings / next-action / "Manage sharing").

**Files:**
- Modify: `src/products/hub/WorkspaceInspector.tsx`
- Test: `src/products/hub/__tests__/WorkspaceInspector.test.tsx` (extend the SP-C test)

**Interfaces:**
- Consumes: `SectionCard`, `HealthDot` (control-plane), `nextActionFor`, `readinessOf`/`attentionReasons`/`collaborationOf`/`moduleCountsOf`.

- [ ] **Step 1: Extend the failing test**

Add to `WorkspaceInspector.test.tsx`:

```tsx
it('renders an attention checklist from signals.setup', () => {
  render(<WorkspaceInspector tournament={withSignals} onOpen={() => {}} onSettings={() => {}} />);
  // setup: { roster: false, scheduled: false } → checklist items rendered
  const checklist = screen.getByTestId('inspector-checklist');
  expect(checklist).toHaveTextContent(/roster/i);
  expect(checklist).toHaveTextContent(/scheduled/i);
});
it('offers the primary next action', () => {
  render(<WorkspaceInspector tournament={withSignals} onOpen={() => {}} onSettings={() => {}} />);
  // withSignals attention NO_ROSTER → "Add players"
  expect(screen.getByRole('button', { name: 'Add players' })).toBeInTheDocument();
});
```
(`withSignals` in that file has `attention: [{ code: 'NO_ROSTER', … }]` and `setup: { roster: false, scheduled: false }` — update the fixture's `setup` to include both keys if not present.)

- [ ] **Step 2: Run to verify it fails → implement → pass**

Run: `npx vitest run src/products/hub/__tests__/WorkspaceInspector.test.tsx` → FAIL. Implement: wrap the existing SIGNAL/MODULES sections in `SectionCard` eyebrows; add a **checklist** `<ul data-testid="inspector-checklist">` from `Object.entries(tournament.signals?.setup ?? {})` rendering each key with a check/empty marker (✓ when true), plus the attention reasons; add a primary next-action `<Button>` (`nextActionFor(tournament).label`, onClick `onOpen`) at the top of the actions; add a "Manage sharing" ghost button → `onSettings` (sharing lives in settings). Keep the module catalog list + module-counts + Open/Settings. Run again → PASS.

- [ ] **Step 3: Full suite + tsc + build + commit**

Run: `npx vitest run` then `npx tsc -b` then `npm run build`
Expected: green/clean.

```bash
git add src/products/hub/WorkspaceInspector.tsx src/products/hub/__tests__/WorkspaceInspector.test.tsx
git commit -m "feat(sp-d2): Inspector action panel — attention checklist, next action, sections"
```

---

## Self-Review

**Spec coverage (SP-D2 scope of the redesign spec):**
- Control-plane primitives (`MetricStat`/`HealthDot`/`SectionCard`/`EmptyState`/`Skeleton`/`OverflowMenu`) → Tasks 1–2. ✓
- Top summary metrics (workspaces/attention/active/shared/enabled modules/pending invites) → Task 3 (`hubMetrics`) + Task 5 (`HubSummaryBar`). ✓
- Rows: health, module state, readiness, collaboration, date, **next action**; Delete out of the row → Task 4 (+ `nextActionFor` Task 3). ✓
- Inspector → action panel (attention checklist, module map, collaboration, actions) → Task 6. ✓
- Empty/loading states → Task 5. ✓
- Extract from the `HubPage` megafile → Tasks 4–6 (`WorkspaceRow`, `HubSummaryBar`, primitives). ✓
- No new dependency (Headless UI Menu) / tokens-only / Meet untouched → Global Constraints + Task 2. ✓

**Placeholder scan:** none. The presentational JSX in Tasks 4–6 references the documented visual layer + the concrete primitives (props fully specified, tests concrete) — a named-pattern reference, not a vague instruction. Task 1 Step 4 carries a concrete decision (keep `healthDotClass` re-export until Task 4) to avoid a half-migrated state.

**Type consistency:** `WorkspaceHealth` (hubSignals) flows to `HealthDot`/`healthColorClass`. `OverflowItem`/`OverflowMenu` props match Tasks 4/6 usage. `hubMetrics`/`HubMetrics` fields match `HubSummaryBar` (Task 5) + its test. `nextActionFor → { label, reasonCode }` matches Tasks 4/6. `WorkspaceRow` gains `onSettings` (used by `HubPage` Task 4). The `metric-*` testids are produced by `HubSummaryBar` and asserted in its test.

**Slice boundary:** SP-D2 is the Hub only. SP-D3 (New Workspace), SP-D4 (Settings/Sharing/People), SP-D5 (Shell/Dock), SP-D6 (visual QA) each get their own plan at their turn, per the redesign spec's slice list. The control-plane primitives created here are reused by all later slices.
