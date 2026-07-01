> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Workspace suite architecture — design

**Date:** 2026-06-23  
**Status:** accepted — Open Decisions resolved 2026-06-23 (see below); Phase 1 cleared for planning  
**Branch:** `dev/workspace-suite`  
**Source:** user direction: evolve ShuttleWorks from one all-in-one scheduler into an Adobe-style suite of focused products, use the Meet side as the design-language reference, make each product a full-screen mode inside one durable workspace, refactor the filesystem carefully, and avoid breaking or changing existing functionality.

## Goal

Turn ShuttleWorks into a suite of focused event-operation products without losing the current stability of the Meet side.

The core product noun becomes **Workspace**. A workspace is the durable container for a real event lifecycle. It can span multiple planning days, setup, meet-day operations, bracket play, display configuration, exports, backups, and post-event review. Inside a workspace, operators move between full-screen product modes instead of navigating a single overloaded tab set.

The immediate design goal is architectural alignment and vocabulary clarity, not feature expansion. The current functionality should continue working while the codebase gains clearer suite boundaries.

## Product Posture

ShuttleWorks becomes one installed local-first application with several product modes:

- **Hub** — workspace list, recent workspaces, create/import, backups, sharing, global settings, and product launcher.
- **Meet** — the flagship meet-day cockpit: solver, schedule proposals, live operations, roster, courts, TV configuration, and recovery tools.
- **Bracket** — the draw desk: events, participants, seeds, draw generation, advancement, bracket schedule, and live bracket results.
- **Display** — public and venue-facing screens. It can attach to workspace data from Meet, Bracket, or both.
- **Core Platform** — shared workspace identity, auth/roles, sync/outbox, command handling, shared roster/courts, API client, scheduler core, design tokens, and shell components.

This is the recommended middle path between the current all-in-one app and fully separate applications. It gives each workflow its own product surface while preserving one backend, one local source of truth, one auth model, and one shared design language.

## User Perspective

The user opens ShuttleWorks into a **Hub**, not straight into a tournament tab set.

From the Hub, the user creates or opens a workspace such as "Spring League Finals 2026". That workspace may start days before the event. The user can prepare rosters, seed bracket events, configure courts, review schedule constraints, and set up venue displays before the actual day begins.

Inside the workspace, product modes behave like focused apps:

- In **Meet**, the user thinks about court-time, proposals, solver progress, live match status, disruptions, and schedule repair.
- In **Bracket**, the user thinks about events, entrants, seeding, draw shape, advancement, and results.
- In **Display**, the user thinks about what a player, coach, or audience member sees from across the venue.

The products should feel distinct in workflow but unmistakably part of the same suite. The operator should not wonder whether Bracket was imported from a different app. The design language, command feedback, status handling, and error tone should all feel native to ShuttleWorks.

## Research Lens

Enterprise product suites tend to succeed when they separate experience surfaces while unifying the platform beneath them.

Useful patterns from current suite design systems:

- Atlassian frames its system as a unified design language spanning products and collections, with shared foundations and product-specific applications.
- Microsoft Fluent emphasizes platform-native behavior, focus, and an unmistakable cross-product identity.
- IBM Carbon separates reusable design-system assets from product implementation details, supporting multiple products and frameworks through shared foundations.

For ShuttleWorks, the lesson is not to copy any one vendor's UI. The lesson is structural: shared foundations, shared shell rules, shared tokens, shared interaction contracts, and product-specific workflows.

## Current Weak Points

The current codebase already contains the shape of a suite, but the boundaries are still named and organized like a single scheduler product.

Primary weak points:

1. **The ownership noun is still `tournament`.** The docs, API, table names, and routes use `tournament` as the unit of ownership. That made sense for the earlier scheduler, but the new durable container is broader than a tournament day.
2. **Product mode boundaries are mixed with feature boundaries.** Meet concepts live across schedule, live ops, roster, setup, suggestions, control center, and tournaments. Bracket is a feature folder, not a product mode. Display is a page, not a product.
3. **The frontend shell is overloaded.** The current shell behaves like one product with tabs. A suite needs an app-level shell, workspace-level shell, and product-level navigation.
4. **Meet is mature but not explicitly codified as the design reference.** The product direction is clear in `PRODUCT.md`, but the reusable design language is not yet extracted into formal tokens, primitives, and product-shell rules.
5. **Bracket has improved, but its backend and product boundary still trail Meet.** It is folded into the scheduler backend and shell, but not yet expressed as an equal product surface with its own module boundary.
6. **The filesystem mirrors history more than intent.** `products/scheduler` is now carrying Meet, Bracket, Display, shared platform, local backend, and suite shell concerns.
7. **A physical rename could be risky.** Renaming tables, routes, folders, imports, and docs all at once would create unnecessary regression risk.

## Non-Goals

- No immediate feature changes.
- No Meet UI redesign.
- No behavioral changes to existing Meet, Bracket, Display, auth, sync, or solver flows.
- No database table rename in the first implementation phase.
- No route removals in the first implementation phase.
- No immediate split into separately deployed frontends or separately deployed backends.
- No rewrite of the scheduler core.
- No broad visual refresh before the design language is documented and extracted.

## Recommended Approach

Use a **suite shell with product modes**, implemented through gradual boundaries inside the existing app before any large physical move.

This is a mix of:

- **Approach A:** keep the current app operational and avoid destabilizing file moves too early.
- **Approach B:** introduce a suite model with full-screen product modes, shared platform, and a unified design language.

Do not choose a fully separate-app architecture yet. Meet, Bracket, and Display are still tightly connected through roster, courts, schedule state, match status, workspace permissions, local sync, and event-day operations. Splitting them now would duplicate the most sensitive infrastructure.

## Target Architecture

```text
ShuttleWorks App
  Hub
    Workspaces
    Recent workspaces
    Create/import/backup/share
    Product launcher

  Workspace Shell
    Workspace identity and status
    Product switcher
    Role and connection indicators
    Shared command/sync health
    Shared settings access

  Product Modes
    Meet
    Bracket
    Display

  Core Platform
    Workspace domain
    Auth and roles
    Command queue
    Sync/outbox
    API client
    Shared roster/courts/time concepts
    Design system
    Scheduler core adapter
```

The physical runtime remains local-first:

```text
Director machine
  Tauri shell
  React app
  FastAPI sidecar
  SQLite source of truth
  Outbox sync to Supabase mirror

Operator browsers
  Read via realtime mirror where appropriate
  Write through director FastAPI command path where appropriate

Venue displays
  Read-only display surfaces
```

## Product Boundaries

### Hub

Hub owns workspace entry and lifecycle.

Responsibilities:

- List owned and shared workspaces.
- Create a workspace.
- Open a workspace.
- Import/export a workspace package.
- Show backup and sync health at a high level.
- Launch into a product mode.
- Provide global app settings.

Hub should not own Meet scheduling, Bracket draw logic, or Display layout logic.

### Workspace Shell

Workspace Shell owns the common chrome once a workspace is open.

Responsibilities:

- Show workspace name, date range, status, and connection state.
- Provide product switching.
- Provide role-aware actions.
- Provide shared status surfaces: pending writes, sync issues, stale data, offline mode.
- Host product modes full-screen.

Workspace Shell should be stable and minimal. It should not become another dashboard full of product-specific controls.

### Meet Product

Meet remains the reference product.

Responsibilities:

- Roster and setup for meet-style scheduling.
- Match generation.
- CP-SAT schedule solving.
- Proposal review and commit.
- Gantt timeline.
- Live operations.
- Director disruption tools.
- Meet-oriented display configuration.

Meet should move last during physical refactors. It is the strongest and most operationally sensitive product.

### Bracket Product

Bracket becomes a sibling product, not just a tab.

Responsibilities:

- Events and formats.
- Participants and seeding.
- Draw generation.
- Round and advancement state.
- Bracket match scheduling.
- Live result recording.
- Bracket-oriented display data.

Bracket should share the suite shell, design tokens, status language, error patterns, and command reliability expectations, while keeping its event/draw-first workflow.

### Display Product

Display becomes a product mode because venue output is different from operator work.

Responsibilities:

- Public schedule view.
- Court calls.
- Standings/results.
- Bracket draw or result views.
- Screen-safe typography and layout.
- Read-only venue configuration surfaces.

Display can be louder and more brand-present than operator products, but it should still use the same design foundations.

### Core Platform

Core Platform is not a user-facing product.

Responsibilities:

- Workspace identity and lifecycle primitives.
- Auth, roles, invitations.
- Local persistence and migrations.
- Command queue and state-machine contracts.
- Sync/outbox and realtime mirror contracts.
- Shared domain types.
- Shared roster/courts/time concepts.
- API client.
- Design system and product shell primitives.
- Scheduler core integration.

## Vocabulary Migration

The new product noun is **Workspace**.

The old implementation noun, **Tournament**, should remain in persistence and API internals until a later migration proves safe.

Recommended vocabulary layers:

| Layer | Near-term name | Later name |
|---|---|---|
| User-facing UI | Workspace | Workspace |
| Frontend domain facade | Workspace | Workspace |
| Backend public DTO facade | Workspace aliases where safe | Workspace |
| Existing API routes | `/tournaments/*` retained | Add `/workspaces/*`, then deprecate |
| Existing DB table | `tournaments` retained | Rename only if worth the risk |
| Existing scheduler core models | Keep `Tournament*` where deeply embedded | Rename only with focused tests |

This avoids a dangerous all-at-once rename. Users can see the better noun before the storage layer changes.

## Filesystem Direction

Do not begin by moving files. Begin by creating logical boundaries and import rules. Physical moves should happen after tests and product boundaries are explicit.

Target long-term structure:

```text
apps/
  hub/
  meet/
  bracket/
  display/

services/
  api/
    modules/
      workspaces/
      meet/
      bracket/
      display/
      commands/
      sync/

packages/
  design-system/
  product-shell/
  api-client/
  domain/
    workspace/
    meet/
    bracket/
    display/
  scheduling-core-client/

scheduler_core/
  domain/
  engine/
  adapters/
```

Near-term structure inside the current `products/scheduler` app:

```text
products/scheduler/frontend/src/
  app/
    suite/
    workspace/
  products/
    hub/
    meet/
    bracket/
    display/
  platform/
    api/
    auth/
    commands/
    realtime/
    design-system/
    product-shell/
    domain/

products/scheduler/backend/
  modules/
    workspaces/
    meet/
    bracket/
    display/
    commands/
    sync/
  app/
  database/
```

This intermediate layout allows the suite architecture to become real without immediately changing package managers, deployment scripts, Docker files, or Tauri assumptions.

## Design Language

Meet is the reference standard.

The design language should be extracted from Meet, not invented separately. The suite should codify:

- Typography roles.
- Spacing and density.
- Status colors and semantic color tokens.
- Toolbar and header hierarchy.
- Panel and section rules.
- Empty/loading/error state language.
- Pending/applied/rejected command affordances.
- Table, list, timeline, and draw interaction patterns.
- Operator vs public-display expression rules.

Design-system principles:

1. Operator products are calm, technical, dense, and trustworthy.
2. Public display products may be more expressive but must remain legible at venue distance.
3. Status color is semantic, not decorative.
4. Numeric information uses stable tabular layout.
5. Product modes may have different workflow geometry, but they should share interaction grammar.
6. Cards and panels should be used deliberately. The suite should avoid generic admin-dashboard drift.

## Data Flow

The workspace data model should preserve the current local-first reality.

Near-term flow:

```text
React product mode
  -> shared API client
  -> FastAPI route/module
  -> repository/service
  -> SQLite source of truth
  -> sync_queue outbox
  -> Supabase mirror
  -> realtime read clients / display
```

The suite architecture should avoid product modes calling each other's internals directly. Shared state should move through Core Platform contracts:

- Workspace identity.
- Shared roster/courts/time primitives.
- Commands and write status.
- Realtime read models.
- Product-specific APIs.

Examples:

- Bracket should not import Meet UI/store internals to schedule bracket matches.
- Meet should not read Bracket service internals directly.
- Display should consume read models prepared for public output.
- Cross-product integration should happen through workspace-level services or explicit APIs.

## Error Handling

The suite should standardize Meet-style operational reliability across product modes.

Expected shared patterns:

- Structured backend errors with stable codes.
- 409 stale/conflict responses for versioned writes.
- Idempotency for retryable commands.
- Pending/applied/rejected states for command-like operations.
- Non-blocking conflict banners for operator flows.
- Clear empty/loading/error states in every product mode.
- Connection/sync health in the Workspace Shell.

The first implementation should not convert every Bracket operation into a command. It should define the shared contract and migrate high-risk writes deliberately.

## Rollout Plan

### Phase 1 — Spec and vocabulary

Write and approve this design. Adopt Workspace as the product noun in planning docs. Do not move code yet.

Deliverables:

- Suite architecture spec.
- Glossary of Workspace, Product Mode, Workspace Shell, Hub, Core Platform.
- Initial migration rules: preserve existing routes and tables.

### Phase 2 — Boundary map

Create a map of current files into future ownership.

Deliverables:

- Frontend ownership map: app shell, Meet, Bracket, Display, platform.
- Backend ownership map: route/service/repository modules by product.
- Dependency rules: what can import what.
- Risk list for files that are too large or cross too many concerns.

### Phase 3 — Design language extraction

Extract Meet's polished patterns into shared design-system and product-shell primitives.

Deliverables:

- Design token inventory.
- Shared shell/header/status/empty/error primitives.
- Meet reference screenshots and behavior notes.
- Bracket and Display parity checklist.

No user-visible functionality should change in this phase.

### Phase 4 — Suite shell introduction

Introduce Workspace Shell and Product Mode routing around the existing app.

Deliverables:

- Workspace-facing labels in UI where safe.
- Product switcher replacing overloaded tab mental model where safe.
- Existing Meet, Bracket, and Display routes preserved or redirected.
- Compatibility layer for old tournament URLs.

### Phase 5 — Product module migration

Move product code gradually.

Order:

1. Hub/dashboard code.
2. Display code.
3. Bracket code.
4. Shared platform code.
5. Meet code last.

Meet moves last because it is stable, mature, and highest risk.

### Phase 6 — Backend module migration

Introduce backend modules behind existing routes.

Order:

1. Workspace facade around current tournament ownership.
2. Bracket module cleanup.
3. Display/read-model module.
4. Meet scheduling/live-ops module.
5. Optional `/workspaces/*` route aliases after coverage is strong.

Existing `/tournaments/*` routes remain until compatibility is no longer needed.

### Phase 7 — Optional physical package split

Only after the suite boundaries are real should the repo consider a top-level `apps/`, `services/`, and `packages/` split.

This phase should happen only if it reduces complexity. It is not required for the suite model to be successful.

## Testing Strategy

Testing should protect behavior before structure moves.

Required test layers:

- Backend pytest for workspace facade behavior, route compatibility, role gates, and product-specific write safety.
- Frontend unit tests for shared shell primitives and product routing.
- Integration tests for opening existing tournaments/workspaces through old and new routes.
- E2E smoke for Meet happy path before and after shell changes.
- E2E smoke for Bracket create/draw/result path before and after shell changes.
- Display visual smoke for public route compatibility.

For physical file moves, run tests before and after each move slice. Avoid combining visual changes, route changes, and filesystem moves in one PR.

## Acceptance Criteria

The architecture initiative succeeds when:

1. Users understand ShuttleWorks as a workspace-based suite.
2. Meet, Bracket, and Display feel like focused products inside one workspace.
3. Meet remains functionally stable.
4. Existing routes, saved data, and local-first assumptions keep working.
5. The codebase has clear ownership boundaries before large file moves.
6. The design language is extracted from Meet and reused by sibling products.
7. Future implementation can proceed in small, reviewable phases.

## Open Decisions

Resolved 2026-06-23 during planning. The throughline is **narrow and reversible**:
introduce vocabulary and boundaries without physical moves or route changes that
are expensive to walk back.

1. **Tournament → Workspace rename scope: Hub + new shell chrome only.** Deep
   Meet/Bracket internals keep saying "tournament" for now. The rename is a
   facade at the surface where the user first meets the app; a frontend domain
   facade gives one place to map the noun. Zero risk to mature surfaces.
2. **Route shape: preserve existing routes; add a shell *wrapper*, no new URL
   scheme yet.** Defer `/workspaces/:id/meet`-style routes. A wrapper proves the
   product-switcher mental model without a routing migration.
3. **Display launch point: both.** Surfaced from Hub (open a venue screen for a
   workspace) and from Workspace Shell (attach to live data). Display is
   read-only, so exposing both entry contexts is cheap.
4. **`/workspaces/*` API aliases: deferred to Phase 6.** Phase 1 is
   frontend-facade only; adding backend aliases before frontend routing is stable
   would invert the dependency order.
5. **Long-term top-level repo split: deferred/skipped for now.** Adopt the
   intermediate `products/scheduler` module layout as the target. Revisit a
   physical `apps/`/`services/`/`packages/` split (Phase 7) only if it later
   reduces complexity; it is not required for the suite model to succeed.

## Preferred First Implementation Plan

The first implementation plan should be narrow:

1. Add a workspace-suite architecture note/glossary to docs.
2. Create frontend and backend ownership maps without moving files.
3. Define import-boundary rules for future product modules.
4. Inventory Meet design primitives to extract.
5. Identify a low-risk shell-routing slice that can introduce Workspace language while preserving old routes.

This keeps the first build step reversible and measurable. The suite direction becomes real without betting the stable Meet product on a large refactor.
