# Work package 17 — build and validate signage density

Branch `feat/surface-book-remediation`, HEAD `ae9a07d3` at start. Scope: `apps/console/src/modules/display/**` and its tests, `docs/audits/v3-consolidated/`. Per `docs/audits/v3-consolidated/plan.md` §3 rows "Board names at 30 px", "Board scores always present", "Board conflict copy", "Remove vs", "Keep match identity/event context on board and compact variants"; the MatchCard contract `docs/reference/contracts/match-card.md` §4.4 (signage renderer) and §7.4 P3/P4/P7; the state-and-formatting contract §4 (disputed court public label), §7 (board timezone, D13), §6/§2.4 (D14/D5); findings V3-OC24.1 (verified done by 04b) and V3-OC24.2 (fixed here). Two files just outside `modules/display` were touched to close a debt item this package's ruling explicitly named (`packages/design-system/tokens.css`, `tailwind-preset.js` — removing the retired `text-3xs` step) plus the pinned test that allowlisted it (`apps/console/src/platform/contracts/__tests__/captionFloorContract.test.ts`) and `docs/reference/debt-log.md` (closing V3-07-1) — flagged here since they are outside the stated scope but were named by name in the assignment ("the 07 report debt V3-07-1: `text-3xs` survivors in display go").

## Files changed

- `apps/console/src/modules/display/publicDisplay/helpers.ts` — `formatTournamentDate` now redirects to the `formatDateTime` authority (`lib/formatDateTime.ts`, D13) instead of a local `toLocaleDateString` call, with an explicit `timeZone` parameter (default `'UTC'`, still labeled per §7.2 — no tournament timezone reaches this page's wire, see Debt below). `formatPlayers` now redirects to the `sides.ts` authority (D14): builds a `Side` from the raw ids via `meetSideFromIds` and returns `formatSideCondensed`, so an unresolved side prints "To be decided" (never "TBD") and a doubles pair joins with `' / '` (never `' & '`). New `sideLines()` — same authority, but `formatSideLines` (one line per participant) for the board's full signage density. New exported `COURT_ASSIGNMENT_UNAVAILABLE` constant so the exact contract §4.1 sentence is spelled once, not four times independently.
- `apps/console/src/modules/display/publicDisplay/freshness.ts` — `STALE_CAPTION` (a fixed string) replaced by `staleCaption(ageMs)` (a function): "Results may be N minute(s) behind.", computed from the actual age of the last successful sync, floored at 1 minute. Closes V3-OC24.2's "must say how old the data is."
- `apps/console/src/modules/display/publicDisplay/LiveStatusPill.tsx` — `text-3xs` → `text-xs` (word caption; V3-07-1 / caption-floor ruling R1).
- `apps/console/src/modules/display/publicDisplay/tvSizing.ts` — new `resolveSignageNameSize(cardHeightPx)`, a **separate** scale from `resolveCardSizeClasses().playerSize` that goes to 48/60/60/72px (the on-court match-card names' signage floor, ≥48px). Kept separate rather than raising the shared `player` tier, which also feeds `BracketResultsView`'s historical results rows and would have inverted that view's intentional hierarchy (a normal result row bigger than the champion headline) — see "A design decision worth a second look" below.
- `apps/console/src/modules/display/publicDisplay/CourtsView.tsx`:
  - Card band's free-court word: `STATE_WORD.free` ("Free") → literal `"Court free"` (contract §4.1's distinct public label; the operator's `STATE_WORD.free` still serves `RunCourtGrid.tsx` unchanged).
  - Conflict copy (list row, card band, card body) now reads from `COURT_ASSIGNMENT_UNAVAILABLE`.
  - `SideScoreRow` rewritten: takes `lines: string[]` (from the new `sideLines()`) and renders one `<span class="block">` per participant, instead of one joined line built via the `formatPlayers(...) → sideSurnameLine(..., ' & ')` round-trip (deleted — D14/D15, "the `CourtsView.tsx:313` `' & '` → `sideSurnameLine` round-trip is deleted"). The score lane is no longer rendered at all when `scores.length === 0` (was a reserved-width `w-9` placeholder span) — contract §3.4's ledger-collapse rule.
  - `NextUp` (idle-court preview) gains `nextCode`/`laterCode` — the match's own reference next to the "Next"/"Later" label (contract §3.6: identity chip required on the board and compact variants; "next: C2" now resolves to a specific match, not just two names).
  - Remaining `text-3xs` (the "Later" label) → `text-xs`.
  - On-court names now use the new `resolveSignageNameSize(cardHeightPx)` instead of the shared `playerSize`.
- `apps/console/src/modules/display/bracketDisplay/bracketDisplayData.ts` — `sideLabel` rewritten to build a `Side` (resolved slot participant, resolved direct members, or `undetermined`) and return `formatSideCondensed(side)`, replacing the raw `'–'` fallback with the authority's `"To be decided"` (exported as `UNDETERMINED_SIDE_LABEL`). D14.
- `apps/console/src/modules/display/bracketDisplay/BracketLiveView.tsx` — imports `UNDETERMINED_SIDE_LABEL` (replaces the `'–'` string comparison used to filter an unfilled "next" preview) and `COURT_ASSIGNMENT_UNAVAILABLE` (replaces the inline conflict-copy literal).
- `apps/console/src/modules/display/MeetDisplayPage.tsx`:
  - New `BOARD_TIME_ZONE = 'UTC'` constant with a doc comment explaining the data gap (see Debt).
  - Header clock: `now.toLocaleTimeString(...)` (browser locale/zone) → `formatDateTime(now.toISOString(), 'clock_with_zone', BOARD_TIME_ZONE)`, wrapped in `<time dateTime={now.toISOString()}>`, sized `text-5xl` (48px, clears the ≥40px clock floor — was `text-2xl`/24px).
  - "Updated" label: bare `toLocaleTimeString` time-of-day (no date, browser zone) → `formatDateTime(iso, 'datetime', BOARD_TIME_ZONE)` (date + time) inside a `<time dateTime={diagnostic ISO}>`, `title` uses the `deadline` context. Fixes V3-OC24.2's exact finding (an unlabeled, date-less "Updated 04:07 AM").
  - Stale caption call site updated to `staleCaption(lastSyncedAt ? now.getTime() - lastSyncedAt : STALE_MS)`.
- `apps/console/src/modules/display/bracketDisplay/BracketDisplayPage.tsx` — identical treatment: `BOARD_TIME_ZONE` constant, header clock (`text-base`/16px → `text-5xl`/48px, `clock_with_zone`), "Updated" label (`datetime` context, `<time>`), stale caption call site.
- `packages/design-system/tokens.css` / `tailwind-preset.js` — removed `--text-3xs` / the Tailwind `3xs` fontSize step now that both display call sites are gone (closes debt-log V3-07-1).
- `apps/console/src/platform/contracts/__tests__/captionFloorContract.test.ts` — removed the two `modules/display/**` allowlist rows (now stale — the pattern no longer occurs in either file).
- `docs/reference/debt-log.md` — V3-07-1 marked resolved.
- `docs/audits/v3-consolidated/ledger/17-strings.md` (new) — full string/behavior ledger.

## Tests changed/added

- **New**: `apps/console/src/modules/display/__tests__/MeetDisplayPage.signage.test.tsx` — renders the real `MeetDisplayPage` against store state (same pattern as `MeetDisplayPage.courtLayout.test.tsx`): each doubles partner renders in its own `<span class="block">` line (never joined); the Next preview carries the match's own reference; a match with no recorded score renders no score-lane element at all (checked via absence of `[title^="Set "]` and via the side row's child count); a disputed court renders exactly "Court assignment unavailable." with no staff-action or announcement language; the header clock and "Updated" value render inside `<time dateTime>`.
- **Extended**: `apps/console/src/modules/display/bracketDisplay/__tests__/bracketDisplayData.test.ts` — two new cases: an unfilled slot with no direct members labels `"To be decided"` (`UNDETERMINED_SIDE_LABEL`), never `'–'`; a resolved doubles pair condenses to `"Alice / Bob"`, never a `'&'` join.
- **Updated (broke a pinned assumption; not a convenience edit — see reasons)**:
  - `apps/console/src/modules/display/publicDisplay/__tests__/freshness.test.ts` — `STALE_CAPTION` (string) → `staleCaption(ageMs)` (function). Reason: V3-OC24.2 rules that the stale caption must state *how old* the data is; the fixed generic string no longer satisfies the contract, so the pinned exact-string test is superseded by three tests on the new function (never-operator-language, states the actual age, floors at 1 minute).
  - `apps/console/src/modules/display/publicDisplay/__tests__/helpers.test.ts` — removed the second `formatTournamentDate` test, which spied on `Date.prototype.toLocaleDateString` and asserted it was called with `timeZone: 'UTC'`. Reason: the D13 redirect moved the implementation to `formatDateTime.ts`, which calls `Intl.DateTimeFormat` directly — the spy would now simply never fire (a vacuous pass turned into a vacuous fail, not a real regression signal). Replaced with a test that passes an explicit `timeZone` argument and asserts the rendered day actually changes where UTC and that zone disagree on the calendar date (America/Los_Angeles, May 2026) — a stronger, implementation-independent assertion of the same UTC-default behavior. The first test (the original off-by-one regression, run under `TZ=America/Los_Angeles`) is unchanged and still passes.
  - `apps/console/src/platform/contracts/__tests__/captionFloorContract.test.ts` — see Files changed. This is the "stale entries" self-check working as designed (an allowlist row must still occur in its file), not a loosening of the rule.

No test contradicted a ruling; nothing was stopped-and-flagged.

## Per-finding acceptance

| Finding / ruling | Status | Evidence |
|---|---|---|
| V3-OC24.1 (staff-action conflict claim) | **Verified done** (package 04b) | `CourtsView.tsx`/`BracketLiveView.tsx` render exactly "Court assignment unavailable.", now from one shared constant; `MeetDisplayPage.signage.test.tsx`'s disputed-court test confirms no "resolving"/"announcement"/"wait for" language renders. |
| V3-OC24.2 (clock/updated with no date or zone) | **Fixed** | Header clock now `clock_with_zone` (states the zone); "Updated" now `datetime` (states the date, fixing the midnight-ambiguity finding); stale caption now states the actual age. Zone is stated once (the header clock), not repeated on the "Updated" value, per contract §4.2's "stated once nearby" rule. |
| Board names ≥ 48px / court ≥ 28px / clock ≥ 40px (plan §3, contract §4.4) | **Implemented as initial targets; physical validation pending (P7)** | `resolveSignageNameSize` floors at 48px; court numbers were already ≥28px at every tier (unchanged); header clock is 48px (≥40px). See "Physical validation procedure" below for what package 27 must run. |
| Board scores always present → Conditional (plan §3, P3) | **Verified via existing gate; unchanged this package** | The board already gates all score rendering on `config.tvShowScores` (a director-set publication toggle) and on `state?.score`/`state?.sets` actually being present — there is no code path that synthesizes a score. This package's only score-related change is removing the reserved-width placeholder when no score exists (contract §3.4). I did not independently re-verify the package 01 fixture's publication settings/data (out of this package's file scope, backend/fixture territory) — flagged as a residual verification item below. |
| Board conflict copy exactly "Court assignment unavailable." (P4) | **Confirmed, no announcement sentence added** | No confirmed venue announcement process was named to me; per the ruling's default, the four words stand alone everywhere. |
| Keep match identity/event context on board and compact variants (§3.6) | **Fixed for the Next/Later preview** | `NextUp` now shows `nextCode`/`laterCode`. The on-court card already showed its own match code in the band; unchanged. |
| Remove "vs" / explicit board separator (§3.2) | **Unchanged, already compliant** | Every place two sides sit on one line (list row, Next/Later preview) already used a visible "vs" separator; no case in this codebase stacks two sides' names without one, so there is no "two names reading as one pair" risk to remove. |
| D13 (board timezone) | **Partially fixed — see Debt** | Board now uses one formatter, honestly labeled, instead of four separate silent-local/forced-UTC copies. The *real* tournament timezone still does not reach the board (data gap, not a display-logic bug). |
| D14 (unresolved-side fallbacks) | **Fixed for the two D14 sites named for package 17** | `bracketDisplayData.ts` sideLabel, `publicDisplay/helpers.ts` formatPlayers. |
| D5 (state words) | **Verified — already redirected** | `CourtsView.tsx`/`BracketLiveView.tsx`/`LiveStatusPill.tsx` already import `STATE_WORD` (done by 04b); this package added the board-specific "Court free" word deliberately outside that shared vocabulary (see ledger notes) and did not touch the D5 redirect itself. |
| V3-07-1 (`text-3xs` survivors) | **Closed** | Both call sites moved to `text-xs`; token + Tailwind step removed; allowlist rows dropped; debt-log updated. |

## Debt logged

- **Tournament timezone does not reach the board's wire data.** Neither `TournamentConfig`/`ScheduleDTO` (meet board) nor `BracketTournamentDTO` (bracket board) carries a `timeZone` field — only `TournamentSummaryDTO` does, and nothing in the standalone `/display` route (`useDisplaySync`/`useBracketDisplaySync`, both token- and `?id=`-based) fetches that summary or the public `/display/{token}/summary` route (which itself only returns `{kind, name}`, no timezone). `BOARD_TIME_ZONE = 'UTC'` is the contract's own sanctioned fallback (§7.2: fall back to UTC and label it) rather than a silent local-time assumption, but it is not the *actual* venue timezone, so a board in a non-UTC venue will show a UTC clock, correctly labeled "UTC" but not matching the wall clock on-site. Fixing this needs a backend change (either adding `timeZone` to `/display/{token}/summary` and the `state`/`bracket` payloads, or to `TournamentConfig`/`BracketTournamentDTO` directly) that is out of this package's stated file scope (`apps/console/src/modules/display/**` only — no `apps/api` or `apps/console/src/api` changes). Recommend a small follow-up package: thread `timeZone` through the display projection, then delete the two `BOARD_TIME_ZONE` constants in favor of the real value.
- **Board scores' publication/data verification on the package 01 fixture was not independently re-run.** The gating logic (`config.tvShowScores` + presence of `state.score`/`state.sets`) was inspected and found correct, and no code change to it was needed, but confirming T029/T030 actually exercise both the "published + present" and "not published"/"no data" cases end-to-end is a fixture/backend verification task outside this package's file scope.
- **A design decision worth a second look**: the on-court match card's names now render notably larger (48–72px) than the board header's tournament name/date/pills (which stayed at their pre-existing sizes, e.g. `text-3xl`/30px for the tournament name). This is a deliberate consequence of the ruling (names are what a spectator crosses a hall to read) but was not visually proofed against a real screen — flagged for the physical validation pass below to confirm or push back on.

## Physical validation procedure (pending — package 27)

The 48px name / 28px court / 40px clock figures in this package are initial targets per contract §4.4's envelope ("the board is judged physically... the 30 px figures are initial targets to validate, not a conclusion"). Package 27 should:

1. Deploy the board (`/display?id=<tid>` or the public `/display/<token>` link) on the **actual signage hardware** at the **actual mounting height/location** the venue will use (not a laptop screen).
2. Stand at the **intended viewing distance** (the nearest seat/standing area a spectator would realistically read the board from — measure it).
3. With a real or seeded match on court (doubles, to exercise the worst-case 4-line name stack), confirm from that distance, without stepping closer:
   - Both players' names on each side are legible.
   - The court number is legible from a wider angle/further distance than the names (it is the "which court am I looking at" glance-check).
   - The header clock's time is legible at a glance.
   - The "Court assignment unavailable." sentence and the "Court free"/"On court"/"Next" state words are legible.
4. Record the actual screen size, resolution, and measured viewing distance alongside a pass/fail per element, and adjust `resolveSignageNameSize`/`courtNumSize`/the header clock's `text-5xl` if any element fails — these are Tailwind-class changes local to `apps/console/src/modules/display/publicDisplay/tvSizing.ts` and the two display pages, not a data-shape change.
5. Re-check the "design decision worth a second look" above: does the tournament name in the header still read as the board's primary heading, or do the now much-larger on-court names dominate the page in a way that reads wrong?

## Commands run and results (verbatim)

```
$ npm --prefix apps/console run test:run -- src/modules/display
...
 Test Files  28 passed (28)
      Tests  167 passed (167)
```

```
$ npm run lint:scheduler
...
✖ 134 problems (0 errors, 134 warnings)
  0 errors and 3 warnings potentially fixable with the `--fix` option.
```
(All 134 warnings are pre-existing, in files this package did not touch — `react-hooks/set-state-in-effect`, `react-refresh/only-export-components`, `react-hooks/static-components` in `setup/SetupProduct.tsx`, `workspace/DisplayConfig.tsx`, `WorkspaceShellSurface.tsx`, `platform/auth/LoginPage.tsx`, `platform/domain/useWorkspaceModules.ts`, `platform/engine-config/*`, `platform/product-shell/*`. Confirmed via `git diff --stat` that none of these files were touched by this package.)

```
$ npx tsc -b apps/console
(no output — clean)
```

```
$ npm run test:contrast
...
All contrast gates pass.
```

```
$ npm run depcruise
...
x 12 dependency violations (0 errors, 12 warnings). 659 modules, 2852 dependencies cruised.
```
(All 12 are pre-existing `no-cross-module-debt` warnings in files this package did not touch; the new intra-`display`-module import `bracketDisplay/BracketLiveView.tsx → publicDisplay/helpers.ts` is not cross-module — both live under `modules/display/**` — and triggered no new finding.)

```
$ npm --prefix apps/console run test:run
...
 Test Files  1 failed | 247 passed (248)
      Tests  1 failed | 2214 passed (2215)
```
The one failure, `src/modules/setup/__tests__/SetupProduct.test.tsx` (a `findByLabelText` timeout), reproduces in isolation and is in a file this package never touched (`git diff`/`git status` show no changes under `apps/console/src/modules/setup/`) — pre-existing, package 13's territory, unrelated to signage.

## A note on scope

Two files outside `apps/console/src/modules/display/**` were touched (`packages/design-system/tokens.css`, `packages/design-system/tailwind-preset.js`) plus one pinned test outside the stated scope (`apps/console/src/platform/contracts/__tests__/captionFloorContract.test.ts`) and `docs/reference/debt-log.md`. This was a direct, named instruction in the assignment ("the 07 report (debt V3-07-1: `text-3xs` survivors in display)" and ruling "the `text-3xs` survivors in display go (V3-07-1)"), and `tokens.css`'s own comment explicitly said to do this once display's two call sites moved off `text-3xs` ("Remove both once display's remaining `text-3xs` usages are gone"). No other file outside the stated scope was edited. `git diff --stat` was checked before every edit; no file outside this list showed prior changes from a concurrent workstream.
