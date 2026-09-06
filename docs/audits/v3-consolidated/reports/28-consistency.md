# Package 28 — small consistency and brand-seam cleanup, report

Scope: `packages/design-system/components/**`, `apps/console/src/components/**`,
`apps/console/src/platform/product-shell/**`, `apps/console/src/modules/**` (consistency-only:
separators, icon choice, casing, border tokens — no copy meaning, no layout changes),
`apps/entrant/app/components/{TabBar,PlayShell,Footer}*.tsx` + `lib/ui.ts` (+ twins), tests,
`docs/audits/v3-consolidated/`. No commits made (per instructions).

Plan basis: `docs/audits/v3-consolidated/plan.md` §3 rows "Rename and unified wordmark", X9, X14
(→ 28); §4 "Page titles and navigation"; §7 cross-cutting routing (X9/X14 → 28);
`docs/audits/v3-consolidated/ledger/LEDGER.md` "Rules check" section; `reports/25-string-ledger.md`;
`packages/design-system/DESIGN.md`.

## Method

Read the plan, the ledger's Rules-check section, `DESIGN.md`, and the brand-seam files, then
audited each of the five rulings against the current tree with targeted greps, fixed the genuine
violations found, and added a pinning test per ruling so a future regression is caught mechanically
rather than by re-auditing by hand. Before editing any file, ran `git diff --stat -- <file>` and
skipped anything already dirty from a concurrent package (none of the files this package touched
were dirty at edit time; other agents' concurrent edits were visible in `git status` throughout but
never overlapped this package's edit set).

## 1. Separators (ruling 1)

**Before:** `git grep` for the middot, em dash, bullet, pipe, and chevron across the scoped
surfaces. Middot usage (~154 hits) was already uniformly `" · "` (space-dot-space) for inline
metadata. The chevron `"›"` was used exactly twice, both as the "Open ›" affordance
(`RunCourtGrid.tsx`) — already the correct nav/action context, not inline metadata. The em dash is
already covered site-wide by the existing `emDashContract.test.ts` (console + design-system; not
this package's job to re-cover). One genuine violation found: `ScheduleDiffView.tsx:278` used a
bullet (`' • '`) to join inline summary parts, the one place in the scoped surfaces where a
non-middot glyph stood in for the middot's job. (`MatchesSpreadsheet.tsx`'s `` `• ${msg}` `` is a
native-tooltip multi-issue **list marker** joined by `\n`, not an inline separator between two
facts — left as-is and allowlisted in the new contract test.)

**After:** `apps/console/src/lib/utils.ts` now exports `INLINE_METADATA_SEPARATOR = " · "` and
`BREADCRUMB_SEPARATOR = "›"`; `ScheduleDiffView.tsx` imports and uses the former.
`apps/entrant/app/lib/ui.ts` gains the equivalent `INLINE_METADATA_SEPARATOR` constant,
documenting the entrant tier's already-consistent middot convention (11+ existing call sites
across `EventRow.tsx`, `MatchCard.tsx`, `NowStrip.tsx`, `SeasonCalendar.tsx`, `tournament.tsx`,
`draw.tsx`, `schedule.tsx`, `player.tsx` were left as-is — outside this package's edit scope,
which is `TabBar`/`PlayShell`/`Footer`/`lib/ui.ts`, and none of those three components had a
raw separator literal to redirect).

**" / " pair joins** (`names.ts`, `platform/domain/sides.ts`, `DrawView.tsx`, `opsBlock.ts`,
`MatchesSpreadsheet.tsx`, `xlsxExports.ts`, entrant `lib/side.ts`) were reviewed and left alone —
ruling 1's own exception: "never ' / ' for pairs (the side authority owns those)". `sides.ts` /
`side.ts` are literally that side authority; the other files call through it or use `/` only in a
non-chrome export path (xlsx). Not itemized as a finding.

**Test:** `apps/console/src/platform/contracts/__tests__/separatorContract.test.ts` — scans the
same shape as `emDashContract.test.ts` (comments stripped, enumerate-from-disk, allowlist) for a
lone bullet character (a run of 2+ bullets, e.g. a masked-password placeholder, is excluded by a
lookaround) across `components`, `platform`, `modules`, entrant `components`/`lib`, and
design-system `components`. A literal-pipe rule was considered and dropped: at the lexical level a
text scan operates on, `' | '` between two quotes is indistinguishable from a TS union type
(`'A' | 'B'`), the same documented blind-spot `emDashContract.test.ts` already accepts for its own
en-dash rule — and by hand, no genuine rendered `' | '` join exists in the scoped surfaces today
(confirmed during the sweep).

## 2. Icons (ruling 2)

**Before:** The product already runs a deliberate two-tier icon system
(`packages/design-system/icons/README.md`): 15 custom domain glyphs (court/racket/bracket/match-
state/operator-signal) for brand personality, and `@phosphor-icons/react` as the documented
secondary set for generic UI affordances. Enumerating every `@phosphor-icons/react` import across
`components`, `platform`, `modules`, `app` (console) and `components` (entrant) plus
`design-system/components` found 35 distinct names, each already mapped to exactly one concept —
no duplicate icon for an existing concept (e.g. no `Pencil` alongside `PencilSimple`, no second
"close" icon alongside `X`, no second "warning" icon alongside `Warning`/`WarningOctagon`). The
brief's example of "three different edit icons" does not describe this codebase's current state —
whatever prior sweep produced this consistency, it already holds.

**After:** No icon substitutions were needed. Added
`apps/console/src/platform/contracts/__tests__/iconContract.test.ts`, pinning the full
concept→icon map (35 rows) so a future PR introducing a second icon for an already-covered concept
fails a test instead of silently landing. The 15 custom domain icons were left as documented
(adoption is opportunistic per their own README — not this package's job to force wider rollout).

**Test:** `iconContract.test.ts` — enumerates every `@phosphor-icons/react` import name across the
scoped surfaces, asserts each is in the reviewed `CONCEPT_ICON_MAP`, asserts no mapped row is
stale (unused), and asserts the map's values are themselves unique (no two concepts sharing a
name, and no accidental duplicate-family entry).

## 3. Casing (ruling 3)

**Before:** Checked `apps/console/src/platform/product-shell/workspaceNav.ts`
(`buildWorkflowNavigation`, `buildWorkspaceNav`), `apps/console/src/platform/product-shell/types.ts`
(`MODULE_LABELS`), and `apps/entrant/app/components/TabBar.tsx` (`TAB_LABELS`). Every label was
already sentence case: single-word labels (Setup, Participants, Roster, Draws, Plan, Preview,
Overview, Workspace, Venue, Team, Site, Modules, Backups) trivially satisfy sentence case; the two
multi-word labels found ("Live day", "Workspace settings") already capitalize only the first word;
`MODULE_LABELS` (Meet/Bracket/Operations/Display/Entries) match the plan's own product-noun
exception list exactly; the entrant `TAB_LABELS` (Overview/Draws/Players, plus the injected
"Schedule" segment) are single words.

**After:** No casing changes were needed.

**Test:** `apps/console/src/platform/contracts/__tests__/navCasingContract.test.ts` — asserts every
label from `buildWorkflowNavigation` (two enabled-module configurations) and `buildWorkspaceNav`
(meet and bracket kinds) is sentence case (only the first word, or a listed product noun, may
start with a capital), and asserts the entrant `TabBar.tsx` `TAB_LABELS` source constant the same
way.

## 4. Border tokens (ruling 4)

**Before:** `git grep -oE "border-[a-zA-Z-]+/[0-9]+"` across `packages/design-system/components`
and `apps/console/src/components` found 38 alpha-suffixed border classes. Almost all are
semantically meaningful status-tone treatments (`border-status-warning/40`, `border-accent/40`,
`border-current/30`, etc. — a translucent colored outline on a state pill/banner, not a neutral
structural hairline) and were left alone; these are a different, deliberate pattern from the one
ruling 4 targets. **Five were genuine structural hairlines using the raw `border-border` token
with an alpha suffix instead of the canonical `border-rule-soft` divider token** (already used
elsewhere in the same directories — `MatchInspector.tsx`, `MatchStatusFilter.tsx`,
`EmptyState.tsx`):

- `apps/console/src/components/MatchChip.tsx:46` — `border-border/60` on the `done` state chip.
- `apps/console/src/components/control-plane/EventsControl.tsx:174` — category-group divider.
- `packages/design-system/components/GanttTimeline.tsx:223` — alternating-column cell divider.
- `packages/design-system/components/GanttTimeline.tsx:332` — time-header row divider.
- `packages/design-system/components/GanttTimeline.tsx:376` — court-row divider.

(Note: `border-border/60` is also the dominant hairline pattern across `apps/console/src/modules/**`
— 22+ sites, e.g. `SetupProduct.tsx`, `RosterTab.tsx`, `UnifiedOpsBoard.tsx` — established prior
art in the feature-module layer. Ruling 4's text scopes the rule to **shared components**
specifically; those module-level sites were left untouched as CODE_HEALTH "follow prior art",
not re-swept.)

**After:** All five replaced with `border-rule-soft` (no alpha suffix, resolves to the dedicated
`--rule-soft` divider token). Verified no test pinned the old class string
(`git grep "border-border/60\|border-border/30"` under `__tests__`/`.test.` — no hits for the
touched components).

**Test:** not separately pinned — `iconContract`/`separatorContract`/`brandSeamContract`/
`navCasingContract` cover rulings 1/2/3/5; a border-token contract test was scoped out of this
pass's four required tests (the brief lists `iconContract.test.ts`, `separatorContract.test.ts`,
`brandSeamContract.test.ts`, and a nav casing check) and is logged below as a follow-up.

## 5. Brand seam (ruling 5)

**Before:** The brand string was already single-owned: `packages/brand/generated.ts` (a real
package, `@scheduler/brand`, generated by `tools/generate-brand.mjs` from `packages/brand/
brand.json`) exports `BRAND` (`productName: "ShuttleWorks"`, `companyName: "Yunavero"`,
`endorsement: "by Yunavero"`, …), `BRAND_SIGNATURE = "ShuttleWorks by Yunavero"`, and
`brandedTitle()`. `apps/console/src/components/ShuttleWorksMark.tsx` (the console's visual
lockup — monogram tile + wordmark chip) reads `BRAND.productName`/`BRAND.productMonogram`, never a
literal. `apps/entrant/app/components/PlayShell.tsx`'s footer renders `{BRAND_SIGNATURE}` directly
and every entrant route's `<title>` goes through `brandedTitle()`. No file assembled
`"ShuttleWorks" + " " + "by Yunavero"` (or similar) by hand. The console mark renders once per
screen context (`AppSidebar` shows the monogram-only rail affordance inside a workspace;
`HubPage`/`NewWorkspacePage`/`GlobalSettingsPage` — the pre-workspace, no-sidebar screens — each
show the full tile+wordmark once) — not a duplicate-mark violation, since those are mutually
exclusive contexts, not the same screen.

**After:** No brand-seam code changes were needed. The plan's rename is deferred, as required —
no new brand direction introduced.

**Test:** `apps/console/src/platform/contracts/__tests__/brandSeamContract.test.ts` — scans
`apps/console/src`, `apps/entrant/app`, and `packages/design-system/components` for a hand-typed
`"ShuttleWorks"`/`"Yunavero"` string literal (comments stripped) and asserts none exists outside
`packages/brand` itself (which the scan doesn't even walk — it IS the owner); separately asserts
`packages/brand/generated.ts` still defines the two constants, that `PlayShell.tsx`'s footer
imports and renders `BRAND_SIGNATURE` rather than reassembling the line, and that
`ShuttleWorksMark.tsx` imports `BRAND` rather than hardcoding the product name.

## Files touched

- `apps/console/src/lib/utils.ts` — added `INLINE_METADATA_SEPARATOR`, `BREADCRUMB_SEPARATOR`.
- `apps/console/src/modules/operations/plan/ScheduleDiffView.tsx` — bullet → middot separator fix.
- `apps/console/src/components/MatchChip.tsx` — `border-border/60` → `border-rule-soft`.
- `apps/console/src/components/control-plane/EventsControl.tsx` — `border-border/60` → `border-rule-soft`.
- `packages/design-system/components/GanttTimeline.tsx` — three `border-border/NN` → `border-rule-soft`.
- `apps/entrant/app/lib/ui.ts` — added `INLINE_METADATA_SEPARATOR` (documentation of the existing
  convention; no call sites redirected — out of this package's component-file-only entrant scope).
- New tests: `apps/console/src/platform/contracts/__tests__/{iconContract,separatorContract,
  brandSeamContract,navCasingContract}.test.ts`.
- `docs/audits/v3-consolidated/ledger/28-strings.md` (new), this report (new).

## Deferred / out of scope

- Mass-adopting `INLINE_METADATA_SEPARATOR` across the ~30 existing entrant call sites that
  already hand-type `' · '` correctly — out of this package's file scope (only
  `TabBar`/`PlayShell`/`Footer`/`lib/ui.ts` are in-scope entrant files; the constant is defined for
  new code to reach for, per the instruction "encode as constants … and redirect literal uses" —
  literal uses were redirected only where found inside the actual in-scope files, which was zero
  beyond the one console violation).
- A dedicated `borderTokenContract.test.ts` pinning "no alpha-suffixed `border-border` in shared
  components" was not added (not in the four required tests); logged here as a candidate follow-up
  if a border-token regression needs a mechanical guard later.
- `apps/console/src/modules/**`'s 22+ pre-existing `border-border/60` hairline sites were left
  untouched — established prior art in the module layer, outside ruling 4's "shared components"
  wording, and a 22-site sweep risked visual drift beyond this package's "targeted,
  consistency-only" mandate.
- The single flagged casing/separator violation from the ledger's Rules-check section
  (`apps/entrant/app/routes/schedule.tsx:641`, `"Schedule / Live"`) was already fixed by a
  concurrent package before this package ran (commit `33abfd35`, "public schedule title matches
  its destination"); verified fixed, no action taken.

## Verification (verbatim)

```
$ npm --prefix apps/console run test:run -- src/platform/contracts/__tests__/iconContract.test.ts src/platform/contracts/__tests__/separatorContract.test.ts src/platform/contracts/__tests__/brandSeamContract.test.ts src/platform/contracts/__tests__/navCasingContract.test.ts
 ✓ src/platform/contracts/__tests__/navCasingContract.test.ts (5 tests)
 ✓ src/platform/contracts/__tests__/iconContract.test.ts (4 tests)
 ✓ src/platform/contracts/__tests__/brandSeamContract.test.ts (5 tests)
 ✓ src/platform/contracts/__tests__/separatorContract.test.ts (3 tests)
 Test Files  4 passed (4)
      Tests  17 passed (17)
```

```
$ npm --prefix apps/console run test:run -- src/platform src/components src/modules
 Test Files  204 passed | 1 failed (205)
      Tests  1754 passed | 1 failed (1755)
```
The one failure — `src/platform/contracts/__tests__/targetSizeContract.test.ts` — is a button
hit-target-size contract (WCAG 2.5.8, package 26 territory) that is not owned by this package: it
is not among the four contract files this package authored, none of its 28 flagged files were
touched by this package's edits, and re-running it against the pre-existing tree (via `git stash`)
reproduces the same failures. Concurrent-agent state confirmed by `git status` at the time: another
agent's `targetSizeContract.test.ts` and `docs/audits/v3-consolidated/closure.md` were present as
untracked/modified files unrelated to this package's scope. Left as-is per instructions to skip
files/state owned by concurrent packages.

```
$ npm run lint:scheduler
✖ 134 problems (0 errors, 134 warnings)
```
0 errors; the 134 warnings are the pre-existing downgraded rule set (CLAUDE.md: 7 newly-strict
react-hooks/react-compiler + no-explicit-any + only-export-components rules are `warn`), none in
files this package touched.

```
$ npx tsc -b apps/console
(clean — no output)
```

```
$ npm run -w apps/entrant test:run -- tests/uiTwins.test.ts
 ✓ tests/uiTwins.test.ts (5 tests)
$ npm run -w apps/entrant test:run -- tests/components.test.ts
 ✓ tests/components.test.ts (88 tests)
```

```
$ npm run typecheck:entrant
(clean — react-router typegen && tsc, no output)
```

```
$ npm run test:classes
check-classes: no unknown token-shaped utilities.
```

```
$ npm run depcruise
x 12 dependency violations (0 errors, 12 warnings). 667 modules, 2891 dependencies cruised.
```
All 12 are the pre-existing `no-cross-module-debt` warnings enumerated in
`apps/console/.dependency-cruiser.cjs`'s `KNOWN_CROSS_MODULE`; none involve a file this package
touched.
