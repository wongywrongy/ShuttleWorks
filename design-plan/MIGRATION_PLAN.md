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

## 1. Phase 0 — foundations (no visible redesign)

- Merge duplicate primitives: one Modal (DS absorbs `motion-enter`; app copy → re-export), one
  Hint, one INTERACTIVE_BASE; delete dead DS `PageHeader`; re-spec DS `Input`/`Select` to
  `border-border-strong`.
- Add the NEW tokens (`--surface-hover`, `--surface-selected-wash`) + extend the contrast gate;
  fix the unwired classes (`bg-bg-subtle`/`text-fg`/`text-fg-muted`, 38 occurrences) and add the
  unknown-utility CI check.
- Build the NEW primitives at sketch level: SectionHeader, Glyph, ProgressBar, Checklist,
  FormField, Seg (promote), Popover, Notice, Spinner, LockedControl, ConfirmButton, EmptyState
  icon/inline variants, MetricStat finish, StatusPill `size="lg"` + `icon`.
- Mechanical contrast fixes that change no layout: the 47 alpha-suffix texts, opacity-on-status
  texts, HealthDot, OverflowMenu focus, StandingsView podium, schoolAccent dark trio.
- **Blast radius:** wide but shallow (class-string edits); zero behavior change. Everything else
  builds on this.

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
```

## 4. Review gate — decisions requiring human sign-off

**Canon choices with multiple reasonable winners (⚖ rows in the spec):**
1. Row gutter px-4 vs px-5 (P3 — proposal: px-4; banded surfaces re-gutter).
2. Stat label case: sentence (Hub) vs uppercase (Operations band) (P5 — proposal: sentence).
3. BracketEmptyState: fold into EmptyState as a variant vs delete outright (P7).
4. Shell tier keeps h-12 bars (Hub/identity) vs unifying on h-11 ActionsBar (P1).
5. Settings/admin stays a distinct bar-less "document family" (codified) vs adopting ActionsBar (P1).
6. Detail-rail widths collapse to {w-72, w-[380px]} — Hub inspector 344→380? (P13).
7. SchoolTabs underline style retained as the top-level-tab tier vs Seg everywhere (P11).

**Applicability rules (behavior changes — each newly locks or guards something):**
8. **Venue & schedule locks while a schedule exists** (unlock clears schedule; live-day copy).
9. **Bracket roster delete/seeding locks while a generated draw references the player.**
10. Backend 409 mirrors for all frontend locks (meet config, venue, bracket roster).
11. Run record-winner gets Tier-2 confirm (adds one click to the fastest surface — deliberate).
12. Invite revoke gets Tier-2 confirm.
13. `dirty` navigation guards (beforeunload + router blocker) on explicit-save forms.
14. Read-only role mode: viewers stop seeing edit affordances (changes what shared users see).
15. Backup-restore confirm button becomes destructive-ranked.

**Proposed as intentionally different (confirm or overrule):**
16. Display TV board keeps its own type scale + tvAccent + `tracking-widest` (config plane adopts canon).
17. Discipline/event colors + school accents remain categorical data palettes (with the dark-mode
    and size fixes from §3), exempt from the one-accent rule.
18. Modal scrim staying `bg-foreground/40` (inverted lightening in dark) — cosmetic oddity, works.
19. Solver HUD keeps its bespoke telemetry styling (unique genre, single instance).

**Migration order** (§2 table) — approve or reorder.

**Stop point:** these three documents are the entire output. No implementation has begun.
