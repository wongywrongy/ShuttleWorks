# ShuttleWorks design-unification AUDIT

> Evidence-based audit of micro-visual fragmentation, contrast failures, and convention drift
> across modules. Companion docs: `DESIGN_SPEC_DRAFT.md` (proposed canon), `MIGRATION_PLAN.md`.
> Audit date: 2026-07-10. **No code was changed for this audit.**
> File paths are relative to `products/scheduler/frontend/src/` unless prefixed.

---

## 1. How the frontend is organized today (recon)

**Stack:** React + Vite + Tailwind; all color/spacing/type values flow from
`packages/design-system/tokens.css` (two-layer primitives→semantic system, gated by
`packages/design-system/scripts/check-contrast.mjs`) through `tailwind-preset.js`. Theme = `.dark`
+ `[data-theme]` on `<html>` (`hooks/useAppliedTheme.ts`). No CSS modules; styling is utility
classes + a small `globals.css`.

**Routing:** `app/App.tsx` — `/` (Hub), `/new`, `/settings`, `/display` (public TV),
`/tournaments/:id/*` → `TournamentPage` → segment routing via
`platform/product-shell/workspaceNav.ts` (the sidebar is the real nav; segments: overview, meet
roster/matches/schedule(Plan)/live(Run)/configuration, bracket-*, tv, settings tabs).

**Component layers (the structural finding — there are already THREE shared layers, unevenly adopted):**

| Layer | Contents | Adoption |
|---|---|---|
| `packages/design-system/components` (13) | Button, Card, GanttTimeline, Hint, Input, Label, Modal, PageHeader, Select, Separator, StatusBar, StatusPill, Toast | Mixed. `PageHeader` has near-zero consumers; `StatusPill`/`Modal`/`Button` widely used |
| `src/components/control-plane/` (12) | ActionsBar, BandedTable/BandedList, DetailPanel, EmptyState, Eyebrow, HealthDot, MetricStat, OverflowMenu, SectionCard, Skeleton, AvailabilityControl, EventsControl | ActionsBar ×12 consumers, EmptyState ×9, BandedTable ×4, **MetricStat ×0** (Hub hand-rolled `MetricTile` instead), Eyebrow ×2 |
| `src/components/` (34 loose) | StatusPill (re-export), SourceChip, MatchChip, SolverHud, AppStatusPopover, ConflictBanner, status/* … | Cross-product shared, uncurated |

**Per-module size (tsx + ts, excluding tests):**

| Module | Components |
|---|---|
| Meet (`products/meet`) | 47 + 13 — the giant |
| Bracket (`products/bracket`) | 28 + 12 |
| Display (`products/display`) | 12 + 12 |
| Operations (`products/operations`) | 9 + 7 |
| Settings (`products/settings`) | 9 + 3 |
| Hub (`products/hub`) | 8 + 10 |
| Workspace (`products/workspace`) | 6 + 0 |
| shell (`platform/` + `app/`) | 17 + 9 |

**Interpretation:** the pattern layer half-exists. Drift is not "no shared components" — it is
modules bypassing the kit (MetricStat unused; PageHeader unused), the kit living in two places
(design-system vs control-plane), and per-module near-copies of kit members.

---

## 2. Consistency matrix (patterns × modules)

*(filled from the pattern sweeps — sections 2.1–2.14 below)*

### 2.1 Page/view header — **6 distinct implementations + 1 dead canonical-pretender**

Canonical candidate: **`ActionsBar`** (`components/control-plane/ActionsBar.tsx:30`) — `h-11` (44px), `border-b bg-card px-4 gap-3`, eyebrow `text-2xs font-semibold uppercase tracking-[0.08em]`, status slot, right controls. 12 consumers.

| View | Ref | What it does | Flag |
|---|---|---|---|
| Bracket Roster/Draws/Matches/View | `BracketRosterTab:136`, `BracketDrawsTab:113`, `BracketMatchesTab:188`, `BracketViewHeader:107` | ActionsBar + `text-sm font-semibold tabular-nums` count | canonical |
| Meet Roster/Matches/Courts/Run/Config | `MeetActionsBar` (re-export), `SchedulePage:241`, `MatchControlCenterPage:459`, `ConfigSurface:39` | ActionsBar | canonical |
| Display Preview | `DisplayProduct.tsx:20` | ActionsBar, but status slot is prose `text-xs muted` (others: semibold count) | minor variant |
| **Operations Plan/Run** | `OperationsProduct.tsx:198` | **hand-rolled** `<header px-4 py-2.5>` ≈41px, no bg-card, subtitle `text-muted-foreground/70` | variant |
| In-page "Matches" strips | `SchedulePage:308` (`px-4 py-2 bg-card` ≈37px); `BracketMatchesTable:94` (sticky, **bg-background**) | two more hand-rolls, two bgs | variant ×2 |
| Hub command bar / shell identity bar | `HubPage:217` (`h-12 gap-3.5`); `WorkspaceShell:40` (`h-12`) | 48px shell tier | shell-tier variant |
| Settings/admin tabs (×7) | `GeneralSettingsTab:57`, `PeopleAccessTab:44`, `VenueScheduleTab:50`, `DisplayConfig:34`, `SyncBackupsTab:38`, `DangerZoneTab:45`, `SharingTab:105` | **no bar at all** — `h2 text-lg font-semibold` inside `p-6 max-w-*` | different family |
| Workspace Overview | `WorkspaceOverview:77` | `h1 text-xl` in `p-6 sm:p-8` | variant |
| DS `PageHeader` | `packages/design-system/components/PageHeader.tsx:47` | eyebrow `tracking-[0.2em]`; **zero imports** | dead |

Value diffs: heights 44 / ~41 / ~37 / 48px; gap-3 vs gap-3.5; bg-card vs bg-background vs none. Header-slot buttons come in 4 dialects (DS `size="xs" variant="toolbar"` meet; raw `h-7 bg-accent shadow-glow` `BracketDrawsTab:125`; raw `h-7 bg-primary` `DisplayProduct:40`; DS `size="sm"` Hub).

### 2.2 Section header / overline — **~13 class permutations of ONE role**

The 10–11px uppercase overline role is implemented as: `Eyebrow` (`tracking-[0.08em]` + tone), `SectionHeader` (`SettingsControls:49`), `RailLabel` (`WorkspaceInspector:51`, `text-ink-faint`), `SectionLabel` (`WorkspaceOverview:42` — **byte-identical duplicate of RailLabel**), `COLUMN_HEADER_ROW_CLASSES` (`BandedList:24`, `text-3xs`), `GroupBandHeader` (`text-ink-3`), Ops band (`UnifiedOpsList:141`), Run queue label (`RunSurface:400`), RunSummaryBand label (`tracking-[0.06em]`, no semibold), sidebar trigger (`WorkspaceSidebar:119` — **`text-[10px]` arbitrary + `/70` alpha**), global-settings nav group, meet control-center (`MatchDetailsPanel:310,334,380,691` — **4 permutations in one file**, `tracking-wide|wider`), spreadsheet/grid labels.

Repo tracking census: `tracking-[0.08em]` ×78, `tracking-wide` ×21, `tracking-wider` ×19, `tracking-widest` ×4 (Display board — defensible), `tracking-[0.06em]` ×2. Ink for the same role spans 4 grays: `muted-foreground`, `muted-foreground/70`, `ink-faint`, `ink-3`.

### 2.3 Table / list rows — **5 row grammars, 5 selected-treatments, 3 hover washes**

Canonical candidate: **`BANDED_ROW_CLASSES`** (`BandedList:32`) — `min-h-[40px] px-5 gap-3 border-b hover:bg-muted/30`; selected `bg-accent/10` + inset 2px accent stripe; header band `bg-muted/40 py-1.5 text-3xs`. Adopted: meet Matches, bracket Matches/Roster/Standings.

| Surface | Metrics | Hover | Selected |
|---|---|---|---|
| BandedTable surfaces | 40px / px-5 | muted/30 | accent/10 + stripe |
| Hub `WorkspaceRow:127` | 40px / **px-4** | **muted/40** | **bg-bg-elev** + stripe |
| Run queue `RunQueue:60` + `UnifiedOpsList:115` | ~32px / px-4 py-1.5 | muted/30 | **bg-muted/40** — no stripe (and invisible in dark, §3.G) |
| Meet Schedule `MatchesTable:211-296` | real `<table>`, ~26px / px-2 py-1 | **muted/50** | accent/10 `hover:/15`, no stripe |
| Bracket Plan `BracketMatchesTable:185` | `<table>` px-4 py-1 | muted/40 | **accent/10 + ring-1 ring-accent/30** (only ring in app) |
| Settings lists `PeopleAccessTab:61`, `ModuleCatalogRow:22` | bordered rounded card, divide-y, p-3 | none | none |

Empty-cell handling: Hub em-dash `muted-foreground/50` + column auto-hide (`HubPage:161`); ops `—` full muted; meet table blank string.

### 2.4 Status pills & badges — **1 canonical + ~9 hand-rolled**

Canonical: DS `StatusPill` (`rounded-sm px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.04em]`, token tone table, pulse dot). Adopters: Hub inspector, shell badge, draw cards (non-draft), meet detail panels.

Hand-rolled variants: Operations "Plan finalized" pill (`OperationsProduct:240` — **rounded-full**, sentence case, `/10` alpha bg); Display `LiveStatusPill:44` (rounded-full, text-xs, tracking-wider); Display `CourtsView:429` — a SECOND local component **literally named `StatusPill`** (name collision, inline tvAccent styles); meet "N late" chip (`MatchControlCenterPage:484`, `/10` alpha, px-1.5); SolverHud phase pill (rounded-full, font-medium); AppStatusPopover health chip (px-2.5 py-1, h-2 dot); draw-card `draft` state (bare unboxed text); `SourceChip:44` (tracking 0.08 vs pill 0.04); SharingTab role chip (font-medium capitalize); module glyphs (`WorkspaceRow:23` 18px squares vs `MatchChip:125` 12px squares — same role, two geometries).

Drift axes: rounded-sm ↔ rounded-full · tracking 0.04 ↔ 0.08 ↔ wider · text-2xs ↔ text-xs · `-bg` token ↔ `/10–/20` alpha · uppercase ↔ sentence.

### 2.5 Stat blocks — **5 distinct implementations; the shared one has 0 consumers**

Hub `MetricTile` (`WorkspaceInspector:23` — gap-px grid, value `text-lg font-bold sw-num`, label lowercase `text-2xs text-text-muted`) vs Operations `StatItem` (`RunSummaryBand:29` — seamed flex cells + status top-bar, label UPPERCASE `text-3xs text-ink-faint`) vs DS `StatusBar` counts (label-first inline, bracket draws) vs Display footer sentence (`MeetDisplayPage:504`) vs meet Run header inline stats (`MatchControlCenterPage:469`). **`control-plane/MetricStat` exists with zero consumers.**

### 2.6 Progress — 2 similar-but-independent bars + 1 checklist + 1 bespoke HUD

Hub readiness bar (`h-1.5 rounded-full bg-surface-card` track, width-%) vs Display bottom bar (`h-1.5 rounded-full bg-muted`, **scaleX transform**, inline tvAccent fill). Hub ✓/○ checklist (`muted-foreground/40` unchecked — contrast-fails, §3.A). SolverHud = its own genre. No stepper exists anywhere.

### 2.7 Empty states — **2 competing components + ~9 hand-rolls**

`control-plane/EmptyState` (centered, p-10, title text-base; 4 users) vs `bracket/BracketEmptyState` (left editorial, **text-xl**, max-w-3xl, eyebrow; 4 users). Hand-rolled: SchedulePage + MCC icon idiom (`h-10 w-10 muted/60` icon — canonical lacks an icon slot); Run queue one-liner; Ops list one-liner; 4 rail one-liners with split copy voice (**"Select a match…"** `RunInspector:88`/`MatchDetailPanel:58` vs **"Click a match…"** `BracketScheduleSidebar:39`/`MatchDetailsPanel:146`); `MatchesTable:158` — the app's only italic. Display board `text-6xl` tier (defensible). Hub inspector deliberately collapses.

### 2.8 Forms — 5 input recipes, 4 label voices, 3 save models, 2 focus grammars

Input recipes: NewWorkspace (`rounded px-3 py-1.5`), GeneralSettings (`px-3 py-2`, **no text size**), SettingsControls INPUT_CLASS (`h-7 rounded-sm bg-bg-elev`), BracketDrawsTab FIELD_INPUT (`rounded-sm px-2 py-1.5` + **uppercase eyebrow field labels** — a third label voice), ScoreEditor (`rounded bg-card text-base` + unique `focus:ring-1 ring-accent/30`). Save models: auto-save (Venue/Display/General-ish), explicit Save-with-flash (`useSuccessFlash`, meet config), Save+Cancel (NewWorkspace, bracket config modal). **DS `Input`/`Label` have zero imports — the canonical input is dead** (and is itself mis-bordered, §3.E).

### 2.9 Buttons — DS Button (8 variants) vs 6 raw recipe families

Adoption is modular: Hub/Settings/bracket-chrome use DS `Button`; **Operations + meet-control-center are ~100% raw**. The signature glow-primary is hand-cloned in **~7 geometries** (`OperationsProduct:41` h-7/rounded-sm/px-2.5, `RunInspector:29` rounded/px-2/2xs, `UnifiedOpsList:27`, `ScoreEditor:173`, `MoveMatchDialog:154` px-3/py-1.5/sm, `BracketDrawsTab:125`, `BracketScoreEntry:86` bg-primary flavor). Neutral-outline recipe ×8 sites spanning text-3xs→text-sm. Icon buttons ×4 recipes. Segmented toggles ×3.

### 2.10 Dialogs / overlays / drawers

**Two near-duplicate Modal primitives**: DS `Modal` (3 users: HubPage, SyncBackupsTab, DangerZoneTab) vs `components/common/Modal` (9 users; adds `motion-enter`). 3 title grammars (destructive-Eyebrow + h2 / plain h2 p-4 / eyebrow-as-h2 + literal ✕ close). 3 footer grammars (justify-between DS / justify-end DS / justify-end raw glow-clones). 3 popover recipes across **3 z-tokens, 3 radii, 2 bg tokens** (`AppStatusPopover:128` z-popover w-72; meet menus z-overlay; `OverflowMenu:26` z-modal rounded-md). 1 shared drawer (`DetailPanel:70`) — canonical.

### 2.11 Navigation

Workspace rail internally consistent (`WorkspaceSidebar:100` — items text-xs py-1.5, active = accent edge-bar) but Global-settings nav (`GlobalSettingsPage:305`) uses **text-sm + `bg-accent/10 text-accent`** for the same role. Two back idioms (icon-only shell ArrowLeft vs "← Draws" text button). No breadcrumbs. **5 in-page switcher dialects** (Seg / underline tabs / glow pills / boxed tabs / Hub FilterChip).

### 2.12 Typography (same role, different clothes)

Page-title voice ×5 (eyebrow-2xs / h2 text-lg / h1 text-xl / text-xl / text-sm semibold). Numerals: `sw-num` vs `tabular-nums` mixed for identical roles. Micro-badge scale ×4 (`text-2xs`, `text-3xs`, `text-[10px]`, `text-[9px]`); `RunQueue` renders **two different LATE badge sizes in one row** (:101 vs :112).

### 2.13 Spacing rhythm

Detail-rail widths: **5 values** (w-64, w-72 ×3, w-80, w-[344px], w-[380px]). List gutters: px-2 / px-3 / px-3.5 / px-4 / px-5 with no rule (banded=5, hub/ops=4, roster=3, legacy=2). Settings family: p-6 max-w-{xl,2xl}; Overview p-6 sm:p-8 max-w-4xl.

### 2.14 Feedback

1 canonical Toast (DS). **~6 banner looks** (AdvisoryBanner / ConflictBanner / `BracketInlineNotice` — whose warning tone uses **`status-called`** instead of `status-warning` / boxed destructive ×3 / full-bleed strips ×2 / popover mini-row). **Two parallel status-token families** for the same semantics (`status-X` operational vs `status-X-fg/-bg`) cut across all feedback. Loading: spinners exist **only in meet** (5 sites); everywhere else label-swap; no shared spinner primitive. `motion-enter` is meet-heavy, absent from Hub/Settings. DS/app duplicate pairs: **Modal, Hint, INTERACTIVE_BASE** — plus dead DS PageHeader/Input/Label.

---

## 3. Contrast & visibility sweep (both themes)

> Context: the 2026-07-10 token refactor installed a gated semantic layer — every **unmodified**
> text token clears 4.5:1 on every surface step (see `check-contrast.mjs`). This sweep therefore
> targets what the gate cannot see: alpha-suffixed utilities, hard-coded palettes, and
> structure that relies on sub-threshold boundaries.

All ratios computed (WCAG relative luminance, alpha pre-blended over the actual surface stack).
Severity: **FAILS** (<4.5:1 text, <3:1 non-text UI) / WEAK / OK.

### 3.A Alpha-suffixed muted text — 47 occurrences / 31 files, all sub-threshold

The token guarantee ("text ramps from the gray scale, not opacity") is voided at runtime by
`text-muted-foreground/40–70`. Light muted at `/70` = exactly **3.0:1**, `/60` = 2.5, `/50` = 2.1,
`/40` = 1.8 — all fail 4.5; dark fails from `/60` down (and `/70` on raised). The idiom clusters
on the SMALLEST type (9–11px).

| Element | File | Theme | Ratio | Severity |
|---|---|---|---|---|
| Sidebar group labels (10px uppercase) | `WorkspaceSidebar:119,150` (/70) | L / D | 3.00 / 4.29 | FAILS — primary nav taxonomy |
| "Optional" badge (**9px**, /60) | `WorkspaceSidebar:122` | L / D | 2.49 / 3.54 | FAILS — smallest type at lowest alpha |
| Table header row-count (/70) | `BandedTable:176` | L | ≈2.9 | FAILS — every control-plane table |
| Settings nav labels + member IDs (/70) | `GlobalSettingsPage:308`, `ModuleCatalogRow:42`, `PeopleAccessTab:84` | L | 3.00 | FAILS |
| Bracket `pending` status text (/70) | `bracket/matchStatus.ts:20` | L / D | 3.00 / 4.29 | FAILS — status meaning carried by this text; **pinned by a test** |
| Court/round meta (/70) | `BracketMatchDetailPanel:169,191`, `meet MatchDetailPanel:112`, `OperationsProduct:201` | L | 3.00 | FAILS |
| **Public TV board** "~time"/"Later" lines (/60–/70) | `CourtsView:126,129,397` | L | 2.49–3.00 | FAILS — spectator surface viewed at distance |
| Placeholders (/50–/70) | `InlineSearch:89`, `HubPage:228`, `GlobalSettingsPage:76` | L | 2.09–3.00 | FAILS |
| Unchecked ○ readiness marker (/50) | `WorkspaceOverview:126` | L / D | 2.09 / 2.90 | FAILS — state indicator |
| Dimmed checkmark (/40) | `WorkspaceInspector:192` | L / D | 1.78 / 2.34 | FAILS — module-enabled marker |
| HealthDot idle fill (`bg-muted-foreground/40`, 8px) | `HealthDot:8`, `LiveMatchList:114`, `UnifiedOpsList:108` | L / D | 1.78 / 2.34 | FAILS (UI) — idle encoded solely by this dot |
| Hub receded dates (/50–/60 + row `opacity-60` compounding to ~1.9) | `WorkspaceRow:59,74` | L | 2.09–2.49 | FAILS |
| Delete-period icon button (/60) | `AvailabilityControl:114` | L | 2.49 | FAILS (interactive icon) |
| Empty-state icons 40px (/60) | `MCC:427`, `SchedulePage:367` | L | 2.49 | OK-ish (decorative) |
| Reference: un-suffixed muted | everywhere | L / D | 5.63 white · 5.01 sunken / 7.17 raised | OK — the token is safe; only the suffix breaks it |

### 3.B Alpha/opacity on status-colored text (~8 sites)

| Element | File | Ratio (L) | Severity |
|---|---|---|---|
| "(edits will clear schedule)" `warning-fg/80` on warning-bg | `ScheduleLockIndicator:37` | 3.30 | FAILS (dark 4.73 WEAK) |
| Conflict detail `text-destructive/90` on `/10` tint | `SchedulePage:216,225` | 3.72 | FAILS |
| Advisory detail `opacity-80` | `AdvisoryBanner:84` | ~3.4 | FAILS |
| Toast detail line (10px, `opacity-60`) | DS `Toast:103` | 2.60 (dark 3.46) | FAILS |
| Toast dismiss ✕ (`opacity-60`) | DS `Toast:129` | 2.60 | FAILS (UI, interactive) |
| `opacity-80` on `text-foreground` | `BracketInlineNotice:28`, `Hint:87` | ≈9–14 | OK (headroom) |

### 3.C MatchChip (shared Plan/Run primitive)

| Element | Ratio | Severity |
|---|---|---|
| Done chip label (whole chip `opacity-70`) | L 2.87 (D 4.91) | FAILS light |
| Sides line on solid fills (11px, ink `opacity-80`) | ~4.04–4.11 both themes | FAILS (just) |
| Source square "M"/"B" (**8px** on `bg-white/20`) | 3.52 | FAILS (8px text) |

### 3.D Hard-coded palettes

| Element | Verdict |
|---|---|
| `eventColors.ts` / `positionGrid/helpers.ts` text pairings | **OK both themes** (6.8–17:1); chip fills vs board are hue-only ~1.2–1.5 (WS pink-100 vs WD purple-100 confusable) |
| StandingsView podium `yellow-500/60` ring + `/10` tint | **FAILS in LIGHT** — ring 1.39:1, tint 1.06:1 (gold 1st-place nearly invisible); dark 3.74 OK |
| `schoolAccent.ts` dots on dark card | slate **1.98**, violet **2.63**, blue **2.90** — FAIL (UI); light all pass; blue/violet + emerald/teal pairs indistinguishable at 6–8px regardless |

### 3.E Input/control borders — the border-strong rule never reached the primitives

| Element | Border token | Ratio | Severity |
|---|---|---|---|
| **DS `Input:21` and `Select:86`** | `border-input` = `--rule-soft` (**below** hairline) | 1.14 L / 1.23 D | **FAILS (UI)** — tokens.css explicitly reserves `--border-strong` (3.62/4.14 ✓) for inputs |
| ~15 ad-hoc inputs | `border-border` (hairline) | 1.24 / 1.36 | FAILS (UI) — border is the only field boundary |
| Button `outline` variant | `border-border-control` | 3.62 / 4.14 | OK — the migrated prior art |

### 3.F Focus visibility

Global `:focus-visible` net (`globals.css:23`) — **OK** (4.9–6.3:1 both themes). Failures are opt-outs:
`OverflowMenu:20` replaces it with `ring-2 ring-ring/40` and nothing else — **1.81 L / 2.00 D, FAILS**;
settings/hub inputs use `ring-ring/40|30` rings (1.55–1.81, sub-3) rescued only by their
full-strength `focus:border-ring` swap; `BracketMatchesTable:189` selected-row
`ring-accent/30` + `bg-accent/10` — both cues sub-3:1, FAILS as a state indicator.
Accent-on-accent focused Button: saved by `ring-offset-2` gap — OK.

### 3.G Dark-mode structural collapses

| Element | Cause | Severity |
|---|---|---|
| **Selected rows `bg-muted/40`** (`LiveMatchList:120`, `UnifiedOpsList:115`, `RunQueue:61`) | dark `--muted` = `--surface-raised` = the card they sit on → **1.00:1, selected is pixel-identical to unselected** | FAILS |
| Header bands `bg-muted/40` (`BandedTable:164`, `BandedList:65,114`, `DetailPanel:72`, `GanttTimeline:291`) | same alias | FAILS (structure) — band grouping disappears in dark |
| All `hover:bg-muted/40|60` on raised surfaces (~142 `bg-muted/*` occurrences repo-wide) | same | WEAK — hover feedback silently absent in dark |
| **MoveMatchDialog segmented control selected state** (`:227,239`) | `bg-card` in a **`bg-bg-subtle`** track + `shadow-sm` (=none in dark). **`bg-bg-subtle` / `text-fg` / `text-fg-muted` are UNWIRED classes** — not in the preset — **38 occurrences / 8 files render silently transparent** (ScheduleDiffView, DirectorToolsPanel, SuggestionRow, UnlockModal, …) | **FAILS** — zero selected-state signal in dark |
| GanttTimeline zebra/gridlines (`bg-muted/30`, `border-border/30`) | 1.00–1.07 | WEAK (decorative by design) |
| Modal scrim `bg-foreground/40` | dark scrim is a LIGHTER wash (inverted dimming) | OK-note, tonally odd |

### 3.H Systemic causes (ranked)

1. **The alpha-suffix idiom voids the token guarantee** — 47 text occurrences + ~8 status-text
   occurrences; needs a real gate-checked `--text-faint` (or ban the suffix on text).
2. **Dark `--muted` aliases to the card surface** → every muted wash on a raised surface is a
   no-op in dark (~142 sites; selected-state failures are functional, not cosmetic).
3. **DS Input/Select never migrated to `--border-strong`** despite the token existing for exactly
   that; ~15 ad-hoc inputs on hairline borders.
4. **Unwired Tailwind classes render transparent silently** (38 occurrences / 8 files) — needs a
   CI class-name check.
5. **Sub-3:1 focus/selection rings** where components opt out of the global net.
6. Three hard-coded-color stragglers: StandingsView light-theme podium, schoolAccent dark dots,
   event-chip hue-only encoding.

---

## 4. Convention & state-model audit

### 4.1 Locked settings (config protected while dependent state exists)

| Surface | Status | Evidence / treatment |
|---|---|---|
| Meet Configuration (Events + Engine) | **applied (frontend-only)** | `products/meet/TournamentSetupPage.tsx:43-52`, `products/meet/settings/EngineSettings.tsx:126` — Save runs `confirmUnlock()` (`hooks/useLockGuard.ts`); lock = `isScheduleLocked` (true whenever a schedule exists, `store/tournamentStore.ts:245`). Unlock = global `UnlockModal`; confirming **clears the schedule**. Indicator: `components/status/ScheduleLockIndicator.tsx` — amber lock chip |
| Meet Generate over a live day | **applied** | `products/meet/SchedulePage.tsx:86-107` + `schedule/ScheduleActions.tsx` — “Day is live” chip, two-click confirm escalating to “Replace LIVE schedule?”. Frontend-only |
| Bracket draw config after generation | **applied (FE+BE)** | `products/bracket/BracketDrawsTab.tsx:459-488` (draft→Generate, generated→confirm, started→“— (locked)” + title); backend 409s: `api/brackets.py:1987-1990, 2059-2063, 1892, 2461-2468` |
| Bracket engine scoring config | **applied (frontend-only)** | `products/bracket/useBracketScheduleLock.ts` (locks when any event started); its own comment: “backend does not expose an explicit lock flag yet” |
| Bracket Roster after draws generate | **PARTIAL** | Entry/pairing locked per generated draw (`BracketPlayerFields.tsx:249-255`), but player add/delete + seeding are NOT locked and backend has no guard. **Risk: deleting/re-seeding a player placed in a generated draw silently invalidates placements — no warning, no 409** |
| **Workspace Venue & schedule** | **MISSING** | `products/workspace/VenueScheduleTab.tsx` writes `courtCount`/`intervalMinutes`/`dayStart`/`dayEnd` via debounced auto-save; no lock guard, no live-day check, no backend 409. **Risk: shrinking courts or the day window mid-event silently invalidates the live schedule (assignments point outside the venue), zero confirmation — the sharpest single gap** |
| Modules enable/disable | **applied (backend-enforced)** | `api/workspace_modules.py:104-177` — 409s (`MODULE_HAS_DATA`, `MODULE_DEPENDENCY_UNMET`, `MODULE_LAST_OPERATIONAL`); frontend surfaces as toasts |
| Hub / Display config / Operations | N/A | No dependent-state config (Display: “changes apply immediately” by design) |

Also: the meet UnlockModal does **not** escalate its copy when the day is live — unlocking config
mid-live-day gets the same generic confirm as pre-event.

### 4.2 Disabled vs locked vs read-only

- **Disabled:** canonical `INTERACTIVE_BASE` = `disabled:opacity-60`; but hand-rolled buttons use
  `disabled:opacity-50` in ≥4 files (`TournamentSetupPage.tsx:99`, `BracketScoreEntry.tsx:86`,
  `ScoreEditor.tsx:173`, `BracketPlayerFields.tsx:231`). Two opacities coexist.
- **Locked:** THREE distinct visuals, no shared primitive — (a) amber chip + lock icon
  (`ScheduleLockIndicator`), (b) uppercase muted “— (locked)” + title (`BracketDrawsTab:482`),
  (c) italic muted “locked — draw generated” + title (`BracketPlayerFields:249`).
- **Read-only:** communicated only by absence of controls (`PeopleAccessTab.tsx:17` member list;
  Display board by construction). No affordance ever says “read-only”.
- **Reasons/tooltips:** good examples exist (Export XLSX `title="Generate a schedule first"`),
  but the draws-card Generate button (`BracketDrawsTab.tsx:461`) is disabled with **no reason
  given**. Risk: operator stares at a dead button, no idea participants are missing.

### 4.3 Destructive-action guards — **5 confirm patterns + “none”**

| Action | Guard | Notes |
|---|---|---|
| Hub delete workspace | design-system Modal + destructive Button, names deleted data (`HubPage.tsx:354-388`) | strongest |
| Settings danger-zone delete | same Modal pattern (`DangerZoneTab.tsx:73-93`) | consistent ✓ |
| Backup restore | Modal, but confirm is a **default** (non-destructive) Button (`SyncBackupsTab.tsx:87-105`) | variant |
| Reset bracket | `window.confirm` (`BracketDataSection.tsx:28`) | legacy pattern |
| Re-generate draw | `window.confirm` (`BracketDrawsTab.tsx:472`) | legacy |
| Record winner (Bracket Live/Detail) | `window.confirm` “cannot be undone” (`LiveMatchList.tsx:86`, `MatchDetailPanel.tsx:178,194`) | legacy |
| **Record winner (Operations Run)** | **NONE** (`RunInspector.tsx:240-259`) | **Risk: the fastest, most crowded surface has the weakest guard on the same irreversible draw-advancing write that Bracket Live confirms** |
| Meet Generate-replace | two-click inline, 4s, live-aware (`SchedulePage.tsx:96-107`) | 4th pattern |
| Remove player from match | two-click “arm red”, 4s (`MatchDetailsPanel.tsx:108-112`) | 5th pattern |
| Invite revoke | **NONE** — one click (`SharingTab.tsx:188-196`) | Risk: one mis-click permanently kills a shared link |
| Archive workspace | none (reversible — acceptable) | |
| Match-states reset | API + hook exist but **no UI calls it** (`api/client.ts:888`) | unwired |

`window.confirm` survives in 4 places even though `useLockGuard` explicitly migrated off it.

### 4.4 Unsaved-changes protection — **zero repo-wide**

- No `beforeunload`, `useBlocker`, or `usePrompt` anywhere.
- Domain state auto-saves (debounced PUT, `useTournamentState`; safety net `UnsavedBanner` only
  after save-error or 30s stale-dirty).
- Explicit-save forms with silent loss on navigate: Meet Configuration (Events/Engine forms),
  score entry (`BracketScoreEntry`, `ScoreEditor`), `NewWorkspacePage`.
- **Risk:** closing the lid/tab inside the debounce window (`persistStatus==='dirty'`) drops the
  last edits with no backstop — on the source-of-truth machine.

### 4.5 Pending/in-flight — **6 variants**

1. Spinner + `aria-busy` + text swap (`ScheduleActions`, backup button) — only 2 `aria-busy` uses app-wide
2. Text-swap-only + disabled (“Saving…”, “Deleting…”, “Restoring…”) — ≥5 sites
3. Success flash “Saved ✓” (`useSuccessFlash`) — 4 sites
4. Optimistic overlay (`RunSurface.optimisticAssigns`)
5. Global persist indicator (`persistStatus` → AppStatusPopover + UnsavedBanner)
6. **Nothing** — bracket draw Generate has no busy flag (`BracketDrawsTab.tsx:77-80`).
   **Risk: double-click fires concurrent generates; the second 409s and surfaces as an error
   toast for what was a success.**

### 4.6 Validation & error display — 4 patterns

| Surface | Pattern |
|---|---|
| NewWorkspacePage | no field validation; server errors → inline destructive banner |
| Meet Configuration | submit-time validation; full-bleed ribbon banners under actions bar |
| Bracket config/generate | backend 400/409 → global interceptor toast (deduped); local catch empty |
| Score entry | prevention (Save disabled until winner derives); helper text |
| Settings tabs | auto-save; native min/max clamps only |

### 4.7 Permission / shared-state indicators — the big gap

- Backend roles are real and enforced (`app/dependencies.py:147-190`, viewer/operator/owner, 403s).
- Frontend acknowledges roles in exactly **3 places**: Hub delete owner-gate, PeopleAccessTab
  legend, SharingTab invite-role picker.
- **No edit surface keys `disabled`/hidden off the caller's role.** A viewer gets the fully armed
  cockpit and discovers their access via 403 toasts mid-event.
- The Operations nav “Shared” tag is an ARCHITECTURAL badge (shared across engines —
  `workspaceNav.ts:20,59-63`), not a permissions signal. **Risk: reads as “shared with people.”**

### 4.8 Headline convention findings

1. **Venue & schedule** is the one dependent-state config surface with no lock at all.
2. Meet locking is **frontend-only**; only the bracket draw lifecycle has backend 409s — a second
   tab or direct API client can PUT config over a live schedule.
3. Five confirm patterns coexist; guard strength is inversely correlated with action frequency.
4. Zero unsaved-changes/unload protection.
5. Roles exist only server-side; the one “Shared” label that looks permission-ish means
   something else.

---

## 5. Duplication census (summary)

| Pattern | Distinct implementations | Live canonical? |
|---|---|---|
| Page header | 6 (+1 dead DS PageHeader) | ActionsBar (12 consumers) |
| Section overline | ~13 class permutations | Eyebrow (2 consumers) |
| Table/list row | 5 grammars · 5 selected · 3 hovers | BandedList/Table (4) |
| Status pill/chip | 1 + ~9 hand-rolls (incl. name-colliding local `StatusPill`) | DS StatusPill |
| Stat block | 5 | MetricStat (**0 consumers**) |
| Progress bar | 2 + checklist + HUD | none named |
| Empty state | 2 components + ~9 hand-rolls | EmptyState (4) |
| Input recipe | 5 (+ dead, mis-bordered DS Input/Label) | none live |
| Button | DS (8 variants) + 6 raw families; glow-primary cloned ~7× | DS Button |
| Modal | 2 near-duplicate primitives; 3 title + 3 footer grammars | split 3 vs 9 users |
| Popover | 3 recipes / 3 z-tokens / 3 radii | none |
| In-page switcher | 5 dialects | none |
| Banner/notice | ~6 looks · 2 status-token families | none named |
| Confirm pattern | 5 + "none" | none named |
| Pending state | 6 variants | none named |
| Detail-rail width | 5 values | none |

**Systemic reading:** the kit exists and post-redesign surfaces adopted it. **Operations and
meet-control-center predate or bypassed it** and are the two biggest holdouts; Display hand-rolls a
parallel dialect (incl. a name-colliding `StatusPill`); Settings is a third internally-consistent
family. Three DS/app duplicate pairs (Modal, Hint, INTERACTIVE_BASE) and three dead DS components
(PageHeader, Input, Label) mean even the canon layer is split across two homes.
