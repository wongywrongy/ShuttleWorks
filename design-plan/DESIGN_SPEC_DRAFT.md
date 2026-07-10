# DESIGN_SPEC (draft) — the ShuttleWorks pattern canon

> Status: **REVIEWED 2026-07-10 — canon calls resolved** (decisions inlined below as ✅RESOLVED;
> the former ⚖ items are closed). One amendment: destructive-guarded gained an UNDO tier for
> hot-path writes (§2). Implementation still not begun. Companion: `AUDIT.md`
> (evidence), `MIGRATION_PLAN.md` (sequencing). Value layer = the two-layer token system
> (`packages/design-system/tokens.css` + `DESIGN_COLOR.md`); this spec defines the
> pattern/component layer on top of it. All proposals respect the house rules: one outer container
> per view; sections by 0.5px hairline dividers; no bordered cards per section; no bg shifts;
> controls directly on the surface.

Legend per row: **Winner** (which existing implementation becomes canon, or NEW), **Spec**,
**Replaces** (migration checklist), and ⚖ where multiple reasonable winners exist (sign-off list at
the end of MIGRATION_PLAN.md).

---

## 1. Pattern canon

### P1. Page header → `ActionsBar` (existing winner)

- **Winner:** `components/control-plane/ActionsBar` — already 12 consumers, matches house rules.
- **Spec:** `h-11` fixed; `border-b border-hairline`; `bg` = the view surface (no shift);
  `px-4 gap-3`; left = Eyebrow title (`text-overline`, below) + optional status slot
  (`text-sm font-semibold` count OR a StatusPill); right = actions using DS `Button size="xs"`.
  Exactly one ActionsBar per view. Secondary in-page strips (the two "Matches" strips) become
  `SectionHeader` rows, not second bars.
- **Replaces:** Operations hand-rolled header (`OperationsProduct:198`); `SchedulePage:308` and
  `BracketMatchesTable:94` strips; Display Preview status prose normalizes to the count grammar.
- **Family carve-outs (✅RESOLVED — both approved):** (a) shell tier (Hub command bar + workspace
  identity bar) stays `h-12` as a deliberate outer-chrome tier; (b) Settings/admin tabs keep
  their bar-less `p-6 max-w-*` document family BUT adopt the shared `PageTitle`
  (`h2 text-lg font-semibold` + optional subtitle) as a named component so the family is
  codified, not accidental.
- Delete dead DS `PageHeader` (0 imports, disagrees on tracking).

### P2. Section overline → ONE `SectionHeader` (consolidation of Eyebrow/RailLabel/…)

- **Winner:** `Eyebrow`'s type spec, promoted into a single component with placement variants.
- **Spec:** `text-2xs font-semibold uppercase tracking-[0.08em] text-text-muted` (full-strength
  token — fixes the `/70` and `ink-faint` drift). Variants: `divider` (the house-rule
  divider-label row: hairline above, `pt-6 pb-2`), `plain` (mb-2), `column` (table header cells —
  `text-3xs`, the one sanctioned smaller size). Tones: default muted; `destructive` for danger
  zones only.
- **Kill list:** `tracking-wide|wider` for overlines (40 occurrences → 0.08em), `text-[10px]`/
  `text-[9px]` arbitrary sizes, `SectionLabel` (byte-duplicate), `RailLabel`, the 4 permutations
  inside `MatchDetailsPanel`. `tracking-widest` stays ONLY on the Display TV board.

### P3. Rows → `BandedList/BandedTable` grammar everywhere

- **Winner:** `BANDED_ROW_CLASSES` (already the most-adopted).
- **Spec:** row `min-h-[40px] px-4 gap-3 border-b border-hairline` (✅RESOLVED: **px-4** — on
  the 4-step scale, tighter is safer for data-dense views; banded surfaces migrate from px-5); dense tier `min-h-[32px]
  py-1.5` for operational queues (RunQueue/UnifiedOpsList are the prior art — codified as
  `density="dense"`); hover `hover:bg-hover` (NEW token, see §3 resolutions — replaces
  muted/30-40-50); selected = `bg-selected` (NEW token) **+ inset 2px accent stripe** (one
  treatment; kills bg-elev/bg-muted-40/ring variants); header band = `SectionHeader column` on
  `bg-band`. Empty cell = `—` in `text-text-muted` (full strength) only when the column has data
  elsewhere; else hide the column (Hub's auto-hide is the prior art).
- **Replaces:** Hub WorkspaceRow one-offs, meet `MatchesTable` legacy `<table>` styling, bracket
  Plan table ring-selection, settings bordered-card lists (become hairline-divided rows per house
  rules).

### P4. Status pill → DS `StatusPill` (existing winner), everything else dies

- **Spec:** `rounded-sm px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.04em]`; tones
  from the status token families ONLY (`-bg` tints, never `/10` alpha washes); optional pulse dot
  for live. Adds `size="lg"` (px-2.5 py-1 text-xs) for the shell/TV tier so Display and the
  health chip stop hand-rolling.
- **Replaces:** Operations "Plan finalized" pill, `LiveStatusPill`, CourtsView's name-colliding
  local `StatusPill` (renamed + rebased on DS with the tvAccent as a tone override), "N late"
  chip, SolverHud phase pill, AppStatusPopover chip, draw-card draft text (becomes
  `tone="idle"`), SharingTab role chip. `SourceChip` and module glyphs become `Glyph` (below).
- **NEW `Glyph`:** the 1-letter square (M/D/B, source squares) — one component, two sizes
  (18px rows / 12px chips), neutral chip styling per the color budget.

### P5. Stat block → `MetricStat` (exists, 0 consumers — finish and adopt)

- **Spec:** value `text-lg font-bold sw-num text-text-primary`; label `text-2xs text-text-muted`
  **sentence case** (✅RESOLVED — follows the caps diet; uppercase is reserved for SectionHeader); layout variants `tiles` (Hub's gap-px grid) and `band`
  (Operations' seamed flex with optional status top-bar). Replaces MetricTile, StatItem, and the
  meet Run header inline stats; DS `StatusBar` stays for count-strips (different role).

### P6. Progress → one `ProgressBar` + one `Checklist`

- `ProgressBar`: `h-1.5 rounded-full`; track `bg-band`; fill `bg-status-success-fg` (or
  tvAccent on Display); width-% (kills the scaleX variant); `role="progressbar"`.
- `Checklist`: ✓ `text-status-success-fg` / ○ `text-text-muted` (full strength — fixes the /40
  fail). No stepper component until a real use case exists (YAGNI).

### P7. Empty state → `EmptyState` (existing winner) + icon slot

- **Spec:** centered, `p-10 gap-2`; optional `icon` slot (`h-10 w-10 text-text-muted` — adopts
  the SchedulePage idiom); title `text-base font-semibold`; body `text-sm text-text-secondary
  max-w-sm`; action slot. New `variant="inline"` (the one-liner: `px-4 py-6 text-sm
  text-text-muted` centered) for queues/rails. Copy voice: **"Select a …"** everywhere (kills
  "Click a …"); no italics.
- **Replaces:** **BracketEmptyState — DELETED** (✅RESOLVED: module-specific variants of shared
  patterns are exactly the disease; its 4 call sites adopt the shared component), plus all 9
  hand-rolls. Display TV tier exempt.

### P8. Forms → `FormField` + resurrect DS `Input`/`Select`

- **Spec:** `FormField` = label `text-xs font-medium text-text-secondary` (ONE label voice) +
  control + help `text-2xs text-text-muted` + error `text-2xs text-status-danger-fg` under the
  control (one placement). Inputs = DS `Input` re-specced: `h-8 rounded-sm border-border-strong
  bg-surface-raised px-2 text-sm` + the global focus net (no local ring recipes). The settings
  Row contract (`SettingsControls`) stays as the settings-family layout consuming FormField
  internals.
- **Save models (⚖ sign-off):** exactly two — (a) **auto-save** for settings-family tabs (with the
  `persistStatus` indicator), (b) **explicit Save/Cancel** for forms whose commit has blast
  radius (config forms, modals): footer `justify-end`, ghost Cancel then primary Save, pending
  state per §2. `useSuccessFlash` becomes the standard save feedback for (b).

### P9. Buttons → DS `Button` only

- 8 variants suffice. Raw recipes are migrated: glow-primary clones → `variant="default"
  size="xs"`; neutral outlines → `variant="outline" size="xs"` (one text size per size token —
  kills text-3xs buttons); icon buttons → `size="icon-xs|icon-sm"`; text-only actions →
  `variant="link"` or `ghost`. Segmented toggles → NEW `Seg` promoted from `SettingsControls` as
  the one switcher (see P11).

### P10. Dialogs/overlays → ONE Modal, ONE Popover, keep Drawer

- **Modal:** DS `Modal` absorbs `motion-enter` from the app copy; the app copy becomes a
  re-export (same treatment as StatusPill). Title grammar: optional Eyebrow (destructive tone for
  danger) + `h2 text-base font-semibold`; body `text-sm`; footer `justify-end`, ghost Cancel +
  ranked action; close = `size="icon-xs"` Button with X icon (kills literal ✕ chars).
- **Popover (NEW):** `z-popover rounded-sm border-hairline bg-surface-overlay shadow-md p-1|p-3`
  — one recipe; OverflowMenu/AppStatusPopover/meet menus rebase onto it.
- **Drawer:** `DetailPanel` is already canonical; codify width `w-[380px]` as the ONE detail-rail
  width (⚖ — see P13).

### P11. Navigation

- Rail item spec: `text-xs py-1.5`, active = accent edge-bar + `font-medium text-text-primary`
  (workspace rail wins); Global-settings nav rebases onto it. Back = the icon-only shell button
  at shell tier; in-canvas back = `variant="link"` Button with ← label (both survive; the split
  is tier-based and codified). In-page switchers: **`Seg` is the one component** (square,
  `px-3 py-1 text-xs`, active `bg-selected text-accent`). **SchoolTabs (✅RESOLVED): keeps its
  behavior** — verified to encode real scope state (`activeSchoolId` drives roster filtering,
  selection auto-correction, and new-player group assignment, `RosterTab.tsx:59-262`), not just
  styling — and is codified as the ONE top-level-scope tab tier (underline style; skin already
  token-based; its `/60` count suffix is on the Phase-0 contrast list). Glow pills / boxed tabs /
  FilterChip variants die (FilterChip restyles as Seg).

### P12. Typography roles (the six voices)

| Role | Spec |
|---|---|
| Page title (control-plane) | Eyebrow overline in ActionsBar |
| Page title (document family) | `h2 text-lg font-semibold` (`PageTitle`) |
| Section overline | P2 SectionHeader only |
| Body/row primary | `text-sm` / `font-medium` when a name |
| Meta/secondary | `text-xs text-text-secondary` |
| Micro (badges/stamps) | `text-2xs`; `text-3xs` ONLY inside column headers + chip stamps; arbitrary `text-[10px]`/`text-[9px]` banned |

Numerals: `sw-num` everywhere data renders (kills the tabular-nums split — they're aliases in
practice; pick the class with the utility name).

### P13. Spacing constants

- List/row gutter: `px-4`. Section padding (document family): `p-6`. Rail: **`w-72` (288px)
  compact rails, `w-[380px]` detail drawers** — the only two rail widths (✅RESOLVED; Hub
  inspector 344→380). Row heights: 40 standard / 32 dense. Everything else from the `--space-*`
  ladder; arbitrary `p-[18px]`-style values banned.

### P14. Feedback

- Toast: DS Toast (already one) — detail line fixed to full-strength (see §3).
- Banner: **`Notice`** (NEW, generalizing AdvisoryBanner): `rounded border px-3 py-2 text-sm`,
  tones info/warning/danger/success from the `-fg/-bg` pairs — replaces ConflictBanner look,
  BracketInlineNotice (whose warning tone also fixes `status-called`→`status-warning`), boxed
  destructive ×3, full-bleed strips (strips become Notice with `full-bleed` placement variant).
- **The `-fg/-bg` pairs are THE status family for feedback surfaces**; the operational family
  (`status-live` etc.) is reserved for match-state UI (chips, boards). Documented in
  DESIGN_COLOR.md already; this spec makes it a component rule.
- Loading: `Spinner` (NEW tiny primitive wrapping CircleNotch `h-3.5 animate-spin`) + the §2
  `pending` state; label-swap is allowed only WITH the spinner, not instead of it.

---

## 2. State vocabulary (the standard, not a style menu)

Each state: one visual treatment, one behavior, one applicability rule. Components in §4 expose
these as props; per-module styling of states is banned.

### `disabled`
- **Visual:** `opacity-60` + `cursor-not-allowed` (the INTERACTIVE_BASE value; `opacity-50`
  variants migrate). Never color-only — the control keeps its label/icon.
- **Behavior:** inert; no tooltip required, but `title` reason is REQUIRED when the reason is
  non-obvious (the dead-Generate-button rule).
- **Applicability rule:** use ONLY for "not applicable in the current context" (nothing to
  export, no selection yet). If the control is applicable but protected → `locked`.

### `locked`
- **Visual:** lock glyph (12px) + the control at full opacity but non-interactive + `title`
  tooltip stating the REASON ("Locked while a run is live"). Inline lock chips use
  `StatusPill tone="warning" icon="lock"`. Visually distinct from disabled (not dimmed).
- **Behavior:** clicking opens the unlock path — either an explicit unlock confirm (UnlockModal
  pattern) or a navigation link to the blocking state. Reason + unlock path are REQUIRED props.
- **Applicability rule (THE rule — resolves AUDIT §4.1 gaps):** *any setting whose change
  invalidates generated or live artifacts MUST be `locked` while those artifacts exist.*
  Concretely (each line = a behavior change, sign-off required):
  - **Venue & schedule (courts/interval/day window) locks while a schedule exists**; unlock =
    the existing UnlockModal (clears schedule) with live-day-escalated copy.
  - **Bracket roster delete/seeding locks while any generated draw references the player**;
    unlock = regenerate-draw path.
  - Meet config lock (exists) gains live-day-escalated copy in UnlockModal.
  - Backend MUST mirror every frontend lock with a 409 (meet locks are currently frontend-only —
    AUDIT §4.8.2).

### `read-only`
- **Visual:** plain text presentation (value without a control) + a subtle `Read-only` marker
  (SectionHeader-level, once per surface, not per field). NOT dimmed.
- **Behavior:** no interaction affordances rendered at all (don't render dead buttons).
- **Applicability rule:** any surface where the caller's ROLE forbids writes renders read-only —
  *the UI must consume the role* (viewer sees no Save/Generate/Run actions; resolves AUDIT §4.7).
  The Operations nav "Shared" badge is renamed/retooltipped so it cannot read as permissions.

### `pending`
- **Visual:** control `disabled` + `Spinner` + label swap ("Saving…"); `aria-busy` REQUIRED.
- **Behavior:** re-entry blocked (no double-fire — resolves the bracket double-Generate risk);
  optimistic overlays (RunSurface) count as pending on the affected rows.
- **Applicability rule:** every async mutation trigger MUST enter `pending` until settled.

### `dirty`
- **Visual:** the existing `persistStatus` indicator (AppStatusPopover) + `UnsavedBanner` stay;
  explicit-save forms mark the Save button `font-semibold` + a dot marker.
- **Behavior:** navigation/close guard REQUIRED: `beforeunload` while `persistStatus==='dirty'`
  or an explicit-save form has edits; in-app navigation prompts via router blocker.
- **Applicability rule:** any form whose state is not yet persisted MUST guard navigation
  (resolves AUDIT §4.4 — currently zero protection repo-wide).

### `destructive-guarded`
- **Visual/behavior — ONE guard system, THREE tiers** (✅AMENDED per review: hot-path writes get
  undo-over-confirm; a modal on every 9pm score entry would train rage-clicking through confirms
  everywhere and defeat the tier system):
  - **Tier 0 (undo toast) — high-frequency writes on live surfaces:** commit instantly, show an
    8s toast "Winner recorded — **Undo**" (Toast action slot). Undo reverts the write while
    reverting is still clean; once it isn't (a downstream bracket unit has started), the toast
    omits Undo and later corrections route through Tier 2. Requires a real revert path — for
    bracket results the re-record/reset semantics, for meet results the state-machine
    walk-back, for schedule applies the existing `scheduleHistory` revert pool.
  - **Tier 1 (modal):** irreversible + broad blast radius (delete workspace, reset bracket,
    restore backup, unlock-and-clear-schedule). DS Modal; title Eyebrow `destructive`; body
    names exactly what is destroyed; footer ghost Cancel + `variant="destructive"` verb button.
    Restore-backup's confirm button becomes destructive-ranked (restore overwrites live state).
  - **Tier 2 (two-click inline):** irreversible-ish but narrow/infrequent: first click arms the
    control (destructive style + explicit label, 4s), second commits. The existing
    ScheduleActions/MatchDetailsPanel pattern, promoted.
  - `window.confirm` is banned (4 sites migrate).
- **Applicability rule + assignments (✅RESOLVED):**
  - **Run record-winner → Tier 0** (first-time result: instant + Undo toast). **Tier 2 only for
    overwriting an already-recorded result or when downstream bracket units have started.**
  - Suggestions "Apply" (repair/re-optimize) → **Tier 0** (apply instantly + "Applied — Revert"
    toast riding the scheduleHistory pool) — found in the hot-path scan; currently one-click
    with no recovery affordance surfaced.
  - Record winner in Bracket Live/Detail → Tier 2 (low-frequency there; replaces window.confirm).
  - Invite revoke → Tier 2. Re-generate one draw → Tier 2. Walkover from the draw board → Tier 2.
  - Bracket reset / workspace delete / restore / unlock-and-clear → Tier 1.
  - Reversible actions (call, start, postpone, uncall, check-in, archive) need no guard —
    verified against the live-day workflow; nothing else on the Run/board hot paths gains a
    confirm.

---

## 3. Contrast-flag resolutions (every AUDIT §3 flag → a compliant pairing)

| Flag group | Resolution |
|---|---|
| 47× `text-muted-foreground/40-70` | **Ban alpha suffixes on text tokens** (lint rule). Replace: /70 & /60 → `text-text-muted` (full); /50 & /40 markers (unchecked ○, dimmed ✓) → `text-text-muted` with shape difference carrying state (✓ filled vs ○ outline). A new gate-checked `--text-faint` is NOT added — the muted step is the floor by design |
| `opacity-*` on status text (Toast detail, Advisory detail, lock hint, destructive/90) | Full-strength `-fg` tokens; hierarchy via size (text-2xs), not alpha |
| MatchChip done `opacity-70` / sides `opacity-80` / 8px M-B squares | Done chips: full-strength muted text on `status-done-bg` (opacity only on the *border*); sides line: full-strength `-ink`; source squares ≥10px text or `Glyph` size-up |
| HealthDot idle `/40` | `bg-text-muted` full strength (still neutral) |
| DS Input/Select `border-input` + 15 ad-hoc hairline inputs | All inputs → `border-border-strong` (the token exists for exactly this; Button outline is prior art) |
| OverflowMenu focus `ring-ring/40` | Remove the opt-out; inherit the global net (or `ring-2 ring-ring` full) |
| `ring-accent/30` selected rows | P3 selected treatment (bg-selected + stripe) |
| Dark `bg-muted/*` no-ops (~142 sites incl. selected rows, bands) | **NEW semantic tokens `--surface-hover` and `--surface-selected-wash`** mapped per theme (dark = gray-10-based so they exist on raised surfaces); `bg-muted/30-60` washes migrate; added to the contrast gate |
| Unwired `bg-bg-subtle`/`text-fg`/`text-fg-muted` (38×/8 files) | Map to real tokens during migration + **add a CI check for unknown color utilities** |
| StandingsView light podium (1.06–1.39) | `border-status-warning-fg/…`→ full-strength warning pair, or `bg-status-warning-bg` row tint (passes both themes) |
| schoolAccent dark dots <3:1 (slate/violet/blue) | Dark-variant palette entries for the 3 failing hues + minimum dot size 8px + always paired with the name label (never color-alone) |
| TV board `/60-/70` lines | Full-strength muted on the TV ramp (spectator distance argues for MORE contrast, not less) |

---

## 4. Shared component layer (sketch)

One home: `packages/design-system/components` (the control-plane kit graduates into it; the app
`components/` keeps only true app-logic components). Every component accepts the state vocabulary
as props — no per-module state styling.

```
Button        variant, size, pending, disabled, locked, destructive-tier props already fit
ActionsBar    title, status?, children(actions)          [graduates from control-plane]
PageTitle     title, subtitle?                           [NEW — codifies settings family]
SectionHeader variant: divider|plain|column, tone        [consolidation]
DataRow/List  density: standard|dense, selected, onSelect, empty-cell handling  [BandedList grows]
StatusPill    tone, size: sm|lg, dot, pulse, icon(lock)  [exists]
Glyph         letter, size: sm|md                        [NEW — module/source squares]
MetricStat    value, label, tone?, layout: tiles|band    [exists, finish + adopt]
ProgressBar   value, max, tone                           [NEW]
Checklist     items[{done,label}]                        [NEW]
EmptyState    icon?, title, body?, action?, variant: page|inline  [grows icon+inline]
FormField     label, help?, error?, children             [NEW]
Input/Select  border-strong respec                       [resurrect]
Seg           options, value, onChange                   [promotes from SettingsControls]
Modal         title, eyebrowTone?, footer ranking        [DS absorbs motion-enter]
Popover       anchor, children                           [NEW]
Drawer        = DetailPanel                              [graduates]
Notice        tone, title?, children, placement: inline|full-bleed  [NEW]
Toast         (exists)
Spinner       size                                       [NEW]
LockedControl reason, unlockPath, children               [NEW — the `locked` state wrapper]
ConfirmButton tier2 two-click arm pattern                [NEW — promotes ScheduleActions idiom]
UndoToast     tier0: commit + N-second undo action       [NEW — rides Toast's action slot]
```

Props contract: `disabled?: boolean`, `locked?: {reason: string; onUnlock?: () => void; href?: string}`,
`readOnly?: boolean`, `pending?: boolean` on every interactive component. Nothing module-specific
enters this layer.
