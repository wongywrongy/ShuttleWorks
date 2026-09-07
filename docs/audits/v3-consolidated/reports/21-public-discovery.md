# Work package 21 — public discovery, overview and directory

Plan: `docs/audits/v3-consolidated/plan.md` §3 X6 (one locale/timezone-aware
formatter with explicit named contexts; no raw ISO in ordinary prose), X16
("remove all values that do not vary"; retain useful counts and discoverable
controls), "Rename and unified wordmark" (deferred — no new brand direction);
§4 rows "Page titles", "Field labels" (units: pairs vs players), "Dates and
numbers" (a deadline includes date/time/zone; no relative-only "15d"), "Empty
states". Contract: `docs/reference/contracts/state-and-formatting.md` §1, §7
(`formatMomentInZone` — the entrant time authority), §9.

Findings: V3-PE01.1, PE01.2, PE01.3, PE02.1, PE03.1, PE03.2, PE03.3, PE04.1,
PE04.2, PE04.3, PE05.1, PE05.2 (full text), plus the PE06/07/08 evidence rows
(routing verdict below).

## Scope actually touched

- `apps/entrant/app/routes/discovery.tsx` — season-view intro sentence
  (V3-PE01.1).
- `apps/entrant/app/routes/tournament.tsx` — Overview registration-aggregate
  row (V3-PE03.2), hero `statusOverride` wiring (V3-PE03.3), Draws panel
  column header (V3-PE04.2), `PlayersList` call site (dropped the removed
  `eventLabels` prop).
- `apps/entrant/app/components/HeroHeader.tsx` — new `statusOverride` prop:
  an explicit lifecycle phase leads the subtitle instead of the binary
  entries chip (V3-PE03.3).
- `apps/entrant/app/components/EventRow.tsx` — canonical event names
  (V3-PE04.1), single-unit count column (V3-PE04.2), "View draw" button text
  and the removed duplicated "Draw published" state label (V3-PE04.3).
- `apps/entrant/app/components/SeasonCalendar.tsx` — locality in the row meta
  line (V3-PE01.3).
- `apps/entrant/app/components/SeasonStatusCell.tsx` — exact tournament-
  timezone deadline as primary text, relative countdown secondary
  (V3-PE01.2), with a relative-only fallback when no exact instant parses.
- `apps/entrant/app/components/EntrantsList.tsx` — removed the "Events:"
  legend, added the A–Z jump nav (V3-PE05.1), one SSR-rendered
  `data-search-count` node instead of a JS-duplicated second count
  (V3-PE05.2), dropped the now-unused `eventLabels` prop, canonical labels in
  the per-row event `aria-label`.
- `apps/entrant/app/components/PlayersList.tsx` — dropped the `eventLabels`
  prop (no remaining consumer).
- `apps/entrant/app/components/PlayShell.tsx` — footer brand line now renders
  the shared `BRAND_SIGNATURE` constant (V3-PE02.1).
- `apps/entrant/app/lib/phase.ts` — `SeasonRow.closesAt`/`timeZone`/
  `locality`; `StatusCell`'s `chip-open` arm carries `closesAt`/`timeZone`
  (additive; `phase.ts` still imports nothing from `format.ts` — the
  formatting stays in the component, per the existing import-cycle note in
  this file).
- `apps/entrant/public/assets/entrants-filter.js` + `.d.ts` — `findLabel`
  (persistent visible "Find a player"/"Find an entrant" label, "Name or
  club" placeholder), and `boot()` no longer mints a second result count
  (V3-PE05.2).
- New: `apps/entrant/app/lib/eventLabels.ts` — the canonical
  `EVENT_LABEL_MAP` (V3-PE04.1). Package 14 had already built and pinned a
  console mirror (`apps/console/src/platform/domain/eventLabels.ts` +
  `__tests__/eventLabels.test.ts`, which reads this file from disk) against
  the exact same five-entry map; that test passes unmodified against this
  file.
- Backend: `apps/api/src/entries/entries_json.py` — `SeasonRowDTO` gained
  `closesAt`, `timeZone`, `locality`; new `_locality()` heuristic; the
  `/e/api/pages` route computes the nearest open-event deadline as an exact
  wire moment and reads the tournament's timezone and venue address into the
  new fields.
- `tests/backend/test_season_listing.py` — extended `ROW_KEYS`, added
  `venue_address`/`time_zone` params to the `make()` fixture helper, and
  assertions for the new fields (both present-value and honest-`None` cases).
- Test files updated for the above: `apps/entrant/tests/components.test.ts`,
  `discovery.render.test.ts`, `draw.render.test.ts` (only the Draws-panel
  describe block, which renders `EventRow`/`tournament.tsx` — the elimination
  draw-page tests later in that file were not touched), `phase.test.ts`,
  `sitemap.test.ts`, `tournament.render.test.ts`,
  `entrantsFilter.script.test.ts`.
- `docs/audits/v3-consolidated/ledger/21-strings.md` (new).

**Explicitly not touched** (other packages' concurrent scope):
`apps/entrant/app/routes/draw.tsx`, `schedule.tsx`, `player.tsx`,
`components/MatchCard.tsx`, `PersonGroup.tsx`, `PersonRef.tsx`,
`person-ref.js`, `bracket-path.js`, `lib/schedule.types.ts`,
`lib/draws.types.ts` (package 11 — I only *import from* `draws.types.ts`,
never edit it); `regulations.tsx`, the entries-closed branch of `enter.tsx`
(package 22); the account routes (package 23). `apps/entrant/app/lib/format.ts`
already carried an in-flight, unrelated additive change (`formatCalendarDay`/
`formatCalendarMonth`, and `formatMomentInZone` returning `string | null`)
from another package when I started; I only *consumed* the existing
`formatMomentInZone` export and made no edits to that file.

**Note for package 11**: `EventRow.tsx`'s draw heading now reads canonical
labels via `apps/entrant/app/lib/eventLabels.ts`'s `eventLabel()`. `draw.tsx`'s
own heading still derives its name from `eventDisciplineLabel` in
`draws.types.ts` (Title Case, e.g. "Men's Singles"), which is now a second,
inconsistent copy of the same vocabulary. Adopting `eventLabel()` there would
close that gap; left undone because `draws.types.ts` and `draw.tsx` are both
outside this package's scope.

## Concurrent-edit note

`apps/api/src/entries/entries_json.py` and
`apps/entrant/public/assets/my-entries.{js,d.ts}` were edited by another
package while this one was in progress (an unrelated `V3-PE37.1` partner-
invite change, and an unrelated `my-entries` change). Re-verified after each
observed change that my additions (`SeasonRowDTO.closesAt/timeZone/locality`,
`_locality()`, the `/pages` route body) were untouched and the module still
imports and passes its tests.

## Findings — acceptance and evidence

- **V3-PE01.1** (discovery intro): "Find badminton tournaments, schedules,
  and results." — one short sentence, ordinary capitalization, no platform
  reference. Test: `discovery.render.test.ts` ("answers the basename…",
  "puts nothing between…").
- **V3-PE01.2** (discovery deadline): a discovery row now reads e.g. "Closes
  30 Aug 2026, 13:00 GMT+1 · 5d" — the exact tournament-timezone instant
  primary, the relative countdown secondary, no bare "d" suffix standing
  alone. Falls back to the old relative-only chip when no exact instant
  parses (never omits the countdown outright). Tests:
  `discovery.render.test.ts` ("states the exact tournament-timezone
  deadline…"), `components.test.ts` (`SeasonStatusCell` describe block),
  `phase.test.ts` (`statusCell` describe block), `test_season_listing.py`
  (`closesAt`/`timeZone` assertions).
- **V3-PE01.3** (discovery locality): a row states e.g. "Kingsway Centre ·
  London, United Kingdom"; omits the locality (never guesses) when the venue
  address has no comma to parse. Tests: `discovery.render.test.ts` ("states a
  row locality…"), `test_season_listing.py` (`locality` present/`None`
  cases).
- **V3-PE02.1** (footer brand line): identical `"ShuttleWorks by Yunavero"`
  on every public page via the shared `BRAND_SIGNATURE` constant. Test:
  `components.test.ts` (`PlayShell` — "states the exact brand line…").
- **V3-PE03.1** (overview intro repetition): see the ledger entry — the
  entrant-side render (`page.introText`) already renders the field verbatim
  with no system-added repetition around it; the repetitive text observed in
  the audit is generated by `simulator/tournament_sim/seed.py`'s demo-data
  seeding, outside this package's backend-DTO/entrant-route scope. Logged as
  debt below rather than silently left alone.
- **V3-PE03.2** (overview registration aggregate): "Event registrations 0"
  is gone; the row is omitted entirely once it stops answering an entry
  question (entries closed), and reads "Entered so far N" while entries are
  open and N > 0. Test: `tournament.render.test.ts` ("shows the
  entered-so-far count only while it answers an entry question").
- **V3-PE03.3** (overview hero lead): a tournament with an explicit `phase`
  of `live` now leads its subtitle with "Live now" instead of "Entries
  closed"; entry closure remains in the Key dates section, unchanged. Test:
  `tournament.render.test.ts` ("leads a live tournament header with its real
  state…").
- **V3-PE04.1** (event labels): one canonical map
  (`apps/entrant/app/lib/eventLabels.ts`) drives `EventRow.tsx`'s heading +
  aria-label and `EntrantsList.tsx`'s per-row aria-label. Verified against
  package 14's pre-existing console-parity test
  (`apps/console/src/platform/domain/__tests__/eventLabels.test.ts`), which
  passed unmodified.
- **V3-PE04.2** (draw index counts): exactly one count, one unit — "32
  pairs" / "7 players" — never a combined "N confirmed registrations · M
  draw participants" column, and the column header reads "Entered". Tests:
  `components.test.ts` (`EventRow` describe block), `draw.render.test.ts`,
  `tournament.render.test.ts`.
- **V3-PE04.3** (draw index action + duplication): the draw button reads
  "View draw"; the state column no longer repeats "Draw published" beside
  it (the distinct "Draw published · rounds to be scheduled" fact-line for
  an unscheduled draw is untouched, since it is not a duplicate). Tests:
  `components.test.ts`, `draw.render.test.ts`.
- **V3-PE05.1** (directory jump index): a plain-anchor `<nav aria-label="Jump
  to letter">` links every letter that actually has a section
  (`href="#dir-<letter>"`), working with no JS and on mobile; the "Events:"
  legend it replaced is gone. Test: `components.test.ts` ("offers a compact
  A-Z jump index…", "renders no A-Z index for a single-letter roster").
- **V3-PE05.2** (directory search): one result count
  (`[data-search-count]`), SSR-rendered and updated in place by the existing
  `apply()` function rather than duplicated by `boot()`; a persistent visible
  "Find a player" label (not just a placeholder) with a short "Name or club"
  placeholder. Tests: `components.test.ts` ("renders exactly one result
  count…"), `entrantsFilter.script.test.ts` (`findLabel` describe block).

## PE06/PE07/PE08 routing verdict

These are evidence/coverage rows, not findings with their own acceptance
text — the plan's cross-cutting note says the seeded-entry and winners routes
"need routing/intent verification, not an assumed new-screen build."

Verdict: **already correct, verified, no code change needed.** There are no
`/seeds` or `/winners` URL paths in `apps/entrant/app/routes.ts` — they were
retired when the Draws/Players panels merged (ADR 0028; the standing
`draw.tsx`/`tournament.tsx` docstrings record this). What remains is the
legacy `?tab=seeds` / `?tab=winners` *query-string* bookmark, which
`activeTab()`'s `LEGACY_TABS` table (`apps/entrant/app/lib/phase.ts`) folds
onto the Draws panel when Draws is visible, and onto Overview when it is not
— never a blank page, never a stale title on the wrong panel. This is
pinned by `phase.test.ts`'s existing
`it.each(['events', 'seeds', 'winners'])('maps the retired %s tab onto
Draws', …)` test (unchanged, still green) and mirrors the already-tested
`?tab=events`/`?tab=entrants` folding in `tournament.render.test.ts`. No
honest-404 or new-screen work was needed.

## Debt logged

- **V3-PE03.1 root cause** (`simulator/tournament_sim/seed.py:2074`): the
  demo/simulator seed script assembles an intro paragraph that crams the
  tournament name, live-state label, level, prize, host, venue and a
  "Draw listing: …" clause into one sentence — the actual repetitive text
  the audit screenshotted. `page.page.introText` is a plain organizer-
  authored field on the entrant side; there is no system-generated fallback
  paragraph in `entries_json.py` to fix. Regenerating the demo seed script
  (and any already-seeded demo database) is outside this package's declared
  file scope (backend DTOs + entrant routes only) and is logged here rather
  than silently left alone or fixed without authorization.
- **Console DTO regen**: `apps/api/src/entries/entries_json.py`'s
  `SeasonRowDTO` gained three fields; `apps/console/src/api/dto.generated.ts`
  mirrors this DTO but was not regenerated (`make generate-api`) — console is
  out of this package's scope and no console code or test reads the new
  fields, so nothing there is stale in a way any test catches, but the
  generated file is now behind the live OpenAPI schema until the next
  console-side regen.
- **Draw-heading label drift** (package 11): see the "Note for package 11"
  above — `draw.tsx`'s own heading still uses `eventDisciplineLabel`
  (Title Case) rather than the new canonical `eventLabel()` map.

## Commands run, verbatim

### Backend

```
$ .venv/bin/pytest tests/backend/test_season_listing.py -q
..........
10 passed in 22.29s
```

```
$ .venv/bin/pytest tests/backend/test_entries_json_routes.py tests/backend/test_entry_page_audience.py -q
......................................................
54 passed in 94.64s
```

```
$ .venv/bin/pytest tests/backend/test_entries_me_api.py tests/backend/test_entries_config_routes.py tests/backend/unit/test_public_person_contract.py -q
........................................................................ [ 87%]
..........                                                               [100%]
82 passed in 169.65s
```

```
$ .venv/bin/ruff check apps/api tests/backend
All checks passed!
```

```
$ cd apps/api/src && ../../../.venv/bin/lint-imports --config ../.importlinter
Contracts: 15 kept, 0 broken.
```

A broader sweep was also run to catch anything outside the explicitly-touched
files above:

```
$ .venv/bin/pytest tests/backend -k "entries or entry_page or season" -q
474 passed, 2011 deselected, 22 warnings in 639.48s (0:10:39)
```

### Frontend (entrant)

```
$ npm run -w apps/entrant test:run
 Test Files  53 passed (53)
      Tests  959 passed (959)
```

```
$ npm run typecheck:entrant
(clean — react-router typegen && tsc, no errors)
```

```
$ npm run lint:entrant
(clean — eslint ., no errors)
```

```
$ npm --prefix apps/entrant run depcruise
✔ no dependency violations found (111 modules, 327 dependencies cruised)
```

Also ran, to confirm the pre-existing package-14 console/entrant label
parity test still passes against the new `eventLabels.ts` unmodified:

```
$ npx vitest run --root apps/console apps/console/src/platform/domain/__tests__/eventLabels.test.ts
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

No commits were made (per instructions).
