# Phase 4 — TV configurability, search refinement, school dots on Live

**Date:** 2026-04-27 (continuation) · Working tree dirty (no commit per directive).

## What landed

### 1 · TV configurability (per-tournament)

The director now has a **Public display** card on the Setup page with
end-to-end control of how the venue TV looks. All knobs persist on
`TournamentConfig` so the venue's setup survives reloads.

- **Mode** — `strip` / `grid` / `list` (already in Phase 3, mirrored
  here so all TV settings live in one card).
- **Grid columns** — `auto` / `1` / `2` / `3` / `4`. Forces a
  constant card size when the venue's TV-to-court ratio is fixed.
- **Card size** — `auto` / `compact` / `comfortable` / `large`.
  Drives padding + court-number / event-code / player text size in
  both strip and grid modes.
- **Background tone** — `navy` (slate-950, default) / `black`
  (OLED-pure) / `midnight` (deep blue) / `slate` (cool gray).
  Applied to the TV page background and the sticky header / footer.
- **Accent color** — drives the LIVE border, LIVE pill, and progress
  bar. Pick from an 8-color preset palette (emerald / blue / violet /
  rose / amber / teal / cyan / orange) or enter a custom 6-digit hex.
  A native `<input type="color">` is provided alongside for true
  any-color picking.
- **Show scores** — toggle off when the venue prefers private scores
  until the match ends. Hides the aggregate + per-set breakdown on
  every court card.

New file: `frontend/src/features/tournaments/PublicDisplaySettings.tsx`.
DTO + Pydantic schema additions in `frontend/src/api/dto.ts` and
`backend/app/schemas.py` for the five new fields. Rendering wired into
`PublicDisplayPage.tsx` — accent uses inline `style` (because it's a
runtime hex outside Tailwind's safelist) for the border, the LIVE
pill, and the progress bar fill.

### 2 · Search refinement (user feedback)

Per the user's directive ("dont need the event and court in the search
as well as the extraneous number"):

- **Event chips removed** from Matches list, Matches spreadsheet, and
  Schedule. Free-text search still matches event prefixes (e.g., `MS`
  matches `MS3`), so the chips were redundant.
- **Court chips removed** from Schedule. Free-text matches `C5` etc.
- **Result count removed** from every consumer. The number was visual
  noise.
- **School + Type chips kept** on Matches (still the most-asked
  filters, not in the user's removal list).

Files: `MatchesList.tsx`, `MatchesSpreadsheet.tsx`, `SchedulePage.tsx`.
The `InlineSearch` component itself didn't need changes — the count
prop is already optional.

### 3 · Inline search added to Live tab

`features/control-center/WorkflowView.tsx` now hosts an `InlineSearch`
above the three columns (In Progress / Up Next / Finished). Text query
matches event code OR any player name; partition + ordering of the
columns are preserved, only the visible cards within each column
are filtered.

When a search is active and a column has hits *outside* the search,
the empty state reads "No match" instead of the original "None".

### 4 · School dots on Live cards

`features/tracking/MatchStatusCard.tsx` now renders a school accent dot
before each side's player names:

```
[● Alice & Bob] vs [● Carol & Dan]
```

Single dot per side (first player wins the school identity). 6 px,
no label. Tooltip carries the school name. Reuses the same
`SchoolDot` + `getPlayerSchoolAccent` helpers from Phase 3 so the
palette stays consistent with Matches and Schedule.

## Files touched

**New:**
- `frontend/src/features/tournaments/PublicDisplaySettings.tsx`

**Modified:**
- `backend/app/schemas.py` — `tvAccent`, `tvBgTone`, `tvGridColumns`,
  `tvCardSize`, `tvShowScores`
- `frontend/src/api/dto.ts` — same DTO additions
- `frontend/src/pages/PublicDisplayPage.tsx` — wired all five knobs
  into rendering; replaced hardcoded emerald with inline-style accent
- `frontend/src/pages/TournamentSetupPage.tsx` — mounted
  `<PublicDisplaySettings />` between Appearance and the config form
- `frontend/src/features/matches/MatchesList.tsx` — dropped Event chip,
  dropped result-count
- `frontend/src/features/matches/MatchesSpreadsheet.tsx` — same
- `frontend/src/pages/SchedulePage.tsx` — dropped Event + Court chips,
  dropped result-count
- `frontend/src/features/control-center/WorkflowView.tsx` — added
  InlineSearch + per-column filter
- `frontend/src/features/tracking/MatchStatusCard.tsx` — school dots
  before each side

## Verification

- `npx tsc --noEmit` clean
- `npm run build` clean (4.17 s, 1881 modules)
- Docker `frontend` rebuilt + force-recreated
- Backend round-trip validated in Phase 3 (the Pydantic schema accepts
  the new optional fields)

## Decisions worth noting

- **Accent applied via inline `style`** rather than dynamic Tailwind
  classes. Tailwind's JIT only emits classes it can statically detect,
  so an arbitrary user-picked hex needs the inline-style escape hatch
  for `borderLeftColor`, `backgroundColor`, and `color`. The 20% alpha
  on the LIVE pill is computed by appending `33` to the hex.
- **Background tones are a fixed enum** (4 presets) rather than a hex
  picker. Audiences read TVs from across a venue and a custom-bg is
  rare and easy to mess up (low-contrast text). The accent is the
  branding hook; the bg is a tone preset.
- **Card size has 4 levels** (auto / compact / comfortable / large)
  rather than a numeric. Operators don't think in pixels; they think
  in "I want it bigger" or "I want it denser". The named levels also
  let the design system tune what "large" means without breaking
  saved configs.
- **`tvShowScores` defaults to true** (`!== false` check) so existing
  tournaments keep their current behaviour. Opt-out, not opt-in.
- **Schools dots on the Live MatchStatusCard** use a 6 px size — same
  as the Matches list. The Live card is dense; the dot needs to
  register without crowding the player names.

## What remains (open backlog)

- **Drag-reorder for the position-grid columns** — still ▲/▼ only.
- **`eventOrder` / `eventVisible` into the roster XLSX export** — not
  yet wired; export ignores the column-manager's order today.
- **School dots on `MatchDetailsPanel`** (the right-side panel on the
  Live tab) — left for a future pass; the panel is structurally more
  involved than the row-level cards.
- **TV `Schedule` and `Standings` sub-views** — currently use
  hardcoded slate colors; the accent / bg-tone don't yet flow into
  those secondary views. Trivial to extend if the user wants it.
