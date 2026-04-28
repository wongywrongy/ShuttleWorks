# Phase 3 — TV display modes, position-grid column manager, school accents, inline search

**Date:** 2026-04-27 (continuation) · Working tree dirty (no commit per directive).

This phase delivers the six items the user requested after Phase 2:

1. TV display modes (per-tournament).
2. Position-grid column reorder + show/hide.
3. School identity tied into match + player chips (minimal accent).
4. Player search + filters in Roster.
5. Same inline search/filter pattern on Matches + Schedule.
6. Refinement: inline minimal search (`cmd+k` focus), URL-backed filter state, result counts, "no match" empty states.

Per the user's enterprise-feel directive: school accents are minimal —
a 6–10 px filled dot before the player name in the school's color, no
labels, no badge text. Tooltip carries the school name.

## What landed

### 1 · Foundation primitives (new, reused everywhere)

- **`hooks/useSearchParamState.ts`** — debounced URL-string state via
  `react-router-dom`'s `useSearchParams`. Works for free-text search.
- **`hooks/useSearchParamSet`** (same file) — comma-separated set
  variant for filter chips. Toggles sort the array on write so the URL
  is canonical.
- **`components/InlineSearch.tsx`** — 28 px inline row: search input
  (with magnifier + clear), optional filter-chip groups, result-count
  read-out, optional "Clear" button. `cmd+k` / `ctrl+k` focuses the
  input while mounted. Keys: tight, single-row, no card chrome.
- **`lib/schoolAccent.ts`** — `getPlayerSchoolAccent(player, groups)`
  resolves a player → `{ color, name, abbrev }`. Color comes from
  `group.metadata.color` if set; otherwise a deterministic djb2 hash
  picks one of 8 saturated mid-tones (Tailwind *-600 family) so a
  school always paints the same hue across reloads.
- **`components/SchoolDot.tsx`** — minimal filled dot, sm = 6 px,
  md = 8 px, lg = 10 px. No border, no label, tooltip + aria-label
  = school name.

### 2 · TV display modes (per-tournament)

- New optional field `config.tvDisplayMode: 'strip' | 'grid' | 'list'`
  on the tournament config (added to both `frontend/src/api/dto.ts`
  and `backend/app/schemas.py`; round-trip verified via curl).
- **strip** (current default) — single-column tall court cards.
- **grid** — 2-column responsive grid; reuses the same court-card
  render. Best for 8–16 courts on a 1080p TV.
- **list** — dense one-line rows with `Court · Event · Players · Score
  · Timer`. Best for 16+ courts.
- Picker UI: 3-button radiogroup pill in the TV preview header. Only
  visible in admin (`/`); hidden in standalone `/display` so the
  audience never sees the chrome.
- File: `frontend/src/pages/PublicDisplayPage.tsx`.

### 3 · Position-grid column reorder + show/hide

- New optional fields on the tournament config:
  - `eventOrder: string[]` — explicit prefix order, e.g.
    `['XD', 'MD', 'WD', 'WS', 'MS']`.
  - `eventVisible: Record<string, boolean>` — per-prefix visibility.
- New **Columns** popover in the Position-grid header (gear icon).
  Each event row: drag-handle glyph + prefix + full label + ▲/▼ move
  buttons + eye-toggle (visible/hidden). A **Reset** button restores
  the canonical MD/WD/XD/WS/MS order with everything visible.
- Forward-compat: any newly-added event auto-appends to the end so the
  user never silently loses a column when `rankCounts` changes.
- File: `frontend/src/features/roster/PositionGrid.tsx`. Logic for
  re-order + visibility applied inside `events` memo.
- The drag-handle is decorative for now (▲/▼ buttons do the actual
  reorder). True drag-reorder of table columns requires nested
  DndContext gymnastics with the parent player-drag context — out of
  scope for Phase 3, low value over a 5-item list.

### 4 · School accents on player chips

Applied wherever players appear across schools:

- **`features/matches/MatchesList.tsx`** — one school dot per side
  (Side A / Side B / Side C), sourced from the side's first player.
- **`features/matches/MatchesSpreadsheet.tsx`** — school dot inside
  each player chip in the inline `PlayerMultiPicker`.
- **`pages/SchedulePage.tsx`** — `MatchesTable`: school dot before
  player names in both *By Time* and *By Court* views.
- **PlayerPool, Roster grid** — *not* dotted because they're
  school-scoped already; redundant.
- **TV display, MatchDetailsPanel, Live grid** — left for a future
  pass; the MatchDetailsPanel pattern is more involved and the user
  asked for "minimal" first.

### 5 · Inline search + filters across the three list surfaces

Same `<InlineSearch />` component, same URL-param convention, same
behaviour. Result counts, clear-all, friendly empty states.

#### Roster — `features/roster/PlayerPool.tsx`
- Local-only search (per-school side-pool; not URL-backed since the
  pool is sub-surface chrome).
- Placeholder: "Filter N players…".

#### Matches — `features/matches/MatchesList.tsx` and
#### `features/matches/MatchesSpreadsheet.tsx`
- URL params: `q` · `event` · `school` · `type`.
- Filter chip groups: **Event** (auto-derived rank prefixes), **School**
  (when ≥2 schools exist), **Type** (Dual / Tri).
- Replaces the older bespoke search bar in `MatchesList` with the
  unified component.

#### Schedule — `pages/SchedulePage.tsx` `MatchesTable`
- URL params: `q` · `event` · `court`.
- Filter chip groups: **Event**, **Court** (auto-derived from the
  active assignments).
- Filter applies to both *By Time* and *By Court* table views; both
  reflow off the same `filteredAssignments` memo.

### 6 · Refinement / "ease of use"

- All filter state in URL (`?q=foo&event=MS,WS&school=g1`) — operators
  can paste a filtered view to a colleague.
- Result counts are tabular ("12 of 47") so they don't shift width as
  numbers change.
- Empty filter-no-match state surfaces inside the same surface ("No
  matches match these filters") rather than reusing the page-level
  empty state.
- `cmd+k` focuses the active surface's search bar; releases on
  unmount, so it never traps focus when the user switches tabs.
- Every chip uses `aria-pressed` for assistive-tech state. The
  radiogroup on the TV picker uses `role="radio"` + `aria-checked`.

## Files touched

**New:**
- `frontend/src/components/InlineSearch.tsx`
- `frontend/src/components/SchoolDot.tsx`
- `frontend/src/hooks/useSearchParamState.ts`
- `frontend/src/lib/schoolAccent.ts`

**Modified:**
- `backend/app/schemas.py` — `tvDisplayMode`, `eventOrder`, `eventVisible`
- `frontend/src/api/dto.ts` — same DTO additions
- `frontend/src/features/matches/MatchesList.tsx` — InlineSearch + dots
- `frontend/src/features/matches/MatchesSpreadsheet.tsx` — InlineSearch + dots
- `frontend/src/features/roster/PlayerPool.tsx` — InlineSearch
- `frontend/src/features/roster/PositionGrid.tsx` — Column manager
- `frontend/src/pages/PublicDisplayPage.tsx` — TV display modes
- `frontend/src/pages/SchedulePage.tsx` — InlineSearch + dots

## Verification

- `npx tsc --noEmit` clean.
- `npm run build` clean (4.86 s, 1881 modules).
- Docker `frontend` + `backend` rebuilt + force-recreated.
- Backend round-trip: `PUT /tournament/state` with
  `config.tvDisplayMode = 'list'` returns the same value (Pydantic
  schema accepts new field).
- Frontend: clicking the TV `list` radio sets `aria-checked='true'`
  + persists `tvDisplayMode: 'list'` to localStorage; the list-mode
  layout (`hasGridList=true / hasStripCard=false`) renders.
- Matches + Schedule InlineSearch verified visually under
  `docs/audit-2026-04-27/screenshots/p3-01-*` and
  `p3-02-*`.

## Decisions worth noting

- **TV display mode** stored on the tournament config (per-tournament,
  venue-bound). User explicitly said "since it may be up to the
  director" — director chooses, and the choice is part of the venue's
  setup. Not per-device.
- **School accent palette** is fixed to 8 saturated mid-tones rather
  than synthesised HSL. Predictable, enterprise-coded. Matches Tailwind
  *-600 so it pairs with both light + dark surfaces.
- **No drag-reorder of position-grid columns** for Phase 3. ▲/▼
  buttons are sufficient at 5 items and avoid nested-DndContext
  conflicts with the player-drag context. Drag-handle glyph still
  shows, signalling future drag is plausible.
- **InlineSearch is presentational.** Caller owns filter state. This
  keeps the component composable across Roster / Matches / Schedule
  without a coupled state manager.
- **Filter chip groups OR within a group, AND across groups.** Match
  must satisfy *all* chip-group filters; within a group, *any* chip
  selected matches.
- **`cmd+k` is per-surface, not global.** The active mounted
  `<InlineSearch />` registers the listener while mounted. There's no
  global command palette — that's a separate project.
- **MatchDetailsPanel + TV + Live grid** don't yet show school dots.
  These are bigger surfaces with denser content. Left for a future
  pass; the Phase 3 minimal-accent pattern is established and easy to
  extend.

## What remains (a Phase 4 backlog if you want one)

- Apply school dots to MatchDetailsPanel (impact list + score header).
- Apply school dots to the IN PROGRESS card on Live tab.
- Apply school dots to the TV list-mode rows.
- Drag-reorder for the position-grid columns (in addition to ▲/▼).
- Persist `tvDisplayMode` selection per `view` (Courts vs Schedule vs
  Standings), or default once-per-load.
- Wire `config.eventOrder` / `eventVisible` into the roster export
  XLSX so the column order in the file matches the on-screen view.
