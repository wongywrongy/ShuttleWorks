# SP-B1 — Module-driven chrome — design

**Date:** 2026-06-24
**Status:** accepted (pending user spec review)
**Branch:** `dev/workspace-suite`
**Program:** "Control Plane First" → expanded SP-B (real multi-module workspaces).
SP-B1 is the **structural keystone**: make the workspace chrome key off *which
modules are enabled* instead of the single `kind`. Unlocks SP-B2 (foreign-operator
enablement) and SP-B3 (Bracket Display). Mostly frontend; one tiny store slice.

## Goal

Today the entire `/tournaments/:id/*` surface is driven by one `activeTournamentKind`:
`TabBar` renders `kind === 'bracket' ? BRACKET_TABS : MEET_TABS`; `normalizeActiveTab`
snaps any "wrong-kind" tab to that kind's home; the meet-only polling hooks gate on
`kind !== 'bracket'`. That hard-codes one workspace = one module and makes a
multi-module workspace impossible to navigate.

SP-B1 replaces the **single-kind** driver with the **active module** (which the
shell already derives as `moduleForTab(activeTab)`) and makes tab validity key off
the **set of enabled modules**. The Module Dock is already the module switcher and
`tv` (Display) is already *excluded* from the meet tab strip — so the app already
separates "switch module (dock)" from "operate within a module (TabBar)". This
change finishes that separation.

**The hard guarantee:** every existing **single-module** Meet and Bracket workspace
is byte- and behavior-identical — same tabs, same disabled prerequisites, same
routes, same polling. Multi-module behavior only *appears* once two modules are
enabled, which no current path produces (SP-B2 adds it). So SP-B1 ships and is
verified as pure groundwork.

## Decisions locked in brainstorming

- **Presentation:** TabBar shows the **active module's** operator tabs; the **Module
  Dock** switches the active module. (Not: concatenate all enabled modules' tabs
  into one strip.)
- **Scope:** SP-B1 also folds in the original bounded SP-B pieces — `defaultTabForModule`
  module-keyed, `primaryModuleForOpen`, and the disabled-module unavailable guard.
- **"Meet untouched" is deliberately relaxed here** (the rework touches `TabBar` /
  `normalizeActiveTab` / `TournamentPage` / `AppShell`, which are Meet's chrome) —
  so SP-B1 carries heavy regression coverage proving single-module parity.
- **Deferred to a fast-follow (NOT SP-B1):** the hybrid workspace *identity/label*
  (the kind badge, "DELETE MEET vs TOURNAMENT" copy) — cosmetic, already a known
  separate concern.

## The model

The workspace's **valid-tab universe** is the union of the tab groups of its
**enabled** modules:

- `meet` enabled → `MEET_OPERATOR_TAB_IDS` (`setup, roster, matches, schedule, live`)
- `bracket` enabled → `BRACKET_TAB_IDS` (`bracket-setup, bracket-roster, bracket-events,
  bracket-draw, bracket-schedule, bracket-live`)
- `display` enabled → `[]` (Display is a single surface reached via the dock / the
  `tv` route — no operator tab strip, exactly as today)

The **active module** = `moduleForTab(activeTab)` (existing helper: `tv → display`,
`bracket-* → bracket`, meet operator tabs → `meet`, else kind fallback). The TabBar
renders `tabsForModule(activeModule)`.

## Changes (in dependency order)

### 1. `src/lib/bracketTabs.ts` — pure helpers (new)

```ts
import type { ModuleId } from '../platform/product-shell/types';

/** The operator tab-id group for a module. Display has no operator strip
 *  (single surface via the dock / tv route), so it returns []. */
export function tabIdsForModule(module: ModuleId): readonly AppTab[] {
  if (module === 'bracket') return BRACKET_TAB_IDS;
  if (module === 'display') return [];
  return MEET_OPERATOR_TAB_IDS; // meet
}

/** The `{id,label}` rows the TabBar renders for a module. */
export function tabsForModule(module: ModuleId): { id: AppTab; label: string }[];

/** The union of valid tab ids across a set of enabled modules — the
 *  workspace's full valid-tab universe (drives normalizeActiveTab). */
export function validTabIdsForModules(enabled: readonly ModuleId[]): Set<AppTab>;
```

`tabsForModule('meet')` returns the exact rows TabBar's current `MEET_TABS` builds
(`MEET_OPERATOR_TAB_IDS` + `MEET_TAB_LABELS`); `tabsForModule('bracket')` returns the
current `BRACKET_TABS`. (The label maps move next to these helpers so the tab-id +
label source stays single-sourced.)

### 2. `normalizeActiveTab` — snap by enabled modules, not kind

```ts
/** Snap activeTab to a valid tab when it isn't valid for the workspace's
 *  ENABLED modules. Returns null when no change is needed.
 *  - enabled empty / null → caller is still loading; fall back to the
 *    kind-keyed behavior (unchanged) so single-module load is identical.
 *  - tab valid for some enabled module → null (keep).
 *  - else → the PRIMARY enabled module's home tab (defaultTabForModule). */
export function normalizeActiveTabForModules(
  activeTab: AppTab,
  enabled: readonly ModuleId[],
): AppTab | null;
```

The existing kind-keyed `normalizeActiveTab(activeTab, kind)` is **retained** and
used as the load-time fallback (kind known before modules load). For a single-module
workspace the two are equivalent (the one enabled operator's tabs == the kind's
tabs), so behavior is identical; the module-keyed version only diverges once two
modules are enabled.

### 3. `uiStore` — publish the enabled-module set

Add one slice (mirroring the existing `disruptionSummary` publish pattern — the
shared TabBar/TournamentPage read product data from the store, not props):

```ts
activeWorkspaceModuleIds: ModuleId[] | null;   // null while loading/unknown
setActiveWorkspaceModuleIds: (ids: ModuleId[] | null) => void;
```

Reset to `null` on unmount (like `setActiveTournamentId(null)`).

### 4. `AppShell.tsx` — publish modules + gate polling by enablement

- It already calls `useWorkspaceModules(tid)`. Publish the **enabled** module ids
  to the store in an effect: `setActiveWorkspaceModuleIds(realModules ? enabledIds : null)`.
- The dock nav already calls `defaultTabForModule` — drop the `kind` arg (see §6).
- Meet-only polling hooks (`MeetOnlyPollingHooks`) gate on **meet being enabled**
  instead of `kind !== 'bracket'`:
  `const meetEnabled = (modules ?? modulesForWorkspace(kind)).some(m => m.id === 'meet' && m.status === 'enabled')`.
  Single-kind meet → meet enabled → runs (identical); bracket-only → meet not
  enabled → off (identical); hybrid → meet enabled → runs (new, correct).
- **Unavailable guard:** compute the active module's status from `modules`; if the
  active module is **not enterable** (`disabled` / `coming-soon`), render a minimal
  `ModuleUnavailablePanel` instead of `<ModuleOutlet/>`. Resilient: unknown status
  or modules still loading → render the outlet (the kind fallback always has the
  active operator enabled, so no false guard during load).

### 5. `TabBar.tsx` — render the active module's tabs

- `const activeModule = moduleForTab(activeTab, activeTournamentKind);`
- `const tabs = tabsForModule(activeModule);`
- Disabled-prerequisite logic keys off `activeModule` instead of `kind`:
  - `activeModule === 'bracket'` → the `bracketDataReady` gating (draw/schedule/live)
  - `activeModule === 'meet'` → the players/matches gating (matches/schedule/live)
  - `disabledTabTitle` takes `activeModule`.
- For a single-module workspace `activeModule` is always that workspace's one
  operator module → identical tab strip + disabled rules as today.

### 6. `defaultTabForModule(module)` + `primaryModuleForOpen` (moduleModel.ts)

- `defaultTabForModule(module): string` — drop `kind`; module-keyed: `meet→setup`,
  `bracket→bracket-setup`, `display→tv`. Update the one `AppShell` dock-nav caller.
- `primaryModuleForOpen(modules: WorkspaceModule[]): ModuleId` — precedence
  `meet → bracket → display`: first **enabled**, else first **available**, else first
  present, else `meet`. Hub `openTournament` uses it (reading `tournament.modules`
  via `modulesFromDto`, else `modulesForWorkspace(kind)`) instead of
  `kind === 'bracket' ? 'bracket-setup' : 'setup'`. Behavior-neutral for single-kind.

### 7. `TournamentPage.tsx` — drive normalize by enabled modules

- Keep the URL-segment → `activeTab` sync and the optimistic-kind set (kind is still
  the identity + the load-time fallback).
- The normalize effect reads `activeWorkspaceModuleIds` from the store: when present,
  use `normalizeActiveTabForModules(activeTab, ids)`; when null (still loading), fall
  back to the existing `normalizeActiveTab(activeTab, kind)`. Deps include the slice
  so it re-runs when modules resolve. Net effect for single-module: identical.

### 8. `ModuleUnavailablePanel` (new component)

Minimal, design-system styled. Props: `module: ModuleId`, `status: ModuleStatus`,
`primaryLabel`, `onGoToPrimary`, `onOpenSettings?`. Renders the module note (from
`moduleModel`), a "Go to {primaryLabel}" button, and — **only when `status==='disabled'`**
— an "Open Settings" link to `/tournaments/:id/settings`. `data-testid="module-unavailable"`.

## Out of scope (SP-B1)

- Making any foreign operator actually enableable (SP-B2 — backend derivation +
  transition rules). SP-B1 only makes a multi-module workspace *navigable* if one
  existed.
- Bracket Display surface/data (SP-B3).
- Hybrid identity/label/badge + delete-copy (deferred fast-follow).
- Concatenated multi-module tab strips (rejected — dock switches modules).

## Constraints

- No backend / route-path changes. `kind` preserved (identity + load-time fallback).
- **Single-module Meet and Bracket workspaces must be byte/behavior-identical** —
  this is the acceptance bar, proven by tests asserting the same tab ids, disabled
  states, and routes as before.
- Existing design tokens; no new colors.
- Gate (from `products/scheduler/frontend`): `npx tsc -b` clean, `npx vitest run`
  green (current 244 + new), `npm run build` clean. Executed **controller-side**
  (frontend subagents time out on the long vitest collect in this env).

## Tests

- **`bracketTabs`** (unit): `tabIdsForModule` / `tabsForModule` per module (incl.
  `display → []`); `validTabIdsForModules` union for `[meet]`, `[bracket]`,
  `[meet,bracket]`; `normalizeActiveTabForModules` — keep when valid, snap to primary
  home when the active tab's module isn't enabled (single-module == old behavior;
  multi-module keeps cross-module tabs).
- **`moduleModel`** (unit): `defaultTabForModule` module-keyed (3 cases — update the
  existing wrong-kind assertions); `primaryModuleForOpen` (enabled precedence,
  available fallback, hybrid→meet, bracket-only→bracket, blank→meet).
- **`TabBar`** (component): given `activeTab` in each module, renders that module's
  tabs; **single-module meet/bracket render the same tab ids + disabled rules as the
  current tests** (regression parity); a multi-module fixture (meet+bracket enabled,
  active tab switches) swaps the strip.
- **Hub** (component): `openTournament` routes by `primaryModuleForOpen(modules[])`
  (meet→setup, bracket→bracket-setup); kind fallback when no `modules[]`.
- **`ModuleUnavailablePanel`** (component): renders the note + Go-to-primary; shows
  Open-Settings only when `disabled`.
- Existing `TabBar` / `moduleModel` / `ModuleDock` / Hub tests stay green (updated
  only where the signature changed).

## Acceptance criteria

1. TabBar renders the **active module's** tabs (via `tabsForModule`), and the Module
   Dock switches the active module; single-module Meet and Bracket workspaces are
   byte/behavior-identical to before (tabs, disabled prerequisites, routes, polling).
2. `normalizeActiveTab` validity keys off **enabled modules** (with the kind-keyed
   path as the load-time fallback); a multi-module workspace keeps each enabled
   module's tabs reachable instead of snapping them away.
3. `defaultTabForModule` is module-keyed; Hub Open routes via `primaryModuleForOpen`;
   both behavior-neutral for single-kind.
4. A non-enterable active module renders `ModuleUnavailablePanel` (Go-to-primary, and
   Open-Settings when disabled) instead of the module pane; no false guard during load.
5. `tsc -b` + full `vitest run` + `build` green; no backend/route changes; `kind`
   preserved.
