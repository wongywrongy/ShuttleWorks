# How to add a module

**Goal:** stand up a new enableable module — its own section in the workspace
sidebar, its own surfaces, and an honest entry in the test-enforced module
contract — wired the same way Meet, Bracket, and Display are.

This is the longest of the how-to guides because a module touches the most
seams. Every other "add a …" guide ([a surface](/how-to/add-a-surface),
[an endpoint](/how-to/add-an-api-endpoint), [a seam](/how-to/wire-a-seam)) is a
subset of the steps below.

::: info Requirements
- You can run the app locally ([Quickstart](/getting-started/quickstart)) and
  the frontend test suite (`cd products/scheduler/frontend && npx vitest run`).
- You've read [System overview](/architecture/system-overview) for the
  four-module model and [Module contracts](/contracts/) for what a contract is.
- You have a module **id** in mind. This guide adds a fictional `scoreboard`
  module; substitute your own throughout.
:::

## What a module is, in code

A module is not a registry object you instantiate — it is a **set of honest
declarations across a handful of files**, plus a React product component. The
module contract test (`platform/contracts/__tests__/moduleContract.test.ts`)
holds those declarations to the real running app, so a module only "exists" once
every declaration agrees. The eight steps below are exactly those declarations,
in dependency order.

A module also shares one anatomy — **intake → engine → emit** (roster/config in,
the solve/run in the middle, matches/results out). Mirror an existing product
folder (`products/meet/`, `products/bracket/`) when you lay yours out.

## 1 · Add the module id

`ModuleId` is the compile-time union every other surface keys off. Add yours.

```ts
// products/scheduler/frontend/src/platform/product-shell/types.ts
export type ModuleId = 'meet' | 'bracket' | 'display' | 'scoreboard';
```

::: warning Operations is NOT a `ModuleId`
Operations is a **Tier-2 architectural module** with no enable flag — it's
`ArchModuleId = ModuleId | 'operations'` in the contract, and it owns no
`workspace_modules` row. Add a *user-enableable* module to `ModuleId`; only add
to `ArchModuleId` if you're building another always-on layer like Operations.
:::

## 2 · Register it on the backend

The backend is the source of truth for which modules a workspace has. Add the id
to `MODULE_IDS` and decide its lazy-seed default in `derive_modules`.

```python
# products/scheduler/backend/database/models.py
MODULE_IDS = ("meet", "bracket", "display", "scoreboard")   # ~line 619
# OPERATIONAL_MODULES stays ("meet", "bracket") unless your module is an engine.
```

`derive_modules(kind)` (~line 633) seeds a workspace's module rows on first
access. Add your module to the returned status map (`available` unless it should
be on by default). Enablement transitions and their guards (display-dependency,
last-operational, data-loss) live in
[`api/workspace_modules.py`](/how-to/enable-a-module) — you get those for free.

## 3 · Add its surface segments

Every sidebar destination is an `AppTab` literal. Add one per surface your module
owns (intake / engine / emit).

```ts
// products/scheduler/frontend/src/store/uiStore.ts  (the AppTab union, ~line 19)
export type AppTab =
  | /* …existing… */
  | 'scoreboard-setup'    // intake  (Configuration)
  | 'scoreboard-board';   // emit    (the board itself)
```

## 4 · Give it a nav section

`buildWorkspaceNav` (`platform/product-shell/workspaceNav.ts:71`) renders a section per
enabled module. Push yours, ordered **intake → engine → emit** (Configuration
before the output surface).

```ts
// platform/product-shell/workspaceNav.ts — inside buildWorkspaceNav
if (enabled.has('scoreboard')) {
  sections.push({
    id: 'scoreboard',
    label: 'Scoreboard',
    role: 'output',            // 'engine' | 'shared' | 'output'
    items: [
      { segment: 'scoreboard-setup', label: 'Configuration' },
      { segment: 'scoreboard-board', label: 'Board' },
    ],
  });
}
```

The section `id` **must equal** the `ModuleId` — the contract test asserts it.

## 5 · Build the product component

Add `products/scoreboard/ScoreboardProduct.tsx`. It reads `activeTab` and renders
the surface that owns it — copy the shape of `products/meet/MeetProduct.tsx`. Keep
intake/engine/emit in their own subfolders so the anatomy stays legible.

## 6 · Mount it and register it in the dock

Route the active tab to your product, and register the module in
`platform/domain/moduleModel.ts`. `modulesFromDto` filters by `MODULE_ORDER`, so
a module missing from it **never renders in the dock even when the backend says
it's enabled**. `MODULE_LABELS` is a `Record<ModuleId, string>`, so `tsc` forces
you to add the entry the moment `ModuleId` grows — the compiler is your checklist.

```ts
// platform/domain/moduleModel.ts
const MODULE_LABELS: Record<ModuleId, string> = { /* … */ scoreboard: 'Scoreboard' };
const MODULE_ORDER: ModuleId[] = ['meet', 'bracket', 'display', 'scoreboard'];
// moduleForTab(): map your segments → 'scoreboard'

// app/workspace/ModuleOutlet.tsx — add the branch:
if (module === 'scoreboard') return <ScoreboardProduct />;
```

`ModuleOutlet` (`app/workspace/ModuleOutlet.tsx:22`) is the single mount point; it
calls `moduleForTab(activeTab, kind)` and renders the owning product.

## 7 · Declare the contract

This is the honesty layer. Add a `scoreboardContract` to
`platform/contracts/moduleContract.ts` (mirror `displayContract`, lines 236-250),
then add it to the `moduleContracts` array.

```ts
export const scoreboardContract: ModuleContract = {
  id: 'scoreboard',
  enableable: true,
  ownedSegments: ['scoreboard-setup', 'scoreboard-board'], // must match step 4 EXACTLY
  ownedEndpoints: [/* apiClient methods your surfaces own */],
  consumedEndpoints: [apiClient.getMatchStates],           // what you read but don't own
  produces: [],
  consumes: ['MatchStateDTO'],
  emits: [],
  reactsTo: ['matchStateChanged'],                          // only EXISTING SeamEdge names
};
```

Every field is checked: `ownedSegments` against `buildWorkspaceNav`,
`owned/consumedEndpoints` by **referential identity** to real `apiClient` methods
(not strings), and `emits`/`reactsTo` against the honest `SeamEdge` set. See
[How to wire a seam](/how-to/wire-a-seam) if your module needs a new cross-module
edge — that is a deliberate, separate change.

::: warning The test has baselines to update too
The contract test is a deliberate tripwire — adding a module means updating its
own hardcoded baselines: `CONTRACT_BY_ID` (a `Record<ArchModuleId, …>`, so `tsc`
forces it), the `ALL_MODULES` set, and the two `toEqual` expectations (the
`moduleContracts` ids and the nav section-id keys). That's the test demanding you
prove the module is wired everywhere — not a gap to route around.
:::

## 8 · Add endpoints (if any)

If your module needs its own backend routes, follow
[How to add an API endpoint](/how-to/add-an-api-endpoint) for each, then list the
new `apiClient` methods in the contract's `ownedEndpoints` (step 7).

## Verify

```bash
cd products/scheduler/frontend
npx vitest run src/platform/contracts        # the contract test must pass
npx tsc -b                                    # the AppTab/ModuleId unions must type-check
```

A green contract test means every declaration agrees with the running app — your
module now appears in the sidebar when enabled, mounts its surfaces, and is an
honest member of the architecture. Enable it on a workspace via
[How to enable a module](/how-to/enable-a-module).

## See also

- [How to add a surface](/how-to/add-a-surface) — a single new segment on an existing module
- [How to wire a seam](/how-to/wire-a-seam) — a typed cross-module edge
- [Module contracts](/contracts/) · [System overview](/architecture/system-overview)
- [ADR 0001 — Four-module split](/decisions/0001-four-module-split)
