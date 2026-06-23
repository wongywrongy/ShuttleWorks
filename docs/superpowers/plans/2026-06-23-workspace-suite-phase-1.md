# Workspace Suite — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workspace-suite direction real on paper and introduce "Workspace" vocabulary at the Hub/shell surface — without moving files, changing routes, or altering any Meet/Bracket/Display behavior.

**Architecture:** Phase 1 is deliberately narrow and reversible (per `docs/superpowers/specs/2026-06-23-workspace-suite-architecture-design.md`, Open Decisions resolved 2026-06-23). Five tasks produce documentation artifacts that lock in ownership boundaries and import rules. One final task ships a tiny code slice: a single frontend **vocabulary facade** (`platform/domain/workspace.ts`) that becomes the one place the UI reads the user-facing container noun, wired into the dashboard (future Hub) and the tab-bar chrome. Persistence, API routes (`/tournaments/*`), DB tables, and the noun "tournament" in all internals stay exactly as they are.

**Tech Stack:** React 19 + Vite + TypeScript + Tailwind + Zustand; `@scheduler/design-system` (npm workspace); Vitest (frontend tests); FastAPI + OR-Tools + SQLAlchemy (backend, untouched in this phase); pytest (backend tests).

## Global Constraints

Every task's requirements implicitly include this section. Values copied from the spec.

- **No feature changes. No Meet UI redesign.** No behavioral changes to Meet, Bracket, Display, auth, sync, or solver flows.
- **No DB table rename.** `tournaments` table stays.
- **No route changes or removals.** Every `/tournaments/*`, `/display`, `/login`, `/invite/:token` route is preserved verbatim. No new URL scheme (`/workspaces/:id/...`) in this phase.
- **No backend code changes in this phase.** Backend tests must stay green but no backend source is edited.
- **"tournament" stays in persistence and API internals.** The rename is user-facing copy + a frontend facade only — Hub + shell chrome, not deep Meet/Bracket internals.
- **No file moves.** Create new logical boundaries (one new facade file, new docs); do not relocate existing files.
- **Branch:** all work lands on `dev/workspace-suite`.
- **Frontend test command:** from `products/scheduler/frontend/`, run `npx vitest run <path>` (test glob: `src/**/__tests__/**/*.{test,spec}.{ts,tsx}`; vitest config pins `TZ=America/Los_Angeles`).
- **Frontend type check:** from repo root, `npx tsc -b products/scheduler/frontend`.
- **Backend test command (regression only):** from `products/scheduler/`, `python3 -m pytest` (the project `.venv`/`uv` lack pytest; system `python3` has it). One pre-existing failure is expected: `tests/test_config.py::test_settings_picks_postgres_driver` (`ModuleNotFoundError: psycopg2`, an env issue unrelated to this work).
- **Docs home:** architecture docs live under `docs/architecture/workspace-suite/`. The accepted design spec is `docs/superpowers/specs/2026-06-23-workspace-suite-architecture-design.md`.

---

## File Structure

New files created in this phase:

- `docs/architecture/workspace-suite/glossary.md` — Task 1
- `docs/architecture/workspace-suite/frontend-ownership-map.md` — Task 2
- `docs/architecture/workspace-suite/backend-ownership-map.md` — Task 3
- `docs/architecture/workspace-suite/import-boundaries.md` — Task 4
- `docs/architecture/workspace-suite/meet-design-inventory.md` — Task 5
- `products/scheduler/frontend/src/platform/domain/workspace.ts` — Task 6 (the facade)
- `products/scheduler/frontend/src/platform/domain/__tests__/workspace.test.ts` — Task 6 (facade unit test)

Existing files modified (Task 6 only):

- `products/scheduler/frontend/src/pages/TournamentListPage.tsx` — Hub copy reads from the facade
- `products/scheduler/frontend/src/app/TabBar.tsx` — tab chrome aria-label reads from the facade

Tasks 1–5 are documentation; they carry a content-quality check instead of a unit test. Task 6 is code and follows full TDD.

---

### Task 1: Glossary + migration rules doc

**Files:**
- Create: `docs/architecture/workspace-suite/glossary.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical terms (Workspace, Product Mode, Workspace Shell, Hub, Core Platform) and the near-term/later vocabulary table that Tasks 2–6 reference.

- [ ] **Step 1: Write the glossary file**

Create `docs/architecture/workspace-suite/glossary.md` with exactly this content:

```markdown
# Workspace Suite — Glossary & Migration Rules

Companion to `docs/superpowers/specs/2026-06-23-workspace-suite-architecture-design.md`.
This is the canonical vocabulary for the suite. When code and docs disagree with
this file, this file wins for *user-facing* naming; internals may lag (see rules).

## Terms

- **Workspace** — the durable container for a real event lifecycle. Spans planning
  days, setup, meet-day ops, bracket play, display config, exports, backups, and
  post-event review. The new user-facing product noun. Implemented today by the
  `tournaments` table / `/tournaments/*` routes (internal name unchanged).
- **Product Mode** — a full-screen focused surface inside an open workspace: Meet,
  Bracket, or Display. Replaces the "one app with many tabs" mental model.
- **Workspace Shell** — the common chrome shown once a workspace is open: workspace
  identity/status, product switcher, role/connection indicators, shared sync health.
  Stable and minimal; not a second dashboard.
- **Hub** — the pre-workspace surface: workspace list, recent, create/import,
  backups, sharing, global settings, product launcher. Today: `TournamentListPage`.
- **Core Platform** — non-user-facing shared foundation: workspace identity, auth/
  roles, command queue, sync/outbox, API client, shared roster/courts/time, design
  system, scheduler-core integration.

## Vocabulary migration rules (Phase 1)

| Layer | Phase-1 name | Later name |
|---|---|---|
| User-facing UI (Hub + shell chrome) | Workspace | Workspace |
| Frontend domain facade | Workspace (`platform/domain/workspace.ts`) | Workspace |
| Deep Meet/Bracket UI internals | tournament (unchanged) | Workspace (gradual) |
| Backend public DTO facade | tournament (unchanged) | Workspace aliases where safe |
| API routes | `/tournaments/*` retained | add `/workspaces/*`, then deprecate |
| DB table | `tournaments` retained | rename only if worth the risk |
| Scheduler core models | `Tournament*` retained | rename only with focused tests |

**Hard rule for Phase 1:** the rename is confined to the Hub and shell chrome via the
frontend facade. No route, table, DTO, or scheduler-core rename. The kind badge that
labels a bracket event "TOURNAMENT" is a *separate* naming concern (event kind, not
container) and is intentionally left unchanged in this phase.
```

- [ ] **Step 2: Content-quality check**

Run: `grep -nE "TODO|TBD|FIXME|\\bXXX\\b" docs/architecture/workspace-suite/glossary.md`
Expected: no matches (exit status 1 / empty output).

Visually confirm all five terms (Workspace, Product Mode, Workspace Shell, Hub, Core Platform) each have a definition, and the migration table has both a Phase-1 and a Later column for every row.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/workspace-suite/glossary.md
git commit -m "docs(arch): add workspace-suite glossary and Phase-1 migration rules"
```

---

### Task 2: Frontend ownership map

**Files:**
- Create: `docs/architecture/workspace-suite/frontend-ownership-map.md`

**Interfaces:**
- Consumes: glossary terms from Task 1.
- Produces: the authoritative mapping of current frontend files → future product-mode/platform ownership, referenced by Task 4 (import boundaries).

- [ ] **Step 1: Write the frontend ownership map**

Create `docs/architecture/workspace-suite/frontend-ownership-map.md` with this content (paths are current as of 2026-06-23; this is a *map*, not a move — no files relocate in Phase 1):

```markdown
# Frontend Ownership Map

Maps current `products/scheduler/frontend/src/` files to their future suite owner.
No files move in Phase 1. "Owner" = which product mode or platform layer the code
*belongs to* conceptually, used to enforce import boundaries (see import-boundaries.md).

## Workspace Shell (app-level chrome)

- `app/App.tsx` — router + providers (BrowserRouter, AuthProvider, ErrorBoundary).
- `app/AppShell.tsx` — tab-based operator layout shell (will become Workspace Shell + product host).
- `app/TabBar.tsx` — top navigation (will become the product switcher + tab chrome).
- `app/AuthGuard` / `context/` (AuthContext) — session gating.
- `components/` — shared chrome not yet in design-system (error boundary, toast host, status indicators).

## Hub

- `pages/TournamentListPage.tsx` — the dashboard / workspace list (becomes Hub).
- `pages/TournamentPage.tsx` — `/tournaments/:id/*` wrapper that resolves kind and mounts AppShell (straddles Hub→Shell handoff; platform-routing concern).

## Meet product

- `features/setup/`, `features/roster/`, `features/matches/`, `features/schedule/`,
  `features/control-center/`, `features/liveOps/`, `features/suggestions/`,
  `features/exports/`, `features/director/` — meet workflow surfaces.
- Meet tab ids (`setup | roster | matches | schedule | live | tv`) defined in `app/TabBar.tsx`.

## Bracket product

- `features/bracket/` — draw desk, advancement, bracket schedule, bracket live.
- `lib/bracketTabs.ts` — bracket tab ids + labels.
- Bracket tab ids: `bracket-setup | bracket-roster | bracket-events | bracket-draw | bracket-schedule | bracket-live`.

## Display product

- `pages/PublicDisplayPage.tsx` — public `/display` surface.
- `pages/publicDisplay/` — display-specific subcomponents + tests.

## Core Platform (frontend)

- `api/` — API client (axios) + DTOs (`dto.ts`, `dto.generated.ts`).
- `hooks/` — identity + data hooks: `useTournamentId` (`useTournamentId`,
  `useTournamentIdOrNull`), `useTournament`, `useTournamentKind`, `useTournamentState`,
  `useLiveTracking`, etc. These are the future Workspace identity/data layer.
- `store/` — Zustand stores (`uiStore`, `tournamentStore`, `matchStateStore`, …).
- `services/`, `lib/`, `types/`, `utils/` — shared utilities and abstractions.
- `platform/domain/workspace.ts` — **new in Phase 1**: user-facing container-noun facade.
- `@scheduler/design-system` (`packages/design-system/`) — design tokens + shared primitives.

## Risk list (files too large or crossing concerns)

- `features/bracket/` — large; backend+UI boundary still trails Meet (per spec weak point #5).
- `app/AppShell.tsx` — overloaded "one product with tabs"; the future Shell/Hub/product
  split lands here (spec weak point #3).
- `pages/TournamentListPage.tsx` — mixes Hub listing, create-dialog, and delete-modal concerns.
```

- [ ] **Step 2: Content-quality check**

Run: `grep -nE "TODO|TBD|FIXME" docs/architecture/workspace-suite/frontend-ownership-map.md`
Expected: no matches.

Spot-verify three cited paths still exist:
Run: `ls products/scheduler/frontend/src/pages/TournamentListPage.tsx products/scheduler/frontend/src/app/TabBar.tsx products/scheduler/frontend/src/lib/bracketTabs.ts`
Expected: all three list without error.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/workspace-suite/frontend-ownership-map.md
git commit -m "docs(arch): map frontend files to future suite ownership"
```

---

### Task 3: Backend ownership map

**Files:**
- Create: `docs/architecture/workspace-suite/backend-ownership-map.md`

**Interfaces:**
- Consumes: glossary terms from Task 1.
- Produces: the authoritative mapping of current backend modules → future product modules, referenced by Task 4.

- [ ] **Step 1: Write the backend ownership map**

Create `docs/architecture/workspace-suite/backend-ownership-map.md` with this content:

```markdown
# Backend Ownership Map

Maps current `products/scheduler/backend/` modules to their future suite owner.
No files move in Phase 1. Routes (`/tournaments/*`) and tables are unchanged.
FastAPI app + router includes are assembled in `app/main.py`.

## Workspaces (ownership / identity)

- `api/tournaments.py` — tournament CRUD, list, state, schema version (the ownership hub).
- `api/invites.py` — invites, sharing, token flow.
- `api/commands.py` — operator command log / idempotency.
- `repositories/` (tournaments), `database/` ORM models, `alembic/` migrations.

## Meet product

- `api/schedule.py`, `api/schedule_repair.py`, `api/schedule_advisories.py`,
  `api/schedule_proposals.py`, `api/schedule_director.py`,
  `api/schedule_suggestions.py`, `api/schedule_warm_restart.py` — solver + proposal pipeline.
- `api/match_state.py` — match state machine.
- `services/match_state.py`, `services/schedule_impact.py`,
  `services/suggestions_worker.py`, `services/csv_importer.py`.

## Bracket product

- `api/brackets.py` — draws, advancement, seeding, bracket I/O (large; cleanup is Phase 6).
- `services/bracket/` — bracket service implementations.

## Display product

- No dedicated backend module today. Display reads via tournament/state endpoints.
  **Gap:** a `display`/read-model module is a future deliverable (spec Phase 6.3).

## Commands / Sync (Core Platform)

- `api/commands.py` — command queue (shared).
- `services/sync_service.py` — Supabase outbox sync.

## Core / app assembly

- `app/main.py` — FastAPI app + router includes.
- `app/dependencies.py` — DI (auth).
- `app/schemas.py` — Pydantic request/response models.
- `adapters/` — external service adapters.

## Risk list

- `api/brackets.py` — single very large file; trails Meet's modularity (spec weak point #5).
- `api/schedule_*.py` spread — Meet's solver concerns are split across seven route files;
  a future Meet module should consolidate the boundary, not the files, first.
```

- [ ] **Step 2: Content-quality check**

Run: `grep -nE "TODO|TBD|FIXME" docs/architecture/workspace-suite/backend-ownership-map.md`
Expected: no matches.

Spot-verify three cited paths still exist:
Run: `ls products/scheduler/backend/api/tournaments.py products/scheduler/backend/api/brackets.py products/scheduler/backend/services/sync_service.py`
Expected: all three list without error.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/workspace-suite/backend-ownership-map.md
git commit -m "docs(arch): map backend modules to future suite ownership"
```

---

### Task 4: Import-boundary rules

**Files:**
- Create: `docs/architecture/workspace-suite/import-boundaries.md`

**Interfaces:**
- Consumes: the ownership maps from Tasks 2 and 3.
- Produces: the dependency rules that the Task 6 facade is the first instance of, and that future product-module work must follow.

- [ ] **Step 1: Write the import-boundary rules**

Create `docs/architecture/workspace-suite/import-boundaries.md` with this content:

```markdown
# Import Boundary Rules

Dependency rules for the suite. These are *conventions* in Phase 1 (no lint
enforcement yet); a future task may encode them as ESLint `no-restricted-imports`
or an import-linter config. They derive from frontend-ownership-map.md and
backend-ownership-map.md.

## Frontend rules

1. **Product modes must not import each other's internals.** `features/bracket/*`
   must not import from `features/schedule/*`, `features/liveOps/*`, etc., and vice
   versa. Meet must not import Bracket internals; Bracket must not import Meet internals.
2. **Cross-product shared state flows through the platform layer** (`api/`, `hooks/`
   identity hooks, `store/`, `services/`) or a workspace-level facade — never by
   reaching into another product's store/UI.
3. **Display consumes read models / public data**, not operator stores. `pages/
   PublicDisplayPage.tsx` and `pages/publicDisplay/*` must not import operator-only
   feature internals.
4. **The user-facing container noun comes from `platform/domain/workspace.ts`.** Hub
   and shell chrome read display copy from the facade rather than hard-coding
   "tournament"/"workspace" strings. (Event-*kind* labels like "MEET"/"TOURNAMENT"
   badge are a separate concern, not governed by this rule yet.)
5. **The design system is a leaf.** `@scheduler/design-system` must not import from
   `products/scheduler/frontend/src/*`.

## Backend rules

6. **Product route modules use their own services + shared repositories.** No
   cross-product service imports (e.g., `api/brackets.py` must not import
   `services/schedule_impact.py`); cross-product needs go through workspace-level
   services or explicit APIs.
7. **Meet must not read Bracket service internals directly, and vice versa.**
8. **Display data is prepared as read models** for public output, not by exposing
   operator service internals.

## Allowed shared dependencies (both stacks)

- Workspace identity, shared roster/courts/time primitives, commands/write-status,
  realtime read models, and product-specific public APIs are the sanctioned
  cross-product contracts. Everything else is product-private.
```

- [ ] **Step 2: Content-quality check**

Run: `grep -nE "TODO|TBD|FIXME" docs/architecture/workspace-suite/import-boundaries.md`
Expected: no matches.

Confirm the doc has both a Frontend rules section and a Backend rules section, and that rule 4 names `platform/domain/workspace.ts` (the Task 6 facade).

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/workspace-suite/import-boundaries.md
git commit -m "docs(arch): define suite import-boundary rules"
```

---

### Task 5: Meet design-primitive inventory + parity checklist

**Files:**
- Create: `docs/architecture/workspace-suite/meet-design-inventory.md`

**Interfaces:**
- Consumes: glossary terms from Task 1.
- Produces: the inventory of Meet/design-system primitives to reuse, plus a Bracket/Display parity checklist (informs spec Phase 3).

- [ ] **Step 1: Write the design inventory**

Create `docs/architecture/workspace-suite/meet-design-inventory.md` with this content (token/component facts as of 2026-06-23 from `packages/design-system/`):

```markdown
# Meet Design-Primitive Inventory

Meet is the reference standard. The suite's design language is *extracted* from Meet
and the existing `@scheduler/design-system`, not reinvented. This inventory is the
input to spec Phase 3 (design language extraction). No visuals change in Phase 1.

## Already extracted (in `@scheduler/design-system`)

Package: `@scheduler/design-system` (private, ESM). Exports:

- **Tokens** (`tokens.css`): canonical palette (`--bg`, `--bg-elev`, `--ink`,
  `--ink-muted`, `--ink-faint`, `--rule`, `--rule-soft`, `--accent`, `--accent-bg`,
  `--accent-ink`); spacing ladder `--space-1`..`--space-10` (2px→96px); radii
  (sharp/brutalist, ≤2px on controls); motion (easing + duration scale); density
  (row height, cell padding, gaps, badge height); typography (sizes 3xs 10px→2xl
  24px; Geist Variable for UI, JetBrains Mono Variable for numerics). Light
  ("Swiss Industrial Print") + dark ("Tactical Telemetry") schemes.
- **Components** (`components/index.ts`): `PageHeader`, `Card` (+ `CardHeader`,
  `CardFooter`, `CardTitle`, `CardDescription`, `CardContent`), `Input`, `Label`,
  `Select`, `Button`, `Modal`, `Hint`, `Separator`, `StatusPill`, `StatusBar`
  (+ `StatusCount`), `Toast` (+ `ToastStack`), `GanttTimeline` (+ `GANTT_GEOMETRY`,
  `placementBox`).
- **Tailwind preset** (`tailwind-preset.js`): maps tokens → Tailwind theme.
- **Icons** (`icons/index.tsx`): Phosphor wrapper.

## Meet patterns to codify (behavior notes, not yet formal primitives)

- **Header lockup:** boxed `ShuttleWorksMark` left + chrome controls right (sticky,
  `h-12`, bottom rule) — see `pages/TournamentListPage.tsx` header. Reused on operator
  surfaces; should become a shared Shell header rule.
- **PageHeader hierarchy:** eyebrow (uppercase, tracked) + title + description +
  right-aligned actions. Used on the dashboard; the standard section/page intro.
- **Status language:** `StatusPill` tones (green/idle/done) for entity status;
  `StatusBar`/`StatusCount` for aggregate counts. Status color is semantic.
- **Numeric layout:** `tabular-nums` for dates/counts (stable columns).
- **Gantt:** `GanttTimeline` geometry for schedule visualization.
- **Empty/loading/error language:** "Loading…", `Card` empty state, `role="alert"`
  destructive banner — see `TournamentListPage`.

## Bracket / Display parity checklist

For each item, confirm the sibling product uses the shared primitive (✅) or note the gap:

- [ ] Header lockup (boxed wordmark + chrome) — Bracket / Display
- [ ] PageHeader eyebrow+title+actions hierarchy — Bracket / Display
- [ ] `StatusPill` semantic tones for status — Bracket / Display
- [ ] `tabular-nums` for all numeric columns — Bracket / Display
- [ ] Shared empty/loading/error language — Bracket / Display
- [ ] `Toast`/`ToastStack` for command feedback — Bracket / Display
- [ ] Design tokens only (no ad-hoc colors/spacing) — Bracket / Display
- [ ] Operator-calm vs display-expressive expression rules respected — Display

(Phase 3 will fill these in with Meet reference screenshots and per-item findings.)
```

- [ ] **Step 2: Content-quality check**

Run: `grep -nE "TODO|TBD|FIXME" docs/architecture/workspace-suite/meet-design-inventory.md`
Expected: no matches. (The parity `- [ ]` checkboxes are intended deliverable items, not placeholders.)

Verify the design-system package name cited matches reality:
Run: `grep -n '"name"' packages/design-system/package.json`
Expected: shows `"name": "@scheduler/design-system"`.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/workspace-suite/meet-design-inventory.md
git commit -m "docs(arch): inventory Meet design primitives + parity checklist"
```

---

### Task 6: Workspace vocabulary facade + wire into Hub and shell chrome

**Files:**
- Create: `products/scheduler/frontend/src/platform/domain/workspace.ts`
- Create: `products/scheduler/frontend/src/platform/domain/__tests__/workspace.test.ts`
- Modify: `products/scheduler/frontend/src/pages/TournamentListPage.tsx` (Hub copy lines ~300, ~326, ~331)
- Modify: `products/scheduler/frontend/src/app/TabBar.tsx` (aria-label line ~90)

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `workspaceNoun: { lower: 'workspace'; title: 'Workspace'; lowerPlural: 'workspaces'; titlePlural: 'Workspaces' }`
  - `workspaceCopy: { dashboardDescription: string; ownedSectionTitle: string; ownedEmptyHint: string; tabsAriaLabel: string }`
  These are the only user-facing container-noun strings the Hub and tab chrome read (import-boundaries.md rule 4).

- [ ] **Step 1: Write the failing test**

Create `products/scheduler/frontend/src/platform/domain/__tests__/workspace.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { workspaceNoun, workspaceCopy } from '../workspace';

describe('workspaceNoun', () => {
  it('exposes the user-facing container noun in four cases', () => {
    expect(workspaceNoun.lower).toBe('workspace');
    expect(workspaceNoun.title).toBe('Workspace');
    expect(workspaceNoun.lowerPlural).toBe('workspaces');
    expect(workspaceNoun.titlePlural).toBe('Workspaces');
  });
});

describe('workspaceCopy', () => {
  it('derives Hub + chrome copy from the noun (single source of truth)', () => {
    expect(workspaceCopy.dashboardDescription).toBe(
      'Workspaces you own or have been invited to.',
    );
    expect(workspaceCopy.ownedSectionTitle).toBe('Your workspaces');
    expect(workspaceCopy.ownedEmptyHint).toBe("You don't own any workspaces yet.");
    expect(workspaceCopy.tabsAriaLabel).toBe('Workspace tabs');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `products/scheduler/frontend/`): `npx vitest run src/platform/domain/__tests__/workspace.test.ts`
Expected: FAIL — cannot resolve `../workspace` (module does not exist yet).

- [ ] **Step 3: Write the facade**

Create `products/scheduler/frontend/src/platform/domain/workspace.ts`:

```ts
/**
 * Workspace vocabulary facade.
 *
 * Phase 1 of the workspace-suite migration: the user-facing container noun
 * becomes "Workspace" while persistence, API routes (`/tournaments/*`), and DB
 * tables keep saying "tournament". This module is the single place the Hub and
 * shell chrome read the container noun, so a later, deeper rename touches one file.
 *
 * Scope rule (see docs/architecture/workspace-suite/import-boundaries.md, rule 4):
 * Hub + shell chrome only. Event-*kind* labels ("MEET" / "TOURNAMENT" badge) are a
 * separate concern and are NOT governed here.
 */
export const workspaceNoun = {
  /** lowercase singular — "workspace" */
  lower: 'workspace',
  /** Title-case singular — "Workspace" */
  title: 'Workspace',
  /** lowercase plural — "workspaces" */
  lowerPlural: 'workspaces',
  /** Title-case plural — "Workspaces" */
  titlePlural: 'Workspaces',
} as const;

export type WorkspaceNoun = typeof workspaceNoun;

/** User-facing copy for the Hub and shell chrome, derived from {@link workspaceNoun}. */
export const workspaceCopy = {
  dashboardDescription: `${workspaceNoun.titlePlural} you own or have been invited to.`,
  ownedSectionTitle: `Your ${workspaceNoun.lowerPlural}`,
  ownedEmptyHint: `You don't own any ${workspaceNoun.lowerPlural} yet.`,
  tabsAriaLabel: `${workspaceNoun.title} tabs`,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `products/scheduler/frontend/`): `npx vitest run src/platform/domain/__tests__/workspace.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the facade into the Hub (`TournamentListPage.tsx`)**

In `products/scheduler/frontend/src/pages/TournamentListPage.tsx`:

Add the import near the other local imports (the file already imports from `@scheduler/design-system` and local modules — place this with the local imports):

```ts
import { workspaceCopy } from '../platform/domain/workspace';
```

Replace the dashboard description (currently line ~300). Find:

```tsx
          description="Meets and tournaments you own or have been invited to."
```

Replace with:

```tsx
          description={workspaceCopy.dashboardDescription}
```

Replace the owned-section title + empty hint (currently lines ~326 and ~331). Find:

```tsx
              title="Your tournaments"
              variant="owned"
              items={owned}
              onOpen={openTournament}
              onDelete={(t) => setDeleteTarget(t)}
              emptyHint="You don't own any tournaments yet."
```

Replace with:

```tsx
              title={workspaceCopy.ownedSectionTitle}
              variant="owned"
              items={owned}
              onOpen={openTournament}
              onDelete={(t) => setDeleteTarget(t)}
              emptyHint={workspaceCopy.ownedEmptyHint}
```

Do NOT touch: the `eyebrow` strings ("DASHBOARD", "YOU OWN", "SHARED WITH YOU"), the
`title="Your events"` page title, the "Collaborating on" shared section, the kind badge
(`'TOURNAMENT' : 'MEET'` at line ~73), the delete-modal eyebrow/body (lines ~349/~358),
or any `openTournament`/navigation code. Routes stay `/tournaments/*`.

- [ ] **Step 6: Wire the facade into the tab chrome (`TabBar.tsx`)**

In `products/scheduler/frontend/src/app/TabBar.tsx`:

Add the import with the other local imports:

```ts
import { workspaceCopy } from '../platform/domain/workspace';
```

Find the tablist aria-label (currently line ~90):

```tsx
aria-label="Tournament scheduler tabs"
```

Replace with:

```tsx
aria-label={workspaceCopy.tabsAriaLabel}
```

- [ ] **Step 7: Type-check and run the full frontend test suite**

Run (from repo root): `npx tsc -b products/scheduler/frontend`
Expected: no errors.

Run (from `products/scheduler/frontend/`): `npx vitest run`
Expected: all tests pass (the prior suite count + 2 new). If any existing test asserted
the old strings ("Your tournaments", "Meets and tournaments you own…", "Tournament
scheduler tabs"), update that test to the new workspace copy and note it in the commit.

- [ ] **Step 8: Confirm routes and internals are untouched**

Run (from repo root): `git diff --stat`
Expected: only `platform/domain/workspace.ts` (new), its test (new), `TournamentListPage.tsx`,
and `TabBar.tsx` appear. No backend files, no route files, no DTO/store files.

Run: `git diff products/scheduler/frontend/src/pages/TournamentListPage.tsx products/scheduler/frontend/src/app/TabBar.tsx | grep -E "^\+" | grep -iE "/tournaments|navigate|route"`
Expected: no matches (no navigation/route literal was changed — only display copy).

- [ ] **Step 9: Commit**

```bash
git add products/scheduler/frontend/src/platform/domain/workspace.ts \
        products/scheduler/frontend/src/platform/domain/__tests__/workspace.test.ts \
        products/scheduler/frontend/src/pages/TournamentListPage.tsx \
        products/scheduler/frontend/src/app/TabBar.tsx
git commit -m "feat(suite): introduce Workspace vocabulary facade at Hub + tab chrome

Single source of truth for the user-facing container noun (platform/domain/
workspace.ts). Hub dashboard copy and tab-bar aria-label now read 'Workspace'
language; routes, tables, DTOs, and deep internals still say 'tournament'.
Reversible, no behavioral change."
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** Preferred First Implementation Plan items 1–5 → Tasks 1, 2+3, 4, 5, 6 respectively. Open Decisions 1–5 honored (Hub-only rename via facade; routes preserved, no new URL scheme; Display unchanged this phase; no `/workspaces/*` aliases; no repo split). Non-Goals respected (no feature/behavior/table/route changes; backend untouched).
- **Placeholder scan:** doc `- [ ]` parity items in Task 5 are intended deliverables, explicitly noted as such; no other TODO/TBD. All code steps show complete content.
- **Type consistency:** `workspaceNoun`/`workspaceCopy` field names (`lower`, `title`, `lowerPlural`, `titlePlural`; `dashboardDescription`, `ownedSectionTitle`, `ownedEmptyHint`, `tabsAriaLabel`) are identical in the test (Step 1), the implementation (Step 3), and the wiring (Steps 5–6).
- **Scope:** single coherent phase (docs + one small facade slice); no decomposition needed.
