# ShuttleWorks Design System

The design language for **ShuttleWorks** — a modular control-plane for running badminton tournaments. One workspace hosts pluggable **modules** (Meet, Bracket, Operations, Display) that share courts, rosters, and a common shell. This system captures the language we converged on: a dense, dark-first **command-plane** (Linear/Bloomberg lineage) warmed with rounded corners and gentle elevation, led by a luminous **blue glow**.

> **Sources.** Derived from the ShuttleWorks codebase (`github.com/wongywrongy/ShuttleWorks`, `apps/console`) and an iterative redesign from the prior brutalist "Swiss Industrial Print / Signal Orange" system. The interactive redesign prototypes live at project root: `ShuttleWorks - Final Direction.dc.html` (dark) and `…Light.dc.html` (light).

---

## Design principles
1. **Dense for ops, roomy for setup.** Live surfaces (Run, Matches) maximize signal per pixel; setup surfaces (Hub, Settings, New Workspace) breathe.
2. **Seamed, not gapped.** Dense surfaces are one continuous plane divided by hairlines — no gutters or per-panel border+radius between the summary strip, board, and queue. The screen frame is the only rounded container.
2. **Modular means archetypal.** A Roster is a Roster, a Matches table is a Matches table, whether under Meet or Bracket. Reuse the archetype; only the data changes.
3. **Glow marks intent, not decoration.** The blue glow belongs to primary actions and live signals only.
4. **One typeface, tabular figures.** Geist everywhere; numbers/codes use tabular-nums so columns align — never a separate "robotic" mono for data.
5. **Color is status.** Muted-solid fills mark live/called on boards; quiet states stay outlined.

---

## CONTENT FUNDAMENTALS
- **Voice:** operator-first, terse, confident. Labels are nouns (`Roster`, `Matches`, `Plan`, `Run`), actions are verbs (`Record result`, `Advance winners`, `Regenerate`).
- **Casing:** Title Case for screen/section titles; UPPERCASE only for micro-labels (column headers, status pills, module role tags `ENG/SHR/OUT`) at 10px with `0.08em` tracking.
- **Person:** second person in guidance ("Your name and how you appear"); imperative on buttons.
- **Numbers/codes:** always tabular — match codes `MS1 / WD2 / XD1`, rounds `QF1 / SF1 / F`, scores `21–18`, times `09:30`, counts `3/12`.
- **No emoji.** Status is carried by color + a small dot/pill, never emoji. Icons are sparse unicode chevrons (`‹ › ⌕ ⚙`) — see Iconography.
- **Tone example:** empty court reads `court free`; over-time match reads `LATE +2`; a called match reads `Called`. Short, literal, gym-floor language.

---

## VISUAL FOUNDATIONS
- **Substrate:** near-black `#050507` page with a soft **ambient blue radial glow** top-right (`--page-glow`). Surfaces step up: sidebar `#0B0C0F` → panel `#0E0F13` → raised card `#16181D` → group band `#131519`.
- **Accent:** luminous azure `#5B9DFF` (dark) / `#2563EB` (light). Primary buttons use it as fill with dark ink `#08192E` and a `0 0 22px` glow.
- **Status ramp:** live `#34D399` (dot) / `#1D7D5C` (muted-solid chip fill); called/late `#E0B24A` / `#A5822F`; scheduled + Meet source `#38BDF8`; Bracket source `#A78BFA`.
- **Type:** Geist 400–700, one family. Scale: display 42 / h2 20 / card 15 / control 14 / body 13 / meta 12 / labels 11–10. Tracking `-0.03em` on display, `+0.08em` on uppercase micro-labels.
- **Corners:** rounded, warmed from the brutalist origin — controls 8–9px, cards/tiles 12px, the screen frame 14px, micro-tags 4px.
- **Elevation:** low-contrast. Screen frame `0 24px 60px rgba(0,0,0,.5)`; raised cards `0 2px 8px`. Light theme softens both.
- **Borders:** hairlines do the structural work — `#23262D` for card edges/dividers, `#1F2229` for in-table row dividers. Rarely more than 1px.
- **Backgrounds:** flat fills + the single ambient glow. No photography, no illustration, no texture. Court boards use a faint dotted lane grid on Plan.
- **Animation:** restrained, `ease-in-out`, nothing bounces. Utilities in `tokens/motion.css`: `sw-pulse` (live breathe), `sw-float-in` / `sw-stagger` (mount), `sw-call-flash` (called), `sw-go-live` (green wipe), `sw-late-nudge` (over-time throb), `sw-glow-in` (intent), `sw-ring-focus`, `sw-rail-expand`, `sw-now-sweep`, `sw-panel-in`. See the live gallery at `guidelines/motion-gallery.html`. All honor `prefers-reduced-motion`.
- **Hover/press:** hover lifts brightness slightly (filter), never restyles; press has no shrink. Selection is a left 2px accent bar + `--surface-active` fill on nav rows, or a full accent border + `--glow-accent-lg` on choice cards.
- **Transparency/blur:** used only for status tints (`color-mix` 10% fill / 30% border from one hue). No frosted glass.
- **Layout:** fixed identity bar (48px) + optional module rail (216px) + content, optional right inspector (280px). Screen frame maxes at 1280px and is **fluid below** so nothing clips. Setup forms cap at 640px.
- **Seamed, not gapped.** Inside a dense ops surface (Run, Matches), sub-regions — summary strip, court board, queue — sit **flush** and are divided by **1px hairlines**, never separated by gutters or given their own border+radius. The screen frame is the only rounded container; everything inside is one continuous plane. Status on a flush cell is a **2px top accent bar**, not a full colored border. Reserve gutter-separated cards for roomy *setup* surfaces (Hub, Settings, New Workspace).
- **The Public Display** is intentionally always dark (gym projection), even inside the light theme.

---

## ICONOGRAPHY
- **Minimal by design.** The system leans on **unicode glyphs** rather than an icon set: `‹ ›` (back / disclosure), `⌕` (search), `⚙` (settings), `＋` (add), `↵` (send/enter), `▾` (menu), `✓ ○` (checklist). Disclosure chevrons rotate 90° when a module group is open.
- **Source identity is a letter, not an icon:** a small `M` / `B` square marks Meet vs Bracket matches on chips and queue rows.
- **No icon font is bundled.** If a richer set is needed for production, adopt **Lucide** (CDN) at 1.5px stroke to match the hairline weight — flagged as a substitution, not yet in the codebase.
- **Logo:** the ShuttleWorks wordmark is a boxed lockup — text in a `1px` `#3A3F49` frame, `6px` radius, `0 10px` padding. The frame *is* the mark; there is no separate glyph. (Recreate with live type; no raster asset was provided.)

---

## Foundations (tokens)
`styles.css` (root) is the single entry point — `@import`s only. It reaches:
- `tokens/colors.css` — substrate ramp, accent, status/module ramps, semantic aliases, `[data-theme="light"]` overrides.
- `tokens/typography.css` — Geist (+ Geist Mono for code-only), scale, weights, `.sw-num` tabular utility.
- `tokens/spacing.css` — 2px step, structural dimensions (bar/rail/inspector widths, row paddings).
- `tokens/effects.css` — radii, elevation, the glow system, focus ring.
- `tokens/motion.css` — easing, durations, `sw-pulse` / `sw-float-in` keyframes.

**Theme switch:** set `data-theme="light"` on `<html>`. Default (unset) is dark.

---

## Components
Reusable primitives (`components/<group>/`):
- **core/Button** — primary (glow) / secondary / ghost, 3 sizes.
- **data/Tag** — compact tabular code chip (match codes, rounds, seeds, ranks); `dashed` for empty slots.
- **data/MatchChip** — the court-board atom (3b muted-solid): scheduled / called / live / done, source initial, `lateBy` marker.
- **data/MetricTile** — Run summary-band / dashboard stat.
- **feedback/StatusPill** — Ready / Live / Called / Drawn / Sched / Draft; live pulses.
- **feedback/HealthDot** — small status dot, optional pulse+glow.
- **navigation/WorkspaceSidebar** — the module-grouped nav rail (the shell spine).

## Templates
- **templates/run-board/** — the keystone **Operations · Run** court board as a copyable `.dc.html` starting point (`RunBoard.dc.html`). Composes the real `WorkspaceSidebar` component over the token layer; `theme` prop toggles dark/light. This is what consuming projects seed a new design from.

## UI kit
- **ui_kits/scheduler/** — keystone **Operations · Run** screen (`index.html`) + README pointing to the full 13-screen prototypes at root.

## Index / manifest
```
styles.css                      → global entry (import this)
tokens/                         → colors, typography, spacing, effects, motion
components/core|data|feedback|navigation/  → primitives (.jsx/.d.ts/.prompt.md + card)
guidelines/                     → foundation + archetype specimen cards
guidelines/motion-gallery.html  → live gallery of every motion utility (Replay all)
templates/run-board/            → Run board template (consumer starting point)
ui_kits/scheduler/              → Run screen + kit README
SKILL.md                        → downloadable-skill entry
(root) ShuttleWorks - Final Direction[ Light].dc.html → full click-through prototypes
```

---

### CAVEATS / SUBSTITUTIONS
- **Fonts** are loaded from **Google Fonts CDN** (Geist / Geist Mono), not self-hosted binaries. Swap to local `@font-face` files for offline/production embedding.
- **No brand raster assets** (logo image, imagery) were provided — the wordmark is type-in-a-frame, recreated live.
- **Icons** are unicode glyphs today; a Lucide adoption is suggested, not yet real.
