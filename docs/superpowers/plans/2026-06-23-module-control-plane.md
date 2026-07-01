> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Module Control-Plane + Hub Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]` tracking.

**Goal:** Pivot the suite to a Ubiquiti-style control plane — Workspace = control plane, Meet/Bracket/Display = modules enabled inside it — with a full product→module rename, a module-aware Hub, and a template-based create flow, all as a frontend facade over `kind`.

**Architecture:** Rename `productModel`→`moduleModel` (+ `ModuleStatus`), `ProductSwitcher`→`ModuleDock`, `ProductOutlet`→`ModuleOutlet`, `ProductId`→`ModuleId` across code+tests (tsc-guided). Redesign `products/hub/HubPage` into a module-aware control plane and add a dedicated `/new` create page with module templates. No backend/route/Meet changes.

**Tech Stack:** React 19 + TS + Vite + Zustand + Tailwind; `@scheduler/design-system`; Vitest.

## Global Constraints

- No backend/DB/DTO/solver/route migration. Routes `/tournaments/:id/setup`, `/tournaments/:id/bracket-setup`, `/tournaments/:id/tv`, `/display` unchanged; `/new` is additive.
- `kind` stays the only backend signal; module set is derived (no module persistence).
- Enablement copy, NOT "wrong workspace": `Meet is not enabled for this workspace.` / `Bracket is not enabled for this workspace.` / `Display for bracket workspaces is coming.`
- Meet workflow untouched; no unrelated Meet visual redesign. Preserve create/open/delete.
- `products/{hub,meet,bracket,display}/` directories stay; only module concept/symbols change.
- Tests from `products/scheduler/frontend/`: `npx vitest run <path>`; type-check repo root `npx tsc -b products/scheduler/frontend`; build `npm run build`. Each task: tsc + (focused or full) vitest green.

---

### Task 1: Module model (rename + status pivot)

**Files:**
- Rename: `src/platform/domain/productModel.ts` → `src/platform/domain/moduleModel.ts`
- Modify: `src/platform/product-shell/types.ts` (`ProductId`→`ModuleId`; replace `ProductSwitcherItem` with `WorkspaceModule` + `ModuleStatus`)
- Rename test: `src/platform/domain/__tests__/productModel.test.ts` → `moduleModel.test.ts`

**Produces:** `ModuleId`, `ModuleStatus`, `WorkspaceModule`; `moduleForTab(tab,kind)`, `defaultTabForModule(module,kind)`, `modulesForWorkspace(kind)`.

- [ ] **Step 1: types.ts** — replace product types with:
```ts
export type ModuleId = 'meet' | 'bracket' | 'display';
export type ModuleStatus = 'enabled' | 'available' | 'not-enabled' | 'coming-soon';
export interface WorkspaceModule {
  id: ModuleId;
  label: string;
  status: ModuleStatus;
  note?: string; // enablement copy for not-enabled / coming-soon
}
```
Keep `WorkspaceIdentity` unchanged.

- [ ] **Step 2: moduleModel.ts** (`git mv` productModel.ts then edit):
```ts
import type { ModuleId, WorkspaceModule, WorkspaceIdentity } from '../product-shell/types';
type Kind = WorkspaceIdentity['kind'];
const MEET_OPERATOR_TABS = new Set(['setup','roster','matches','schedule','live']);

export function moduleForTab(tab: string, kind: Kind): ModuleId {
  if (tab === 'tv') return 'display';
  if (tab.startsWith('bracket-')) return 'bracket';
  if (MEET_OPERATOR_TABS.has(tab)) return 'meet';
  return kind === 'bracket' ? 'bracket' : 'meet';
}
export function defaultTabForModule(module: ModuleId, kind: Kind): string {
  if (kind === 'bracket') return 'bracket-setup';
  if (module === 'display') return 'tv';
  if (module === 'meet') return 'setup';
  return 'setup';
}
export function modulesForWorkspace(kind: Kind): WorkspaceModule[] {
  const isBracket = kind === 'bracket';
  return [
    { id: 'meet', label: 'Meet',
      status: isBracket ? 'not-enabled' : 'enabled',
      note: isBracket ? 'Meet is not enabled for this workspace.' : undefined },
    { id: 'bracket', label: 'Bracket',
      status: isBracket ? 'enabled' : 'not-enabled',
      note: isBracket ? undefined : 'Bracket is not enabled for this workspace.' },
    { id: 'display', label: 'Display',
      status: isBracket ? 'coming-soon' : 'available',
      note: isBracket ? 'Display for bracket workspaces is coming.' : undefined },
  ];
}
/** A module is enterable (clickable in the dock) when enabled or available. */
export function isModuleEnterable(status: WorkspaceModule['status']): boolean {
  return status === 'enabled' || status === 'available';
}
```

- [ ] **Step 3: moduleModel.test.ts** — assert `moduleForTab`/`defaultTabForModule` (unchanged mapping), and `modulesForWorkspace('meet')` = Meet enabled / Bracket not-enabled (note "Bracket is not enabled for this workspace.") / Display available; `modulesForWorkspace('bracket')` = Meet not-enabled ("Meet is not enabled for this workspace.") / Bracket enabled / Display coming-soon ("Display for bracket workspaces is coming."). Assert `isModuleEnterable`.

- [ ] **Step 4:** `npx vitest run src/platform/domain/__tests__/moduleModel.test.ts` green; `npx tsc -b products/scheduler/frontend` will fail in consumers (fixed Task 2-3) — note expected.
- [ ] **Step 5: Commit** `feat(suite): module model — kind-derived module set with statuses`

---

### Task 2: ModuleDock + ModuleOutlet (rename + status behavior)

**Files:**
- Rename: `src/platform/product-shell/ProductSwitcher.tsx` → `ModuleDock.tsx`; `src/app/workspace/ProductOutlet.tsx` → `ModuleOutlet.tsx`
- Rename tests accordingly; update `data-testid` `product-<id>`→`module-<id>`
- Modify: `src/platform/product-shell/WorkspaceShell.tsx` (props `products/activeProduct/onSelectProduct` → `modules/activeModule/onSelectModule`)

**Produces:** `<ModuleDock modules active onSelect />` (enterable = `isModuleEnterable(status)`; disabled items show `note`); `<ModuleOutlet/>` (uses `moduleForTab`).

- [ ] **Step 1:** `git mv` ProductSwitcher.tsx → ModuleDock.tsx. Rewrite to accept `modules: WorkspaceModule[]`, `active: ModuleId`, `onSelect`. Disabled when `!isModuleEnterable(m.status)`; `title={m.note}`; `data-testid={`module-${m.id}`}`; `onClick` fires only when enterable AND `m.id !== active` (keep the active-guard).
- [ ] **Step 2:** `git mv` ProductOutlet.tsx → ModuleOutlet.tsx; use `moduleForTab(activeTab, kind)`; same Meet/Bracket/Display mounting.
- [ ] **Step 3:** Update `WorkspaceShell.tsx` prop names → `modules/activeModule/onSelectModule`; render `<ModuleDock .../>`.
- [ ] **Step 4:** Update the renamed tests (`ProductSwitcher.test`→`ModuleDock.test`, `ProductOutlet.test`→`ModuleOutlet.test`) to new names, `module-<id>` testids, `WorkspaceModule` shape, and assert disabled `note` shown + active-click no-op.
- [ ] **Step 5:** `npx vitest run src/platform/product-shell/__tests__/ src/app/workspace/__tests__/` green for these; commit `refactor(suite): ProductSwitcher→ModuleDock, ProductOutlet→ModuleOutlet`.

---

### Task 3: Wire the rename through consumers (tsc-guided)

**Files:** `src/app/AppShell.tsx` (the WorkspaceShell wiring: `productForTab`→`moduleForTab`, `productsForWorkspace`→`modulesForWorkspace`, `defaultTabForProduct`→`defaultTabForModule`, prop names, imports from `moduleModel`/`ModuleDock`/`ModuleOutlet`); any other `productModel`/`ProductId` importer surfaced by tsc.

- [ ] **Step 1:** `npx tsc -b products/scheduler/frontend` → fix every reported reference (imports + symbol names). `grep -rn "productModel\|ProductId\|ProductSwitcher\|ProductOutlet\|productForTab\|productsForWorkspace\|defaultTabForProduct\|product-meet\|product-bracket\|product-display" src` must return nothing after.
- [ ] **Step 2:** `npx tsc -b products/scheduler/frontend` clean; `npx vitest run` full suite green (update any straggler test references). Commit `refactor(suite): finish product→module rename across consumers`.

---

### Task 4: Module-aware Hub redesign (`HubPage`)

**Files:** `src/products/hub/HubPage.tsx`; test `src/products/hub/__tests__/HubPage.test.tsx`.

**Module chips:** add a small helper (in HubPage or a `hubModules.ts`) deriving the row's chips from `kind`: meet → `[{label:'Meet',tone:'enabled'},{label:'Display',tone:'available'}]`; bracket → `[{label:'Bracket',tone:'enabled'},{label:'Display',tone:'soon'}]`. (Reuse `modulesForWorkspace` filtered to non-`not-enabled`.)

- [ ] **Step 1:** In `TournamentRow`, after the kind cell, render module chips (small pills via design-system tokens: enabled = solid/accent, available = outline, soon = muted "Display · soon"). Keep name/date/status/owner/role/Open/Delete.
- [ ] **Step 2:** Header: keep `WORKSPACES`/`Your workspaces` (workspace facade already), reframe subtitle to control-plane language ("Your event control planes — open a workspace to run its modules."). The "New" button → label "New workspace", navigates to `/new` (Task 5) via `useNavigate`.
- [ ] **Step 3:** Replace the in-row kind badge text so it reads as a module context, not a permanent type (keep the kind cell but ensure chips carry the module story; do NOT remove existing behavior).
- [ ] **Step 4:** Tests: HubPage renders "workspace"/module language; a meet row shows Meet + Display chips; a bracket row shows Bracket + Display(soon) chip; "New workspace" button navigates to `/new`. Mock `apiClient.listTournaments` (as the existing test does) with one meet + one bracket row.
- [ ] **Step 5:** `npx vitest run src/products/hub/__tests__/HubPage.test.tsx` green; tsc clean; commit `feat(hub): module-aware control-plane Hub with module chips`.

---

### Task 5: Dedicated create-workspace page (`/new`, templates)

**Files:** Create `src/products/hub/NewWorkspacePage.tsx` + `__tests__/NewWorkspacePage.test.tsx`; modify `src/app/App.tsx` (add `/new` route, lazy); HubPage "New workspace" → navigate `/new`.

**Templates:** `MEET_DAY` (modules Meet, Display → kind `meet`, destination `setup`), `BRACKET_TOURNAMENT` (module Bracket → kind `bracket`, destination `bracket-setup`), `HYBRID` (disabled, "Coming soon — multiple modules in one workspace"), `BLANK` (disabled, "Coming soon").

- [ ] **Step 1:** Build `NewWorkspacePage`: full-screen view (same header lockup), title "New workspace"; selectable template cards each listing included modules; name + date inputs; submit "Create workspace". Reuse the existing create call (`apiClient.createTournament` or whatever the current New-event modal uses — read `HubPage`/the modal for the exact call + payload) with `kind` from the selected template. On success → `navigate('/tournaments/${id}/${destination}')`. Disabled templates not submittable.
- [ ] **Step 2:** `App.tsx` — add `<Route path="/new" element={<AuthGuard><NewWorkspacePage/></AuthGuard>} />` (lazy import), mirroring the existing guarded routes. Do not touch other routes.
- [ ] **Step 3:** Tests: renders "New workspace" + "Create workspace"; Meet Day card lists Meet+Display and selecting+submitting calls create with `kind:'meet'` then navigates to `/setup`; Bracket Tournament → `kind:'bracket'` → `/bracket-setup`; Hybrid/Blank disabled. Mock the create API.
- [ ] **Step 4:** `npx vitest run src/products/hub/__tests__/NewWorkspacePage.test.tsx` green; tsc clean; commit `feat(hub): dedicated New Workspace page with module templates`.

---

### Task 6: Docs/glossary + final copy + full verify

**Files:** `docs/architecture/workspace-suite/glossary.md`, `meet-design-inventory.md`/`frontend-ownership-map.md` (replace "product mode" → "workspace module" where it appears); `import-boundaries.md` rule 4 (product→module wording).

- [ ] **Step 1:** Glossary: reframe "Product Mode" → "Workspace Module (formerly Product Mode)"; add **Module**, **Module Dock**, **Module Catalog**; add a line: "`kind` is a temporary compatibility bridge; future target is persisted `modules[]` (not yet implemented)."
- [ ] **Step 2:** `grep -rn "product mode\|product-mode\|ProductSwitcher\|product switcher" docs/architecture/workspace-suite` → update to module language.
- [ ] **Step 3:** Confirm `DisplayProduct` still has `/display?id=${id}` + Configure router nav (verified live `14c863a`); their tests still green.
- [ ] **Step 4:** Full verify: repo root `npx tsc -b products/scheduler/frontend` clean; from frontend `npx vitest run` all green; `npm run build` clean. Commit `docs(arch): product-mode → workspace-module language; module glossary`.

---

## Self-Review (plan author)
- **Spec coverage:** module model+statuses (T1), rename ProductSwitcher/Outlet/Id (T2/T3), Hub module chips + "New workspace" (T4), template create flow + `/new` (T5), enablement copy (T1 model + used everywhere), docs/glossary (T6), Display fixes confirmed (T6). Routes/Meet/backend untouched (Global Constraints).
- **Placeholders:** T5 step 1 says "read the current create call" — that's a deliberate lookup of an existing exact call, not a placeholder; the implementer must use the real `apiClient` method the current modal uses.
- **Type consistency:** `ModuleId`/`WorkspaceModule`/`ModuleStatus` defined T1, consumed T2-T5; `moduleForTab`/`defaultTabForModule`/`modulesForWorkspace`/`isModuleEnterable` names consistent; `module-<id>` testids consistent T2/T4.
- **Scope:** one cohesive slice; rename is mechanical/tsc-guided, UI tasks isolated.
