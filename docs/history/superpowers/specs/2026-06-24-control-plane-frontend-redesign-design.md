> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Control-Plane Frontend Redesign — design

**Date:** 2026-06-24
**Status:** accepted (SP-D1 deliverable — user brief)
**Branch:** `dev/workspace-suite`
**Program:** "Control Plane First" → SP-D, the frontend audit + redesign phase. The
backend/module foundation is complete (persisted `workspace_modules`, `modules[]`
create-seed, `signals` on summaries, module-driven chrome, bracket display, enabled
templates). SP-D makes the product *feel* like a serious Ubiquiti-style workspace
control plane — high-signal, modular, calm, operational, premium.

**Frontend-only.** No backend contract changes (unless a slice proves one strictly
necessary, documented then). `kind` preserved. No route-path removals. Meet/Bracket
operational surfaces stay behaviorally intact; only shell-level chrome changes.

## 1. Visual audit — current weak points

Audited from code (every surface read this session); live before/after screenshots
are pending the user enabling Chrome remote-debugging (`chrome://inspect` → "Allow
remote debugging"), to be captured during SP-D6.

**Hub (`products/hub/HubPage.tsx`, ~370 lines).**
- Now consumes signals (SP-C) but is still a **flat list + a rail**, not a dashboard.
  No top summary band (totals: workspaces, attention, active, shared, enabled modules,
  pending invites).
- Rows carry signal metrics but **no primary "next action"** (just Open/Delete).
- **Destructive Delete sits inline in every row** — risky; one mis-click from the list.
- `HubPage.tsx` is a megafile (command bar + filters + rows + chips + delete modal +
  inspector wiring) — hard to evolve; ripe for extraction.
- Empty state is a single centered card; loading is a bare "Loading…" line.

**New Workspace (`products/hub/NewWorkspacePage.tsx`).**
- Four static template cards. Module set is shown only as plain text chips; **no clear
  enabled-vs-available distinction**, no module capability hints.
- Blank routes to the primary *available* module (Meet → `setup`) — **opens Meet
  silently** instead of a workspace overview / modules setup. The brief flags this.
- Name/date inputs are visually equal to the (more important) template choice.
- No "custom modules" path even though the `modules[]` seed API supports it.

**Workspace Shell / Module Dock (`platform/product-shell/{WorkspaceShell,ModuleDock}.tsx`).**
- The dock reads as a **tab strip with status dots**, not installed product modules.
  Enabled/available/disabled/coming-soon are distinguished only by a small dot + italic.
- No per-module **settings/install** affordance from the dock; enabling a disabled
  module is a tiny inline "· enable". Switching modules doesn't feel intentional.

**Workspace Settings (`products/settings/*`).**
- `WorkspaceSettingsPage`: left rail + pane, defaults to **General — there is no
  Overview tab** (the brief wants a real one).
- **Modules tab** is a bare enable/disable list with one helper sentence — **no
  capability descriptions, no dependency map, no per-module detail**.
- **People & Access** renders **raw `userId` in monospace** (`PeopleAccessTab.tsx:77`)
  — not trustworthy/readable; roles legend is terse; read-only (no role endpoint).
- **Sharing** mixes the public-display link and collaborator invites; status/expiry
  exist but the **safety framing is thin** and the two link types aren't clearly
  separated.
- **Sync & Backups** and **Appearance** are `ComingSoonTab` placeholders — dead tabs
  in a control plane the backend doesn't yet serve.

**Display entry points (`products/display/*`).**
- `DisplayProduct` (the in-shell `tv`) is a clean embed; the bracket display (SP-B3)
  is new. Entry is fine; the **discoverability of "this is the public display"** and
  the relationship to Sharing's public link can be tightened.

**Cross-cutting:** loud accent in several spots; some "coming soon" copy where the
backend now supports the flow; large empty surfaces on New Workspace / empty Hub;
inconsistent loading/error treatment.

## 2. Design direction & visual language

Ubiquiti-style control plane (not Adobe suite): **workspaces are control planes;
modules are installable/enabled product systems inside them.** Dashboards show
operational signal — health, readiness, attention, modules, people, invites, last
updated, next action. The interface is calm, technical, precise, premium.

**Control-plane visual layer (additive, documented).** Introduce shared primitives —
used by Hub / New Workspace / Settings / shell chrome — that soften the brutalist
defaults *where it helps*:
- **Surfaces:** calm neutral panels, hairline `1px` `border-border` dividers, subtle
  `bg-card/40` section grouping; small `rounded-sm`/`rounded-md` only where it reads
  as software, not marketing.
- **Metrics:** tabular-nums, small-caps section eyebrows (`tracking-[0.18em]`),
  restrained single accent for the live/primary state only.
- **Density:** rows + dividers over card piles; high information density, readable.
- **States:** every list/panel has explicit empty / loading (skeleton) / error states.
- **Meet operational tabs stay on the current tokens** — the new layer applies to the
  control-plane surfaces, not the in-module operator UIs. Token/component changes are
  additive and documented in the slice that introduces them.

New shared primitives (small, in `platform/control-plane/` or `components/`):
`MetricStat` (label + tabular value), `HealthDot` (shared health→color), `SectionCard`
(eyebrow + hairline-bordered panel), `EmptyState`, `Skeleton` rows, `Overflow` menu
(for moving Delete out of the row). Reuse existing design-system `Button`/`StatusPill`.

## 3. Proposed new flows (per surface)

### Hub → control-plane dashboard
- **Top summary band:** `MetricStat`s — Total workspaces, Needs attention, Active,
  Shared with me, Enabled modules (sum), Pending invites (sum) — derived from the
  loaded summaries' `signals` (with safe fallbacks). Clicking a metric sets the
  matching filter where one exists.
- **Rows** keep the dense signal cluster and add a **primary next action** derived
  from health/attention (e.g. "Add players", "Generate schedule", "Open") + an
  **overflow menu** carrying **Delete** (with the existing confirm modal) and Settings.
  Delete leaves the row surface.
- **Inspector → action panel:** attention **checklist** (from `signals.setup` + reasons),
  a **module map** (the catalog with status), **people/share state** (member/invite
  counts + a "Manage sharing" link), and primary actions (Open / Settings / next action).
- Empty + loading states: a proper empty control-plane state and skeleton rows.

### New Workspace → module/template builder
- Two-column: **left = the system you're building** (templates as module systems, each
  showing its modules with **enabled vs available** chips + a one-line capability hint),
  **right (or below, secondary) = name/date**. Choosing the system is primary.
- **Blank** lands on the **workspace overview / Modules setup** (Settings → Modules /
  the new Overview), not a silent Meet open.
- **Custom path (feasible now):** a "Custom" template that lets the operator toggle each
  module's seed state (enabled/available/disabled) before create, sent via `modules[]`.
  Validated against the same backend rules (display needs an operator, etc.).

### Workspace Shell / Module Dock → product modules
- The dock presents modules as **product systems**: name + status treatment that
  clearly distinguishes **enabled / available / disabled / coming-soon** (not just a
  dot) and an affordance to **enter / enable / open settings** per module. Switching
  the active module reads as intentional (the running module is visually primary).
- Keep full-screen module modes and the existing routes; this is presentation + the
  per-module action affordance, no behavior rewrite.

### Settings → real control-plane settings
- **Overview tab (new, default):** workspace identity + the signal summary (health,
  readiness checklist, module map, people/share counts, next actions) — the
  Inspector's action panel, full-width.
- **Modules → module catalog:** each module a row/card with **capability description**,
  status, **dependencies** (e.g. "Display requires Meet or Bracket enabled"), and
  actions (enable/disable/settings), surfacing the backend 409 rules as inline guidance.
- **People & Access:** show a **readable identity** (email/display when available;
  truncate/avoid raw UUIDs — show a short id chip only as secondary), clear role
  capabilities, joined dates; honest that role-change has no endpoint yet.
- **Sharing:** **separate sections** — "Public display link" (the read-only TV/`/display`
  link, copy/open, safety note that it's public) vs "Collaborator invites" (create with
  role, status/expiry, copy, **revoke**, safety language about who can join).
- **Sync & Backups / Appearance:** either make real enough to be useful or
  **de-emphasize** — collapse the dead `ComingSoon` tabs (hide from the rail until
  implemented, or fold Backups into Overview if the backup endpoints suffice). Default:
  hide Sync/Appearance from the rail this phase (documented), removing dead tabs.

## 4. Component architecture

Extract from the megafiles; each unit small, testable, one responsibility.
- **Hub:** `HubPage` → `HubSummaryBar` (metrics), `WorkspaceRow` (already local →
  own file + next-action + overflow), `WorkspaceInspector` (already its own file →
  action-panel sections: `AttentionChecklist`, `ModuleMap`, `CollaborationSummary`),
  `hubMetrics.ts` (pure: totals from summaries, reuse `hubSignals`).
- **New Workspace:** `NewWorkspacePage` → `templates.ts` (data + the custom builder
  model), `TemplateCard`, `CustomModulesBuilder`, `workspaceCreateFlow.ts` (pure: seed
  → create → landing route via `primaryModuleForOpen`/`defaultTabForModule`).
- **Shell/Dock:** `ModuleDock` → presentational module entries + a `ModuleEntry` with
  status treatment + per-module action; keep `WorkspaceShell` as the frame.
- **Settings:** add `OverviewTab`; `ModulesSettingsTab` → `ModuleCatalog` +
  `ModuleCatalogRow` (capability/deps/actions); `PeopleAccessTab` → readable identity
  helper (`displayMember.ts`); `SharingTab` → `PublicDisplayLink` + `CollaboratorInvites`.
- **Control-plane primitives:** `MetricStat`, `HealthDot`, `SectionCard`, `EmptyState`,
  `Skeleton`, `OverflowMenu` (shared).

Pure logic (metrics, create-flow, identity formatting, module-catalog descriptions)
lives in tested `.ts` modules; components stay thin and snapshot/assert on rendered
signal.

## 5. Test plan

Every slice is TDD where logic exists, render-tested where it's presentational:
- **Hub:** `hubMetrics` totals (incl. signal fallbacks); summary-bar render; row
  next-action + overflow (Delete moved out of row, confirm modal still works);
  inspector action-panel sections (attention checklist, module map, collaboration).
- **New Workspace:** template render (enabled vs available chips); create payload +
  landing route per template; Blank → overview/modules route (not silent Meet); custom
  builder produces a valid `modules[]` seed + create/route.
- **Module Dock:** status treatment per state (enabled/available/disabled/coming-soon);
  enter vs enable vs settings affordance; active-module emphasis. Preserve existing
  `module-<id>` testids/aria/behavior.
- **Settings:** Overview render; module catalog (capability/deps/status/actions, 409
  guidance); People readable identity (no raw UUID as primary); Sharing split sections
  (public link vs invites, copy/revoke/status).
- **Control-plane primitives:** unit tests for `MetricStat`/`HealthDot`/`EmptyState`/
  `OverflowMenu`.
- Gate each slice: `npx tsc -b`, `npx vitest run`, `npm run build` from
  `products/scheduler/frontend`. No backend tests (frontend-only).
- **SP-D6:** live before/after screenshots (once CDP enabled) + a written visual-audit
  notes doc under `docs/`.

## 6. Rollout slices

Each is its own spec-section → plan → build → review, staged so the app stays green and
shippable between slices. (SP-D1 is this document + the implementation plan.)

- **SP-D2 — Hub redesign.** Control-plane primitives (`MetricStat`/`HealthDot`/
  `SectionCard`/`EmptyState`/`Skeleton`/`OverflowMenu`); `HubSummaryBar`; row
  next-action + Delete→overflow; inspector → action panel; extract `WorkspaceRow`/
  metrics from `HubPage`. (Largest visible win.)
- **SP-D3 — New Workspace module builder.** Template builder UX (enabled/available
  chips + capability hints), Blank → overview/modules, custom-modules path, name/date
  secondary; extract `templates.ts`/`TemplateCard`/`CustomModulesBuilder`/create-flow.
- **SP-D4 — Settings / Sharing / People redesign.** Overview tab; Modules → catalog
  (capability/deps/actions); People readable identity; Sharing split (public link vs
  invites) + safety language; de-emphasize/hide Sync & Appearance dead tabs.
- **SP-D5 — Shell / Module Dock polish.** Modules-as-products dock, clear state
  treatment, per-module enter/enable/settings affordance, intentional switching;
  keep full-screen modes + routes + testids.
- **SP-D6 — Visual QA + tests.** Live before/after screenshots (CDP), final
  render/regression tests, written visual-audit notes; tighten loading/empty/error
  states across all surfaces.

## Constraints

- No route-path removals; `kind` preserved; no module status vocabulary change.
- No backend contract changes unless a slice proves one strictly necessary (documented).
- Meet/Bracket operator behavior unchanged; only shell-level chrome + the control-plane
  surfaces change.
- Prefer extracting smaller components from large pages (`HubPage`, settings tabs).
- Each slice testable + green (`tsc`/`vitest`/`build`); commit per slice.

## Acceptance criteria (phase)

1. Hub is a control-plane dashboard: summary metrics, signal-bearing rows with a
   next-action, safe (non-row) delete, an action-panel inspector.
2. New Workspace is a module/template builder: clear enabled/available, Blank →
   overview/modules, a custom-modules path; name/date secondary.
3. Module Dock presents modules as product systems with clear state + per-module
   actions; switching is intentional; full-screen + routes intact.
4. Settings has an Overview, a module catalog, readable People, split Sharing with
   safety language; dead Sync/Appearance tabs removed/de-emphasized.
5. A documented control-plane visual layer softens the control-plane surfaces; Meet
   operator surfaces intact; token/component changes documented.
6. Every slice green (`tsc`/`vitest`/`build`); before/after visual notes captured.
