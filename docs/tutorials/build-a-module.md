# Tutorial: build a module

A guided, build-it-together walkthrough that teaches the four-module architecture
by adding a fifth section to the workspace. We will stand up a small fictional
module called **Standings** — a read-only board that ranks teams from live match
results — and wire it the same way Meet, Bracket, and Display are wired. The
payoff at the end is a green module-contract test: the moment the architecture
itself agrees your module is a first-class citizen.

This page is for a developer who has skimmed the [System overview](/architecture/system-overview)
and wants the model to *click* by doing. It is the narrative twin of
[How to add a module](/how-to/add-a-module) — that page is these same eight steps
as a one-screen checklist. Keep it open beside you as the map; build along here.

::: info What you need
- The app running locally ([Running locally](/getting-started/running-locally)).
- The frontend test runner: `cd products/scheduler/frontend && npx vitest run`.
- Roughly an hour. Every edit below is small; the lesson is in *why* each one is needed.
:::

## What "a module" actually is

A module is **not** an object you instantiate or a plugin you register. It is a
set of *honest declarations spread across a handful of files*, plus one React
product component. Nothing wires itself; you wire it by hand at each seam. The
module-contract test (`platform/contracts/__tests__/moduleContract.test.ts`)
holds those declarations against the real running app, so a module only truly
"exists" once every declaration agrees with every other. The eight steps below
*are* those declarations, in dependency order.

Every module also shares one anatomy: **intake → engine → emit** (config/roster
in, the solve or run in the middle, results out). Standings is *output-shaped* —
it has no engine of its own. Its intake is a Configuration surface (pick the
ranking rule); its emit is the board. That makes it the close cousin of
[Display](/modules/display), which is the simplest existing module to mirror.

Two tools will drive us, and noticing *which one* catches each mistake is half
the lesson:

| Tool | Catches | Why |
| --- | --- | --- |
| `npx tsc -b` | type-level gaps | exhaustive `Record<ModuleId, …>` maps demand an entry the moment you name a new module |
| `npx vitest run src/platform/contracts` | dishonest declarations | the contract test compares your declarations to the real nav, real API client, and real seam set |

Vitest does **not** type-check (esbuild just transpiles), so type-only edits never
show up as a test failure — they show up under `tsc`. Keep that split in mind and
"follow red to green" becomes literally true at every milestone.

## Milestone 1 · Name it

`ModuleId` is the compile-time union every other surface keys off. It is pure
vocabulary — naming `standings` here wires nothing, it only grants you permission
to refer to the module everywhere else.

```ts
// products/scheduler/frontend/src/platform/product-shell/types.ts
export type ModuleId = 'meet' | 'bracket' | 'display' | 'standings';
```

::: warning Operations is NOT a `ModuleId`
Operations is a **Tier-2 architectural module** — always-on, no enable flag, no
`workspace_modules` row. It lives in `ArchModuleId = ModuleId | 'operations'`, not
in `ModuleId`. You are adding a *user-enableable* module, so `ModuleId` is right.
:::

Now run the compiler — it hands you your next chore:

```bash
cd products/scheduler/frontend && npx tsc -b
# error: 'MODULE_LABELS' … Property 'standings' is missing
```

`MODULE_LABELS` in `platform/domain/moduleModel.ts` is a `Record<ModuleId, string>`.
The instant `standings` joined the union, that exhaustive map became incomplete.
That is the type system acting as your checklist. While you are in that file, add
the module to `MODULE_ORDER` too — that array is the dock's source list, and a
module missing from it is filtered out before it ever reaches the sidebar (see
`modulesFromDto`, which does `MODULE_ORDER.filter(...)`).

```ts
// platform/domain/moduleModel.ts
const MODULE_ORDER: ModuleId[] = ['meet', 'bracket', 'display', 'standings'];
const MODULE_LABELS: Record<ModuleId, string> = {
  meet: 'Meet',
  bracket: 'Bracket',
  display: 'Display',
  standings: 'Standings',
};
```

**Checkpoint.** Start the dev server (`npm run dev`) and open a workspace. The
sidebar looks *exactly the same* — no Standings anywhere. That is correct: you
have given the module a name, but a name is inert. Nothing reads it yet.

## Milestone 2 · Tell the backend

The backend is the source of truth for *which modules a workspace has*. Add the id
to `MODULE_IDS` and decide its lazy-seed default in `derive_modules`.

```python
# products/scheduler/backend/database/models.py
MODULE_IDS = ("meet", "bracket", "display", "standings")   # ~line 619

def derive_modules(kind):                                   # ~line 633
    if kind == "bracket":
        return {"bracket": "enabled", "display": "available",
                "meet": "available", "standings": "available"}
    return {"meet": "enabled", "display": "available",
            "bracket": "available", "standings": "available"}
```

`standings` seeds as `available` (installed but off) for both kinds — it is not an
engine, so leave `OPERATIONAL_MODULES = ("meet", "bracket")` alone. Module rows are
seeded **lazily** from `kind` the first time any module path is touched, so create
a **fresh** workspace after this edit; existing workspaces already have their three
rows and will not gain a fourth.

**Checkpoint.** The UI is still blank — but the backend now knows the module
exists. Prove it with the same endpoint [How to enable a module](/how-to/enable-a-module)
documents:

```bash
curl http://localhost:8600/tournaments/$TID/modules
# → the fresh workspace now lists a "standings" row at status "available"
```

Why nothing in the sidebar yet? Two reasons, and naming them is the whole point:
the sidebar renders **only enabled** modules (`WorkspaceSidebar` filters on
`status === 'enabled'`), and even an enabled module needs a nav section — which
does not exist yet.

## Milestone 3 · Give it surfaces

Every sidebar destination is an `AppTab` literal — the value of `uiStore.activeTab`
and the URL segment. Add one per surface your module owns: intake and emit.

```ts
// products/scheduler/frontend/src/store/uiStore.ts  (the AppTab union, ~line 19)
export type AppTab =
  | /* …existing… */
  | 'standings-setup'    // intake — Configuration
  | 'standings-board';   // emit   — the board itself
```

**Checkpoint.** Still nothing. `AppTab` literals are route keys; nothing references
them yet. Like `ModuleId` in Milestone 1, they are vocabulary waiting to be used —
the next two milestones use them.

## Milestone 4 · Give it a section — and watch it appear

`buildWorkspaceNav` (`platform/product-shell/workspaceNav.ts:71`) renders one section per
enabled module. Push yours, ordered **intake → emit**.

```ts
// platform/product-shell/workspaceNav.ts — inside buildWorkspaceNav
if (enabled.has('standings')) {
  sections.push({
    id: 'standings',                // MUST equal the ModuleId — the test asserts it
    label: 'Standings',
    role: 'output',                 // 'engine' | 'shared' | 'output'
    items: [
      { segment: 'standings-setup', label: 'Configuration' },
      { segment: 'standings-board', label: 'Board' },
    ],
  });
}
```

Now flip the module on for your workspace. The Modules admin page is keyed by its
own catalog (which we are intentionally leaving alone), so enable it directly
through the control-plane endpoint:

```bash
curl -X PATCH http://localhost:8600/tournaments/$TID/modules/standings \
  -H 'Content-Type: application/json' -d '{"status":"enabled"}'
# available → enabled is an allowed transition; standings is neither display
# nor operational, so no dependency guard fires.
```

**Checkpoint — the arc turns.** Reload the workspace. A **Standings** section now
appears in the sidebar, with an *Output* role badge, holding *Configuration* and
*Board*. Click **Board**… and the content pane is blank. Look closely: the owning
*engine's* product mounted (Meet or Bracket, depending on workspace kind) but it
has **no case** for a `standings-` segment, so it renders nothing. The navigation
is wired; the mount is not. That gap is the next two milestones.

## Milestone 5 · Build the product component

Add `products/standings/StandingsProduct.tsx`. It reads `activeTab` and renders the
surface that owns it — exactly the shape of `products/display/DisplayProduct.tsx`
and `products/meet/MeetProduct.tsx`. Keep intake and emit in their own files so the
anatomy stays legible.

```tsx
// products/scheduler/frontend/src/products/standings/StandingsProduct.tsx
import { lazy, Suspense } from 'react';
import { useUiStore } from '../../store/uiStore';
import { TabSkeleton } from '../../components/TabSkeleton';

const StandingsSetup = lazy(() =>
  import('./StandingsSetup').then((m) => ({ default: m.StandingsSetup })));
const StandingsBoard = lazy(() =>
  import('./StandingsBoard').then((m) => ({ default: m.StandingsBoard })));

/** Standings product mode: the active standings surface. Output-shaped —
 *  Configuration (intake) and the Board (emit), no engine in between. */
export function StandingsProduct() {
  const activeTab = useUiStore((s) => s.activeTab);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Suspense fallback={<TabSkeleton tab={activeTab} />}>
        {activeTab === 'standings-setup' ? <StandingsSetup /> : null}
        {activeTab === 'standings-board' ? <StandingsBoard /> : null}
      </Suspense>
    </div>
  );
}
```

(`StandingsBoard` would read live results — `apiClient.getMatchStates` — and rank
them; `StandingsSetup` would pick the ranking rule. The exact UI is yours; the
*wiring* is what this tutorial is teaching.)

**Checkpoint.** The component exists, but nothing imports it. The Board is still
blank — a built-but-unmounted surface. One more milestone connects it.

## Milestone 6 · Mount it

`ModuleOutlet` (`app/workspace/ModuleOutlet.tsx:22`) is the single mount point: it
calls `moduleForTab(activeTab, kind)` and renders the owning product. Two small
edits route your segments to your product.

```ts
// platform/domain/moduleModel.ts — inside moduleForTab(), beside the bracket- check
if (tab.startsWith('standings-')) return 'standings';
```

```tsx
// app/workspace/ModuleOutlet.tsx
import { StandingsProduct } from '../../products/standings/StandingsProduct';
// …
if (module === 'standings') return <StandingsProduct />;
```

**Checkpoint — the chain is whole.** Click **Standings → Board** and your board
renders. Trace what just happened, because this is the four-module model in one
breath: *enabled module* → *sidebar section* (`buildWorkspaceNav`) → click sets
`activeTab` → `ModuleOutlet` → `moduleForTab` → `StandingsProduct`. The surface is
live. But is Standings an *honest member of the architecture*? Not yet — nothing
asserts what it owns, and the contract test does not know it exists.

## Milestone 7 · Declare the contract — honestly

This is the honesty layer, and the climax of the build. Add a `standingsContract`
to `platform/contracts/moduleContract.ts`, mirroring `displayContract` — the
read-only output shape: it owns no backend route, consumes live match-state, and
reacts to the existing `matchStateChanged` edge.

```ts
// platform/contracts/moduleContract.ts
export const standingsContract: ModuleContract = {
  id: 'standings',
  enableable: true,
  ownedSegments: ['standings-setup', 'standings-board'], // must match Milestone 4 EXACTLY
  ownedEndpoints: [],                                     // owns no route — pure read
  consumedEndpoints: [apiClient.getMatchStates],          // Operations owns it; we read it
  produces: [],
  consumes: ['MatchStateDTO'],
  emits: [],
  reactsTo: ['matchStateChanged'],                        // only EXISTING SeamEdge names
};

// append it to the registry, last
export const moduleContracts: readonly ModuleContract[] = [
  meetContract, bracketContract, operationsContract, displayContract, standingsContract,
];
```

Now the subtle part — and the part the terse how-to leaves for you to discover.
The contract test pins the **canonical roster** of modules in several places. This
is deliberate: you cannot grow the architecture *quietly*. To welcome a new module
you must update the test's notion of "all the modules that exist today" — and that
edit *is* the honesty invariant doing its job. The compiler and the test will point
you at each spot.

```ts
// platform/contracts/__tests__/moduleContract.test.ts

// 1. tsc-forced: this Record<ArchModuleId, …> now demands a 'standings' key.
const CONTRACT_BY_ID: Record<ArchModuleId, ModuleContract> = {
  meet: meetContract, bracket: bracketContract, operations: operationsContract,
  display: displayContract, standings: standingsContract,
};

// 2. the ground-truth enabled set the nav is checked against.
const ALL_MODULES: Set<ModuleId> = new Set(['meet', 'bracket', 'display', 'standings']);

// 3. the descriptor-set baseline (operations stays 3rd — match the existing order).
expect(moduleContracts.map((c) => c.id)).toEqual(
  ['meet', 'bracket', 'operations', 'display', 'standings'],
);

// 4. the section-id baseline the nav must render.
expect([...sectionSegments.keys()].sort()).toEqual(
  ['bracket', 'display', 'meet', 'operations', 'standings'].sort(),
);
```

::: tip Why a hardcoded roster is a feature, not a chore
The test could have derived the roster automatically. It does not — on purpose. A
hand-edited baseline is a tripwire: a module cannot slip into the architecture
without a human consciously updating the list of what is real. That is the same
philosophy as the contract file itself, whose doc-comment opens with *"Honesty is
the invariant."*
:::

## The payoff

Run the finish-line test:

```bash
cd products/scheduler/frontend
npx vitest run src/platform/contracts
# ✓ moduleContract — descriptor set
# ✓ moduleContract — ownedSegments match buildWorkspaceNav
# ✓ moduleContract — endpoints are real apiClient methods (by reference)
# ✓ moduleContract — named seam edges are honest
```

**Green. Congratulations — you built a module.** That passing suite is not a
formality; it is the architecture certifying four real facts about Standings:

- Its `ownedSegments` are the *actual* destinations `buildWorkspaceNav` renders —
  ownership checked against the running IA, not a comment.
- Its `consumedEndpoints` are the *same function references* the API client
  exposes (`apiClient.getMatchStates`), checked by identity, never by string.
- Its `reactsTo` names a real seam edge from the honest set — you cannot claim a
  cross-module wire that does not exist.
- No two modules claim to *own* the same endpoint.

Finish with a type sweep to confirm the union edits are clean everywhere:

```bash
npx tsc -b   # MODULE_LABELS, CONTRACT_BY_ID, every Record<ModuleId> — all satisfied
```

Standings now appears in the sidebar when enabled, mounts its own surfaces, and is
an honest member of the model — five sidebar sections now, four user-enableable
modules plus the always-on Operations layer.

## What you wired, in one table

Each milestone added one declaration at one seam. This is the whole map:

| File | You declared | Caught by |
| --- | --- | --- |
| `platform/product-shell/types.ts` | the `ModuleId` name | `tsc` (via `MODULE_LABELS`) |
| `platform/domain/moduleModel.ts` | dock label + order, `moduleForTab` route | `tsc` + the blank board |
| `backend/database/models.py` | `MODULE_IDS`, `derive_modules` seed | the seeded `available` row |
| `store/uiStore.ts` | the `AppTab` surface segments | (inert until referenced) |
| `platform/product-shell/workspaceNav.ts` | the sidebar section | the appearing section |
| `products/standings/StandingsProduct.tsx` | the product component | the rendering board |
| `app/workspace/ModuleOutlet.tsx` | the mount branch | the rendering board |
| `platform/contracts/moduleContract.ts` (+ its test) | the honest contract + roster | the green contract test |

Two ideas carry across all of them: a **name is just vocabulary** until something
references it, and the **contract test is the finish line** that proves every
reference agrees. If your module needs its own backend routes or a brand-new
cross-module edge, those are deliberate, separate changes — see the how-tos below.

## See also

- [How to add a module](/how-to/add-a-module) — the same eight steps as a terse checklist
- [How to add a surface](/how-to/add-a-surface) — a single new segment on an existing module
- [How to enable a module](/how-to/enable-a-module) · [How to add an API endpoint](/how-to/add-an-api-endpoint) · [How to wire a seam](/how-to/wire-a-seam)
- [System overview](/architecture/system-overview) · [Module contracts](/contracts/) · [Display module](/modules/display)
- [ADR 0001 — Four-module split](/decisions/0001-four-module-split)
