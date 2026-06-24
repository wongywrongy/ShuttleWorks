# Hub Control-Plane Redesign (sub-project #3) — design

**Date:** 2026-06-23
**Status:** accepted (user said "proceed with the plan")
**Branch:** `dev/workspace-suite`
**Program:** Workspace-modules control plane. Builds on #1 (persistence) + #2 (frontend reads real modules). Pure frontend.

## Goal

Turn `/` from a centered table into a **full-width operational control plane**: a top command bar, filterable/searchable workspace list with module + status density, and a right-side inspector for the selected workspace. Professional, neutral, crisp — not a generic admin-card stack. No backend/route changes.

## What data exists (no backend change this slice)

`TournamentSummaryDTO` provides: `name`, `status` (draft/active/archived), `kind`, `tournamentDate`, `createdAt`, `updatedAt`, `role` (owner/operator/viewer), `ownerName`, and `modules[]` (the real catalog from #1). So the Hub can show: name, **module chips from real `modules[]`**, role, owner, status, **last-updated (`updatedAt`)**, and the per-workspace module catalog in the inspector.

Deferred to #6 (needs new data/endpoints): collaborator counts, invite/share state, sync health. The layout reserves a place for them; this slice ships the columns the DTO supports and does NOT fabricate the rest.

## Layout

A full-height, full-width shell (replaces the `max-w-4xl` centered column):

```
┌ top bar: ShuttleWorks · [search input] ········· Theme · New workspace ┐
├ filter tabs: All · Active · Draft · Shared with me · Needs attention ──┤
├──────────────────────────────────────┬─────────────────────────────────┤
│ workspace list (dense rows)          │ inspector (selected workspace)  │
│  name + module chips · role · owner  │  name, status, dates, role      │
│  · status · updated · Open · Delete  │  module catalog (all statuses)  │
│  …                                   │  Open · (placeholders for #6)   │
└──────────────────────────────────────┴─────────────────────────────────┘
```

- **Top bar:** boxed `ShuttleWorksMark`, a search `<input>` (filters by name, client-side), `ThemeToggle`, and the primary `New workspace` button (→ `/new`, unchanged).
- **Filter tabs:** `All` / `Active` / `Draft` / `Shared with me` / `Needs attention`. Definitions (client-side over the loaded list):
  - Active/Draft → `status` match. Shared with me → `role !== 'owner'`. Needs attention → owned + `status === 'draft'` (incomplete setup). All → everything.
  - Each tab shows a count badge.
- **Workspace list:** dense rows (not big cards). Columns: name (+ truncate), module chips (`modulesFromDto(modules)` with fallback to `kind`), role, owner (when shared), status pill, last-updated (relative-ish `updatedAt`), `Open`, `Delete` (owners only). Clicking a row selects it (inspector); `Open` navigates; row keyboard-focusable.
- **Inspector (right, ~320px):** the selected workspace's summary — name, status pill, created/updated, role, owner, and the **full module catalog** (each module: label + status chip + note for non-enabled). Primary `Open`. A muted "Sharing & collaborators — coming in a later phase" placeholder (honest, not faked). Collapses/empty-states when nothing selected ("Select a workspace").

## Visual direction

Use existing design tokens (`@scheduler/design-system`, Tailwind theme): cool neutral surfaces (`bg-background`/`bg-card`/`bg-muted`), crisp 1px `border-border` dividers, dense but readable spacing, restrained accent (`text-accent`/`bg-accent/10`) only for enabled modules + active tab. No drop-shadow card stack. Match Meet's operational density. Keep `StatusPill` for status. Sections separated by hairline borders, not gaps.

## Components (`products/hub/`)

- Rewrite `HubPage.tsx` into the shell + composition; extract focused pieces to keep files small:
  - `HubTopBar.tsx` (wordmark, search, theme, New workspace) — or inline if small.
  - `WorkspaceListRow.tsx` (one dense row; reuses `ModuleChips`).
  - `WorkspaceInspector.tsx` (right panel; module catalog from `modulesFromDto`).
  - `hubFilters.ts` (pure: filter predicate + counts per tab; unit-tested).
  - Keep `ModuleChips` (reads real `modules[]`).
- `useState` for `query`, `activeFilter`, `selectedId`; existing `refresh`/`openTournament`/delete-modal logic preserved.

## Constraints

- No backend/DB/DTO/route/solver changes; `/new`, `/tournaments/*` unchanged; Meet untouched.
- Preserve create (→ `/new`), open (kind-correct route), delete (confirm modal) behavior.
- Module chips/inspector read the real `modules[]` DTO (fallback to `kind`).
- tsc clean; full `npx vitest run` green; `npm run build` clean.

## Tests

- `hubFilters`: predicate + counts for All/Active/Draft/Shared/Needs-attention over a fixture list.
- HubPage: renders the top bar (search + New workspace), filter tabs with counts; typing in search filters rows; clicking a filter narrows rows; clicking a row populates the inspector with that workspace's module catalog; Open routes meet→`/setup`, bracket→`/bracket-setup` (keep existing nav tests); module chips read `modules[]` when present (keep existing).
- Keep all currently-green Hub tests passing (adapt selectors as needed).
- Run focused hub tests, full Vitest, build before committing.

## Acceptance criteria

1. `/` is a full-width control plane: top command bar + search, filter tabs with counts, dense list, right inspector.
2. List + inspector read real `modules[]` (fallback `kind`); status/role/owner/updated shown from the DTO.
3. Search + all five filters work; empty state offers Create workspace + explains modules.
4. Create/open/delete preserved; routes/backend/Meet untouched; tsc + suite + build green.
5. No fabricated collab/sync data — those are honest placeholders deferred to #6.

## Deferred

Collaborator/invite/share columns + sync health (#6, needs backend); per-module configure deep-links (#5 Settings); bulk actions.
