> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# SP-D5 — Module Dock as Product Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Make the Module Dock read as a product-module launcher rather than an anonymous tab strip: a leading modules glyph, a clear "running" treatment for the active module, and a trailing **Manage modules** affordance that opens the Settings module catalog (reusing the `?tab=modules` seam). Behavior, routes, and full-screen module modes are unchanged.

**Architecture:** Frontend-only, additive. `ModuleDock` gains an optional `onManage` prop + presentational reframing; `WorkspaceShell` forwards `onManageModules`; `AppShell` wires it to `navigate(/settings?tab=modules)`. No new dependency (Phosphor icons already used).

**Tech Stack:** React 19, TS, Tailwind, `@phosphor-icons/react`, Vitest.

## Global Constraints

- Branch `dev/workspace-suite`. Frontend-only; no route-path change (the `?tab=modules` query reuses the SP-D2 seam); module status vocabulary unchanged.
- Preserve existing dock contract: `role="tablist"`/`role="tab"`, `data-testid={`module-${id}`}`, `data-status`, `aria-selected`, the enter/enable/coming-soon behavior, and the active-module emphasis. Existing ModuleDock tests must keep passing.
- Existing design tokens only. Run from `products/scheduler/frontend`; gate `npx tsc -b`, `npx vitest run`, `npm run build`.

---

### Task 1: ModuleDock — launcher framing + running treatment + Manage affordance

**Files:**
- Modify: `src/platform/product-shell/ModuleDock.tsx`
- Test: `src/platform/product-shell/__tests__/ModuleDock.test.tsx`

**Interfaces:**
- `ModuleDockProps` gains `onManage?: () => void`. When provided, render a trailing icon button (`data-testid="module-manage"`, `aria-label="Manage modules"`, Phosphor `SlidersHorizontal`) that calls `onManage`. The active module gets `aria-current="page"` and a pulsing accent status dot (running indicator).

- [ ] **Step 1: Add failing tests**

```tsx
it('marks the active module as current (running)', () => {
  render(<ModuleDock modules={modules} active="meet" onSelect={() => {}} />);
  expect(screen.getByTestId('module-meet')).toHaveAttribute('aria-current', 'page');
  expect(screen.getByTestId('module-display')).not.toHaveAttribute('aria-current');
});

it('shows a Manage affordance that calls onManage when provided', async () => {
  const onManage = vi.fn();
  render(<ModuleDock modules={modules} active="meet" onSelect={() => {}} onManage={onManage} />);
  await userEvent.click(screen.getByTestId('module-manage'));
  expect(onManage).toHaveBeenCalled();
});

it('omits the Manage affordance when onManage is absent', () => {
  render(<ModuleDock modules={modules} active="meet" onSelect={() => {}} />);
  expect(screen.queryByTestId('module-manage')).toBeNull();
});
```

- [ ] **Step 2: Run → fail → implement → pass**

Run: `npx vitest run src/platform/product-shell/__tests__/ModuleDock.test.tsx` → FAIL. Implement:
- Wrap the existing tablist in a row with a leading `aria-hidden` modules glyph (Phosphor `SquaresFour`, muted, `h-4 w-4`) so the region reads as a module launcher.
- On the active module button add `aria-current="page"`; for the active module make the status dot pulse: append `animate-pulse` to the dot's class when `isActive && m.status === 'enabled'`.
- After the module buttons, when `onManage` is provided, render:
  ```tsx
  <button type="button" data-testid="module-manage" aria-label="Manage modules"
    onClick={onManage}
    className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground">
    <SlidersHorizontal aria-hidden className="h-4 w-4" />
  </button>
  ```
- Keep every existing class/behavior/testid. Imports: `import { SquaresFour, SlidersHorizontal } from '@phosphor-icons/react';`.
Run again → PASS (new + existing dock tests).

- [ ] **Step 3: Commit**

```bash
git add src/platform/product-shell/ModuleDock.tsx src/platform/product-shell/__tests__/ModuleDock.test.tsx
git commit -m "feat(sp-d5): Module Dock as launcher — glyph, running treatment, Manage affordance"
```

---

### Task 2: Wire `onManageModules` through the shell

**Files:**
- Modify: `src/platform/product-shell/WorkspaceShell.tsx` (add `onManageModules?`, pass to `ModuleDock.onManage`)
- Modify: `src/app/AppShell.tsx` (pass `onManageModules={() => tid && navigate(\`/tournaments/${tid}/settings?tab=modules\`)}`)
- Test: extend `src/platform/product-shell/__tests__/WorkspaceShell.test.tsx` if present, else assert via ModuleDock (Task 1 covers the dock; this step is integration wiring).

- [ ] **Step 1: Wire it**

`WorkspaceShellProps` gains `onManageModules?: () => void`; pass `onManage={onManageModules}` to `<ModuleDock>`. In `AppShell`, add the `onManageModules` prop to the `<WorkspaceShell>` usage, navigating to `/tournaments/${tid}/settings?tab=modules` (guard on `tid`).

- [ ] **Step 2: Gate + commit**

Run: `npx tsc -b` then `npx vitest run` then `npm run build` — all green/clean.

```bash
git add src/platform/product-shell/WorkspaceShell.tsx src/app/AppShell.tsx
git commit -m "feat(sp-d5): wire Manage modules → Settings module catalog (?tab=modules)"
```

---

## Self-Review

- Modules-as-products: launcher glyph + running treatment + Manage affordance → Task 1; the catalog it opens was built in SP-D4. ✓
- Switching feels intentional / better settings affordance: the Manage button routes to the module catalog → Tasks 1–2. ✓
- No route-path change (`?tab=modules` query), behavior/testids/a11y preserved, no new dep → Global Constraints + Task 1. ✓
- Type consistency: `onManage?`/`onManageModules?` are optional `() => void`; `AppShell` guards `tid`. ✓
