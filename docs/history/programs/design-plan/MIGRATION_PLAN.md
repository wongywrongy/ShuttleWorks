# MIGRATION_PLAN — design unification

> Companion to `AUDIT.md` (evidence) and `DESIGN_SPEC_DRAFT.md` (canon). **Nothing here is
> authorized until the Review Gate below is signed off.**

## 0. Ground rules

1. **No new variants.** If a module needs something the canon lacks, the sequence is:
   amend `DESIGN_SPEC.md` → extend the shared component → then use it in the module. Inlining a
   variant "just for now" is a review-blocking defect.
2. **Component layer consolidates into ONE home** (`packages/design-system/components`); the
   control-plane kit graduates there in Phase 0; `src/components/` retains only app-logic
   components (SolverHud, AppStatusPopover internals, MatchChip domain logic).
3. Each phase ends green: `tsc`, vitest, eslint, depcruise, `check-contrast.mjs`, plus a
   both-themes screenshot pass of the migrated surfaces.
4. A module is **done** when its column in the AUDIT §2 matrix reads `canonical` on every row and
   its AUDIT §4 convention cells read `applied` or `N-A` (no `missing-but-applicable` left).

## 1. Phase 0 — pre-migration BUGFIX PASS + foundations (✅expanded per review)

Ships first and independently — these are bugs, not migrations:

**0a. Operational bugfixes (no design dependency, highest urgency):**
- The dark-mode **no-op `bg-muted/*` selected states** (Run queue / UnifiedOpsList /
  LiveMatchList — invisible selected rows are a live-day operational hazard) via the NEW
  `--surface-hover` / `--surface-selected-wash` tokens + gate extension.
- The **38 unwired-class occurrences** (`bg-bg-subtle`/`text-fg`/`text-fg-muted`) + the
  unknown-utility CI check.
- The **47 alpha-suffix text failures** + opacity-on-status texts + HealthDot + OverflowMenu
  focus + StandingsView light podium + schoolAccent dark trio (mechanical class edits).
- **Backend 409 mirrors** for every frontend lock (meet config, venue, bracket roster) — lands
  independently of all visual work; ranked the most important single item in the plan.

**0b. Foundations:**
- Merge duplicate primitives: one Modal (DS absorbs `motion-enter`; app copy → re-export), one
  Hint, one INTERACTIVE_BASE. Delete the three dead DS components (PageHeader, Input, Label) —
  re-spec `Input`/`Select` to `border-border-strong` ONLY at the point something adopts them
  (P8/pilot), not speculatively.
- Build the NEW primitives at sketch level: SectionHeader, Glyph, ProgressBar, Checklist,
  FormField, Seg (promote), Popover, Notice, Spinner, LockedControl, ConfirmButton, **UndoToast
  (Tier 0)**, EmptyState icon/inline variants, MetricStat finish, StatusPill `size="lg"` + `icon`.
- Display's name-colliding local `StatusPill` is renamed **when its module migration starts**
  (step 6), not before.
- **Blast radius:** 0a wide but shallow, zero behavior change except the backend 409s (approved);
  everything else builds on this.

## 2. Module order (pilot → traffic)

| # | Module | Why this order | Adopts | Deletes | Blast radius |
|---|---|---|---|---|---|
| 1 | **Workspace settings + Global settings** (pilot) | Smallest coherent family (15 tsx); already internally consistent; exercises PageTitle, FormField, Seg, Notice, rows, `dirty` guard, Tier-1 confirms — validates the kit without touching live-ops surfaces | PageTitle, FormField, Input, SectionHeader, DataRow (member/module lists), Notice, LockedControl (Venue lock!), ConfirmButton (revoke) | 7 hand-rolled h2 headers; bordered-card lists; ad-hoc inputs; window-confirm-free already | Low; the Venue **lock is a behavior change** (sign-off #3) |
| 2 | **Hub** | Highest-traffic entry; small (8 tsx); already half-canonical | ActionsBar alignment (or codified shell-tier), DataRow, StatusPill, Glyph, MetricStat(tiles), ProgressBar, Checklist, EmptyState | MetricTile, RailLabel, WorkspaceRow one-off row classes, local FilterChip styling | Low-medium; visual diffs on the busiest screen |
| 3 | **Bracket** | Second-biggest module; mixes canonical (ActionsBar/BandedTable) with the worst legacy (window.confirm ×3, name-collision pill risk sibling, eyebrow field labels, BracketEmptyState) | ConfirmButton (record winner, re-generate), Modal (reset), SectionHeader, FormField, EmptyState, Notice (fixes called→warning), StatusPill for draft | window.confirm ×3, BracketEmptyState (folds into EmptyState variant), FIELD_LABEL eyebrow voice, Plan-table ring selection | Medium |
| 4 | **Operations** | The biggest visual holdout (hand-rolled header, raw buttons, dense rows) AND the sharpest guard gap (Run record-winner unguarded); do it after the kit is proven on 3 modules | ActionsBar, Button, DataRow(dense), StatusPill, MetricStat(band), ConfirmButton (record winner!), EmptyState(inline), selected-wash tokens | hand-rolled header, ~4 glow-clones, "Plan finalized" pill, per-row one-offs | Medium-high (live floor surface — verify with the tournament-sim mid-day workspace) |
| 5 | **Meet** (largest, 47 tsx) | Split into 5a control-center (overline permutations ×4, raw dialogs/buttons, ScoreEditor focus recipe), 5b schedule (legacy MatchesTable → DataRow, strips → SectionHeader), 5c roster (SchoolTabs ruling applies) | everything above + Drawer | legacy table styling, tracking-wide(r) overlines, raw dialog footers, spinner one-offs | High — schedule/live are operator-critical; migrate outside event days, verify with sim |
| 6 | **Display** | Deliberately separate axis; only the config-plane surfaces (Preview/Configuration) adopt the canon; the TV board keeps its tier but rebases pills on StatusPill lg + fixes its /60–/70 text | StatusPill(lg), canon on config plane | LiveStatusPill, name-colliding local StatusPill | Low-medium |
| 7 | **Cross-cutting conventions** (after visual canon lands) | `dirty` guards (beforeunload + router blocker), read-only role mode, backend 409 mirrors for meet/venue locks, "Shared" badge rename | LockedControl everywhere applicable; role-aware rendering | — | Behavioral; each item individually sign-off-gated |

Per-module definition of done: matrix column all-`canonical`, convention cells resolved, gates
green, screenshots both themes attached to the PR.

## 3. Draft CLAUDE.md enforcement section

To be added to the repo-root `CLAUDE.md` when implementation is authorized:

```markdown
## Design system discipline (DESIGN_SPEC.md is binding)
- Values come from semantic tokens only (`packages/design-system/tokens.css`); primitives
  (--gray-*, --blue-*, …) and raw Tailwind palette colors (blue-500, amber-50…) never appear in
  component code. No alpha suffixes on text tokens (text-*/60): use the full-strength token or a
  shape/size difference.
- Before writing ANY new UI, check `packages/design-system/components` — if a pattern exists,
  use it; if it almost fits, propose a DESIGN_SPEC amendment + extend the component FIRST, then
  consume it. Never inline a variant ("just this once" is how the last 13 eyebrow variants
  happened).
- One outer container per view; sections separated by hairline dividers (SectionHeader
  variant="divider"); no bordered cards per section, no background shifts; controls sit directly
  on the surface.
- Element states come from the state vocabulary (disabled / locked / read-only / pending /
  dirty / destructive-guarded — DESIGN_SPEC §2) via component props, never per-module styling.
  Any setting whose change invalidates generated/live artifacts MUST render locked while they
  exist, with a reason and an unlock path — and the backend must enforce the same rule (409).
  window.confirm is banned; destructive writes use ConfirmButton (tier 2) or Modal (tier 1).
- Contrast gates are blockers: run `node packages/design-system/scripts/check-contrast.mjs`
  after token changes; new fg/bg pairings must clear 4.5:1 (text) / 3:1 (UI) in BOTH themes.
- Performance guardrails (DESIGN_SPEC §5) are blockers on live-ops surfaces: no `transition: all`;
  module products + heavy tabs/libs load via `React.lazy`/`await import()` (never eager-import a
  sibling module's surface into a shared shell); shadow budget per view (no animated shadow or
  persistent `backdrop-filter` on an always-rendered surface); no per-row timers or per-row context
  subscriptions; memoize per-render graph walks and use `Map` lookups (never `.find` in a per-item
  render callback); poll-fed store setters must be no-op-safe (no fresh reference when unchanged).
  Run `ANALYZE=1 npm run build` for chunk deltas on shell/route changes.
```

## 4. Review gate — RESOLVED 2026-07-10

**Canon calls (1–7): all resolved.** Gutters = px-4; stat labels sentence case;
**BracketEmptyState deleted**; shell h-12 tier approved; bar-less settings family approved
(codified via PageTitle); rail widths → {288, 380} (Hub inspector 344→380); **SchoolTabs keeps
its behavior** (verified: `activeSchoolId` scope state drives roster filtering/selection/creation,
`RosterTab.tsx:59-262`) and is codified as the one top-level-scope tab tier on tokens.

**Applicability rules (8–15): 7 approved, 1 amended.**
- 8, 9 approved (the textbook cascading-damage cases).
- 10 approved and ranked the single most important item — a frontend-only lock is a suggestion,
  not a lock. Moved into Phase 0a.
- **11 AMENDED:** Run record-winner uses **Tier 0 undo-over-confirm** (record instantly + 8s
  "Winner recorded — Undo" toast); Tier-2 confirm reserved for overwriting an existing result or
  correcting after downstream bracket units started. Rationale: a modal per score at 9pm trains
  rage-clicking through confirms and defeats the tier system. Bracket Live keeps Tier 2 (low
  frequency there). Hot-path scan for other confirm-tier friction: suggestions "Apply" moved to
  Tier 0 (rides scheduleHistory revert); everything else on the Run/board hot paths stays
  unguarded-reversible — no other assignments slow the live day.
- 12–15 approved (14 = read-only viewer mode is the frontend mirror of authorization that
  already exists server-side; "fully armed cockpit + 403 toasts" is the worst viewer UX).

**Intentionally different (16–19): all approved with ONE CONDITION** — exempt from the canon ≠
exempt from tokens: the TV type tier, categorical palettes, scrim, and Solver HUD must draw
their values from the primitive layer so they re-theme with everything else (the TV preset hex
duplication in `displayPresets.ts` gets primitive-ized during step 6).

**Migration order: approved**, with the bugfix items (unwired classes, contrast failures,
dead-component deletion, backend 409s) pulled forward into Phase 0a as a pre-migration pass —
invisible selected rows in the Run queue must not wait behind four module migrations.

**Stop point:** planning remains the entire output. Implementation begins with Phase 0a on
explicit go-ahead.
