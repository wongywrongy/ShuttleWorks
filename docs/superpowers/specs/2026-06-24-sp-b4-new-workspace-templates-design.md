# SP-B4 — New Workspace template seeds — design

**Date:** 2026-06-24
**Status:** accepted (autonomous continuation per user grant)
**Branch:** `dev/workspace-suite`
**Program:** "Control Plane First" → completes the **create** side of real
multi-module workspaces. SP-A built the backend `modules[]` create-seed; SP-B1/B2/B3
made multi-module workspaces real. SP-B4 wires the New Workspace template picker to
send the seed, enabling the **Hybrid** and **Blank** templates that ship today as
disabled "Coming soon". Frontend-only.

## Goal

`/new` (`NewWorkspacePage`) already presents four templates, but **Hybrid Event** and
**Blank Workspace** are disabled because create only sends `{name, kind,
tournamentDate}` — never `modules[]`. The backend create endpoint has accepted a
validated `modules[]` seed since SP-A. SP-B4 sends each template's module seed on
create, enabling all four templates, so a workspace's module set is chosen up front
(create→use) in addition to post-create (Settings → Modules).

## Decisions (from SP-A's template definitions + post-SP-B3 reality)

Each template maps to a legacy `kind` (compatibility) **and** an explicit module seed:

| Template | kind | seed (`status`) | lands on |
|---|---|---|---|
| Meet Day | meet | meet `enabled`, bracket `available`, display `enabled` | `setup` |
| Bracket Tournament | bracket | bracket `enabled`, meet `available`, display `available` | `bracket-setup` |
| Hybrid Event | meet | meet `enabled`, bracket `enabled`, display `enabled` | `setup` |
| Blank Workspace | meet | meet `available`, bracket `available`, display `disabled` | **Settings → Modules** |

All four seeds satisfy the backend's create-seed validation (display `enabled` only
when meet/bracket `enabled` — Meet Day + Hybrid both enable meet). Blank has zero
enabled modules (legitimate), so it lands on the workspace **Settings** page
(`/tournaments/:id/settings`) where the operator enables modules — matching "start
empty and enable modules as you go". The other three land on their primary module's
home tab.

## Changes (frontend only)

1. **`api/dto.ts`** — add `modules?: WorkspaceModuleDTO[]` to `TournamentCreateDTO`.
   `apiClient.createTournament` already posts the body verbatim, so no client change.
2. **`products/hub/NewWorkspacePage.tsx`** —
   - `Template` carries `kind: 'meet' | 'bracket'`, a `seed: WorkspaceModuleDTO[]`
     (`{ moduleId, status, config: null }`), and a `destination` (a tab segment, or
     the `'settings'` sentinel for Blank).
   - All four templates are **enabled** (drop `kind: null` / `comingSoon`); the
     module chips derive from the seed (modules that are `enabled` or `available`).
   - `handleCreate` posts `{ name, kind, tournamentDate, modules: template.seed }`
     and navigates to `/tournaments/${id}/${destination}` — or
     `/tournaments/${id}/settings` when `destination === 'settings'`.

## Out of scope

- Backend changes — the `modules[]` create-seed + validation already exist (SP-A).
- A free-form custom-module builder (per-module toggles at create time) — the four
  templates cover the cases; a custom builder is a later option if wanted.
- Hybrid identity/label, hybrid-aware signals — pre-existing deferred follow-ups.

## Constraints

- Frontend-only; no backend/route changes; `kind` still sent (legacy compatibility).
- All four seeds must pass the backend create-seed validation (verified above).
- Existing design tokens; the page's layout is unchanged (only the templates' data +
  the create payload).
- Gate from `products/scheduler/frontend`: `tsc -b`, `vitest run`, `build`.

## Tests (`NewWorkspacePage.test.tsx`)

- Meet Day → `createTournament` called with `kind: 'meet'` **and** a `modules` seed
  enabling meet + display; routes to `/setup`.
- Bracket Tournament → `kind: 'bracket'` + seed; routes to `/bracket-setup`.
- **Hybrid** → enabled (not disabled); `createTournament` with all three modules
  enabled; routes to `/setup`.
- **Blank** → enabled; `createTournament` with meet/bracket `available`, display
  `disabled`; routes to `/tournaments/:id/settings`.
- Replace the "Hybrid and Blank are disabled" test with the two enable/route tests.

## Acceptance criteria

1. `TournamentCreateDTO` carries optional `modules`; create sends each template's
   seed.
2. All four templates are selectable; Hybrid and Blank create real multi-module /
   blank workspaces.
3. Each template lands on the right place (primary module home; Blank → Settings).
4. `tsc` + `vitest` + `build` green; no backend/route changes.
