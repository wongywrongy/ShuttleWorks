> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Workspace Suite — Phase 4: Workspace Shell + Product Modes — design

**Date:** 2026-06-23
**Status:** design / pending user review
**Branch:** `dev/workspace-suite` (stacking on Phase 1)
**Parent spec:** `docs/superpowers/specs/2026-06-23-workspace-suite-architecture-design.md`
**Builds on:** Phase 1 (`docs/superpowers/plans/2026-06-23-workspace-suite-phase-1.md`) — glossary, ownership maps, import-boundary rules, and the `platform/domain/workspace.ts` vocabulary facade.

## Goal

Introduce the **Workspace Shell** and **product-mode** structure from the parent
spec, as the real app-based separation foundation — not just chrome. An open
workspace gains a stable shell (identity, status, connection, product switcher)
and routes into product modules (Meet / Bracket / Display) that live as their own
modules. Existing routes, the single-kind data model, and all Meet/Bracket/solver
behavior keep working.

## Scope decisions (resolved 2026-06-23)

- **Approach C** (of A/B/C): extract reusable shell primitives + the deeper
  reframe, to set the long-term app-based structure.
- **Switcher model: all three products, forward-looking.** The switcher always
  shows Meet · Bracket · Display. The operator product that does not match this
  workspace's `kind` is shown **disabled with an explanation**; Display is
  available only for meet workspaces (bracket has no public display yet — disabled
  with a parity reason). This teaches the suite model and pre-stages the future
  multi-product workspace.
- **Active product derived from route** (no new URL scheme — honors parent-spec
  Open Decision 2). Meet operator tabs → Meet; `tv` → Display; `bracket-*` →
  Bracket. Selecting a product navigates to that product's default existing route.
- **Move scope this phase: boundaries + the two safe relocations.** Stand up the
  full `app/` + `products/` + `platform/product-shell/` skeleton and Workspace
  Shell; relocate the lowest-risk surfaces into their modules now — dashboard →
  `products/hub`, public display → `products/display` (the parent spec's Phase-5
  migration order: Hub first, Display second). Meet and Bracket get thin
  product-entry wrappers; their feature code stays in `features/*` and moves in a
  later phase (Meet last, per the parent spec).
- **The meet `tv` tab leaves the TabBar** and becomes the Display product mode.
  Route `/tournaments/:id/tv` is preserved and resolves into Display mode.

## Non-Goals

- No data-model change. A workspace stays single-kind (meet **or** bracket); the
  multi-product workspace is a later phase.
- No new URL scheme (`/tournaments/:id/meet` etc.). Existing `/tournaments/*`,
  `/display`, `/login`, `/invite/:token` routes preserved.
- No backend, DB, DTO, or solver changes (one frontend-only addition: caching the
  already-fetched tournament `status` in the UI store).
- No Meet feature-code relocation (only the meet `tv` tab's *placement* changes).
- No Bracket public-display implementation (placeholder + tracked follow-up).
- No design-token changes; reuse `@scheduler/design-system` primitives.

## Target structure (near-term layout, additive + 2 moves)

```
products/scheduler/frontend/src/
  app/
    suite/        ← app-level routing: Hub vs open-Workspace (refactor of App.tsx route tree)
    workspace/    ← workspace product-routing: derive active product from route, product outlet
  products/
    hub/          ← MOVED: dashboard (was pages/TournamentListPage.tsx)
    meet/         ← MeetProduct entry (thin: mounts existing meet tabs+content)
    bracket/      ← BracketProduct entry (thin: mounts existing BracketTab)
    display/      ← MOVED: public display (was pages/PublicDisplayPage.tsx) + DisplayProduct entry
  platform/
    product-shell/  ← WorkspaceShell, ProductSwitcher, WorkspaceIdentityBar (presentational)
    domain/         ← workspace.ts (Phase 1) + product/identity model + useWorkspaceIdentity
```

`AppShell.tsx` remains the HUD-anchored host (SolverHud, ToastStack, UnsavedBanner,
UnlockModalHost stay put). Its body is reorganized: it renders `WorkspaceShell`
(identity bar + switcher) wrapping a **product outlet** that mounts the active
`products/*` module. The product-routing logic (active-product derivation, outlet)
lives in `app/workspace/`.

## Components & interfaces

### `platform/product-shell/` (presentational, pure → unit-testable)

```ts
export type ProductId = 'meet' | 'bracket' | 'display';

export interface ProductSwitcherItem {
  id: ProductId;
  label: string;
  available: boolean;
  disabledReason?: string;   // shown as tooltip/hint when !available
}

export interface WorkspaceIdentity {
  name: string | null;
  date: string | null;            // ISO date string
  status: 'draft' | 'active' | 'archived' | null;
  kind: 'meet' | 'bracket' | null;
}

// WorkspaceShell — the frame
interface WorkspaceShellProps {
  identity: WorkspaceIdentity;
  products: ProductSwitcherItem[];
  activeProduct: ProductId;
  onSelectProduct: (id: ProductId) => void;
  onBackToHub: () => void;
  statusSlot?: React.ReactNode;   // health chip (AppStatusPopover) lives here
  children: React.ReactNode;      // the active product module
}

// ProductSwitcher — segmented control; disabled items render disabledReason
interface ProductSwitcherProps {
  products: ProductSwitcherItem[];
  active: ProductId;
  onSelect: (id: ProductId) => void;
}

// WorkspaceIdentityBar — back-to-Hub + name · date · status badge (StatusPill)
interface WorkspaceIdentityBarProps {
  identity: WorkspaceIdentity;
  onBackToHub: () => void;
  statusSlot?: React.ReactNode;
}
```

### `platform/domain/` — product model + identity hook

```ts
// productModel.ts — pure helpers (exhaustively unit-tested)
function productForTab(tab: string, kind: WorkspaceIdentity['kind']): ProductId;
//   meet tabs (setup|roster|matches|schedule|live) → 'meet'
//   'tv' → 'display'
//   bracket-* → 'bracket'
//   fallback by kind: bracket → 'bracket', else 'meet'

function defaultTabForProduct(product: ProductId, kind: WorkspaceIdentity['kind']): string;
//   meet → 'setup'; bracket → 'bracket-setup'; display → 'tv' (meet only)

function productsForWorkspace(kind: WorkspaceIdentity['kind']): ProductSwitcherItem[];
//   meet:    Meet(available), Bracket(disabled: "This workspace is a meet — brackets live in their own workspace."), Display(available)
//   bracket: Meet(disabled: "This workspace is a bracket — meets live in their own workspace."), Bracket(available), Display(disabled: "Public display for brackets is coming.")
//   null (loading): treat as the optimistic kind passed by the caller; never crash

// useWorkspaceIdentity.ts — reads stores, returns WorkspaceIdentity
function useWorkspaceIdentity(): WorkspaceIdentity;
//   name/date ← tournamentStore.config; status/kind ← uiStore
```

### `app/workspace/` — product routing

A host module that: calls `useWorkspaceIdentity()`, computes
`activeProduct = productForTab(activeTab, kind)` and
`products = productsForWorkspace(kind)`, renders `WorkspaceShell` with
`onSelectProduct = (p) => navigate('/tournaments/:id/' + defaultTabForProduct(p, kind))`,
and mounts the matching `products/*` module in the shell's children (the product
outlet). Selecting a disabled product is a no-op (the switcher prevents it).

### `products/*` modules

- `products/meet/MeetProduct.tsx` — thin: the meet tab dispatch (setup/roster/
  matches/schedule/live), extracted from AppShell's meet path. Renders TabBar (now
  meet-operator tabs only) + the active meet tab content. Feature components stay
  in `features/*`.
- `products/bracket/BracketProduct.tsx` — thin: renders `BracketTab` + bracket
  TabBar.
- `products/display/DisplayProduct.tsx` — the elevated Display mode: the live
  public-display surface in-shell with a fullscreen affordance (today's
  `TvPreviewTab` content, made first-class). Wraps the relocated display view.
- `products/hub/` — the relocated dashboard module (was `pages/TournamentListPage.tsx`).

## Wiring changes

- **uiStore**: add `activeTournamentStatus: TournamentStatus | null` +
  `setActiveTournamentStatus`. Cleared on unmount alongside `activeTournamentId`.
- **useTournamentKind**: it already fetches `TournamentSummaryDTO` (which carries
  `status`); set `activeTournamentStatus` from the same response (no new request).
- **TabBar**: remove the back-arrow, wordmark, and the `tv` tab. It keeps the
  product's tab sub-navigation and is rendered by the active operator product
  module. The health chip (`AppStatusPopover`) moves up into the Workspace Shell
  identity bar (`statusSlot`).
- **AppShell**: body reorganized to render `WorkspaceShell` + product outlet;
  HUDs stay anchored around it. Meet/bracket content dispatch moves into
  `MeetProduct`/`BracketProduct`.
- **Routing**: `/tournaments/:id/tv` preserved → Display mode. The Hub move
  updates the `/` route import to `products/hub`; the Display move updates the
  `/display` route import to `products/display`. No route paths change.

## Data flow

```
Route (/tournaments/:id/<tab>)
  → app/workspace host: useWorkspaceIdentity() + productForTab(activeTab, kind)
  → WorkspaceShell (identity bar + ProductSwitcher + statusSlot)
      → product outlet mounts products/{meet|bracket|display}
          → existing features/* content (unchanged) + existing stores/hooks
  HUDs (solver/toast/unsaved/modal) remain anchored in AppShell host
```

No product module imports another product's internals (import-boundary rules from
Phase 1). Shared identity/status flows through `useWorkspaceIdentity` + the store;
the switcher navigates via existing routes only.

## Error / edge handling

- **Kind-resolution flash:** while `kind` is null (summary still loading), the host
  uses the optimistic kind already derived in the URL-sync path (`bracket-` prefix
  → bracket, else meet) so the switcher/identity don't flicker. `productsForWorkspace`
  and `productForTab` must never throw on null kind.
- **Stale tab after kind resolves:** existing `normalizeActiveTab` still runs;
  `productForTab` re-derives the product from the normalized tab.
- **Bracket Display:** Display is disabled in the switcher for bracket workspaces
  (parity reason). `defaultTabForProduct('display','bracket')` is never reached via
  a click; if reached defensively, it returns the bracket default rather than a
  meet route.
- **Missing identity fields:** name/date/status may be null mid-load; the identity
  bar renders graceful fallbacks ("Untitled", "—") and omits the status pill when
  status is null.

## Testing strategy

- **Pure helpers (`productModel`)**: exhaustive case tables — every meet tab, `tv`,
  every bracket tab, null kind; `defaultTabForProduct` for each product/kind;
  `productsForWorkspace` availability + reasons per kind.
- **Presentational components**: `WorkspaceShell`, `ProductSwitcher`,
  `WorkspaceIdentityBar` render tests — correct items/labels, disabled item shows
  its reason and is not clickable, switching an available item fires `onSelect`,
  back fires `onBackToHub`, status pill omitted when status null.
- **`useWorkspaceIdentity` + uiStore status**: unit tests for store field + setter,
  hook returns composed identity.
- **Integration**: render the workspace host for a meet id → switcher shows
  Meet·Bracket(disabled)·Display; selecting Display navigates to `/tournaments/:id/tv`
  (route preserved); render for a bracket id → Bracket active, Meet+Display disabled
  with reasons.
- **Relocations**: each file move (Hub, Display) is its own task; run the full
  frontend suite green immediately before and after the move, and confirm the
  route still resolves to the relocated module.
- **Regression**: `npx tsc -b products/scheduler/frontend` clean and the full
  `npx vitest run` suite green after every task. Pre-existing tests that asserted
  the old TabBar (back-arrow / wordmark / `tv` tab) are updated to the new shell.

## Sequencing (informs the plan; each task independently green)

1. `productModel` pure helpers + tests.
2. uiStore `activeTournamentStatus` + setter; `useTournamentKind` sets it.
3. `useWorkspaceIdentity` hook + tests.
4. `platform/product-shell/` presentational components + tests (no wiring yet).
5. `products/meet`, `products/bracket` thin entry modules (extract dispatch from AppShell).
6. `products/display` DisplayProduct (elevate `tv`); remove `tv` from TabBar; remove back/wordmark from TabBar; preserve `/tv` route.
7. `app/workspace` host + `app/suite` routing: wire WorkspaceShell + switcher + product outlet into AppShell body; move health chip to shell.
8. Relocate dashboard → `products/hub` (move + update `/` import).
9. Relocate public display → `products/display` (move + update `/display` import).
10. Cleanup + final whole-branch review.

The additive shell work (1–7) lands before the two relocations (8–9); each move is
isolated and tested, satisfying the parent spec's "don't combine moves with route/
visual changes" caution at task granularity.

## Acceptance criteria

1. An open workspace shows a Workspace Shell: back-to-Hub, name · date · status
   badge, a product switcher (Meet · Bracket · Display), and the connection/health
   chip — above the product's own tab sub-nav.
2. The switcher shows all three products; the foreign operator product and (for
   bracket) Display are disabled with clear reasons; the applicable ones work.
3. Selecting a product navigates only to existing routes; `/tournaments/:id/tv`
   resolves into Display mode; no route paths were added or removed.
4. Meet and Bracket behavior is unchanged except the `tv` tab's relocation into
   Display. Solver/live/roster/schedule flows untouched.
5. Dashboard and public display now live in `products/hub` and `products/display`;
   `/` and `/display` resolve to them; Meet and Bracket have thin `products/*`
   entry modules.
6. `tsc` clean; full frontend suite green; backend untouched.

## Deferred / tracked follow-ups

- Bracket public-display surface (Display parity for bracket workspaces).
- Multi-product workspace data model (a workspace holding meet **and** bracket).
- Relocating Bracket and Meet feature code into `products/*` (Bracket then Meet,
  in later phases).
- Phase-1's known item: `TournamentListPage.tsx` empty-state copy "open the
  tournament app" (carry into the Hub relocation if convenient).
- Encoding import-boundary rules as lint (Phase-2 enforcement).
