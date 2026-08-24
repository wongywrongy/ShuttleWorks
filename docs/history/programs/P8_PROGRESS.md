# SP-P8 — Public Homepage: Season Calendar: program ledger

**ABSOLUTE RULE:** read this file at session start, update it at session end.

**Plan:** `docs/history/superpowers/plans/2026-08-24-sp-p8-season-calendar.md`
(committed `e66006b5`), from the SP-P8 prompt (conversation-delivered, not a
repo file) + the Phase 0 audit at
`~/.claude/plans/2026-08-24-sp-p8-phase0-audit.md`.
**Branch:** `feat/p8-season-calendar`, worked in place (no worktree — the repo
is OneDrive-synced and the base branch is unmerged SP-P7 work this program
depends on), based on `feat/p7-delta-38` @ `4d5aca56`.
**SDD workspace:** `.superpowers/sdd/2026-08-24-sp-p8-season-calendar/`
(per-task briefs + reports, review diffs, the Phase-1 payload artifact, the QA
seed script). None of it is committed.
**Binding visual reference:** none — `public-homepage-federation-mockup.html`
was unreachable (ruling D4), so the surface was built from the tier's tokens,
exactly as SP-P7 was.

## What replaced what

`/e/` was a **filter-sidebar listing**: a `FilterStrip` of status facets beside
a grid of `TournamentCard`s, fed by a loader that read `GET /e/api/pages` for a
bare array of slugs and then fanned out one `GET /e/api/page/{slug}` **per
listed tournament** (the accepted G1 N+1 from SP-P6-2). Status was derived
client-side from raw dates and open flags.

It is now a **federation-style season calendar**: a conditional NOW strip, a
masthead, one control row (search · three segments · a CSS-only filter panel ·
dismissible chips), and a month-grouped calendar — fed by **one** read of an
extended `GET /e/api/pages` whose rows carry a **server-computed** status. The
N+1 is retired, the sidebar and both its components are deleted, and the header
search that lived on every public page is gone (the calendar owns search now).
Zero client JS throughout: search and dates are GET forms, the filter panel is
`<details>`/`<summary>` with a CSS-only popover→bottom-sheet swap.

## Task table

| # | Task | Status |
|---|---|---|
| 0 | Phase 0 audit + STOP | **DONE** — D1–D6 raised; the owner's "execute the full plan" instruction was taken as sign-off for both STOPs |
| 1 | Backend pure status function (`page_status`) | **DONE** `908eb39a` — 13/13, review Approved |
| 2 | Extend `GET /e/api/pages` to the season listing payload | **DONE** `c10fbf6f`…`ffce4e67` — 10 tests + 1 fix round (2 Important) |
| 3 | Regenerate console DTOs + **Phase 1 STOP** | **DONE** `d2ce10eb` — payload artifact captured, all six enum cases |
| 4 | Frontend pure functions (`phase.ts`) | **DONE** `6634b37d` + `ec3bc04a` — 85/85 |
| 5 | Update the non-discovery consumer (`sitemapCache`) | **DONE** `e69afad3` — `is_open` sitemap invariant re-verified |
| 6 | NOW-strip inverse-surface tokens | **DONE** `82c85b85` — contrast 17.91:1 ink / 6.97:1 muted, both themes |
| 7 | The four season-calendar components | **DONE** `df650e71` (+ `6a1d9b38`, the R11 fix) — 72/72, 24 new |
| 8 | Rebuild `discovery.tsx`, delete the sidebar | **DONE** `790f656b` + `ea17c705` — closes the typecheck-broken stretch |
| 9 | Remove the header search (all public pages) | **DONE** `6003aa3e` |
| 10 | Repo gates + dead-code sweep | **DONE** `619ffdab` — `make check` exit 0 repo-wide |
| 11 | Playwright QA + screenshots | **DONE** — matrix 10/10 after one fix (`6a1d9b38`) |
| 12 | Docs, ledger, completion report | **DONE** — this file |

Tasks 4→8 were a deliberate **sequential stretch**: the tree does not typecheck
between them (`discovery.tsx`, `FilterStrip.tsx`, `TournamentCard.tsx`,
`components.test.ts` are mid-surgery), so those implementers ran per-file vitest
only. Task 8 closes it, and the full typecheck/lint/depcruise set is a gate
again from there.

## Commits

Sixteen on the branch, `e66006b5..6a1d9b38`, newest last. Two are plan
documents; the other fourteen are the work. (The dispatch brief said "13
commits" — the tree says 16 / 14-of-work; the list below is what `git log
main..HEAD` reports, minus the seven inherited commits below the base — the
`feat/p7-delta-38` stack plus the SP-HOST-1 domain-guard fix, all still unmerged
to `main`.)

```
e66006b5  docs: SP-P8 season-calendar implementation plan                        (plan doc)
908eb39a  feat(entries): one pure public status function (SP-P8 §3)
97fb70fc  docs: fix Task 7 heading break in the SP-P8 plan                       (plan doc)
c10fbf6f  feat(entries): the season listing payload — status, counts, the NOW pick (SP-P8 §3)
ffce4e67  test(entries): pin the publication-flag values and the undated-last sort (SP-P8 §3)
d2ce10eb  chore(console): regenerate DTOs for the season listing
6634b37d  feat(entrant): season pure functions — views, sections, the status cell (SP-P8 §2)
ec3bc04a  fix(entrant): the legacy ?status= lookup must not read the prototype chain
e69afad3  refactor(entrant): sitemap reads the season payload's slugs
82c85b85  feat(design-system): inverse-surface tokens for the NOW strip (SP-P8 §2.1)
df650e71  feat(entrant): the four season-calendar components (SP-P8 §2)
790f656b  feat(entrant): /e/ is the season calendar; the filter sidebar is gone (SP-P8 §2)
ea17c705  fix(entrant): an empty segment is an empty state, not an empty card (SP-P8 §2.4)
6003aa3e  feat(entrant): the header sheds its search - the calendar owns it (SP-P8 §4)
619ffdab  chore(entrant): knip the sidebar leftovers
6a1d9b38  fix(entrant): the calendar row stacks its status at phone widths (R11)
```

## The Phase 0 rulings (D1–D6) as applied

| # | Question | Applied |
|---|---|---|
| D1 | No end-date column exists — the date "window" is unrepresentable | **Option (a):** window = the single `tournament_date` day. `in_progress` means `today == date`; a range renders as one date. Zero schema change. The upgrade (an `end_date` column + operator UI) is in the debt-log. |
| D2 | No city field — venue has `name` + free-text `address` only | Rows show **venue name** only; search covers name + organizer + venue name. No city anywhere. |
| D3 | "Debounced" client-side search is impossible (zero client JS, structural) | Search is a **GET form submit**; all filtering is loader-side; the filter panel is a CSS-only `<details>` with an `Apply dates` submit, not a live panel. |
| D4 | The companion mockup file is unreachable | **Build from tokens**, exactly as SP-P7 ran. The one visual consequence is recorded under the gate-forced deviations below. |
| D5 | The listing shape change is breaking (bare list → object) | Taken. Every consumer is in-repo and was updated in the same branch: `sitemapCache.server.ts` (T5), `discovery.tsx` (T8), `measure-page-weight.mjs` (T8), the console's generated DTOs (T3). |
| D6 | `?status=upcoming` has no segment in the new design | Legacy `?status=` maps onto the **Season** view (`LEGACY_STATUS_VIEWS`). Cost, accepted and QA-confirmed: a legacy `?preset=30d` URL leaves every radio unchecked, so a blind `Apply dates` clears it — the chip's `×` is the honest escape. |

## Execution rulings that changed the plan

Each is a case where the tree, a gate, or an observed defect beat the plan's
own text. All were ruled by the controller mid-flight and are recorded in the
SDD ledger with their cost-if-wrong.

1. **`Object.hasOwn`, not `in` (T4, `ec3bc04a`).** The brief's transcribed
   `parseFilters` tested legacy-key membership with the `in` operator, which
   walks the prototype chain — so `/e/?status=toString` put a **function** into
   `Filters.view` and `?status=__proto__` put the prototype object itself, on a
   public-tier URL, echoed back into a hidden form input and into segment
   hrefs. The pre-SP-P8 code was immune by accident (`STATUS_CHOICES.includes`).
   Fixed and pinned with a four-row table; a grep confirmed no sibling brief
   carries the same idiom.
2. **`nearestCloseAt` extracted; `enter.tsx` joins Task 4's scope (T4).**
   `enter.tsx:370` was an unlisted consumer of `toDiscoveryCard` — the plan's
   expected-breakage list named three files and this was a fourth. Rather than
   leave a downstream task with an ownerless red typecheck, the reduction became
   `nearestCloseAt(events)` and the one call site was rewired; the two
   `toDiscoveryCard` tests covering that reduction were carried over, not
   deleted.
3. **`monthLong` lives in `phase.ts`; `format.ts` re-exports (T4).** The plan
   put it in `format.ts` — but `format.ts` already imports from `phase.ts`, so
   that closes an import cycle, and `boundaries.test.ts` asserts the literal
   "no dependency violations found", which **warnings** also fail. One month
   table, both import paths working. (Task 10's knip then deleted the
   re-export: nothing ever imported it.)
4. **Ruling 1 — undated completed rows get their own group (T7).**
   `monthGroupsDesc` filters to dated rows, so an undated completed row vanished
   from the Completed view. `SeasonCalendar`'s completed branch now appends a
   trailing `Date to be confirmed` section, mirroring the Season view's undated
   section. Task 11 then established the state is **unreachable server-side**
   (an undated page falls to the entries branch and reads `entries_closed`), so
   the group is the honest net for exactly the parser-divergence case — and the
   reachable half (undated + `entries_closed` in the Season view) was verified
   live instead.
5. **A third empty-state arm (T8, `ea17c705`).** The plan's two conditions left
   a hole: an empty *segment* with no filters active (`?view=completed` on a
   season with nothing completed) rendered a bare bordered card with nothing in
   it. Ruled a real §2.4 violation — a conditional element must disappear
   cleanly. The filtered arm's condition became `rows.length === 0`, so
   `SeasonCalendar` can no longer receive an empty array.
6. **`role="search"` relocated, not deleted (T9).** The dispatch premise was
   wrong: discovery's on-page search form carried no `role="search"`, so
   deleting the header form would have left the tier with **zero** search
   landmarks. One attribute moved onto `SeasonControls`' main search form; the
   popover form stays roleless. The 2026-08-11 placeholder-clip test was deleted
   rather than relocated — its subject (the header's fixed ~184px box) no longer
   exists.
7. **Three gate-forced copy/markup deviations (T7).** The tree's own guards beat
   the plan's sketch: the em dash is banned tier-wide, so `Follow live — draws &
   results →` shipped as **`Follow live · draws & results →`**; `truncate` /
   `whitespace-nowrap` / `overflow-hidden` are banned, so the venue · organizer
   line wraps with `break-words` + `min-w-0` and the month header carries no
   ground of its own; and `chip-live` mirrors `StatusChip`'s proven
   `status-live/40` ramp rather than the sketch's `border-accent/40`, because an
   unemitted opacity utility fails **silently transparent** and no gate in this
   tier would catch it (see the `check-classes.mjs` debt entry).
8. **The 380px stack fix (T11 → T7 implementer, `6a1d9b38`).** QA measured the
   calendar card's min-content at 364.2px inside a 348px box: 10px of horizontal
   page scroll, right gutter gone, control row unable to wrap. Root cause was
   `min-w-[8rem] shrink-0` applied **unconditionally** around a chip that
   structurally cannot wrap. The fixed-width column is a desktop property: name,
   count and status now sit in a group that is a column below `sm:` and the
   original single-line row from `sm:` up. Same shape as the fix
   `TournamentCard`'s float once needed.
9. **Two scope widenings, both mandatory.** `components.test.ts` was a fourth
   sequential-stretch casualty the plan did not list — Task 7 deleted its
   `FilterStrip`/`TournamentCard` describes so its own gate could run, Task 8
   deleted the component files. And `measure-page-weight.mjs` (a **blocking CI
   gate** that measures `/e/`) stubbed the old bare-array shape and would have
   thrown on the new loader — fixed inside Task 8, which closed the earlier
   deferred minor about it.
10. **Task 2's fixture, not its assertion (T2).** The brief's step-4 premise —
    "the fixture's pages share one date" — was false, and following it literally
    would have made the order test assert insertion order, destroying its
    purpose. The fixture was corrected instead (a date on `second_open_page`)
    so the brief's assertion holds *and* exercises the new date-first rule.

## Negative controls (rule §0.8 / CODE_HEALTH.md 3b)

Every gate and conditional render in this program was demonstrated to fail when
its condition is removed. Each row is a mutation or removal that was **actually
run**, with the named test that caught it.

| # | Control | Mutation / removal performed | Test that failed |
|---|---|---|---|
| 1 | The NOW pick requires **published draws** | `page_status`'s in-window branch `("in_progress_live" if draws_published else "in_progress", None)` → unconditional `("in_progress_live", None)` | `test_every_enum_case_computes_serverside`, `test_the_now_pick_requires_published_draws`, `test_two_live_tournaments_pick_one_and_count_the_rest` (3 failed / 7 passed — one more than predicted; `case-quiet-live` joins the live set and the `moreCount` arithmetic moves with it) |
| 2 | The row **key set is pinned** | added `city: Optional[str] = None` to `SeasonRowDTO` | `test_the_key_set_is_pinned` (1 failed / 9 passed) |
| 3 | The publication flags carry **values**, not just keys | `winnersPublished=bool(page.draws_published)` — the swapped mirror | `test_every_enum_case_computes_serverside` (1 failed / 9 passed). Shipped **green** through all ten tests before the fix round. |
| 4 | **Undated rows sort last** | `rows.sort(key=lambda r: (r.date is not None, ...))` — the inverted key | `test_rows_order_dated_ascending_then_slug` (1 failed / 9 passed). Also green before the fix round; the key had zero coverage until an undated page was added to the fixture. |
| 5 | Undated **completed** rows are not dropped (ruling 1) | deleted `<Section label={UNDATED_LABEL} rows={undated} />` from `SeasonCalendar`'s completed branch | `SeasonCalendar > keeps an undated COMPLETED row in the Completed view (ruling 1)` — the row is simply absent from the markup |
| 6 | The status cell **stacks below `sm:`** (R11) | restored the pre-fix `flex min-w-[8rem] shrink-0 justify-end` | `SeasonCalendar > drops the status under the name block below sm: (R11, 380px)` — `classTokens` finds no element carrying `sm:min-w-[8rem]` at all |
| 7 | The NOW strip is **absent, not empty** (render pair) | the `NO_NOW` fixture (`now: null`) is the paired half of the strip-present test; absence asserted as `not.toContain('Now playing')` — the region is not in the document | `discovery.render.test.ts`, the strip present/absent pair |
| 8 | §7 trap 1, frontend half | an `in_progress` row dated **today** with `now: null` | the row renders and no strip appears — a client clock cannot manufacture the strip |
| 9 | An empty **segment** is an empty state, never a bare card | the third arm's own fixture: one `entries_open` row, `?view=completed`, `now: null` | `the two empty states > takes the same arm for an empty SEGMENT — never a bare empty calendar`, which asserts `not.toContain('id="calendar"')` — the section is absent, not merely empty |
| 10 | **LIVE control, real browser + real database** (T11 matrix line 3) | `UPDATE entry_pages SET draws_published=0 WHERE slug IN ('case-live','also-live')` against the running backend, then reload | the strip **element is gone** (not an empty band) and all three same-day rows render plain `In progress` with the row link only, no `?tab=draws`. Re-flipped to 1 and re-verified through `/e/api/pages`: both back to `in_progress_live`, `now.moreCount: 1`. |

Two structural guarantees stand in place of controls, because the failure they
prevent is a **compile error** rather than a test failure:

- **No dead links.** `StatusCell` is a closed sum whose no-link arms carry no
  `href` key *at all*, so the trap-3 assertion `expect('href' in cell)
  .toBe(false)` holds by construction; the `chip-muted` and `text` arms render
  `<span>`, structurally hrefless.
- **No blank cell for a new status.** `statusCell` is exhaustive with **no
  `default`**, so a seventh `PageStatus` fails `tsc` instead of rendering
  nothing.

One further control is a demonstrated *defect*, not a removal: the
prototype-chain RED in T4, where `?status=toString` / `constructor` /
`__proto__` / `hasOwnProperty` each produced a non-`'season'` value from the
plan's own transcribed code, four rows red before the `Object.hasOwn` fix.

## Shipped degradation mode

Per §5's degradation contract, SP-P8 ships in **FULL mode with one omission**:

- ✅ **Publication flags are live.** `draws_published` / `results_published`
  exist, are operator-controlled, and are what decide `in_progress_live` vs
  plain `in_progress` and `completed_winners` vs plain `completed` — so the NOW
  strip's condition and the row's `follow live` / `Winners →` links are real,
  not simulated.
- ✅ **Winners are live**, as `?tab=winners` on the tournament page. `Winners →`
  deep-links there; the live chip deep-links to `?tab=draws`. Both verified in
  the browser (matrix lines 1a/1b).
- ❌ **The NOW strip omits the player count.** No public per-tournament
  person-count projection exists (per-event `entryCount` does; a confirmed-person
  count does not — deferred by SP-P7). §2.1 says *omit, never zero*, so it
  omits, and the strip carries the **event** count instead. This is the **one**
  degraded element. The upgrade is **projection-side only** — one count on
  `SeasonRowDTO` and one more `·` segment in `NowStrip` — with **zero structural
  rework** and no layout change. Logged to the debt-log.
- ✅ **The §3.8 header shipped** in SP-P7; SP-P8's only header change is
  *removing search*. It inherits SP-P7's known deferral (the header shows the
  session state, not the name — a name needs a credentialed call).

## Screenshot inventory

`docs/screenshots/` is gitignored — these are evidence, not commits.

| File | Shot |
|---|---|
| `sp-p8-phase0-before-desktop.png` | **Before** — the filter-sidebar listing at desktop |
| `sp-p8-phase0-before-mobile-380.png` | **Before** — the same at 380×840 |
| `sp-p8-after-desktop.png` | 1440×960 full page, Season view, all 8 seeded rows + NOW strip |
| `sp-p8-after-mobile-380.png` | 380×840 full page, Season view (**retaken after the R11 fix**) |
| `sp-p8-after-now-strip.png` | the `Now playing` region alone, with `+1 more` |
| `sp-p8-after-completed-view.png` | `?view=completed`, 2 rows, `Winners →` present |
| `sp-p8-after-filter-panel.png` | the `<details>` panel open at desktop (anchored popover) |
| `sp-p8-after-empty-filtered.png` | `?q=zzzz` → `No tournaments match` + `Clear filters` |

## QA (Task 11, real browser, 2026-08-24)

Backend `uvicorn core.main:app --port 8600` against a scratch DB (never
`data/local.db`; `docker ps` checked first for the Vite→container proxy trap),
entrant dev server on :5173. Fixture verified server-side before the browser
opened: all six enum cases, `counts {takingEntries: 1, completed: 2}`,
`now {slug: "also-live", moreCount: 1}`.

**Matrix 10/10** after one fix. Nine passed first time — every enum case's cell
and its deep link, the NOW strip with `+1 more` and no player count, the live
negative control above, segment counts and view reordering, the full filter
lifecycle (preset → chip → dismiss → custom range → clear all, with **zero
reserved space** in the default state), deep links including the D6 legacy
`?status=open`, all three empty states (filtered, empty segment, empty
database), and the header (zero search inputs on three pages, exactly one
account link). Line 7 (380px) failed as a **MEDIUM R11 violation** and was
fixed in `6a1d9b38`; the controller re-verified live — overflow 0 at 380px —
and retook both the mobile and desktop shots. Servers stopped, ports verified
free.

## Gates at completion

`make check` from the repo root, **exit 0**, every stage green:

| Gate | Result |
|---|---|
| console eslint · `tsc -b` · vitest · depcruise | **1812** tests; 0 errors (117 lean-gate warnings) |
| entrant eslint · typecheck · vitest · depcruise | **744** tests; 0 violations (93 modules) |
| ruff (`F`) | clean |
| import-linter | **15/15** contracts |
| pytest | **1859 passed / 66 skipped** |
| `docs:build` (link gate) | green |

Attribution, because two numbers differ by one: the repo-wide `make check` was
Task 10's run (`619ffdab`), which reported entrant **743**. The **744** above is
the post-fix per-tier re-run after `6a1d9b38` added the R11 responsive test —
no other count moved. Extra gates not in `make check`: the entrant page-weight
CI gate (`/e/` at **2.2 KB gz, 0 scripts**, budget 4 KB) and the design-system
contrast check (NOW-strip ink 17.91:1, muted 6.97:1, both themes).

## Done-conditions checklist

Built from the plan's Global Constraints plus its spec-coverage map, then
verified against the prompt's §9 by the controller (who holds the prompt):
§9's five bullets all map onto rows below — the three that lacked an explicit
row (deep links, both empty states, the screenshot set) were added in this
pass.

| Condition | Verified by |
|---|---|
| Public tier reads projections only; no new mutation endpoints (§0.2) | `GET /e/api/pages` is the only route touched; `tests/backend/test_auth_surface.py` (anonymous-surface allowlist, prose updated, status-code contract unchanged) |
| No hardcoded hostnames (I1) | the CI domain-grep guard, green on every push |
| Tournament-level facts only — no entrant data, no entry counts, no pricing (§0.4) | `test_no_entrant_or_pricing_data_leaks` + `test_the_key_set_is_pinned` (backend); `not.toMatch(/player/i)` in `components.test.ts` (frontend) |
| Exactly four page elements; the six cut shapes not reintroduced (§0.5) | `discovery.render.test.ts` cut-shape assertions (no `aria-label="Status"`, no `aria-label="Dates"`, `role="search"` count === 1, no facet link) + Task 10's `git diff main -- apps/entrant \| grep -iE "season stats\|signed-in card\|winner name\|hero\|FilterStrip"` → deletions only |
| 380px works fully (R11) | Task 11 matrix line 7, re-verified live at overflow 0 after `6a1d9b38`; pinned by `SeasonCalendar > drops the status under the name block below sm: (R11, 380px)` |
| No new frameworks or dependencies (§0.7) | `npm --prefix apps/entrant run knip` — no new dependency findings; `package.json` untouched |
| Every gate/conditional render has a negative control (§0.8) | the ten-row table above, each run |
| Zero client JS; no `Date.now()` below loaders; no literal hex in entrant markup | `root.tsx` renders no `<Scripts/>`; `discovery.render.test.ts` asserts zero scripts and no cookie; grep `#[0-9a-f]{3,8}` over the four new components → zero (tokens live in `tokens.css`, their allowed home) |
| Copy register: sentence case, consumer voice, `·` separators | `tests/noEmDash.test.ts` (allowlist empty by design) + `tests/noTruncation.test.ts`, both green |
| Deterministic total order across SQLite/Postgres | `test_rows_order_dated_ascending_then_slug` — `(date is None, date, slug)`, with control #4 above |
| Server computes status once; the tier never re-derives it (§3) | `test_every_enum_case_computes_serverside` (all six values); `statusCell` is a pure mapping with no clock |
| `Cache-Control` on the listing | `test_the_public_cache_header_is_set` — `public, max-age=30` |
| `is_open` remains the entire listing gate | `test_a_closed_page_never_appears`; the sitemap invariant re-verified in Task 5 |
| One backend read from the loader (the G1 N+1 retired) | `expect(called).toEqual(['http://backend:8000/e/api/pages'])` — an equality assertion, not a prefix check |
| Phase-1 STOP artifact posted before any frontend task | `phase1-payload-examples.json` — one page per enum case plus a second live page so `now.moreCount` is 1 |
| Docs and ledger updated | this file, `docs/reference/api/index.md`, `docs/reference/debt-log.md`; `npm run docs:build` green |
| Old deep links resolve to equivalent views (§9) | `parseFilters` legacy tests (`?status=open→open`, `past→completed`, `upcoming→season`, prototype-chain rows) + Task 11 matrix line 6 live (`/e/?status=open`, `/e/?preset=30d&q=…`, `/e/?view=completed`) |
| Both empty states shown (§9) | `discovery.render.test.ts` (no-tournaments state, no-match state, empty-segment third arm) + Task 11 matrix line 8 live incl. the fresh-empty-DB boot; `sp-p8-after-empty-filtered.png` |
| Screenshot set delivered (§9) | `docs/screenshots/`: `sp-p8-phase0-before-{desktop,mobile-380}.png` + `sp-p8-after-{desktop,mobile-380,now-strip,completed-view,filter-panel,empty-filtered}.png` (gitignored evidence) |

## Deferred

Harvested from the SDD ledger, deduplicated. Nothing here blocks the merge.

**Promoted to `docs/reference/debt-log.md`** (the ones with an owner cost):
no tournament end date (ruling D1's upgrade) · the NOW-strip player count
(SP-P7 projection deferral) · `check-classes.mjs` broken *and* ungated, never
scanning `apps/entrant` · knip's 18 unused exported entrant DTO types (**D21**,
a policy call) · the stale `#results` locators in
`tests/e2e/tests/10-entrant-r11-evidence.spec.ts:455,458` · `make
generate-api`'s trailing `rm` exiting 2 on Windows · `SeasonRowDTO.status` as a
plain `str` where a `Literal` would give exhaustiveness.

**Backend, minor:**
- `page_status`'s `max(0, ·)` floor is unreachable on a single clock — a dead
  guard, harmless; and the test named `..._floors_at_zero` actually asserts
  `None`, so the floor itself is untested.
- `date.fromisoformat` is laxer than the tier's `parseIsoDate` regex (it accepts
  `20260912`), which is the *only* way ruling 1's undated-completed group is
  reachable. Real-world unlikely — the console writes `YYYY-MM-DD`.
- The sort key reads the raw date string while `page_status` parses it, so a
  malformed value sorts inside the dated block. Deterministic; a divergence on
  garbage only.
- `name` / `organizer` / `venueName` / `date` / `eventCount` are pinned by key,
  with no value assertions.
- `test_no_live_tournament_means_now_is_null` runs on an empty DB, which is
  weaker than its name (the property is covered in aggregate elsewhere).
- `str(tournament_date)` is computed twice per row; the `Dict` value element is
  untyped; the `season` fixture docstring still says "Six open pages" when there
  are now seven (`test_season_listing.py:31-32`).
- The Phase-1 payload artifact omits the `Cache-Control` header (the header is
  tested; the artifact just doesn't show it).

**Frontend, minor:**
- `viewRows`' open comparator relies on `Infinity - Infinity = NaN` falling
  through to the slug tiebreak — accidental correctness that wants a comment or
  a `??` guard.
- Coverage lost with the deleted tests and not re-added: the
  custom-range-beats-preset negative half, `statusCell` for `entries_open` with
  a `null` `closesInDays`, `monthLong` out of range.
- `FilterChip` carries a no-op hover token; `queryHref` sets `q` untrimmed;
  `NowStrip`'s `aria-label` duplicates its visible text.
- Preset-vs-custom precedence is UX-unruled — the chips keep it honest, and QA
  confirmed the D6 cost: `?preset=30d` leaves every radio unchecked and a blind
  `Apply dates` clears it.
- `NowStrip`'s `+N more → #calendar` dangles when the strip renders over an
  empty-state segment (browser-benign: it lands at the top).
- `nowMs` is now dead in the discovery component (interface-specified, zero
  cost); the month-header render assertion is smoke-level (the grouping tables
  live in `phase.test.ts`).
- The responsive test pins **tokens, not nesting** — hoisting the status cell
  out of its wrapper with the `sm:` tokens intact would regress silently.
- A landmark-ownership assertion is missing: `role="search"` could migrate to
  the popover form unnoticed. One line in `components.test.ts`.
- `enter.quote.test.ts:189` carries a stale comment.

**Design, recorded not deferred:**
- The NOW strip's inverse triplets are duplicated verbatim across both theme
  blocks (`resolve()` forces it; primitives would dedupe).
- `slate-900/400` introduce a second gray family outside the cool-gray ramp,
  confined to the NOW strip. Revisit if the inverse band spreads.
- `SeasonCalendar` renders an empty card if handed `rows: []` — unreachable
  since `ea17c705`, so no guard was added (YAGNI). The contract lives in
  `discovery.tsx`'s comment above the ternary.
- Undated + completed is **unrepresentable** server-side, so ruling 1's
  `Date to be confirmed` completed group is reachable only through the
  server/tier date-parser divergence above. It stays as the honest net.
- The server never emits `closesInDays == 0`, so the calendar never says
  "closes today". `chipLabel`'s 0-branch stays for `tournament.tsx`'s hero,
  where client-clock skew still makes it reachable.

**Closed during the program, recorded so it is not re-deferred:**
`apps/entrant/scripts/measure-page-weight.mjs`'s old bare-array mock — fixed
inside Task 8 (it is a blocking CI gate and would have gone red on push).

**Inherited from SP-P7, unchanged:** live-state chip wiring · highlight-player
on the tree · elimination connector lines · withdrawn/rejected write paths (E2)
· the "account has newer details" hint · global profiles (R15) · compass/monrad
plate winners · the header's state-not-name deferral.
