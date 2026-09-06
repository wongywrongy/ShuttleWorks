# Work package 26b — entrant (public) accessibility and responsive checks

Branch `feat/surface-book-remediation`, HEAD `8e07b9ea` at start (package 24 had just landed). Scope: `apps/entrant/tests/**` (new static contract test), `tests/e2e/tests/entrant-a11y.spec.ts` (new), targeted fixes in `apps/entrant/app/**` for defects the new checks found, `docs/audits/v3-consolidated/`. Per `docs/audits/v3-consolidated/plan.md` §6 rows "Accessibility" and "Responsive/signage" (public 320/390/768/1440; bracket scroll deliberate), the WCAG 2.2 AA paragraph (4.5:1 text; 24×24 CSS px pointer-target minimum; 44px is the comfortable public target, not the AA gate; APCA is not the gate; no fixed `offsetHeight` assertions), the MatchCard contract §6 (identity/side rendering — the full-name-access finding below), and the entrant-tier constraints in `CLAUDE.md` (SSR, no hydration, bounded same-origin route modules, CSP).

## What this package is, in one paragraph

One new vitest static contract test (`apps/entrant/tests/a11yContracts.test.ts`, 62 tests: accessible names / `aria-describedby` wiring / heading order across 18 rendered routes, plus skip-link, full-name-access, colour-only-meaning and target-size checks), one new Playwright spec (`tests/e2e/tests/entrant-a11y.spec.ts`, 88 tests: DOM audit × 12 surfaces × 4 widths, no-horizontal-scroll at 320/390, bracket-canvas-scroll exception, 200% zoom on card-bearing surfaces, three keyboard walks, two full-name-access checks, two real-form invalid-submission checks), and eleven targeted product fixes the new checks actually found. All contract tests and the Playwright spec pass.

The dominant finding, by volume, was **one defect class appearing at five separate sites**: an implicit CSS Grid or flex track defaults to `min-width: auto` on its items, so a single long piece of organizer-authored or fixture text (a venue/locality string, an intro paragraph, a match-card name, a document version line) can force the *entire shared track* — and every sibling in it — wider than the viewport, producing a document-level horizontal scroll the individual overflowing element's own `break-words`/`min-w-0` did nothing to prevent (that class is on the item, not the track). Diagnosed and fixed on Discovery, the Tournament overview, Schedule, `MatchCard`, and the "Filters" popover's closed-state visibility; the same latent pattern is confirmed present but not demonstrated-to-fail at several other sites and is logged as debt (`V3-26-4`) for a systematic sweep.

## Files changed

**New static contract test**:
- `apps/entrant/tests/a11yContracts.test.ts` (new, 62 tests) — renders 18 routes through the real `@react-router/dev` pipeline (`createRequestHandler`, the same harness every other file in this directory uses) and checks, generically, per route: (a) every interactive element has an accessible name; (b) every `aria-describedby` points at an id that exists; (g) heading order (exactly one `h1`, no skipped level). Plus route-independent checks: (c) the skip link exists and its target is keyboard-focusable; (d) the longest fixture name renders in full, visible text, never behind a `title=` tooltip (MatchCard/PersonGroup source-checked structurally); (e) colour is never the only carrier of match-state meaning (source scan); (f) target size — the entry-wizard primary buttons and the design-system `Button size="lg"` are 44px, the shared secondary utility is ≥24px (source scan). Registered in `apps/entrant/vitest.test-files.ts`'s `SSR_TEST_FILES` (pinned list, now 23 entries) since it boots a Vite server like every other file there.

**New Playwright spec + runner wiring**:
- `tests/e2e/tests/entrant-a11y.spec.ts` (new, 88 tests) — see "Browser checks" below.
- `tests/e2e/package.json` — added `"test:entrant-a11y": "playwright test tests/entrant-a11y.spec.ts"`.
- `tests/e2e/global-setup.ts` — `requiresEntrantOrigin()` now also returns `true` for `npm_lifecycle_event === 'test:entrant-a11y'` (this spec needs the entrant SSR origin up, the same as `test:entrant-evidence`).
- `apps/entrant/tests/launch-scripts.test.ts` — `entrant-a11y.spec.ts` added to the pinned `e2eTestFiles()` list (alphabetical, after `console-browser-contracts.spec.ts`); added an assertion pinning `requiresEntrantOrigin({ npm_lifecycle_event: 'test:entrant-a11y' }) === true`.
- No new dependency: confirmed `tests/e2e/node_modules` has no `@axe-core/playwright` (same finding as 26a's `V3-26-2`), so the spec reuses the identical documented DOM-audit fallback (unnamed buttons/links, unlabeled inputs, images without `alt`, duplicate ids). Logged as `V3-26-6`.

**Product fixes** (targeted; each entry names the defect the new checks actually found):

1. `apps/entrant/app/components/PlayShell.tsx` — the skip link (`href="#main-content"`) targeted a plain `<div id="main-content">` with no `tabindex`. WCAG 2.4.1 "Bypass Blocks" needs the skip target to actually *receive* keyboard focus, not just scroll into view; without `tabindex="-1"`, the very next Tab after activating the link returned to the header. Added `tabIndex={-1}` (+ `focus:outline-none`, since a programmatic-focus target doesn't need a visible ring).
2. `apps/entrant/app/components/SectionCard.tsx` — the `eyebrow` variant rendered an `<h3>`; its only caller (`receipt.tsx`) places it directly under the page's one `<h1>` with no intervening `<h2>`, skipping a heading level. Changed to `<h2>` (semantic-only; the uppercase "eyebrow" look is entirely the class string, untouched).
3. `apps/entrant/app/routes/tournament.tsx` — the Players panel had no heading of its own (Overview and Draws both carry a `sr-only` `<h2>`; Players didn't), so `EntrantsList`'s `<h3>` A–Z letter groups skipped from the page's `<h1>` straight to `<h3>`. Added a matching `<h2 className="sr-only">Players</h2>`.
4. `apps/entrant/app/routes/schedule.tsx` — the page rendered a second `<h1 id="schedule-title">` even though `HeroHeader` already renders the page's one `<h1 id="tournament-title">` (the tournament name) directly above it. Changed to `<h2>`; updated the one pinned assertion in `apps/entrant/tests/schedule.test.ts` accordingly.
5. `apps/entrant/app/components/SegmentedNav.tsx` — the season-view segment group (`inline-flex`, no wrap utility) had no way to drop onto a second line, so three segments ("Season" / "Taking entries · N" / "Completed · N") forced Discovery's control row wider than a 320/390px viewport. Added `flex-wrap`.
6. `apps/entrant/app/components/SeasonControls.tsx` — three related fixes to the same search-and-filter box: (a) the box's `flex-1` gave the wrap algorithm nothing to measure (an implicit `flex-basis: 0%` always "fits," so it never dropped to its own line), so the "Filters" `<details>` trigger (which cannot shrink below its own label) simply overflowed the box's edge instead of the box wrapping to contain it — added `basis-full` (with `sm:basis-80` preserved for wider screens) and `max-w-full`; (b) the closed-state popover panel measurably kept a real, non-zero, mispositioned layout box (`display:block`) instead of following the native `details:not([open])` hiding rule, for a mechanism this package could not fully explain from source inspection alone — replaced reliance on that native behaviour with an explicit `hidden group-open:block` (`group` added to `<details>`); (c) the root `<div className="grid gap-3">` is an implicit-grid-track item with no `min-w-0` (see the defect-class summary above) — added it.
7. `apps/entrant/app/components/SeasonCalendar.tsx` — two fixes: (a) the calendar card's outer `<section>` is the grid item whose content (a long, sparsely-breakable venue/locality line) was inflating the SAME shared grid track `SeasonControls` sits in — added `min-w-0`, which is what actually closed Discovery's 320px horizontal-scroll defect (the `SeasonControls` fixes above were real but insufficient alone, since the *track*, not any one item, was refusing to shrink); (b) the status-cell wrapper below `sm:` had no width constraint at all, so its child `<span>` (an exact-instant deadline, e.g. "Closes 1 Jan 2035, 09:00 GMT+9 · 3076d") took its unwrapped preferred width instead of wrapping — added `min-w-0`.
8. `apps/entrant/app/routes/discovery.tsx` — the `<div className="mt-6 grid gap-4">` wrapping `SeasonControls` + `SeasonCalendar` is the outer implicit-grid-track container; added `min-w-0` alongside the two fixes above (all three were needed together — see the file comments for why each one alone was insufficient).
9. `apps/entrant/app/routes/tournament.tsx` — the same implicit-grid-track defect, three sites: the Overview grid's outer wrapper, the intro/key-facts pair (`md:grid-cols-[minmax(0,1fr)_18rem]` — protected at `md:`, not below it), and the key-dates/venue pair (`md:grid-cols-2`). Added `min-w-0` to all three; a long organizer-authored intro paragraph and a long venue address line were the demonstrated triggers at 320px.
10. `apps/entrant/app/components/SectionCard.tsx` (`titled` variant, the Overview cards) — same defect: the card `<section>` itself is a grid item of the key-dates/venue pair; added `min-w-0`.
11. `apps/entrant/app/routes/schedule.tsx` (both `mt-3 grid gap-4 md:grid-cols-2` match-card groupings) and `apps/entrant/app/components/MatchCard.tsx` — same defect at 200% text zoom: the grid containers needed `min-w-0` (added to both occurrences in `schedule.tsx`), and `MatchCard`'s own `<article>` — itself a direct grid item in these groupings — needed it too (a container's `min-w-0` governs how *it* shrinks as an item of *its* parent; it does nothing for how its own children contribute to *its* track sizing).

None of these are visual redesigns — every fix is a class-string addition (`min-w-0`, `flex-wrap`, `tabIndex={-1}`, a heading-level change) with no layout/spacing values altered, except the semantic `<h3>`→`<h2>` swaps, which are heading-tag-only (the CSS classes, and therefore the rendered look, are unchanged).

## Static contract test — results

```
$ npm --prefix apps/entrant run test:run -- tests/a11yContracts.test.ts
 ✓ tests/a11yContracts.test.ts (62 tests) 2578ms
 Test Files  1 passed (1)
      Tests  62 passed (62)
```

## Browser checks (Playwright) — surfaces, widths, and results

`tests/e2e/tests/entrant-a11y.spec.ts` ran against the canonical shared fixture (`tools/fixture-up.sh`, T029 Taipei / T030 Korea Masters — `taipeiSlug`/`koreaSlug` were added to `fixture.json` for this package) on a standalone instance (`FIXTURE_API_PORT=8601 FIXTURE_CONSOLE_PORT=4174 FIXTURE_ENTRANT_PORT=5175 FIXTURE_SEED_KEY=entrant-a11y FIXTURE_KEEP=1`), never on the same ports as the concurrently-running package-26a fixture.

**Surfaces** (12): Discovery, Tournament overview, Schedule, Draw (Round view on mobile / bracket on desktop), Player directory, Player page, Regulations, Sign in, Sign up, Entry wizard, My entries (signed out), Receipt gate (signed out), Invitation unavailable. `drawKey`/`playerKey`/the longest fixture name are all read live from the running fixture's own `/e/api/page/{slug}/{players,draws}` (never hardcoded), so this spec does not drift if the seed changes.

**Widths**: 320, 390, 768, 1440.

| Check | Coverage | Result |
| --- | --- | --- |
| (i) DOM audit (unnamed buttons/links, unlabeled inputs, images without `alt`, duplicate ids) | 12 surfaces × 4 widths = 48 tests | 48/48 pass |
| (ii) no horizontal document scroll at 320/390 | 12 surfaces × 2 widths = 24 tests | 24/24 pass (after product fixes 5–9 above) |
| bracket canvas scroll exception (document must not scroll even though the canvas container may) | 1 test | pass |
| (iii) 200% text zoom, no clipped text / no horizontal scroll | Schedule, Player directory (card-bearing surfaces) | 2/2 pass (after fix 11) |
| (iv) keyboard walk — skip link → focus lands in `#main-content`; tab bar reachable; A–Z jump nav + search field reachable; primary action reachable | 3 tests (Discovery, Player directory, Tournament overview) | 3/3 pass |
| (v) full-name access — longest fixture name (`Muhammad Reza Pahlevi Isfahani`, 30 chars) renders in full, unclipped, at 320px | Player directory row + a Schedule match card | 2/2 pass |
| (vi) forms — invalid submission, error adjacent to the form/field, context preserved | Sign-in (wrong password), Reset (weak new password) | 2/2 pass |

```
$ cd tests/e2e && npx playwright test tests/entrant-a11y.spec.ts --reporter=list
  88 passed (21.4s)
```

**Deliberately out of the 200% zoom set**: the Entry wizard. Its progress strip (`<nav aria-label="Entry progress" className="overflow-x-auto">`) is an intentional, self-contained horizontal-scroll region (a step breadcrumb, not a text-reflow defect) and correctly does not leak to the document; but `StatusChip`'s `whitespace-nowrap` did, specifically with the fixture's synthetic "closes in 3039d" countdown. Logged as `V3-26-5` rather than fixed blind, since `StatusChip` is a shared primitive used broadly and the correct fix is a design decision (wrap / truncate / locally scroll), not a class tweak made under this package's time budget.

## Forms check — mechanics

Per-route SSR error outcomes are reached via **real, distinct URL states** the entrant tier already models (not synthesized): `/e/login/failed` (a `303` from `POST /e/account/login`) and `/e/reset/password-failed` (a `303` from `POST /e/account/reset-password`'s password-policy branch). The Playwright spec drives these with real form fills and clicks — a real wrong password, and a real weak-but-8+-character password (`'password'`, not `'short'`: `resetPassword.tsx`'s field carries `minLength={8}`, so anything shorter never reaches the network at all, blocked by native HTML5 validation before the click even submits — verified directly, not assumed). Both checks confirm the error `Notice` (`role="status"`) sits above the re-shown form, and that the reset error's `aria-describedby` target exists and contains the real refusal text; the reset check additionally confirms the `token`/`next` hidden fields survive the failed submission unchanged.

Two mechanical notes from getting these green:
- The reset-password journey shares the account credential-throttle bucket (`identity/auth.entrant_ip_key`, `AUTH_THROTTLE_MAX_FAILURES=5` by default, package 23's `V3-23-2` debt note) with every other forced-failure check on the same fixture. Iterating on this spec's assertions during development exhausted that bucket (`auth_throttle` table, key `eip:127.0.0.1`) and produced a real `429` — cleared directly in the fixture's own SQLite database (`DELETE FROM auth_throttle WHERE key LIKE 'eip:%' ...`) once, not a product change; a CI run starting from a fresh fixture will not hit this.
- Signup was deliberately **not** given a forced-failure check: its client-side password/consent validation and non-enumeration redirect are already covered by `apps/entrant/tests/signup.test.ts`, and driving it further here would touch Cloudflare Turnstile (a real, non-deterministic external dependency in a test-mode widget) for no additional coverage.

## Commands run (verbatim)

```
$ npm --prefix apps/entrant run test:run
 Test Files  54 passed (54)
      Tests  1029 passed (1029)
```

```
$ npm run typecheck:entrant
> react-router typegen && tsc
(clean — no output, exit 0)
```

```
$ npm run lint:entrant
> eslint .
(clean — no output, exit 0)
```

```
$ npm run depcruise:entrant
✔ no dependency violations found (111 modules, 327 dependencies cruised)
```

```
$ cd tests/e2e && npx tsc --noEmit
(clean — no output, exit 0)
```

```
$ cd tests/e2e && E2E_MANAGE_STACK=0 E2E_BASE_URL=http://127.0.0.1:4174 \
    E2E_PLAY_BASE_URL=http://127.0.0.1:5175 FIXTURE_JSON=<fixture.json> \
    npx playwright test tests/entrant-a11y.spec.ts --reporter=list
  88 passed (21.4s)
```

Node used: `~/.local/share/zed/node/node-v24.11.0-linux-x64/bin` (added to `PATH`), `v24.11.0`.

## Debt logged

`docs/reference/debt-log.md`, "Work package 26b":
- **V3-26-4** — the implicit-grid-track `min-width: auto` defect class is fixed everywhere this package's checks demonstrated it failing, but not swept everywhere the same *pattern* appears (`enter.tsx`, `EntrantsList.tsx`, `EventRow.tsx`, two more `schedule.tsx` sites) — those are latent, not demonstrated, at the widths/content this package's fixture reaches.
- **V3-26-5** — `StatusChip`'s `whitespace-nowrap` overflows at 200% zoom with an unusually long (fixture-synthetic) countdown; needs a design decision before a fix.
- **V3-26-6** — no `@axe-core/playwright` (same as 26a's `V3-26-2`); the entrant spec uses the same documented fallback.
- **V3-26-7** — the backend's `_locality()` heuristic (package 21) can embed a date range and event-code list into a workspace's `locality` field; a rendering-agnostic data-shaping question for whichever package next touches it, out of this package's `apps/entrant/**` scope.

## Files in scope (final)

- `apps/entrant/tests/a11yContracts.test.ts` (new)
- `apps/entrant/vitest.test-files.ts`
- `tests/e2e/tests/entrant-a11y.spec.ts` (new)
- `tests/e2e/package.json`
- `tests/e2e/global-setup.ts`
- `apps/entrant/tests/launch-scripts.test.ts`
- `apps/entrant/tests/schedule.test.ts` (one pinned assertion updated for fix 4)
- `apps/entrant/app/components/{PlayShell,SectionCard,SegmentedNav,SeasonControls,SeasonCalendar,MatchCard}.tsx`
- `apps/entrant/app/routes/{discovery,tournament,schedule}.tsx`
- `docs/reference/debt-log.md`
- `docs/audits/v3-consolidated/reports/26b-entrant-a11y.md` (this file)

No commits were made (per instructions).
