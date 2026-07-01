> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Workspace Suite — Phase 4a: Workspace Shell + Product Modes (additive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the Workspace Shell (identity · status · product switcher · connection chip) and the `products/{meet,bracket,display}` module boundaries, reframing the existing single-kind operator surface — additively, with no file relocations and no route changes.

**Architecture:** New presentational primitives in `platform/product-shell/` and pure logic + an identity hook in `platform/domain/`. `AppShell.tsx` stays the HUD-anchored host (SolverHud/ToastStack/modals untouched) but its content area becomes `WorkspaceShell` hosting a product outlet that mounts `MeetProduct | BracketProduct | DisplayProduct`. The meet `tv` tab is elevated into the Display mode; the back/wordmark + health chip move from `TabBar` up into the shell. Active product is derived from the existing active tab — no new URL scheme.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind + Zustand; `@scheduler/design-system`; Vitest (jsdom, `TZ=America/Los_Angeles`).

## Global Constraints

Every task implicitly includes these. Values copied from `docs/superpowers/specs/2026-06-23-workspace-suite-phase-4-shell-design.md`.

- **No route changes.** `/tournaments/:id/tv` and all other routes resolve exactly as before. `tv` stays a routable segment in `MEET_TAB_IDS`; only its placement (TabBar → Display mode) changes.
- **No backend/DB/DTO/solver changes.** The one store addition (`activeTournamentStatus`) is populated from the response `useTournamentKind` already fetches — no new request.
- **No data-model change.** A workspace is single-kind. The switcher shows all three products; the foreign operator product, and Display for bracket workspaces, are disabled with reasons.
- **No file relocations in 4a.** `pages/TournamentListPage.tsx` and `pages/PublicDisplayPage.tsx` stay put (relocated in Plan 4b). New code is additive; `AppShell.tsx`/`TabBar.tsx` are edited in place.
- **Disabled-reason copy (verbatim):**
  - Meet on a bracket workspace: `This workspace is a bracket — meets live in their own workspace.`
  - Bracket on a meet workspace: `This workspace is a meet — brackets live in their own workspace.`
  - Display on a bracket workspace: `Public display for brackets is coming.`
- **Branch:** all work on `dev/workspace-suite`.
- **Frontend tests:** from `products/scheduler/frontend/`, `npx vitest run <path>` (full suite: `npx vitest run`). Type check from repo root: `npx tsc -b products/scheduler/frontend`.
- After every task: `tsc` clean and full `vitest run` green.

## File Structure

New files:
- `products/scheduler/frontend/src/platform/product-shell/types.ts` — `ProductId`, `ProductSwitcherItem`, `WorkspaceIdentity` (T1)
- `products/scheduler/frontend/src/platform/domain/productModel.ts` — pure product helpers (T1)
- `products/scheduler/frontend/src/platform/domain/__tests__/productModel.test.ts` (T1)
- `products/scheduler/frontend/src/platform/domain/useWorkspaceIdentity.ts` (T3)
- `products/scheduler/frontend/src/platform/domain/__tests__/useWorkspaceIdentity.test.ts` (T3)
- `products/scheduler/frontend/src/platform/product-shell/ProductSwitcher.tsx` (T4)
- `products/scheduler/frontend/src/platform/product-shell/WorkspaceIdentityBar.tsx` (T4)
- `products/scheduler/frontend/src/platform/product-shell/WorkspaceShell.tsx` (T4)
- `products/scheduler/frontend/src/platform/product-shell/__tests__/ProductSwitcher.test.tsx` (T4)
- `products/scheduler/frontend/src/platform/product-shell/__tests__/WorkspaceShell.test.tsx` (T4)
- `products/scheduler/frontend/src/products/meet/MeetProduct.tsx` (T5)
- `products/scheduler/frontend/src/products/bracket/BracketProduct.tsx` (T5)
- `products/scheduler/frontend/src/products/display/DisplayProduct.tsx` (T6)
- `products/scheduler/frontend/src/app/workspace/ProductOutlet.tsx` (T7)
- `products/scheduler/frontend/src/app/workspace/__tests__/ProductOutlet.test.tsx` (T7)

Modified files:
- `src/store/uiStore.ts` — add `activeTournamentStatus` + setter (T2)
- `src/hooks/useTournamentKind.ts` — set status from the summary (T2)
- `src/lib/bracketTabs.ts` — add `MEET_OPERATOR_TAB_IDS` (visible meet tabs, no `tv`) (T6)
- `src/app/TabBar.tsx` — drop back/wordmark + render meet tabs without `tv` (T6)
- `src/app/AppShell.tsx` — body becomes WorkspaceShell + ProductOutlet; HUDs stay (T7)

---

### Task 1: Product model — types + pure helpers

**Files:**
- Create: `src/platform/product-shell/types.ts`
- Create: `src/platform/domain/productModel.ts`
- Test: `src/platform/domain/__tests__/productModel.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ProductId = 'meet'|'bracket'|'display'`; `ProductSwitcherItem`; `WorkspaceIdentity`; `productForTab(tab, kind): ProductId`; `defaultTabForProduct(product, kind): string`; `productsForWorkspace(kind): ProductSwitcherItem[]`.

- [ ] **Step 1: Write the failing test**

Create `src/platform/domain/__tests__/productModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  productForTab,
  defaultTabForProduct,
  productsForWorkspace,
} from '../productModel';

describe('productForTab', () => {
  it('maps meet operator tabs to meet', () => {
    for (const t of ['setup', 'roster', 'matches', 'schedule', 'live']) {
      expect(productForTab(t, 'meet')).toBe('meet');
    }
  });
  it('maps tv to display', () => {
    expect(productForTab('tv', 'meet')).toBe('display');
  });
  it('maps bracket-* tabs to bracket', () => {
    for (const t of ['bracket-setup', 'bracket-draw', 'bracket-live']) {
      expect(productForTab(t, 'bracket')).toBe('bracket');
    }
  });
  it('falls back by kind for unknown tabs and never throws on null kind', () => {
    expect(productForTab('weird', 'bracket')).toBe('bracket');
    expect(productForTab('weird', 'meet')).toBe('meet');
    expect(productForTab('weird', null)).toBe('meet');
  });
});

describe('defaultTabForProduct', () => {
  it('routes meet-workspace products to existing meet routes', () => {
    expect(defaultTabForProduct('meet', 'meet')).toBe('setup');
    expect(defaultTabForProduct('display', 'meet')).toBe('tv');
    // bracket is disabled on a meet workspace → defensive home
    expect(defaultTabForProduct('bracket', 'meet')).toBe('setup');
  });
  it('routes everything to bracket home on a bracket workspace', () => {
    expect(defaultTabForProduct('bracket', 'bracket')).toBe('bracket-setup');
    expect(defaultTabForProduct('display', 'bracket')).toBe('bracket-setup');
    expect(defaultTabForProduct('meet', 'bracket')).toBe('bracket-setup');
  });
});

describe('productsForWorkspace', () => {
  it('meet workspace: Meet+Display live, Bracket disabled with reason', () => {
    const p = productsForWorkspace('meet');
    expect(p.map((x) => x.id)).toEqual(['meet', 'bracket', 'display']);
    expect(p.find((x) => x.id === 'meet')!.available).toBe(true);
    expect(p.find((x) => x.id === 'display')!.available).toBe(true);
    const bracket = p.find((x) => x.id === 'bracket')!;
    expect(bracket.available).toBe(false);
    expect(bracket.disabledReason).toBe(
      'This workspace is a meet — brackets live in their own workspace.',
    );
  });
  it('bracket workspace: Bracket live, Meet+Display disabled with reasons', () => {
    const p = productsForWorkspace('bracket');
    expect(p.find((x) => x.id === 'bracket')!.available).toBe(true);
    expect(p.find((x) => x.id === 'meet')!.disabledReason).toBe(
      'This workspace is a bracket — meets live in their own workspace.',
    );
    expect(p.find((x) => x.id === 'display')!.disabledReason).toBe(
      'Public display for brackets is coming.',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `products/scheduler/frontend/`): `npx vitest run src/platform/domain/__tests__/productModel.test.ts`
Expected: FAIL — cannot resolve `../productModel`.

- [ ] **Step 3: Write the types**

Create `src/platform/product-shell/types.ts`:

```ts
/** The three suite product modes inside an open workspace. */
export type ProductId = 'meet' | 'bracket' | 'display';

/** One entry in the product switcher. Disabled entries carry a reason
 *  (shown as a tooltip) explaining why this workspace can't enter them yet. */
export interface ProductSwitcherItem {
  id: ProductId;
  label: string;
  available: boolean;
  disabledReason?: string;
}

/** Identity of the open workspace, as the shell displays it. Fields are
 *  nullable because they hydrate asynchronously. */
export interface WorkspaceIdentity {
  name: string | null;
  date: string | null; // ISO date string
  status: 'draft' | 'active' | 'archived' | null;
  kind: 'meet' | 'bracket' | null;
}
```

- [ ] **Step 4: Write the product model**

Create `src/platform/domain/productModel.ts`:

```ts
import type {
  ProductId,
  ProductSwitcherItem,
  WorkspaceIdentity,
} from '../product-shell/types';

type Kind = WorkspaceIdentity['kind'];

const MEET_OPERATOR_TABS = new Set([
  'setup',
  'roster',
  'matches',
  'schedule',
  'live',
]);

/** Which product owns a given active tab. `tv` is the Display mode; any
 *  `bracket-` tab is Bracket; the meet operator tabs are Meet. Unknown tabs
 *  fall back to the workspace kind. Never throws on a null kind. */
export function productForTab(tab: string, kind: Kind): ProductId {
  if (tab === 'tv') return 'display';
  if (tab.startsWith('bracket-')) return 'bracket';
  if (MEET_OPERATOR_TABS.has(tab)) return 'meet';
  return kind === 'bracket' ? 'bracket' : 'meet';
}

/** The existing route segment to navigate to when a product is selected.
 *  On a bracket workspace only Bracket is real, so everything routes to the
 *  bracket home (defensive — disabled products are never clicked). */
export function defaultTabForProduct(product: ProductId, kind: Kind): string {
  if (kind === 'bracket') return 'bracket-setup';
  if (product === 'display') return 'tv';
  if (product === 'meet') return 'setup';
  return 'setup';
}

/** The switcher always lists all three products. The operator product that
 *  doesn't match this workspace's kind is disabled with an explanation, and
 *  Display is disabled for bracket workspaces (no public display yet). */
export function productsForWorkspace(kind: Kind): ProductSwitcherItem[] {
  const isBracket = kind === 'bracket';
  return [
    {
      id: 'meet',
      label: 'Meet',
      available: !isBracket,
      disabledReason: isBracket
        ? 'This workspace is a bracket — meets live in their own workspace.'
        : undefined,
    },
    {
      id: 'bracket',
      label: 'Bracket',
      available: isBracket,
      disabledReason: !isBracket
        ? 'This workspace is a meet — brackets live in their own workspace.'
        : undefined,
    },
    {
      id: 'display',
      label: 'Display',
      available: !isBracket,
      disabledReason: isBracket
        ? 'Public display for brackets is coming.'
        : undefined,
    },
  ];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/platform/domain/__tests__/productModel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add products/scheduler/frontend/src/platform/product-shell/types.ts \
        products/scheduler/frontend/src/platform/domain/productModel.ts \
        products/scheduler/frontend/src/platform/domain/__tests__/productModel.test.ts
git commit -m "feat(suite): product model — types + product/route/availability helpers"
```

---

### Task 2: Cache workspace status in the UI store

**Files:**
- Modify: `src/store/uiStore.ts` (interface near line 128; implementation default + setter)
- Modify: `src/hooks/useTournamentKind.ts`
- Test: `src/platform/domain/__tests__/uiStoreStatus.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `uiStore.activeTournamentStatus: 'draft'|'active'|'archived'|null`; `uiStore.setActiveTournamentStatus(status)`. `useTournamentKind` now also caches status from the same summary fetch.

- [ ] **Step 1: Write the failing test**

Create `src/platform/domain/__tests__/uiStoreStatus.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from '../../../store/uiStore';

describe('uiStore activeTournamentStatus', () => {
  beforeEach(() => {
    useUiStore.getState().setActiveTournamentStatus(null);
  });

  it('defaults to null', () => {
    expect(useUiStore.getState().activeTournamentStatus).toBeNull();
  });

  it('stores and clears the status', () => {
    useUiStore.getState().setActiveTournamentStatus('active');
    expect(useUiStore.getState().activeTournamentStatus).toBe('active');
    useUiStore.getState().setActiveTournamentStatus(null);
    expect(useUiStore.getState().activeTournamentStatus).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/platform/domain/__tests__/uiStoreStatus.test.ts`
Expected: FAIL — `setActiveTournamentStatus is not a function`.

- [ ] **Step 3: Add the store field + setter**

In `src/store/uiStore.ts`, in the `UiState` interface immediately after the `setActiveTournamentKind` line (~line 128), add:

```ts
  // Active tournament's lifecycle status (draft | active | archived).
  // Fetched alongside ``kind`` by ``useTournamentKind`` from the summary
  // endpoint; ``null`` while loading or on failure. The Workspace Shell
  // reads this to show a status badge.
  activeTournamentStatus: 'draft' | 'active' | 'archived' | null;
  setActiveTournamentStatus: (
    status: 'draft' | 'active' | 'archived' | null,
  ) => void;
```

Then in the store implementation (the `create<UiState>(...)` body), find the `activeTournamentKind` default and setter and add the mirror right after them. The kind default looks like `activeTournamentKind: null,` and its setter like `setActiveTournamentKind: (kind) => set({ activeTournamentKind: kind }),`. Add:

```ts
  activeTournamentStatus: null,
  setActiveTournamentStatus: (status) => set({ activeTournamentStatus: status }),
```

(Read the file to place these beside the existing `activeTournamentKind` default and setter — mirror the exact surrounding style.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/platform/domain/__tests__/uiStoreStatus.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire useTournamentKind to cache status**

In `src/hooks/useTournamentKind.ts`, also read the status setter and set it from the same summary response, and clear it on the null/​error paths. Replace the hook body so it reads:

```ts
export function useTournamentKind(tournamentId: string | null): void {
  const setActiveTournamentKind = useUiStore(
    (s) => s.setActiveTournamentKind,
  );
  const setActiveTournamentStatus = useUiStore(
    (s) => s.setActiveTournamentStatus,
  );

  useEffect(() => {
    let cancelled = false;
    if (!tournamentId) {
      setActiveTournamentKind(null);
      setActiveTournamentStatus(null);
      return () => {
        cancelled = true;
      };
    }
    apiClient
      .getTournament(tournamentId)
      .then((row) => {
        if (cancelled) return;
        setActiveTournamentKind(row.kind);
        setActiveTournamentStatus(row.status);
      })
      .catch(() => {
        if (cancelled) return;
        setActiveTournamentKind(null);
        setActiveTournamentStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId, setActiveTournamentKind, setActiveTournamentStatus]);
}
```

(`row` is a `TournamentSummaryDTO`, which carries `status`. If `tsc` reports `status` is optional/typed differently, pass `row.status ?? null`.)

- [ ] **Step 6: Type-check and run the focused tests**

Run (repo root): `npx tsc -b products/scheduler/frontend` → expect clean.
Run (frontend): `npx vitest run src/platform/domain/__tests__/uiStoreStatus.test.ts` → expect PASS.

- [ ] **Step 7: Commit**

```bash
git add products/scheduler/frontend/src/store/uiStore.ts \
        products/scheduler/frontend/src/hooks/useTournamentKind.ts \
        products/scheduler/frontend/src/platform/domain/__tests__/uiStoreStatus.test.ts
git commit -m "feat(suite): cache active workspace status in uiStore from kind fetch"
```

---

### Task 3: `useWorkspaceIdentity` hook

**Files:**
- Create: `src/platform/domain/useWorkspaceIdentity.ts`
- Test: `src/platform/domain/__tests__/useWorkspaceIdentity.test.ts`

**Interfaces:**
- Consumes: `uiStore.activeTournamentKind`, `uiStore.activeTournamentStatus` (T2), `tournamentStore.config`.
- Produces: `useWorkspaceIdentity(): WorkspaceIdentity`.

- [ ] **Step 1: Write the failing test**

Create `src/platform/domain/__tests__/useWorkspaceIdentity.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceIdentity } from '../useWorkspaceIdentity';
import { useUiStore } from '../../../store/uiStore';
import { useTournamentStore } from '../../../store/tournamentStore';

describe('useWorkspaceIdentity', () => {
  beforeEach(() => {
    useUiStore.getState().setActiveTournamentKind(null);
    useUiStore.getState().setActiveTournamentStatus(null);
    useTournamentStore.setState({ config: null } as never);
  });

  it('composes identity from the tournament + ui stores', () => {
    useTournamentStore.setState({
      config: { tournamentName: 'Spring Finals', tournamentDate: '2026-04-01' },
    } as never);
    useUiStore.getState().setActiveTournamentKind('meet');
    useUiStore.getState().setActiveTournamentStatus('active');

    const { result } = renderHook(() => useWorkspaceIdentity());
    expect(result.current).toEqual({
      name: 'Spring Finals',
      date: '2026-04-01',
      status: 'active',
      kind: 'meet',
    });
  });

  it('returns nulls when nothing is loaded', () => {
    const { result } = renderHook(() => useWorkspaceIdentity());
    expect(result.current).toEqual({
      name: null,
      date: null,
      status: null,
      kind: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/platform/domain/__tests__/useWorkspaceIdentity.test.ts`
Expected: FAIL — cannot resolve `../useWorkspaceIdentity`.

- [ ] **Step 3: Implement the hook**

Create `src/platform/domain/useWorkspaceIdentity.ts`:

```ts
import { useTournamentStore } from '../../store/tournamentStore';
import { useUiStore } from '../../store/uiStore';
import type { WorkspaceIdentity } from '../product-shell/types';

/** Reads the open workspace's display identity from the tournament + ui
 *  stores. Name/date come from the persisted config; status/kind from the
 *  summary cached by `useTournamentKind`. */
export function useWorkspaceIdentity(): WorkspaceIdentity {
  const name = useTournamentStore((s) => s.config?.tournamentName ?? null);
  const date = useTournamentStore((s) => s.config?.tournamentDate ?? null);
  const status = useUiStore((s) => s.activeTournamentStatus);
  const kind = useUiStore((s) => s.activeTournamentKind);
  return { name, date, status, kind };
}
```

(If `tsc` reports `config` has no `tournamentName`/`tournamentDate`, read `src/store/tournamentStore.ts` for the exact config field names and adjust — the dto fields are `tournamentName` and `tournamentDate`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/platform/domain/__tests__/useWorkspaceIdentity.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

Run (repo root): `npx tsc -b products/scheduler/frontend` → clean.

```bash
git add products/scheduler/frontend/src/platform/domain/useWorkspaceIdentity.ts \
        products/scheduler/frontend/src/platform/domain/__tests__/useWorkspaceIdentity.test.ts
git commit -m "feat(suite): useWorkspaceIdentity hook composing shell identity"
```

---

### Task 4: Product-shell presentational components

**Files:**
- Create: `src/platform/product-shell/ProductSwitcher.tsx`
- Create: `src/platform/product-shell/WorkspaceIdentityBar.tsx`
- Create: `src/platform/product-shell/WorkspaceShell.tsx`
- Test: `src/platform/product-shell/__tests__/ProductSwitcher.test.tsx`
- Test: `src/platform/product-shell/__tests__/WorkspaceShell.test.tsx`

**Interfaces:**
- Consumes: `ProductId`, `ProductSwitcherItem`, `WorkspaceIdentity` (T1); `@scheduler/design-system` `StatusPill`; `INTERACTIVE_BASE` from `../../lib/utils`.
- Produces: `<ProductSwitcher products active onSelect />`; `<WorkspaceIdentityBar identity onBackToHub />`; `<WorkspaceShell identity products activeProduct onSelectProduct onBackToHub statusSlot children />`.

- [ ] **Step 1: Write the failing tests**

Create `src/platform/product-shell/__tests__/ProductSwitcher.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductSwitcher } from '../ProductSwitcher';
import type { ProductSwitcherItem } from '../types';

const items: ProductSwitcherItem[] = [
  { id: 'meet', label: 'Meet', available: true },
  { id: 'bracket', label: 'Bracket', available: false, disabledReason: 'nope' },
  { id: 'display', label: 'Display', available: true },
];

describe('ProductSwitcher', () => {
  it('renders all products and marks the active one', () => {
    render(<ProductSwitcher products={items} active="meet" onSelect={() => {}} />);
    expect(screen.getByTestId('product-meet')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('product-display')).toHaveAttribute('aria-selected', 'false');
  });

  it('disables unavailable products and exposes the reason', () => {
    render(<ProductSwitcher products={items} active="meet" onSelect={() => {}} />);
    const bracket = screen.getByTestId('product-bracket');
    expect(bracket).toBeDisabled();
    expect(bracket).toHaveAttribute('title', 'nope');
  });

  it('fires onSelect only for available products', async () => {
    const onSelect = vi.fn();
    render(<ProductSwitcher products={items} active="meet" onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('product-display'));
    await userEvent.click(screen.getByTestId('product-bracket'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('display');
  });
});
```

Create `src/platform/product-shell/__tests__/WorkspaceShell.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceShell } from '../WorkspaceShell';
import type { WorkspaceIdentity } from '../types';
import { productsForWorkspace } from '../../domain/productModel';

const identity: WorkspaceIdentity = {
  name: 'Spring Finals',
  date: '2026-04-01',
  status: 'active',
  kind: 'meet',
};

describe('WorkspaceShell', () => {
  it('shows identity, status, switcher, status slot and children', () => {
    render(
      <WorkspaceShell
        identity={identity}
        products={productsForWorkspace('meet')}
        activeProduct="meet"
        onSelectProduct={() => {}}
        onBackToHub={() => {}}
        statusSlot={<span data-testid="chip">chip</span>}
      >
        <div data-testid="content">content</div>
      </WorkspaceShell>,
    );
    expect(screen.getByText('Spring Finals')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByTestId('product-meet')).toBeInTheDocument();
    expect(screen.getByTestId('chip')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('omits the status pill when status is null and shows a name fallback', () => {
    render(
      <WorkspaceShell
        identity={{ name: null, date: null, status: null, kind: 'meet' }}
        products={productsForWorkspace('meet')}
        activeProduct="meet"
        onSelectProduct={() => {}}
        onBackToHub={() => {}}
      >
        <div />
      </WorkspaceShell>,
    );
    expect(screen.getByText('Untitled')).toBeInTheDocument();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });

  it('fires onBackToHub from the back control', async () => {
    const onBackToHub = vi.fn();
    render(
      <WorkspaceShell
        identity={identity}
        products={productsForWorkspace('meet')}
        activeProduct="meet"
        onSelectProduct={() => {}}
        onBackToHub={onBackToHub}
      >
        <div />
      </WorkspaceShell>,
    );
    await userEvent.click(screen.getByLabelText('Back to workspaces'));
    expect(onBackToHub).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/platform/product-shell/__tests__/`
Expected: FAIL — components don't exist.

- [ ] **Step 3: Implement ProductSwitcher**

Create `src/platform/product-shell/ProductSwitcher.tsx`:

```tsx
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { ProductId, ProductSwitcherItem } from './types';

interface ProductSwitcherProps {
  products: ProductSwitcherItem[];
  active: ProductId;
  onSelect: (id: ProductId) => void;
}

/** Segmented control over the workspace's product modes. Unavailable
 *  products render disabled with their reason as a tooltip. */
export function ProductSwitcher({ products, active, onSelect }: ProductSwitcherProps) {
  return (
    <div role="tablist" aria-label="Products" className="flex items-center gap-0.5">
      {products.map((p) => {
        const isActive = p.id === active;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            disabled={!p.available}
            aria-selected={isActive}
            aria-disabled={!p.available || undefined}
            title={!p.available ? p.disabledReason : undefined}
            data-testid={`product-${p.id}`}
            onClick={() => {
              if (p.available) onSelect(p.id);
            }}
            className={[
              INTERACTIVE_BASE,
              'rounded-sm px-3 py-1.5 text-sm font-medium tracking-tight',
              !p.available
                ? 'cursor-not-allowed text-muted-foreground/40'
                : isActive
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            ].join(' ')}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement WorkspaceIdentityBar**

Create `src/platform/product-shell/WorkspaceIdentityBar.tsx`:

```tsx
import { ArrowLeft } from '@phosphor-icons/react';
import { StatusPill } from '@scheduler/design-system';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { WorkspaceIdentity } from './types';

interface WorkspaceIdentityBarProps {
  identity: WorkspaceIdentity;
  onBackToHub: () => void;
}

function statusTone(status: WorkspaceIdentity['status']) {
  if (status === 'active') return 'green' as const;
  if (status === 'archived') return 'idle' as const;
  return 'done' as const;
}

/** Back-to-Hub control + workspace name · date · status badge. */
export function WorkspaceIdentityBar({ identity, onBackToHub }: WorkspaceIdentityBarProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={onBackToHub}
        aria-label="Back to workspaces"
        title="Back to workspaces"
        className={[
          INTERACTIVE_BASE,
          'inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted-foreground',
          'hover:bg-muted/40 hover:text-foreground',
        ].join(' ')}
      >
        <ArrowLeft size={14} aria-hidden="true" />
      </button>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm font-semibold text-foreground">
          {identity.name || 'Untitled'}
        </span>
        {identity.date ? (
          <span className="text-xs text-muted-foreground tabular-nums">{identity.date}</span>
        ) : null}
        {identity.status ? (
          <StatusPill tone={statusTone(identity.status)}>{identity.status}</StatusPill>
        ) : null}
      </div>
    </div>
  );
}
```

(If `tsc` reports `StatusPill`'s `tone` prop rejects one of `'green'|'idle'|'done'`, read `packages/design-system/components` for the allowed tones and map accordingly — these three match `TournamentListPage.tsx`'s existing usage.)

- [ ] **Step 5: Implement WorkspaceShell**

Create `src/platform/product-shell/WorkspaceShell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ProductSwitcher } from './ProductSwitcher';
import { WorkspaceIdentityBar } from './WorkspaceIdentityBar';
import type { ProductId, ProductSwitcherItem, WorkspaceIdentity } from './types';

interface WorkspaceShellProps {
  identity: WorkspaceIdentity;
  products: ProductSwitcherItem[];
  activeProduct: ProductId;
  onSelectProduct: (id: ProductId) => void;
  onBackToHub: () => void;
  statusSlot?: ReactNode;
  children: ReactNode;
}

/** The stable workspace chrome: a top bar with identity, product switcher,
 *  and a status/connection slot, hosting the active product module below. */
export function WorkspaceShell({
  identity,
  products,
  activeProduct,
  onSelectProduct,
  onBackToHub,
  statusSlot,
  children,
}: WorkspaceShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <WorkspaceIdentityBar identity={identity} onBackToHub={onBackToHub} />
        <ProductSwitcher products={products} active={activeProduct} onSelect={onSelectProduct} />
        <div className="flex items-center gap-2">{statusSlot}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/platform/product-shell/__tests__/`
Expected: PASS (all three suites). Run `npx tsc -b products/scheduler/frontend` → clean.

- [ ] **Step 7: Commit**

```bash
git add products/scheduler/frontend/src/platform/product-shell/
git commit -m "feat(suite): WorkspaceShell, ProductSwitcher, WorkspaceIdentityBar primitives"
```

---

### Task 5: MeetProduct + BracketProduct entry modules

**Files:**
- Create: `src/products/meet/MeetProduct.tsx`
- Create: `src/products/bracket/BracketProduct.tsx`

**Interfaces:**
- Consumes: `uiStore.activeTab`; existing lazy pages; `TabBar`; `TabSkeleton`; `BracketTab`.
- Produces: `<MeetProduct />` (TabBar + meet operator tab dispatch, no `tv`); `<BracketProduct />` (TabBar + BracketTab). Consumed by the product outlet in T7.

These are extracted from `AppShell.tsx`'s current body so T7 can mount them through the outlet. No test of their own — they are thin compositions of already-tested pages, and T7's outlet test plus the full suite cover them. (If the reviewer wants a smoke test, a render-without-crash test is acceptable, but is not required here.)

- [ ] **Step 1: Implement MeetProduct**

Create `src/products/meet/MeetProduct.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import { useUiStore } from '../../store/uiStore';
import { TabBar } from '../../app/TabBar';
import { TabSkeleton } from '../../components/TabSkeleton';

const TournamentSetupPage = lazy(() =>
  import('../../pages/TournamentSetupPage').then((m) => ({ default: m.TournamentSetupPage })),
);
const RosterTab = lazy(() =>
  import('../../features/roster/RosterTab').then((m) => ({ default: m.RosterTab })),
);
const MatchesTab = lazy(() =>
  import('../../features/matches/MatchesTab').then((m) => ({ default: m.MatchesTab })),
);
const SchedulePage = lazy(() =>
  import('../../pages/SchedulePage').then((m) => ({ default: m.SchedulePage })),
);
const MatchControlCenterPage = lazy(() =>
  import('../../pages/MatchControlCenterPage').then((m) => ({ default: m.MatchControlCenterPage })),
);

/** Meet product mode: the operator tab strip + the active meet tab. The `tv`
 *  tab is no longer here — it became the Display product mode. */
export function MeetProduct() {
  const activeTab = useUiStore((s) => s.activeTab);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabBar />
      <main id="main" className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<TabSkeleton tab={activeTab} />}>
          <div key={activeTab} className="h-full animate-block-in">
            {activeTab === 'setup' ? <TournamentSetupPage /> : null}
            {activeTab === 'roster' ? <RosterTab /> : null}
            {activeTab === 'matches' ? <MatchesTab /> : null}
            {activeTab === 'schedule' ? <SchedulePage /> : null}
            {activeTab === 'live' ? <MatchControlCenterPage /> : null}
          </div>
        </Suspense>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Implement BracketProduct**

Create `src/products/bracket/BracketProduct.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import { TabBar } from '../../app/TabBar';
import { TabSkeleton } from '../../components/TabSkeleton';
import { useUiStore } from '../../store/uiStore';

const BracketTab = lazy(() =>
  import('../../features/bracket/BracketTab').then((m) => ({ default: m.BracketTab })),
);

/** Bracket product mode: the bracket tab strip + the bracket surface. */
export function BracketProduct() {
  const activeTab = useUiStore((s) => s.activeTab);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabBar />
      <main id="main" className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<TabSkeleton tab={activeTab} />}>
          <div key="bracket" className="h-full animate-block-in">
            <BracketTab />
          </div>
        </Suspense>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run (repo root): `npx tsc -b products/scheduler/frontend` → clean. (The full suite still passes; AppShell still references its own copies until T7.)

```bash
git add products/scheduler/frontend/src/products/meet/MeetProduct.tsx \
        products/scheduler/frontend/src/products/bracket/BracketProduct.tsx
git commit -m "feat(suite): MeetProduct + BracketProduct entry modules"
```

---

### Task 6: DisplayProduct + relocate `tv` out of the TabBar

**Files:**
- Create: `src/products/display/DisplayProduct.tsx`
- Modify: `src/lib/bracketTabs.ts` (add `MEET_OPERATOR_TAB_IDS`)
- Modify: `src/app/TabBar.tsx` (drop back/wordmark; render meet tabs without `tv`)
- Modify: `src/app/TabBar.test.tsx` if it asserts the removed controls (run the suite to find out)

**Interfaces:**
- Consumes: `PublicDisplayPage`; `uiStore.setActiveTab`; `INTERACTIVE_BASE`; design-system icons.
- Produces: `<DisplayProduct />` (the elevated, live public-display surface with a fullscreen affordance); `MEET_OPERATOR_TAB_IDS` (meet tabs minus `tv`).

- [ ] **Step 1: Add the visible-meet-tabs constant**

In `src/lib/bracketTabs.ts`, immediately after the `MeetTabId` type (~line 46), add:

```ts
/** The meet tabs the TabBar renders. Excludes ``tv`` — TV is reached
 *  through the Workspace Shell's Display product mode, not the tab strip —
 *  while ``tv`` stays in ``MEET_TAB_IDS`` so the ``/tournaments/:id/tv``
 *  route and ``normalizeActiveTab`` keep treating it as valid. */
export const MEET_OPERATOR_TAB_IDS = MEET_TAB_IDS.filter(
  (id) => id !== 'tv',
) as Exclude<MeetTabId, 'tv'>[];
```

- [ ] **Step 2: Implement DisplayProduct (elevate the TV preview, made live)**

Create `src/products/display/DisplayProduct.tsx` — this is the former `TvPreviewTab` from `AppShell.tsx`, now a first-class mode with the embedded display made interactive (pointer-events restored):

```tsx
import { lazy, Suspense } from 'react';
import { ArrowSquareOut, GearSix } from '@phosphor-icons/react';
import { useUiStore } from '../../store/uiStore';
import { TabSkeleton } from '../../components/TabSkeleton';
import { INTERACTIVE_BASE } from '../../lib/utils';

const PublicDisplayPage = lazy(() =>
  import('../../pages/PublicDisplayPage').then((m) => ({ default: m.PublicDisplayPage })),
);

/** Display product mode: the venue public-display surface, live in-shell,
 *  with a "Configure display" shortcut and an "Open fullscreen" affordance. */
export function DisplayProduct() {
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Public display</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The venue TV for this workspace. Open fullscreen on the display device.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('setup');
              const url = new URL(window.location.href);
              url.searchParams.set('section', 'display');
              window.history.replaceState({}, '', url.toString());
            }}
            className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-sm text-card-foreground hover:bg-muted/40 hover:text-foreground`}
          >
            <GearSix aria-hidden="true" className="h-4 w-4" />
            Configure display
          </button>
          <a
            href="/display"
            target="_blank"
            rel="noopener noreferrer"
            className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90`}
          >
            <ArrowSquareOut aria-hidden="true" className="h-4 w-4" />
            Open fullscreen
          </a>
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden border border-border bg-card">
        <div className="absolute inset-0 overflow-auto">
          <Suspense fallback={<TabSkeleton tab="tv" />}>
            <PublicDisplayPage />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
```

Note the `setActiveTab('setup')` shortcut: selecting "Configure display" returns to the Meet Setup tab, which the product outlet (T7) re-derives to the Meet product — same behavior the old TV tab had.

- [ ] **Step 3: Edit TabBar — drop back/wordmark, render meet tabs without `tv`**

In `src/app/TabBar.tsx`:

(a) Update the imports: change
```ts
import { BRACKET_TABS, MEET_TAB_IDS, type MeetTabId } from '../lib/bracketTabs';
```
to
```ts
import { BRACKET_TABS, MEET_OPERATOR_TAB_IDS, type MeetTabId } from '../lib/bracketTabs';
```
and remove the now-unused `ArrowLeft`, `Link`, and `ShuttleWorksMark` imports (keep `useNavigate`):
```ts
import { useNavigate } from 'react-router-dom';
```
(delete the `import { ArrowLeft } from '@phosphor-icons/react';`, the `Link` from the react-router import, and `import { ShuttleWorksMark } from '../components/ShuttleWorksMark';`).

(b) Build `MEET_TABS` from the visible set. Change
```ts
const MEET_TABS: TabDef[] = MEET_TAB_IDS.map((id) => ({
  id,
  label: MEET_TAB_LABELS[id],
}));
```
to
```ts
const MEET_TABS: TabDef[] = MEET_OPERATOR_TAB_IDS.map((id) => ({
  id,
  label: MEET_TAB_LABELS[id],
}));
```

(c) Remove the back-arrow `<Link>` and the wordmark `<Link>` block (the two `<Link to="/">` elements, lines ~99–121 — the comment block plus both links). The `role="tablist"` div becomes the first child of the `flex min-w-0 items-center gap-3` container. The outer `<nav>`, the tablist, and the trailing `AppStatusPopover` div all stay.

(Read the current file and remove exactly the two `<Link to="/">…</Link>` elements and their leading comment; leave everything else.)

- [ ] **Step 4: Run the full suite to surface fallout, fix asserting tests**

Run (frontend): `npx vitest run`
Expected: the only failures (if any) are in `src/app/TabBar.test.tsx` if it asserts the back-arrow, the wordmark, or a `tv` tab. For each such failure, update the assertion to the new reality (no back-arrow/wordmark in TabBar; meet tab strip is setup/roster/matches/schedule/live). Do not weaken unrelated assertions. If `TabBar.test.tsx` has no such assertion, no change is needed.

Run `npx tsc -b products/scheduler/frontend` → clean (confirms no dangling `tv`/`MEET_TAB_IDS`/`ArrowLeft` references).

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/frontend/src/products/display/DisplayProduct.tsx \
        products/scheduler/frontend/src/lib/bracketTabs.ts \
        products/scheduler/frontend/src/app/TabBar.tsx \
        products/scheduler/frontend/src/app/TabBar.test.tsx
git commit -m "feat(suite): DisplayProduct mode; lift TV + back/wordmark out of TabBar"
```

(Omit `TabBar.test.tsx` from the `git add` if it needed no change.)

---

### Task 7: Wire WorkspaceShell + ProductOutlet into AppShell

**Files:**
- Create: `src/app/workspace/ProductOutlet.tsx`
- Test: `src/app/workspace/__tests__/ProductOutlet.test.tsx`
- Modify: `src/app/AppShell.tsx` (body → WorkspaceShell + outlet; HUDs stay)

**Interfaces:**
- Consumes: `MeetProduct`, `BracketProduct`, `DisplayProduct` (T5/T6); `productForTab`, `defaultTabForProduct`, `productsForWorkspace` (T1); `useWorkspaceIdentity` (T3); `WorkspaceShell` (T4); `AppStatusPopover`; `uiStore`; react-router `useNavigate`; `useTournamentId`.
- Produces: `<ProductOutlet />` (mounts the active product module by derived product); reorganized `AppShell` that renders the shell + outlet.

- [ ] **Step 1: Write the failing ProductOutlet test**

Create `src/app/workspace/__tests__/ProductOutlet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductOutlet } from '../ProductOutlet';
import { useUiStore } from '../../../store/uiStore';

vi.mock('../../../products/meet/MeetProduct', () => ({
  MeetProduct: () => <div data-testid="meet-product" />,
}));
vi.mock('../../../products/bracket/BracketProduct', () => ({
  BracketProduct: () => <div data-testid="bracket-product" />,
}));
vi.mock('../../../products/display/DisplayProduct', () => ({
  DisplayProduct: () => <div data-testid="display-product" />,
}));

function setTabAndKind(tab: string, kind: 'meet' | 'bracket' | null) {
  useUiStore.getState().setActiveTab(tab as never);
  useUiStore.getState().setActiveTournamentKind(kind);
}

describe('ProductOutlet', () => {
  beforeEach(() => setTabAndKind('setup', 'meet'));

  it('renders MeetProduct for a meet operator tab', () => {
    setTabAndKind('schedule', 'meet');
    render(<ProductOutlet />);
    expect(screen.getByTestId('meet-product')).toBeInTheDocument();
  });

  it('renders DisplayProduct for the tv tab', () => {
    setTabAndKind('tv', 'meet');
    render(<ProductOutlet />);
    expect(screen.getByTestId('display-product')).toBeInTheDocument();
  });

  it('renders BracketProduct for a bracket tab', () => {
    setTabAndKind('bracket-draw', 'bracket');
    render(<ProductOutlet />);
    expect(screen.getByTestId('bracket-product')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/workspace/__tests__/ProductOutlet.test.tsx`
Expected: FAIL — cannot resolve `../ProductOutlet`.

- [ ] **Step 3: Implement ProductOutlet**

Create `src/app/workspace/ProductOutlet.tsx`:

```tsx
import { useUiStore } from '../../store/uiStore';
import { productForTab } from '../../platform/domain/productModel';
import { MeetProduct } from '../../products/meet/MeetProduct';
import { BracketProduct } from '../../products/bracket/BracketProduct';
import { DisplayProduct } from '../../products/display/DisplayProduct';

/** Mounts the product module that owns the current active tab. */
export function ProductOutlet() {
  const activeTab = useUiStore((s) => s.activeTab);
  const kind = useUiStore((s) => s.activeTournamentKind);
  const product = productForTab(activeTab, kind);
  if (product === 'bracket') return <BracketProduct />;
  if (product === 'display') return <DisplayProduct />;
  return <MeetProduct />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/workspace/__tests__/ProductOutlet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Reorganize AppShell body**

In `src/app/AppShell.tsx`:

(a) Remove the lazy page imports that moved into the product modules — `TournamentSetupPage`, `RosterTab`, `MatchesTab`, `SchedulePage`, `MatchControlCenterPage`, `PublicDisplayPage`, `BracketTab` — and remove the now-unused `Suspense`, `TabBar`, `TabSkeleton`, `ArrowSquareOut`, `GearSix`, `INTERACTIVE_BASE` imports and the `TvPreviewTab` function (lines ~212–260). Keep `lazy`? No longer needed → remove. Add the new imports:

```ts
import { useUiStore } from '../store/uiStore';
import { useTournamentState } from '../hooks/useTournamentState';
import { useAdvisories } from '../hooks/useAdvisories';
import { useSuggestions } from '../hooks/useSuggestions';
import { useNavigate } from 'react-router-dom';
import { SolverHud } from '../components/SolverHud';
import { UnsavedBanner } from '../components/UnsavedBanner';
import { ToastStack } from '../components/Toast';
import { UnlockModalHost } from '../components/common/UnlockModalHost';
import { AppStatusPopover } from '../components/AppStatusPopover';
import { useTournamentId } from '../hooks/useTournamentId';
import { WorkspaceShell } from '../platform/product-shell/WorkspaceShell';
import { ProductOutlet } from './workspace/ProductOutlet';
import { useWorkspaceIdentity } from '../platform/domain/useWorkspaceIdentity';
import {
  productForTab,
  defaultTabForProduct,
  productsForWorkspace,
} from '../platform/domain/productModel';
```

Keep the existing `useEffect` import and the `pushToast`/`setActiveProposal` effects exactly as they are.

(b) Inside `AppShell()`, after the existing store reads, add identity + product wiring:

```ts
  const activeTournamentKind = useUiStore((s) => s.activeTournamentKind);
  const navigate = useNavigate();
  const tid = useTournamentId();
  const identity = useWorkspaceIdentity();
  const activeProduct = productForTab(activeTab, activeTournamentKind);
  const products = productsForWorkspace(activeTournamentKind);
```

(`activeTournamentKind` is already read at line 51 — reuse it; don't double-declare. `activeTab` is already read at line 50.)

(c) Replace the `<main>…</main>` block (lines ~145–170) — and the surrounding TabBar/UnsavedBannerSlot — with the WorkspaceShell hosting the banner + outlet. The texture overlay, skip-link, `SharedStateHooks`, `MeetOnlyPollingHooks`, `SolverHud`, `ToastStack`, `UnlockModalHost` all stay. The new body between the polling hooks and `SolverHud`:

```tsx
      <WorkspaceShell
        identity={identity}
        products={products}
        activeProduct={activeProduct}
        onSelectProduct={(p) => {
          if (tid) navigate(`/tournaments/${tid}/${defaultTabForProduct(p, activeTournamentKind)}`, { replace: true });
        }}
        onBackToHub={() => navigate('/')}
        statusSlot={<AppStatusPopover />}
      >
        <UnsavedBannerSlot />
        <main id="main" className="min-h-0 flex-1 overflow-hidden">
          <ProductOutlet />
        </main>
      </WorkspaceShell>
```

Note: the `id="main"` skip-link target moves here, so remove the `id="main"` from the product modules' `<main>` if it would duplicate — keep the product modules' inner `<main>` but change their `id="main"` to no id (the outer one owns the skip target). Simplest: in `MeetProduct.tsx` and `BracketProduct.tsx`, change `<main id="main" ...>` to `<div ...>` (they're inner scroll regions, not the skip target). Make that change as part of this step and re-run their relevant tests.

Keep `UnsavedBannerSlot`, `SharedStateHooks`, `MeetOnlyPollingHooks` function definitions at the bottom of the file. Delete `TvPreviewTab`.

- [ ] **Step 6: Type-check and run the full suite**

Run (repo root): `npx tsc -b products/scheduler/frontend` → clean (no dangling references to the removed imports/`TvPreviewTab`).
Run (frontend): `npx vitest run` → all green. Update any test that asserted the old AppShell structure (e.g. a test expecting `tv` content under a TabBar tab, or the old single `<main>` dispatch) to the new shell + outlet reality; do not weaken unrelated assertions.

- [ ] **Step 7: Commit**

```bash
git add products/scheduler/frontend/src/app/AppShell.tsx \
        products/scheduler/frontend/src/app/workspace/ \
        products/scheduler/frontend/src/products/meet/MeetProduct.tsx \
        products/scheduler/frontend/src/products/bracket/BracketProduct.tsx
git commit -m "feat(suite): mount WorkspaceShell + product switcher + outlet in AppShell"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** spec steps 1–7 → Tasks 1, 2, 3, 4, 5, 6, 7. (Steps 8–9 file relocations + `app/suite` route refactor are Plan 4b.) Disabled-reason copy verbatim in T1 + Global Constraints. Switcher all-three + derive-from-route + `tv`→Display + status badge + back/wordmark relocation + health-chip-to-shell all covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete content; the "no own test" note in T5 is justified (thin compositions covered by T7 + suite), not a skipped requirement.
- **Type consistency:** `ProductId`/`ProductSwitcherItem`/`WorkspaceIdentity` field names identical across T1 definition, T3 hook, T4 components, T7 wiring. `productForTab`/`defaultTabForProduct`/`productsForWorkspace` signatures match between T1 and their T7 callers. `MEET_OPERATOR_TAB_IDS` defined in T6, consumed in T6 TabBar. `activeTournamentStatus`/`setActiveTournamentStatus` defined in T2, consumed in T3.
- **Scope:** one cohesive additive phase; the two file relocations are deliberately deferred to Plan 4b to keep moves isolated from this structural/visual change (parent-spec testing caution).
