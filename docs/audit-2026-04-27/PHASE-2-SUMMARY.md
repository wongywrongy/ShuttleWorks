# Phase 2 — Design system foundation + targeted bug fixes

**Date:** 2026-04-27 · **Skill:** `ui-ux-pro-max:ui-ux-pro-max` · **Stopped after Phase 2** per user direction.

This phase closes every item in
[`PHASE-1-AUDIT.md`](./PHASE-1-AUDIT.md) tagged `BUG` for B1, B2, B3, B6, B7
plus all of T1–T3, S1–S2, Bt2–Bt4, St1–St3. It also delivers the
density-toggle that the user asked for as a config option.

The polish backlog (empty states, keyboard shortcuts, sticky table
headers, TV auto-rotate, score on TV, etc.) and B4 / B5 are out of
scope per the "stop after Phase 2" instruction.

## What landed

### 1 · Typography foundation (T1–T3)

- Self-hosted **Inter Variable** (body) + **JetBrains Mono Variable**
  (numerics) via `@fontsource-variable/*`. Registered once in
  `frontend/src/main.tsx`. No CDN dependency.
- `body` now renders `font-family: 'Inter Variable', …` with `cv11 ss01
  ss03` feature-settings for cleaner data.
- `code / kbd / pre / samp / time / [data-numeric]` automatically use
  JetBrains Mono with `font-variant-numeric: tabular-nums` so digit
  columns no longer jitter as values change.
- Tailwind's font scale gains a new `text-2xs` (11 px / tracking 0.02 em)
  for overlines and micro-eyebrows.
- Type pairing chosen at Claude's discretion per the user's directive.
  Inter is the de-facto enterprise standard (Linear / Stripe / Vercel /
  Notion). JetBrains Mono is the most legible monospace at body sizes.
  Fira Sans was the skill's recommendation but Fira-everywhere reads
  more dev-tool than enterprise dashboard.

### 2 · Density toggle (user ask)

- New per-device preference `density: 'comfortable' | 'compact'` on
  `usePreferencesStore` (separate localStorage key from theme + tournament).
- New hook `useAppliedDensity()` mirrors `useAppliedTheme()`; toggles
  `data-density="compact"` on `<html>`.
- New component `<DensityToggle />` (two-state pill, Comfortable /
  Compact icons via Lucide).
- Mounted once in `AppShell.tsx` alongside `useAppliedTheme`. Toggle
  surfaces in two places:
  1. Header pill, next to the theme toggle (always reachable).
  2. **Setup → Appearance** card, alongside the theme toggle, with
     a section eyebrow `THEME / DENSITY`.
- CSS variables drive sizing: `--density-row-h`, `--density-cell-py`,
  `--density-cell-px`, `--density-gap`, `--density-section-gap`,
  `--density-badge-h`. Comfortable defaults: 36 / 8 / 12 / 16 / 24 / 22.
  Compact: 28 / 4 / 8 / 12 / 16 / 18.
- Tailwind plugin adds two custom variants:
  - `compact:py-1` — applies only when `[data-density="compact"]`.
  - `comfortable:py-3` — applies only when comfortable (default).
- Density-aware utility classes: `h-row`, `min-h-row`, `h-badge`,
  `p-cell`, `gap-section`, `gap-gap`, `space-cell-y`, `px-cell`. Use
  these in new components instead of hardcoding spacing.

### 3 · Spacing foundation (S1–S2)

The full long-tail purge is multi-PR territory. Phase 2 lays down the
target scale in CSS vars + Tailwind utilities so future work can codemod
incrementally without bikeshedding. The spacing-aware utilities listed
above are the canonical entry points; Setup form `Save configuration` is
the first caller to land.

### 4 · Status semantic tokens (St1–St3)

- New named tokens in `src/index.css`:
  - `--status-live` (emerald) + `--status-live-bg`
  - `--status-called` (amber) + `--status-called-bg`
  - `--status-started` (sky) + `--status-started-bg`
  - `--status-blocked` (red) + `--status-blocked-bg`
  - `--status-warning` (amber) + `--status-warning-bg`
  - `--status-idle` (slate) + `--status-idle-bg`
  - `--status-done` (slate-muted) + `--status-done-bg`
- Light + dark variants, both passing WCAG AA against `bg-card`.
- Tailwind exposes them as `bg-status-live`, `text-status-live`,
  `border-status-live`, etc. (`*-bg` for the muted-tinted background).
- **Applied** in `features/control-center/GanttChart.tsx` (the schedule
  Gantt — closes B7) and `features/liveops/LiveOperationsGrid.tsx` (the
  Live ops grid; mirrors the same palette so the operator's mental model
  carries between tabs).

### 5 · Button hierarchy (Bt2–Bt4)

- `components/ui/button.tsx` gains `xs`, `icon-sm`, `icon-xs` sizes for
  dense toolbars and inline-with-table actions. Existing variants
  (default / destructive / outline / secondary / ghost / link) stay.
- **Bt2:** "Generate (replaces schedule)" → "Generate" (with a
  parenthetical-free "Click again to replace" confirm-state). Less
  marketing-page-CTA, more enterprise-tool-CTA.
- **Bt3:** Setup form `Save configuration` is now right-aligned, sized
  to content. Was a full-width black bar dominating the page.
- **Bt4:** Header status chip ("Idle" / "Solving" / "Degraded") is
  larger (`px-2.5 py-1 text-xs font-semibold` — was `px-2 py-0.5 text-xs`),
  has a 2 px dot (was 1.5 px), and uses semantic status tokens with a
  subtle border so it pops against the card surface.

### 6 · Inline bug fixes (B1, B2, B3, B6, B7)

- **B1** `components/common/ElapsedTimer.tsx:14-19` and
  `pages/PublicDisplayPage.tsx:43-50` — the format function now wraps:
  - `< 1 h` → `M:SS`
  - `< 24 h` → `H:MM:SS`
  - `≥ 24 h` → `Xd Hh`
  - Stale data that previously rendered `11395:48` now reads `8d 0h`,
    so the operator can recognise stale state and resolve.
- **B2** `components/SolverHud.tsx:73-86` — the "Solver idle — click
  Generate to begin." footer only renders on the Schedule tab now.
  Hidden on Roster / Matches / Live / Setup, where it was floating
  over real content.
- **B3** `features/roster/GroupStrip.tsx` — inserted an orphan-player
  banner above the school chips that surfaces players whose `groupId`
  doesn't match any registered school. Counts are tabular, the banner
  uses `bg-status-warning-bg/40` so it reads as advisory, not alarming,
  and copy directs the user to the recovery path ("Edit a player to
  assign, or import again with a school column").
- **B6** `pages/PublicDisplayPage.tsx:218-285,418,479-499` — empty courts
  on the public TV now show a "Next up · HH:MM" preview with the
  match's player names, sourced from the next future scheduled
  assignment for that court. Falls back to the static "Available" only
  when there's literally no upcoming match for the court (e.g.,
  tournament finished). Muted `text-slate-300` + `text-slate-500`
  eyebrow so the eye still locks onto live matches first.
- **B7** `features/control-center/GanttChart.tsx:45-66` and
  `features/liveops/LiveOperationsGrid.tsx:47-54` — `STATUS_STYLES` /
  `getStatusColor` rewired to the `status-*` semantic tokens. The Live
  grid now visibly differentiates scheduled (slate) / called (amber) /
  live (emerald) / done (muted slate). Per-block borders and text colors
  follow the same palette so the cue is multi-channel (color-blind safe).

## Files touched

**Foundation files (new or rewritten):**
- `frontend/src/index.css` — full theme + status + density token block
- `frontend/tailwind.config.js` — fonts, status colors, density utils, custom variants
- `frontend/src/store/preferencesStore.ts` — added density slice
- `frontend/src/hooks/useAppliedDensity.ts` (new)
- `frontend/src/components/DensityToggle.tsx` (new)
- `frontend/src/types/fonts.d.ts` (new — declares the `@fontsource-variable/*` modules)
- `frontend/src/main.tsx` — register fonts
- `frontend/src/app/AppShell.tsx` — mount `useAppliedDensity()`
- `frontend/src/app/TabBar.tsx` — show `<DensityToggle />` in header
- `frontend/src/pages/TournamentSetupPage.tsx` — Appearance card hosts both toggles

**Bug fixes / surface-level edits:**
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/common/ElapsedTimer.tsx`
- `frontend/src/components/SolverHud.tsx`
- `frontend/src/components/AppStatusPopover.tsx`
- `frontend/src/features/roster/GroupStrip.tsx`
- `frontend/src/features/control-center/GanttChart.tsx`
- `frontend/src/features/liveops/LiveOperationsGrid.tsx`
- `frontend/src/features/schedule/ScheduleActions.tsx`
- `frontend/src/features/tournaments/TournamentConfigForm.tsx`
- `frontend/src/pages/PublicDisplayPage.tsx`

**Dependency:**
- `frontend/package.json` + `package-lock.json` — `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`

## Verification

- `npx tsc --noEmit` clean.
- `npm run build` clean (8.42 s, 1881 modules).
- Docker `frontend` container rebuilt + force-recreated; navigated all
  tabs in light + dark + the public TV via Playwright. Captures live
  under `docs/audit-2026-04-27/screenshots/p2-*.png`.
- Verified body computed font-family resolves to `Inter Variable`.
- Verified `data-density="compact"` propagates `--density-row-h: 28px`
  (vs. 36 px comfortable).
- Verified XD3 (live status) renders with `bg-status-live-bg` + emerald
  border on the Live grid in light + dark.

## What remains (if Phase 3 ever runs)

These are explicitly **out of scope** for Phase 2. Listed so you can
re-prioritise or push back on the original "stop after Phase 2" call:

- **B4** — Roster orphan-player one-click reassignment action. Phase 2
  added the visibility banner; the recovery action would be a "Send all
  to → School A" dropdown.
- **B5** — TV Schedule + Standings empty-state fallbacks (auto-rotate
  to Courts when there's no scheduled or finished data).
- Codemod the long tail of raw `<button>` callers to `<Button>` from
  `components/ui/button.tsx`. Phase 2 only updated the most-visible
  toolbars (Schedule generate, Setup save).
- Codemod the 1.5 / 0.5 spacing long tail to the new 4-step scale.
- Apply `data-density` / `h-row` / `p-cell` to existing tables (Schedule
  by-time, MATCHES list, Roster spreadsheet) so density actually changes
  row heights everywhere — currently it changes them only in
  components that opt-in.
- Schedule LOG severity legend + summary chip.
- Live tab info hierarchy (the 98 % / 19-active line is still tiny).
- Empty-state polish across every list surface.
- Status colors on `MatchStatusCard.tsx` (the per-match status pill in
  Live ops controls).

## Decisions

- **Inter + JetBrains Mono** chosen over Fira Sans / Fira Code (the
  skill's recommendation). Reasoning: Inter is the dominant choice in
  enterprise dashboards in 2026, has wider weight coverage in the
  variable file, and pairs visually with JetBrains Mono more cohesively
  than the two Fira variants do. The skill's recommendation isn't
  wrong, just more dev-tool-coded.
- **Compact density does NOT shrink fonts.** Only padding, row-heights,
  and gaps shrink. Rationale: legibility on a packed live-ops screen
  beats raw rows-per-inch. Datadog and Linear do shrink fonts in their
  compact modes; the call is reversible (one CSS variable away) if the
  user wants to revisit.
- **Density toggle is per-device, not per-tournament.** Lives on
  `usePreferencesStore` next to theme. A tournament import won't clobber
  the operator's UI density choice.
- **No commit yet** per user directive. Working tree dirty.

## Screenshots index

| File | Surface |
|---|---|
| `p2-01-setup-light.png` | Setup, light, comfortable — new Appearance card with both toggles, right-aligned save |
| `p2-02-live-light-status-colors.png` | Live, light — XD3 emerald (live), B1 timer "8d 0h" working |
| `p2-03-tv-light-next-up.png` | TV preview, light — Inter typography on the public display |
| `p2-04-setup-light-compact.png` | Setup, light, compact density |
| `p2-05-live-dark.png` / `p2-05b-live-dark-corrected.png` / `p2-06-dark-viewport.png` | Live, dark — verified |
| `p2-07-public-display-final.png` | Public `/display` — B1 timer fix on the TV, status pill bigger |
