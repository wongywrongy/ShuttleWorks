# Design audit — every surface, 2026-08-11

Six parallel audits (public entrant tier, Hub/workspace shell, Meet, Bracket, Operations + Entries
desk, Display), each run against `impeccable`'s audit/critique references, the
`design-motion-principles` skill, and — decisively — **the repo's own
`packages/design-system/MOTION.md`**. Every surface was walked in a real browser at 390px and
1280px (Display additionally at 1920px), with console and network open, on the seeded stack.

Screenshots: `docs/screenshots/audit/` (gitignored).

Findings below are grouped by **theme**, because the themes are the useful output. Six surfaces
independently hit the same handful of root causes, and fixing a theme is cheaper than fixing its
symptoms one at a time.

---

## The themes

### T1 — The product states things that are not true

This is the largest and most damaging pattern, and it spans every tier. Not missing information —
**confidently wrong information**, which is worse, because it stops the reader checking.

| Where | What it says | What is true |
|---|---|---|
| `DisplayConfig.tsx:78-108` | "Public display URL… **Anyone with the link can watch, with no sign-in**" | The URL requires `require_tournament_access("viewer")`. Signed out: 401. |
| `MeetDisplayPage.tsx:322-329` | "Display link not valid — **this link has been turned off or never existed**" | It was never a public link. The message sends the director back to copy the same URL. |
| the same flow, client error | "**Your session has expired** — please sign in again" | There was never a session. |
| Nashville board footer | "12 / 24 matches complete · **50%**" | Ignores a live 16-team bracket entirely. Authoritative-looking, wrong. |
| DFW bracket Live view | 52 cards reading "**CALLED**" | All 52 are `started:false`. None are called. |
| `DateBadge.tsx:5-6` | "`aria-hidden`: **the card's text carries the date for AT**" | No date text exists anywhere in `TournamentCard`. Screen readers get no date. |
| `MOTION.md` §7/§8 | reduced-motion "**already kills the infinite ones**… inherit the global override automatically" | False for `animation`-based keyframes. Four classes are unguarded. |

A false comment or a false label is worse than silence: it tells the next reader there is nothing
to verify. Two of these (`DateBadge`, `MOTION.md`) actively misled agents during this audit.

### T2 — Run is a second-class citizen to Plan

The live-day surface consistently lacks what the planning surface has, and **in every case the fix
already exists one branch over in the same file family**.

| | Plan | Run |
|---|---|---|
| Board wrapper | `UnifiedOpsBoard.tsx:349` — `shrink-0 overflow-x-auto` | `RunLiveBoard.tsx:293,305` — no `shrink-0` → **collapsed to 1px** |
| Narrow-viewport rail | wrapped in `DetailDock` (documented overlay fallback) | `RunInspector` hand-rolled `w-72 flex-shrink-0` → **column renders at 0px** |
| Rich match panel | `MatchDetailPanel` (undo start, set-by-set scores, armed winner buttons) | hardcoded `live={false}`; **unreachable in production** |
| Timeline blocks | `DragGantt.tsx:648` — real `<button>`, dnd-kit focus wiring | `GanttChart.tsx:373-408` — `<div onClick>`, **no keyboard access** |

The surface used under the most time pressure, beside the courts, is the one that got less care.

### T3 — Motion runs on a parallel token set nobody reconciled with the standard

`MOTION.md` calls itself "authoritative for every surface… the source of truth." A second duration
vocabulary (`--dur`, `--dur-slow`, `--dur-xslow`, `--pulse-dur`, `--nudge-dur`, `tokens.css:160-165`)
was built alongside it and never mapped onto the canonical `--motion-*` names. Everything below
follows from that.

- **`sw-call-flash` 900ms** — 3× the 300ms chrome cap, 2× the reserved-only `--motion-slow`.
- **`sw-go-live` 480ms** — above even the reserved tier.
- Both use `var(--ease)` = `cubic-bezier(0.4,0,0.2,1)` — the flat curve §4 forbids **by name**,
  aliased under a different token so it doesn't read as Tailwind's default.
- **`animate-block-in` 450ms on every tab click**, against a "sub-200ms or no animation" ceiling for
  that exact interaction class. Origin is `MeetProduct.tsx:32`; `BracketTab.tsx:246-255` copies it
  with a comment saying so; `CourtsView.tsx:240` repurposes the same *locked* keyframe onto card
  mounts. **One fix at the origin, three sites.**
- Meanwhile the same keyframe **is** correctly `motion-safe:`-gated at `DragGantt.tsx:671` and
  `SolverHud.tsx:150` — so the convention exists and simply wasn't applied.
- **`.motion-enter`, `.motion-enter-icon`, `.animate-block-in`, `.animate-slide-up` are absent from
  the `prefers-reduced-motion` kill list** while the doc claims otherwise. This hits the Display
  board's **automatic 15-second standings rotation**, running for hours, on a screen nobody can
  pause, with no reduced-motion escape.

**`MOTION.md` also has a real gap**, and it is worth fixing rather than working around: its frequency
model is built for a director at a desk. It has **no tier for "automatic, non-interactive, recurring
every 15 seconds for hours"** — the Display board's actual profile — and its "High frequency: tab
click" rule misfires on a TV nobody touches. Recommend a fourth axis for ambient/spectator surfaces.

### T4 — The operator shell has no responsive story

Measured independently by three agents, converging on the same number: the workspace content column
resolves to **~110px at a 390px viewport**. `WorkspaceSidebar.tsx:113` is `w-56 shrink-0` with no
breakpoint anywhere in the shell.

Downstream, two surfaces don't merely crowd — they **vanish with no scrollbar to hint they exist**:
`/roster`'s position grid (`{width: 0, left: 540}`) and Run's board+queue column (`width: 0`). By
contrast `/matches` degrades *gracefully* through `BandedTable`'s `@container/table` column
priorities, and the Entries desk stays reachable via `overflow-x: auto` — so the codebase already
knows how to do this.

Two Hub filter chips — including **"Needs attention"** — sit past the viewport edge with
`overflow-x: visible` clipped by an ancestor: no scrollbar, no swipe, unreachable.

> **Open question for the owner.** R11 dual-width is an *entrant* requirement. Whether the operator
> console must work at 390px is a product decision, not an audit finding. If a desk may run a tablet,
> T4 is a ship blocker; if not, it is polish. Everything above is one fix either way.

### T5 — Bracket failure is driven by segment count, not format family

`computeSegmentedLayout` (`DrawView.tsx:619-634`) stacks every segment in one full-canvas-width
vertical column, sizing width to the *widest* segment only.

| Format | Segments | Auto-fit |
|---|---|---|
| Single-elim /32 | 1 | 42% |
| Double-elim /16 | 3 | 43% |
| Compass /16, Monrad /16-full | 8 | **24.2%** |

Two compounding wastes: seven of eight segments average 44% of the canvas width (dead space baked
into the bounding box, *independent of zoom*), and the resulting 1192×3290 box then fits at 24.2%.
Net: **~14% of the visible pane is bracket content.** Seven-eighths blank.

The same segment count drives the connector-line failure. There are **no connector lines anywhere** —
alignment is the only cue. That reads acceptably in single-elim's one consistent tree, loses only
cross-segment links in double-elim, and fails completely in compass/monrad, where eight
independently-centred segments sit in an order that isn't source-adjacent and the "Loser of {id}"
breadcrumb disappears once results land.

**`PanZoomCanvas` is correct given its input — do not touch it.** Fixing `computeSegmentedLayout` to
flow segments into rows addresses both worst bracket findings at once.

### T6 — Clock-relative rendering breaks on stale actual timestamps

`/live`'s Gantt renders **completely empty** on a finished tournament: all 73 blocks exist in the DOM
at `left: 2352px` in a 680px track, because `getRenderSlot` positions off `actualStartTime` and the
axis blows out to ~240 columns of 8.875px. The sibling `/schedule` Gantt is plan-relative and renders
correctly on the same data. **This reproduces for any director reopening a past tournament's Live
tab** — it is not a seed artifact.

Same class: Nashville's spectator board shows `elapsed = "1d 2h"` beside a pulsing LIVE badge.
`timeFormatters.ts:42-53`'s own comment anticipates exactly this ("≥24h → stale data, operator should
resolve") and ships it to the public screen anyway.

### T7 — Data-dense views lack table semantics

`BandedTable`/`BandedList` — Meet Matches, Roster's player list, the Entries desk — is entirely
`<div>`/`<span>`, no `role="table"/"row"/"columnheader"`. A screen reader gets a flat run of text with
no link between an entrant and their state. **`PositionGrid` uses a real `<table>`/`<thead>`/`<th>`**,
so the pattern is known and simply wasn't applied to the shared primitive.

---

## Ranked ship blockers

| # | Finding | Tier | Size |
|---|---|---|---|
| 1 | Display "Public link" is not public, and misdiagnoses itself | Display | M |
| 2 | Run board collapses to 1px — **fixed, `77f77a5`** | Ops | ✅ S |
| 3 | Command failures silent on the live desk (`ConflictBanner` mounted nowhere) | Ops | S |
| 4 | Recording a result is terminal, one click, visually identical to reversible Postpone | Ops | M |
| 5 | Bracket Live shows every future match as "CALLED" | Display | S |
| 6 | Hybrid Meet+Bracket workspaces structurally invisible on the board | Display | M |
| 7 | Page-weight gate cannot render the state that breaks its own budget | Entrant | M |
| 8 | `/live` Gantt empty for any past tournament | Meet | M |
| 9 | Run column renders at 0px at 390px | Ops | M |
| 10 | `/roster` position grid renders at 0px at 390px | Meet | M |
| 11 | Drag-to-reschedule has no keyboard sensor (WCAG 2.1.1) | Ops | S |
| 12 | Bracket canvas ~14% content on segmented formats | Bracket | M |
| 13 | Reduced-motion kill list missing four classes, incl. the 15s board rotation | System | S |

**The page-weight one deserves emphasis (#7).** `visibleBlocks()` is `Math.max(1, echo.players.length)`
and `echo.players` is always empty on a bare GET, so the gate is *structurally incapable* of measuring
more than one player block. Real data at the form's own supported sizes: 4 players = 4.08 KB, 8 = 4.81 KB
against a 4 KB blocking budget. CI stays green while normal use blows it by ~20%. This is the same
failure the gate was already rewritten once to fix — measuring something other than what the browser pays for.

---

## Suggested fix order

1. **The lies (T1).** Cheapest per unit of harm, and several are one string. The Display public-link
   chain is the one a director puts on a poster.
2. **The Run/Plan parity gaps (T2).** Every fix exists one branch over; this is adoption, not design.
3. **The motion token reconciliation (T3)** plus the four-class reduced-motion fix — one systemic
   change retires findings on four surfaces.
4. **`computeSegmentedLayout` (T5).** One function, two worst-in-module findings.
5. **T4**, once the owner rules on whether operator-mobile is in scope.
6. **T6, T7** and the remaining per-surface craft items.

## Notable, and worth not losing

- **The red-dot claim was wrong, and the chase found something better.** An earlier pass reported
  finished matches carrying a warm-red status dot. `--status-done` is `#746B60` — warm taupe at 11%
  saturation. The real red is `lib/schoolAccent.ts`'s **categorical** 8-hue school palette, one slot of
  which is `#e11d48` (rose-600), rendered as an 8px dot beside player names. It has nothing to do with
  match state. Because F&K is 100% finished, every dotted row was also finished — correlation enough to
  manufacture the claim. **The finding is a categorical palette overlapping a semantic status hue**, not
  a status token bug.
- **The entrant tier's restraint is a finding.** The public entrant list carries names only — no club,
  no contact — junior rosters carry no birth years, and there are no fake-live pulsing indicators
  despite the token being available. On a tier handling minors' data, that is worth protecting.
- **A zero-cost motion opportunity exists.** The entrant tier does full page navigations for everything
  a JS app would do in place. `@view-transition { navigation: auto; }` would soften all of them at zero
  JavaScript and zero page weight, Chromium-supported today, silently ignored elsewhere — with an
  explicit `prefers-reduced-motion` override, since the spec does not disable it automatically.
- **`SchoolDot.tsx` ships an `lg = 10px (TV, headline contexts)` variant** that was built for the
  Display board and never wired in.

---

## Corrections to this document

- **`MatchDetailPanel` does not carry contingency handling.** T2's table originally credited it with
  walkover/retired/forfeit. Those live in a *different* component — `BracketMatchDetailPanel`, a
  roster-editing drawer whose `onRecordContingency` is plumbed by `BracketMatchesTab`.
  `MatchDetailPanel` carries undo-start, set-by-set scores and armed winner buttons. Bringing
  contingency to Run would be new plumbing, not adoption, and was deliberately left out of the fix.
  *(Found by the agent implementing T2, 2026-08-11.)*

- **T6's root cause was misdiagnosed here.** This document blamed ~198-day-stale timestamps. The
  staleness is not what breaks it: `getRenderSlot` derives a slot via `msToSlot`, which reads
  **time-of-day only**. A 21:14 finish inside a 09:00–12:00 day derives slot 24 of a 6-slot day, so
  the axis stretches and the placement clamp pins every chip to the final column. Any match whose
  *actual* hour falls outside the configured day breaks it — a tournament running late into the
  evening does it on the day, with no staleness at all. *(Found by the agent implementing the fix.)*
- **T7's root cause was also deeper than the missing roles.** A clickable row took `role="button"`
  from `selectableRowProps`, and `button` is a **name-from-content** role — it flattens every cell
  into one accessible label. That *is* the "flat run of text" described above, and it would have
  defeated cell roles even if they had been added. Rows are now `role="row"` + `aria-selected`;
  `role="button"` remains correct for the non-table surfaces sharing that helper.
  *(Found by the agent implementing the fix.)*
