# Work package 06 — fix contrast and text hierarchy

Baseline `f5ccfcef`, branch `feat/surface-book-remediation`. Scope: `docs/audits/v3-consolidated/plan.md` §3 rows X1/X2/X3-X7 (font sizes excluded — package 07) and §6, per the code map `docs/audits/v3-consolidated/maps/05-06-copy-contrast.md` Part B. No font-size, layout, or spacing changes were made.

## Files changed

**R1 — mechanism first (X1).**
- `packages/design-system/scripts/contrast.mjs` (new) — the colour math and token parsing extracted from `check-contrast.mjs`: `blockOf`, `varsOf`, `parseTokens` (returns `{ primitives, light, dark, resolve }`), `hslToRgb`, `relativeLuminance`, `contrastRatio`, `luminanceDelta`. Same regexes and formulas as before, byte-for-byte behavior.
- `packages/design-system/scripts/check-contrast.mjs` — now imports from `contrast.mjs` instead of defining the math inline; output and exit codes unchanged (verified below).
- `packages/design-system/scripts/__tests__/contrast.test.mjs` (new) — vitest unit tests against the extracted module (34 tests): `hslToRgb`/`relativeLuminance` sanity, `contrastRatio` symmetry and known values, `parseTokens`'s `var()` indirection and undefined-token error, then the actual per-token assertions the ruling asked for — `--text-primary`/`--text-secondary`/`--text-muted` on all four surfaces in both themes, `--text-on-accent` on `--action-primary` in both themes, plus the negative control (pale blue on white fails) and the "muted ink legitimately passes" positive control (plan §6's correction — `--text-muted` on white is asserted to PASS, not fail).
- `packages/design-system/package.json` — added a `scripts` block with `test:contrast:unit` (`vitest run scripts/__tests__/contrast.test.mjs`), runnable via the hoisted root `vitest` binary.
- `Makefile` / `.github/workflows/ci.yml` — **no edit needed.** At baseline `f5ccfcef` both `check`/`check-full`/`check-fast` (Makefile:380-381, 442-443) and the CI `frontend` job (ci.yml:50-52) already run `npm run test:contrast` and `npm run test:classes` as blocking steps; the code map's "not in `make check` or CI" note was stale.

**R2 — remove opacity/alpha text fading** (map Part B1 sites):
- `apps/console/src/components/ActiveChoice.tsx:70` — disabled state: `opacity-60` → `text-muted-foreground` (token-based, no fade).
- `apps/console/src/modules/hub/HubPage.tsx:89` — active count: `text-current opacity-75` → `text-text-on-accent` (full ink on the accent fill).
- `apps/console/src/components/control-plane/MatchStatusFilter.tsx:54` — same fix, same reason.
- `apps/console/src/components/MatchChip.tsx:137` — done-state label no longer muted (removed the `doneLabel ? ' text-muted-foreground' : ''` override so it inherits the per-state ink already set by the chip's fill, instead of always being generically muted). `:146` — `v` separator: `opacity-60` → `text-muted-foreground`.
- `apps/console/src/modules/bracket/DrawView.tsx:1401` — schedule caption: `text-foreground/70` → `text-text-secondary`. `:1559` — non-winning set digit: `opacity-70` → `text-muted-foreground`. `:1520` — loser slot name: `text-muted-foreground` → `text-foreground` (R3). `:558/570` — mobile list-row names: `text-muted-foreground` → `text-foreground` for both sides (R3).
- `apps/console/src/modules/operations/run/RunFinished.tsx:91` — `vs` separator: `text-muted-foreground/70` → `text-muted-foreground`.
- `apps/console/src/modules/meet/roster/positionGrid/PositionCell.tsx:83` — disabled cell: `text-muted-foreground/70` → `text-muted-foreground`. `:95` — dash glyph: `opacity-50` → `text-muted-foreground` (kept `italic`).
- `apps/console/src/modules/display/publicDisplay/CourtsView.tsx:115` — closed-row `opacity-50` on the whole row removed (the row's own sub-elements already carry `line-through`/muted/"Court closed" cues). `:142` — "Next" eyebrow: `text-foreground/80` → `text-foreground`. `:275` — closed-card `opacity-60` removed (same reasoning). `:292` — court-code badge: `opacity-90` removed. `:456` — "Later" block: container `opacity-70` removed; the "Later" label now carries `text-muted-foreground` directly (metadata), and the un-annotated name span now inherits full ink (body default) instead of being faded along with the label — these are real participant names (R3).
- `apps/console/src/modules/meet/roster/RosterTab.tsx:591` — school-pill count: `opacity-75` → active/inactive branch (`text-text-on-accent` when the pill is selected, `text-muted-foreground` otherwise) — same active-fill-contrast bug as HubPage/MatchStatusFilter.
- `apps/console/src/components/control-plane/OverflowMenu.tsx:111` — disabled menu item (real state is `aria-disabled`, item stays focusable/announced, not exempt as a genuinely inert control): `text-muted-foreground opacity-60` → `text-muted-foreground` only.
- `apps/console/src/modules/bracket/BracketInlineNotice.tsx:28` — message line: `opacity-80` → `text-muted-foreground`.
- `packages/design-system/components/Toast.tsx:97` — diagnostic code line: `opacity-90` removed (inherits the already-validated per-level status ink).
- `packages/design-system/components/Button.tsx:13` — `disabled:saturate-0` → `disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground` (token-based disabled treatment, matching the existing `TextField.tsx` disabled convention).
- `apps/console/src/components/control-plane/MatchCard.tsx` — **no change.** The map cites `:196` as "stacked variant mutes the loser's name", but that line (`ResultSideBlock`) governs the side's *score* digits, not a name — muting a lost game's score by weight is the intended "winner reads by weight" hierarchy, not a text-fade defect. The actual name renderer (`CardSide`, line 116) already reads `won ? 'font-semibold text-foreground' : 'text-foreground'` at baseline — both branches already primary ink. No edit made; flagged here per the "verify before editing" instruction.

**R3 — names in primary ink (X2):**
- `apps/entrant/public/assets/person-ref.js:38` — unlinked name: `text-muted-foreground` → `text-foreground`. `apps/entrant/app/components/PersonRef.tsx` needed **no separate edit** — it imports `personRefModel` from `person-ref.js` directly rather than duplicating its class-string logic, so the two are not actually duplicated "twins" (see debt log V3-3); one edit updates both consumers.
- `apps/console/src/components/control-plane/MatchCard.tsx` — already correct at baseline (see above).
- `apps/console/src/modules/bracket/DrawView.tsx` — loser slot (`:1520`) and mobile list-row names (`:558/570`) as listed under R2 above.
- `apps/console/src/components/MatchChip.tsx:137` — as listed under R2 above (the chip's own `label`, not `sideA`/`sideB`, stopped muting on done).

## Before/after computed ratios — the two ActiveChoice count sites

Both `HubPage.tsx:89` and `MatchStatusFilter.tsx:54` shared the identical bug: the active pill's count used `text-current opacity-75`, i.e. `--text-on-accent` alpha-composited at 75% over the `--action-primary` fill. Computed via `contrast.mjs` (`hslToRgb` + `relativeLuminance`, alpha-blended in sRGB space to match CSS `opacity` compositing):

| Theme | Before (`text-current opacity-75`) | After (`text-text-on-accent`) |
| --- | --- | --- |
| light | **3.63:1** (fails 4.5) | **5.20:1** (passes) |
| dark | **4.11:1** (fails 4.5) | **6.06:1** (passes) |

The map's raster estimate ("11px → ≈3:1") is consistent with the computed light-theme figure.

## Non-text opacity/alpha deliberately kept

Per plan §3 X1 ("Non-text opacity ... stays") and R2's disabled-control exemption. Enumerated (and pinned) in `apps/console/src/platform/contracts/__tests__/inkContract.test.ts`'s `NON_TEXT_OPACITY` allowlist:
- `DrawView.tsx`: `hover:opacity-90` (button fill dims on hover — a background, not text), `disabled:opacity-40`/`disabled:opacity-50` (real `disabled` attribute — WCAG's contrast-minimum exempts inactive controls).
- `RunFinished.tsx`: `disabled:opacity-50` on the Undo button (real `disabled` while updating/locked).
- `PositionCell.tsx`: `opacity-0` / `focus-visible:opacity-100` / `group-hover/cell:opacity-100` — a hover-reveal toggle for the reassign pencil, fully opaque whenever it is interactive, not a resting text fade.
- `RosterTab.tsx`: `disabled:opacity-50` (real `disabled` attribute, repeated across several buttons).
- Background/border/ring/shadow alpha throughout (`bg-x/NN`, `border-x/NN`, `ring-x/NN`) is untouched everywhere — e.g. `MatchChip.tsx`'s `bg-white/20` source-square fill, `DrawView.tsx`'s `border-accent/40 ring-accent/30`, `CourtsView.tsx`'s `bg-status-live-bg/60` row tints, `BracketInlineNotice.tsx`'s `bg-status-called/10` tint — none of these are text colour and none were in scope.

Out-of-scope survivors (not touched, logged as debt V3-1): roughly 90 further `opacity-N`/`disabled:opacity-N` occurrences across the console outside the map's owner-file list (`RunQueue.tsx`, `MeetMatchControls.tsx`, `DirectorToolsPanel.tsx`, `WorkspaceRow.tsx`, `BracketPlayerFields.tsx`, `RegenerateMenu.tsx`, `MatchesTab.tsx`, `AvailabilityControl.tsx`, `lib/utils.ts`, …) — spot-checked as disabled-control patterns but not audited file-by-file.

## Tests added (R4)

- `packages/design-system/scripts/__tests__/contrast.test.mjs` — 34 tests against the extracted module (see R1 above); hierarchy tokens and contrast are asserted separately from any DOM/layout check.
- `apps/console/src/platform/contracts/__tests__/inkContract.test.ts` — 5 tests: a negative control that the two ban regexes (`text-<token>/<N>` alpha suffix; `opacity-<N>` with optional variant prefixes) actually match seeded violations; a full ban on text-alpha across every WP-06 owner file; an allowlist check that every remaining `opacity-N` in an owner file is one of the enumerated non-text uses; a staleness check that every allowlist entry still occurs (so it can't silently rot into covering a deleted line); and a check that `Button.tsx` no longer contains `saturate-0` and does carry the new token-based disabled treatment. Deliberately scoped to the map's owner-file list rather than a codebase-wide scan (see debt V3-2) — a blanket ban today would immediately fail on the ~90 out-of-scope occurrences in V3-1.
- No existing snapshot/class-pinning test needed updating: `apps/entrant/tests/uiTwins.test.ts` doesn't cover `person-ref.js` (it pins `CHIP`/`PRIMARY_BUTTON`, a different pair); `apps/entrant/tests/personRef.test.ts` asserts routing/DOM shape, not colour classes; no dedicated test files exist for `MatchChip`, `CourtsView`, `RunFinished`, `PositionCell`, `BracketInlineNotice`, `OverflowMenu`, or `Toast`.

## Commands run and results

- `node packages/design-system/scripts/check-contrast.mjs` → **all gates pass** (identical output/ratios to before the extraction; exit 0).
- `npm run test:contrast` → **all contrast gates pass** (exit 0).
- `npm run test:classes` → `check-classes: no unknown token-shaped utilities.` (exit 0).
- `npm run test:contrast:unit` (from `packages/design-system`) → **34/34 tests passed.**
- `npm --prefix apps/console run test:run -- src/platform/contracts/__tests__/inkContract.test.ts src/platform/contracts/__tests__/selectedContrastContract.test.ts src/components/__tests__/ActiveChoice.test.tsx src/modules/hub/__tests__/HubPage.test.tsx src/components/control-plane/__tests__/OverflowMenu.test.tsx src/modules/meet/roster/__tests__/RosterTab.cleanup.test.tsx src/modules/bracket/__tests__/BracketRosterTab.test.tsx src/modules/bracket/__tests__/DrawView.test.tsx src/modules/bracket/__tests__/DrawView.centered.test.tsx src/modules/bracket/__tests__/DrawView.segments.test.tsx src/modules/bracket/__tests__/DrawView.swiss.test.tsx src/modules/bracket/__tests__/BracketMatchesTab.test.tsx` → **12 files, 119 tests passed.**
- `npm --prefix apps/console run test:run` (full suite) → **230 files, 2051 tests passed.**
- `npm run lint:scheduler` → **0 errors, 134 warnings** (pre-existing categories only — `react-hooks/set-state-in-effect`, `react-hooks/static-components`; none introduced here).
- `npm run -w apps/entrant test:run -- tests/uiTwins.test.ts tests/personRef.test.ts` → **2 files, 13 tests passed.**
- `npm run -w apps/entrant test:run -- tests/noRawColor.test.ts` → **1 file, 5 tests passed.**
- `npm run typecheck:entrant` → clean.
- `npm run lint:entrant` → clean.
- `cd apps/console && npx tsc -b` → 3 pre-existing errors in `src/modules/settings/__tests__/SyncReconciliationPanel.test.tsx` (`AuthorityStatusDTO` missing `acknowledged_operations`), caused by a concurrent agent's in-flight edit to `apps/console/src/api/dto.ts`/`dto.generated.ts` (both show modified in `git status` at session start, outside this package's file scope) — unrelated to any file this package touched; filtering those three lines out, `tsc -b` is clean.
- `npm run depcruise` → **0 errors**, 16 pre-existing `no-cross-module-debt` warnings (all predate this change, unrelated files).
- `npm run -w apps/entrant test:run` (full suite) → 49/50 files, 885/886 tests passed; the one failure (`tests/launch-scripts.test.ts`) asserts CLI flags in `tests/e2e/run-console-contracts.sh`/`tools/fixture-up.sh`, both shown modified/untracked by a concurrent agent at session start — unrelated to this package.

## Debt logged

`docs/reference/debt-log.md`, new "## v3 consolidated plan" heading: V3-1 (the ~90 out-of-scope opacity occurrences), V3-2 (`inkContract.test.ts` is a curated allowlist, not yet a blanket ban), V3-3 (note that `person-ref.js`/`PersonRef.tsx` are not actually duplicated twins).
