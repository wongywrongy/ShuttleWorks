# Phase 1 audit — UI/UX punch list

**Date:** 2026-04-27 · **Method:** Playwright walkthrough (1440×900) of every
tab in light + dark + the public display, plus targeted source-code review.
**Skill:** `ui-ux-pro-max:ui-ux-pro-max` design-system pass —
recommended pattern *Real-Time / Operations*, palette *blue + amber + status*,
type pairing *Inter (body) + JetBrains Mono (numerics)* (overriding the
skill's Fira default for the de-facto enterprise pair).

Findings are tagged `BUG` (real defect, fix in Phase 2 or sooner),
`drift` (design-system inconsistency — the bulk of Phase 2),
or `polish` (refinement, optional).

Screenshots: `docs/audit-2026-04-27/screenshots/`.

---

## Real bugs (fix during Phase 2)

| # | Tag | Surface | File:line | Issue | Fix |
|---|-----|---------|-----------|-------|-----|
| B1 | BUG | Live, TV | `frontend/src/components/common/ElapsedTimer.tsx:14-19` | `format()` only emits `M:SS` — a stale `actualStartTime` from days ago renders as `11395:48`. No cap, no hours/days unit. | Add an hours unit and cap at e.g. `99:59:59`; or render `Xd Yh` past 24 h. |
| B2 | BUG | All admin tabs | `frontend/src/app/AppShell.tsx:102` (renders `SolverHud`) | `SolverHud` text "Solver idle — click Generate to begin." appears as a floating footer on every tab even when the user is on Roster/Live/TV — looks like a fixed banner overlaying content. | When `phase === null` (idle), hide the HUD entirely on tabs other than Schedule. |
| B3 | BUG | Roster | `frontend/src/features/roster/RosterTab.tsx` (header), school count badges | Shows "School A · 0" / "School B · 0" but page header reads "2 · 71 players". Players exist on the data but the per-school badge counts are wrong. | Recompute badge counts from `players.filter(p => p.groupId === group.id).length`. |
| B4 | BUG | Roster, position grid | `frontend/src/features/roster/PositionGrid.tsx` | When school is selected but its `playerIds` is empty, both the player list ("No players yet…") and the grid show empty — yet 71 players exist (just not assigned to either visible school). User has no path to discover or recover. | If `players.filter(byGroup).length === 0` but `players.length > 0`, surface "X players exist with no school — assign them" with a one-click action. |
| B5 | BUG | TV, Schedule sub-tab | `frontend/src/pages/PublicDisplayPage.tsx` | When all matches are finished/in-progress, "UP NEXT" shows a single line "No upcoming matches" and 80 % of the TV is black void. Same on Standings ("No matches completed yet") with finished match data present. | Empty states must auto-fall-back: Schedule → Courts view; Standings → leaderboard from finished matches; or auto-rotate to a final-results splash. |
| B6 | BUG | TV, public display | `frontend/src/pages/PublicDisplayPage.tsx:467` | Empty courts show only the static word "Available" — wastes ~80 % of the screen during a tournament with active courts. | Show next-match preview ("Next: XD7 @ 15:30 · Player A vs Player B") or a "Court free" splash with the next-up time. |
| B7 | BUG | Live | `frontend/src/features/control-center/GanttChart.tsx` (render) | The 19 "active" matches reported in the header are not visually distinct on the grid — every block is the same near-white surface. Only the single in-progress match (XD3) gets a green outline. The audience has no visual cue for called / scheduled / blocked. | Apply status-tinted backgrounds (green = live, amber = called, red = blocked, gray = done) per block. The CSS tokens already exist; the renderer just needs to read `matchStates[id].status`. |

## Design-system drift (the bulk of Phase 2)

These aren't bugs — they're inconsistencies that erode the "professional" feel.
Centralizing the four foundations in Phase 2 (typography, spacing, button
hierarchy, status tokens) fixes most of them at once.

### Typography

| # | Tag | Where | Issue |
|---|-----|-------|-------|
| T1 | drift | All surfaces | System font stack throughout; gives a vanilla / generic feel for an enterprise tool. Adopt **Inter** (body) + **JetBrains Mono** (timers, scores, slot times, court IDs, monospaced data). |
| T2 | drift | All surfaces | Mixed `text-xs / -sm / -base` without a deliberate scale. Define and apply 11 / 12 / 14 / 16 / 18 / 24 with weights 400 / 500 / 600 / 700. |
| T3 | drift | Schedule blocks, Live grid, MATCHES table | Block labels (`MS17 / 1v1`), match numbers (`M45`), and timer values use proportional figures — columns shift width as digits change. Apply `font-variant-numeric: tabular-nums` to all numerics. |
| T4 | drift | Schedule LOG panel `frontend/src/features/schedule/ScheduleDiagnosticsBar.tsx` (et al) | Uses uppercase eyebrow "LOG" + Fira-Code-style green/orange — inconsistent with the rest of the palette in light mode (looks like a hacker terminal). | Move to monospaced + `text-foreground` / `text-muted-foreground` with one accent color for severity. |

### Spacing

| # | Tag | Where | Issue |
|---|-----|-------|-------|
| S1 | drift | App-wide | Long tail of `px-1 / px-1.5 / px-2 / px-2.5 / py-0.5 / py-1 / py-1.5`. Tight scale = 4 / 8 / 12 / 16 / 20 / 24 / 32 with everything else removed. |
| S2 | drift | Setup form | Card-to-card vertical rhythm uneven (Schedule & Venue → Player Settings → Scoring Format spacing differs). Standardize on a single "section gap" token (24 px). |
| S3 | drift | Live tab `frontend/src/features/control-center/WorkflowPanel.tsx` | Header band ("98% · 46/47 matches · 19 active") is too tight at `text-xs`/`gap-2` — easy to miss the most important number on the page. |

### Button hierarchy

| # | Tag | Where | Issue |
|---|-----|-------|-------|
| Bt1 | drift | App-wide | `components/ui/button.tsx` exists but most callers use raw `<button className="px-3 py-1.5 bg-blue-600 text-white">`. No primary / secondary / ghost / outline / destructive distinction enforced. |
| Bt2 | drift | Schedule top toolbar | "Generate (replaces schedule)" is a long, parenthetical label. Re-label to "Generate" with the warning surfaced in a confirm dialog when a schedule already exists. |
| Bt3 | drift | Setup `Save Configuration` | Full-width primary CTA at the bottom of Setup is unusual for an enterprise dashboard. Standard pattern: right-aligned, fixed width, alongside a secondary "Discard" button. |
| Bt4 | drift | Header `idle` pill `frontend/src/components/AppStatusPopover.tsx` | Single tiny green dot + "idle" — too small for the most-monitored status badge on the app. Make it a proper status pill with the AppShell brand. |

### Status semantic tokens

| # | Tag | Where | Issue |
|---|-----|-------|-------|
| St1 | drift | Live grid, schedule blocks, match cards | Status colors live as inline `bg-emerald-500/15 text-emerald-300` etc. across many files. Define `status-live`, `status-called`, `status-started`, `status-blocked`, `status-warning`, `status-idle`, `status-done` as named utilities (CSS vars + Tailwind plugin or simple component classes). |
| St2 | drift | Live grid | "IN PROGRESS" green is the only currently-applied status — there's no amber "called", no red "blocked". | Wire the renderer to read `matchStates[id].status` and apply the named token. |
| St3 | drift | Schedule LOG panel | Soft-violation rows use saturated red text on light bg — works in dark, slightly garish in light. Token `status-warning-text` should desaturate in light mode. |

## Surface-specific polish

### Setup
- `polish` Backups list dominates the Setup page — 11 rows take more vertical space than the actual config. Collapse into an `<AppStatusPopover>` action ("View backups") or move into a dedicated `Backups` tab.
- `polish` Heading repetition: "Tournament Setup" h1 + "Tournament Configuration" h2 say the same thing. Drop one or pivot the second to a card label.
- `polish` "Event Categories" — five inline number inputs all containing "19" with no indicator they're per-rank. The labels (Men's Singles / Women's Singles / Men's Doubles / Women's Doubles / Mixed Doubles) are present but the visual emphasis is wrong: numbers dominate, labels look secondary.
- `polish` Setup Guide button is small and orphaned in the top-right of the Configuration card. Promote to a proper sticky help affordance, or fold its content into a collapsible section.

### Roster
- `polish` Position grid empty state: 19 × 5 = 95 placeholder cells overwhelm the page when no players are assigned. Show a hero zero-state ("Drag a player onto a position to assign") until ≥1 cell is filled, then reveal the full grid.
- `polish` Color-coded event columns (MD pink / WD green / XD yellow / WS purple / MS blue) feel pastel-y. For an enterprise tool, a single accent + intensity ramp is more cohesive — but the per-event palette also functions as semantic tagging, so this is an opinion call.
- `polish` "Bulk-import players · paste a list" — the inline button is oddly split (`+ Bulk-import players` + `paste a list` as two sub-actions). One primary "Bulk import" with the modal owning the format help.

### Matches
- `polish` 47-row flat list with no grouping by event type (MD/WD/XD/WS/MS) — visual rhythm flat. Add subtle dividers + sticky group headers.
- `polish` Per-row `v` chevron is repeated 47 times — visually noisy. Reveal on row hover.
- `polish` Header row not sticky — scroll loses column meaning.
- `polish` "AUTO-GENERATE" panel says "No feasible pairings" because Roster is unpopulated; the message doesn't direct the user to fix the upstream cause.

### Schedule
- `polish` Time axis only shows hourly labels (10:00 / 11:00 / …) although slot duration is 30 min. Half-hour ticks would aid scanning.
- `polish` "Drag a match to any cell — infeasible targets glow red. Drop pins the match and re-solves the rest." instructional text is too small (`text-xs`) and easy to miss. Promote to `text-sm` muted, or make it a one-time tooltip.
- `polish` LOG panel has no summary at the top ("4 violations") and no severity legend.
- `polish` "By Time / By Court" toggle below the MATCHES header is a custom toggle — could use the shadcn `<Tabs>` for consistency with the App Status / Theme toggles.

### Live (Match Control Center)
- `polish` "98% · 46/47 matches · 19 active" header band is tiny and light gray — should be the **largest** typography on the page. This is the operator's pulse.
- `polish` "IN PROGRESS" section — a single very-tall row for one match, then "Up Next (0) / Finished (46)" tabs with empty body (50 % of viewport unused).
- `polish` `(moved)` annotation is small and parenthetical — operator may miss it. Make it a proper status pill.
- `polish` No status legend for the colors used in the grid. A small bottom legend ("● live ● called ● scheduled ● done") would help.

### TV / Public Display
- `polish` Court cards: ~80 px tall each, mostly empty whitespace; would benefit from a denser layout when fewer than half the courts are active. Two-up grid above 4 inactive courts.
- `polish` `vs` separator uses lowercase + small caps; for a TV display it should read large enough to be seen 30 ft away. Bump to ≥ 24 px.
- `polish` In-progress match has no live score display — for a sports TV this is the single most-wanted datum.
- `polish` No auto-refresh / auto-rotate between Courts / Schedule / Standings sub-tabs. A real public TV should rotate views automatically (e.g. 30 s per view).
- `polish` "Tournament Status" wordmark could be replaced with the actual tournament name from `config.tournamentName` (if set) for branding.
- `polish` Footer progress bar is full-width but very thin (3 px); could be more emphatic for a venue-scale display.
- `polish` The TV preview tab in admin shows the same rendering at 1440 px wide; in production a TV is typically 1920×1080 or 3840×2160. Add a "Preview at TV size" affordance that opens `/display` in a new window sized to the venue's display resolution.

### Cross-cutting
- `polish` Every empty state is a single line of muted text. Every list/grid surface deserves an icon + heading + description + primary CTA.
- `polish` No keyboard shortcut hints anywhere. Power users moving fast on Live would benefit from `j/k` to navigate matches, `c` to call, `s` to start, `f` to finish.
- `polish` Toast notifications: positioning + timing not audited — Phase 4 work.
- `polish` Tab bar has no per-tab dirty indicator. When changes on Roster aren't yet auto-saved (`persistStatus === 'dirty'`), a tiny dot on the Roster tab would prevent users navigating away accidentally.
- `polish` `cursor-pointer` is applied via `INTERACTIVE_BASE` but some custom-styled rows/cards still rely on default cursor — drift from the central rule.

## Phase 2 mapping

The drift findings above collapse into **four foundation deliverables**:

1. **Typography foundation** — install Inter + JetBrains Mono, define a 6-step scale + weight tokens, adopt `tabular-nums` everywhere numerics live. Closes T1–T3.
2. **Spacing foundation** — kill `1.5 / 0.5` increments, document a 7-step scale, codemod the worst offenders. Closes S1–S2.
3. **Button hierarchy** — extend `components/ui/button.tsx` with explicit variants × sizes, codemod `<button>` callers to `<Button>`. Closes Bt1–Bt3.
4. **Status semantic tokens** — define `status-{live,called,started,blocked,warning,idle,done}` once; replace inline emerald/amber/red. Closes St1–St3 and unblocks B7.

The seven real bugs (B1–B7) get fixed inline as Phase 2 touches their files.

The polish list stays open as a Phase 3/4 backlog (out of scope per current plan).

## Density toggle (Phase 2 deliverable)

User asked for **compact mode with an option in config**. Implementation:

- Add `densityPreference: 'comfortable' | 'compact'` to `usePreferencesStore` (per-device, not exported with the tournament).
- Apply via a `data-density="compact"` attribute on `<html>` driven by the same hook that toggles `.dark`.
- Tailwind reads this through CSS custom properties: e.g. `--row-height: 32px` (comfortable) vs `24px` (compact); `--cell-padding-y: 8px` vs `4px`. Components consume `var(--row-height)` etc.
- Toggle UI: pill in the same Setup → Appearance card that owns the theme toggle.

## Open issues this audit surfaced

- The **theme hydration false-positive** I dismissed in last session's audit is real for **stale Docker frontend builds**, not for the source code: when the running container is older than the localStorage schema, `theme: dark` in storage doesn't apply because the old code didn't read it. Not a bug in current code. Worth a CLAUDE.md note: "after touching `preferencesStore`, rebuild the frontend container".
- **Backend `data/tournament.json` and `data/match_states.json` carry stale state** from prior development sessions (some `actualStartTime` values are days old, producing nonsensical timers). Audit the seeding strategy before next dev session — the `audit-backup` files I made are the safe rollback.
