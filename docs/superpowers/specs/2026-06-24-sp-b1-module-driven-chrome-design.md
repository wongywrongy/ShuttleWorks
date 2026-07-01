> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# SP-B1 — Module-driven chrome — design

**Date:** 2026-06-24
**Status:** accepted (refined during planning — simpler than the first cut)
**Branch:** `dev/workspace-suite`
**Program:** "Control Plane First" → expanded SP-B (real multi-module workspaces).
SP-B1 is the **structural keystone**: make the workspace chrome key off *which
modules are enabled* instead of the single `kind`. Unlocks SP-B2 (foreign-operator
enablement) and SP-B3 (Bracket Display). Frontend-only.

## Goal

Today the `/tournaments/:id/*` surface is driven by one `activeTournamentKind`:
`TabBar` renders `kind === 'bracket' ? BRACKET_TABS : MEET_TABS`, and `TournamentPage`
*snaps* any "wrong-kind" tab to that kind's home via `normalizeActiveTab`. That
silent snap is the "misrouting" we're replacing, and it makes a multi-module
workspace impossible to navigate (a bracket tab on a `kind=meet` hybrid gets snapped
straight back to a meet tab).

What the codebase **already** does right (and we keep): `ModuleOutlet` mounts the
product by **`moduleForTab(activeTab)`** — not kind — and `tv` (Display) is already
excluded from the meet tab strip (Display is reached via the dock, not a tab). So
"switch module" (dock / URL) and "operate within a module" (TabBar) are already
separated at the mount layer. SP-B1 finishes the job at the two remaining
kind-locked points.

**The hard guarantee:** every existing **single-module** Meet and Bracket workspace
is byte- and behavior-identical — same tabs, same disabled prerequisites, same
routes, same polling. Multi-module behavior only *appears* once two modules are
enabled, which no current path produces (SP-B2 adds it). SP-B1 ships and is verified
as pure groundwork.

## Decisions locked in brainstorming

- **Presentation:** TabBar shows the **active module's** operator tabs; the **Module
  Dock** switches the active module. (Not: concatenate all modules' tabs.)
- **Non-enterable modules:** an in-shell **unavailable panel**, for **all
  non-enterable statuses** (disabled + coming-soon) — *instead of* silently snapping.
- SP-B1 folds in the original bounded pieces: `defaultTabForModule` module-keyed +
  `primaryModuleForOpen` + the unavailable panel.
- **"Meet untouched" is deliberately relaxed here** (the rework touches `TabBar` and
  `TournamentPage`) — so SP-B1 carries heavy single-module regression coverage.
- **Deferred fast-follow (NOT SP-B1):** hybrid workspace identity/label (kind badge,
  "DELETE MEET vs TOURNAMENT" copy) — cosmetic, a known separate concern.

## The mechanism

The **active module** = `moduleForTab(activeTab, kind)` (existing helper: `tv →
display`, `bracket-* → bracket`, meet operator tabs → `meet`, else kind fallback).
Two kind-locked points become module-driven, and one guard is added:

1. **`TabBar` renders `tabsForModule(activeModule)`** instead of `kind`-selected
   tabs. For a single-module workspace `activeModule` is always that workspace's one
   operator module → identical strip.
2. **`TournamentPage` drops the kind-based snap.** Removing `normalizeActiveTab`'s
   call means a tab whose module isn't enterable is *preserved*, not snapped — so the
   guard (below) can show the panel, and a valid multi-module tab is never snapped
   away. (Normal single-module navigation never triggered the snap — every tab
   already matched its kind — so this is behavior-neutral there. The legacy `/bracket`
   URL is already redirected to `/bracket-setup` by a route in `App.tsx`.)
3. **The unavailable guard (`AppShell`)** is what prevents a non-enterable product
   from mounting: when the active module is **not enterable** per the real `modules`
   state, render `ModuleUnavailablePanel` **instead of `<ModuleOutlet/>`**. Because
   `ModuleOutlet` is what mounts the product (and its TabBar), the panel cleanly takes
   the whole content area — no floating tabs. Resilient: unknown status or modules
   still loading → render the outlet (the kind fallback always has the active operator
   enterable, so no false guard during load).

No new uiStore slice and no module-aware `normalizeActiveTab` are needed — the guard,
sitting where the product mounts, subsumes both.

## Changes

### 1. `src/lib/bracketTabs.ts` — `tabsForModule(module)` (new, pure)

```ts
import type { ModuleId } from '../platform/product-shell/types';

/** The `{id,label}` rows the TabBar renders for a module:
 *  meet → the meet operator tabs, bracket → the bracket tabs,
 *  display → [] (single surface via the dock / tv route, no strip). */
export function tabsForModule(module: ModuleId): { id: AppTab; label: string }[] {
  if (module === 'bracket') return BRACKET_TABS;
  if (module === 'display') return [];
  return MEET_TABS;   // meet
}
```

The label rows `MEET_TABS` (built from `MEET_OPERATOR_TAB_IDS` + the meet labels) and
`BRACKET_TABS` move/stay next to this helper so the tab-id + label source is
single-sourced. `tabsForModule('meet')` must return exactly the rows `TabBar`
currently builds for a meet workspace; `tabsForModule('bracket')` exactly today's
`BRACKET_TABS`.

### 2. `src/app/TabBar.tsx` — render the active module's tabs

- `const activeModule = moduleForTab(activeTab, activeTournamentKind);`
- `const tabs = tabsForModule(activeModule);`
- The disabled-prerequisite logic keys off `activeModule` instead of `kind`:
  `activeModule === 'bracket'` → the `bracketDataReady` gating (draw/schedule/live);
  otherwise → the players/matches gating (matches/schedule/live). `disabledTabTitle`
  takes `activeModule`.
- Single-module parity: `activeModule` is always that workspace's one operator module,
  so the tab strip + disabled rules are identical to today.

### 3. `src/platform/domain/moduleModel.ts` — module-keyed entry routing

- `defaultTabForModule(module): string` — **drop the `kind` param** and the
  `kind==='bracket'` short-circuit: `meet→setup`, `bracket→bracket-setup`, `display→tv`.
- `primaryModuleForOpen(modules: WorkspaceModule[]): ModuleId` (new) — precedence
  `meet → bracket → display`: first **enabled**, else first **available**, else first
  present, else `meet`.

### 4. `src/products/hub/HubPage.tsx` — open via primary module

`openTournament` uses `primaryModuleForOpen` (reading `tournament.modules` via
`modulesFromDto`, else `modulesForWorkspace(kind)`) instead of
`kind === 'bracket' ? 'bracket-setup' : 'setup'`. Behavior-neutral for single-kind:
meet→setup, bracket→bracket-setup.

### 5. `src/app/AppShell.tsx` — module-aware shell

- Dock nav: `defaultTabForModule(p)` (drop the `kind` arg — caller fix for §3).
- Meet-only polling gate: replace `activeTournamentKind !== 'bracket'` with
  **meet-enabled**: `modules.some(m => m.id === 'meet' && m.status === 'enabled')`
  (where `modules = realModules ?? modulesForWorkspace(kind)`). Single-kind meet →
  runs (identical); bracket-only → off (identical); hybrid → runs (new, correct).
- **Guard:** compute the active module's `WorkspaceModule` from `modules`; if it is
  not `isModuleEnterable`, render `<ModuleUnavailablePanel … />` in `<main>` instead
  of `<ModuleOutlet/>`. Unknown/loading status → render the outlet.

### 6. `src/app/workspace/ModuleUnavailablePanel.tsx` (new component)

Minimal, design-system styled. Props: `label`, `note?`, `primaryLabel`,
`onGoToPrimary`, `onOpenSettings?`. Renders a heading (`{label} isn't available in
this workspace`), the `note`, a **"Go to {primaryLabel}"** button (→ the primary
module's home), and — **only when the module is `disabled`** (i.e. `onOpenSettings`
provided) — an **"Open Settings"** link. `data-testid="module-unavailable"`.
`AppShell` supplies `label`/`note` from the active `WorkspaceModule`, `primaryLabel`
from `primaryModuleForOpen`, and `onOpenSettings` only when the active module's status
is `disabled`.

### 7. `src/pages/TournamentPage.tsx` — drop the kind-snap

Remove the `normalizeActiveTab` import and the effect that calls it (the one that does
`const next = normalizeActiveTab(activeTab, kind); if (next) setActiveTab(next)`).
Keep the URL-segment → `activeTab` sync and the optimistic-kind set (kind stays as
identity + chrome fallback). With the snap gone, a non-enterable active tab is
preserved and the AppShell guard shows the panel.

If `normalizeActiveTab` (in `bracketTabs.ts`) is left with no remaining callers,
remove it and its unit tests in the same task to avoid dead code.

## Out of scope (SP-B1)

- Making any foreign operator enableable (SP-B2 — backend derivation + transitions).
- Bracket Display surface/data (SP-B3).
- Hybrid identity/label/badge + delete copy (deferred fast-follow).
- Concatenated multi-module tab strips (rejected — dock switches modules).
- A uiStore enabled-module slice / module-aware `normalizeActiveTab` (unnecessary —
  the guard subsumes them).

## Constraints

- No backend / route-path changes. `kind` preserved (identity + chrome fallback).
- **Single-module Meet and Bracket workspaces must be byte/behavior-identical** —
  the acceptance bar, proven by tests asserting the same tab ids, disabled states,
  routes, and polling as before.
- Existing design tokens; no new colors.
- Gate (from `products/scheduler/frontend`): `npx tsc -b` clean, `npx vitest run`
  green (current 244 + new), `npm run build` clean. Executed **controller-side**
  (frontend subagents time out on the long vitest collect in this env).

## Tests

- **`bracketTabs`** (unit): `tabsForModule` per module (`meet` → the meet rows,
  `bracket` → `BRACKET_TABS`, `display` → `[]`).
- **`moduleModel`** (unit): `defaultTabForModule` module-keyed (3 cases — update the
  existing wrong-kind assertions); `primaryModuleForOpen` (enabled precedence,
  available fallback, hybrid→meet, bracket-only→bracket, blank→meet).
- **`TabBar`** (component): the existing tests already set `activeTab` consistently
  with `kind`, so they assert single-module parity and must stay green unchanged;
  add a multi-module case — with `activeTab='bracket-setup'` the strip is the bracket
  tabs even when `activeTournamentKind='meet'` (proving module-driven, not kind-driven).
- **Hub** (component): `openTournament` routes by `primaryModuleForOpen(modules[])`
  (meet→setup, bracket→bracket-setup); kind fallback when no `modules[]`.
- **`ModuleUnavailablePanel`** (component): renders heading + note + Go-to-primary;
  shows Open-Settings only when `onOpenSettings` is provided.
- **`TournamentPage`** (component): single-module meet + bracket land on / keep their
  correct tab (parity, snap removal is a no-op there); a `kind=meet` page whose
  `activeTab` is a bracket tab is **preserved** (not snapped) so the guard can act.
- Existing `TabBar` / `moduleModel` / `ModuleDock` / Hub tests stay green (updated
  only where a signature changed).

## Acceptance criteria

1. `TabBar` renders the **active module's** tabs (`tabsForModule`); single-module Meet
   and Bracket are byte/behavior-identical (tabs, disabled prerequisites, routes,
   polling).
2. The kind-based snap is gone from `TournamentPage`; a non-enterable active module is
   preserved and surfaces `ModuleUnavailablePanel` (Go-to-primary, plus Open-Settings
   when disabled) **instead of** the module pane — no false guard during load.
3. A multi-module workspace keeps each enabled module reachable (switching the dock /
   URL renders that module's product + tab strip), with no snapping.
4. `defaultTabForModule` is module-keyed; Hub Open routes via `primaryModuleForOpen`;
   both behavior-neutral for single-kind.
5. `tsc -b` + full `vitest run` + `build` green; no backend/route changes; `kind`
   preserved.
