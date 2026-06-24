# Workspace Suite — Module control-plane pivot + Hub redesign — design

**Date:** 2026-06-23
**Status:** accepted (user approved; symbol rename = full; Hub = new dedicated control plane)
**Branch:** `dev/workspace-suite`
**Parent:** `docs/superpowers/specs/2026-06-23-workspace-suite-architecture-design.md`

## Goal

Pivot the product story from "Adobe-style separate products" to a **Ubiquiti/UniFi-style control plane**: one **Workspace** is the durable control plane, and **Meet / Bracket / Display** are **modules** enabled inside it. Redesign the `/` dashboard into a module-aware **Hub**, and the create flow into template/module selection — all as a frontend facade over the existing `kind`, with no backend/route changes.

## Model

- **Workspace** = durable event control plane (today: a `tournaments` row).
- **Module** = Meet / Bracket / Display, enabled inside a workspace.
- **`kind` is a temporary compatibility bridge.** The frontend derives a module set from `kind`; the future target is a persisted `modules[]` (NOT implemented this slice).

### Module model (`platform/domain/moduleModel.ts`, renamed from `productModel.ts`)

```ts
export type ModuleId = 'meet' | 'bracket' | 'display';
export type ModuleStatus = 'enabled' | 'available' | 'not-enabled' | 'coming-soon';

export interface WorkspaceModule {
  id: ModuleId;
  label: string;            // 'Meet' | 'Bracket' | 'Display'
  status: ModuleStatus;
  /** enablement copy for non-active statuses (not-enabled / coming-soon) */
  note?: string;
}
```

`modulesForWorkspace(kind)`:
- `meet` → Meet `enabled`, Bracket `not-enabled` ("Bracket is not enabled for this workspace."), Display `available`.
- `bracket` → Meet `not-enabled` ("Meet is not enabled for this workspace."), Bracket `enabled`, Display `coming-soon` ("Display for bracket workspaces is coming.").

Clickable in the dock = status ∈ {`enabled`, `available`}; disabled = {`not-enabled`, `coming-soon`} (show `note`). Helpers `moduleForTab(tab, kind)` and `defaultTabForModule(module, kind)` keep the existing route mapping (`tv`→display, `bracket-*`→bracket, meet operator tabs→meet).

## Symbol rename (full, mechanical, tsc-guided)

- `ProductId` → `ModuleId`; `ProductSwitcherItem` → `WorkspaceModule` (shape above).
- `ProductSwitcher` → `ModuleDock`; `ProductOutlet` → `ModuleOutlet`.
- `productModel.ts` → `moduleModel.ts`; `productForTab`→`moduleForTab`, `defaultTabForProduct`→`defaultTabForModule`, `productsForWorkspace`→`modulesForWorkspace`.
- Update all consumers + tests + `data-testid`s (`product-<id>` → `module-<id>`).
- **`products/{hub,meet,bracket,display}/` directories stay** (physical app layout; renaming dirs is needless churn). Only the module *concept/symbols* change.

## Hub redesign (`/` — new dedicated control plane)

Replace the generic event list with a **module-aware Workspace Hub** in the existing ShuttleWorks design language (Meet is the reference — `PageHeader`, cards, `StatusPill`, brutalist×premium tokens; **no new visual system**).

- Header: eyebrow `WORKSPACES`, title "Your workspaces", control-plane subtitle.
- **Workspace rows/cards** show: **name · date · status · owner/role · enabled-module chips · Open**.
- **Module chips** (derived from `kind`): a meet shows `Meet` (solid/enabled) + `Display` (outline/available); a bracket shows `Bracket` (solid/enabled) + `Display` (muted "soon"). The non-enabled foreign operator module is omitted from the row (kept for the in-workspace dock, which teaches the full set). Chips must NOT frame meet/bracket as permanent separate workspace *types* — they read as "modules enabled here."
- Sections: "You own" / "Shared with you" preserved; create/open/delete behavior preserved.
- The "New" action → **"New workspace"**, navigating to the dedicated create surface.

## Create-workspace surface (dedicated)

A dedicated full-screen create view (additive route `/new` — neutral, does NOT introduce `/workspaces/*`, leaves `/tournaments/*` untouched), reachable from the Hub.

- Title "New workspace"; **template cards**, each listing its included modules:
  - **Meet Day** — modules: Meet, Display → creates backend `kind: 'meet'`.
  - **Bracket Tournament** — modules: Bracket → creates backend `kind: 'bracket'`.
  - **Hybrid Event** — visible, **disabled/coming-soon** ("Coming soon — multiple modules in one workspace").
  - **Blank Workspace** — visible, **disabled** ("Coming soon").
- Name + date inputs (as today). Submit button: **"Create workspace."**
- On create → navigate to the first enabled operational module: Meet Day → `/tournaments/:id/setup`; Bracket Tournament → `/tournaments/:id/bracket-setup`.
- Preserves the existing create API call + payload (`kind` set from the template).

## Open-workspace shell (`ModuleDock`)

The in-workspace chrome uses module language. The dock shows all three modules; non-active ones are disabled with enablement copy:
- "Meet is not enabled for this workspace." / "Bracket is not enabled for this workspace." / "Display for bracket workspaces is coming."
Disabled modules stay visible (teach the control-plane model) but never imply a different workspace is required.

## Display correctness (already shipped `14c863a`; confirm + keep tests)

- `DisplayProduct` "Open fullscreen" → `/display?id=${id}` ✓ (verified live).
- "Configure display" → React Router nav to `/tournaments/:id/setup?section=display` ✓ (verified live).
This slice keeps these and their tests; no further change needed beyond confirming after the rename.

## Docs / glossary

- Workspace-suite docs: replace "product mode" as the primary metaphor with **"workspace module"**. Document `kind` as a temporary compatibility bridge and `modules[]` as the future target (not implemented).
- Glossary (`docs/architecture/workspace-suite/glossary.md`): keep Workspace / Hub / Core Platform; add **Module**, **Module Dock**, **Module Catalog**; reframe "Product Mode" → "Workspace Module (formerly Product Mode)".

## Constraints

- No backend / DB / DTO / solver / route migration. `/tournaments/:id/setup`, `/tournaments/:id/bracket-setup`, `/tournaments/:id/tv`, `/display` all unchanged; `/new` is additive.
- No data-lossy enable/disable behavior (no enable/disable persistence at all this slice).
- No Meet workflow changes; no unrelated visual redesign inside Meet.
- Preserve create/open/delete behavior.

## Tests

- Hub renders "Workspace"/module language (not "Tournament dashboard"/"New event").
- Hub rows show module chips derived from `kind` (meet → Meet+Display; bracket → Bracket+Display-soon).
- `modulesForWorkspace` statuses + enablement copy exact (verbatim strings).
- Create templates map to the correct backend `kind`; "Create workspace" button present.
- Disabled/coming-soon modules use enablement language, not "wrong workspace" language.
- Opening a meet workspace routes to `/setup`; bracket → `/bracket-setup`.
- `DisplayProduct` fullscreen opens `/display?id=${id}`; Configure navigates to `/tournaments/:id/setup?section=display`.
- `ModuleDock` disabled items show `note` and aren't clickable; clicking the active module is a no-op (keep the guard).
- Run focused Hub/module tests, full Vitest, and frontend build before committing.

## Acceptance criteria

1. The product story reads: Workspace = control plane; Meet/Bracket/Display = modules enabled inside it.
2. `/` is a module-aware Workspace Hub; rows show module chips.
3. Create flow is template/module based ("New workspace" → templates → "Create workspace") mapping to existing `kind`.
4. All user-facing copy + symbols + docs use module language; enablement copy (not "wrong workspace").
5. Routes preserved; Meet untouched; tsc + full suite + build green.

## Deferred

- Backend `modules[]` persistence + enable/disable; Hybrid/Blank templates; `app/suite`; backend Phase-6 module migration (its own spec, parked on a test-isolation bug).
