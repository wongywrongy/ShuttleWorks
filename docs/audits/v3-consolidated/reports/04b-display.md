# Work package 04 slice 04b — public court/schedule projection, the Display/board half

Baseline `c33d9023`, branch `feat/surface-book-remediation`, HEAD at delivery
`26f8e3f2`. Scope: `apps/api/src/display/display.py`, `apps/api/src/entries/
entries_site.py` (`_merge_live_bracket_courts` and its direct helpers only),
`apps/console/src/modules/display/**`, `apps/console/src/platform/domain/
courtOccupancy.ts` (the `nowWindow` parameter only), `docs/audits/
v3-consolidated/`. Per `docs/reference/contracts/state-and-formatting.md`
§4 (three-value court state, the two occupancy predicates, ruling C2,
ruling D19) and §2.4/§4.4 delta rows D1/D4/D19/D20, and the code map
`docs/audits/v3-consolidated/maps/02-04-contracts.md` §4. Package 03's new
authorities (`apps/api/src/shared/match_vocabulary.py`,
`apps/api/src/shared/court_occupancy.py`,
`apps/console/src/platform/domain/courtOccupancy.ts`) were read, not
modified beyond the one authorized `nowWindow` addition; their existing
tests stayed green throughout. A concurrent agent was mid-flight on
`packages/design-system` and console files outside `modules/display`; no
files outside this slice's stated scope were touched (files that showed as
already-modified at baseline — `apps/api/src/workspaces/tournaments.py`,
`apps/console/src/api/dto.ts`, `apps/console/src/modules/settings/**`,
`tests/backend/test_tournaments.py` — were left untouched; the git diffs
below are scoped to files this slice actually edited).

## Files changed

- **`apps/api/src/display/display.py`** (D4). `/match-states` reused
  `operations.match_state_routes.MatchStateDTO`/`row_to_dto` verbatim —
  including that DTO's four-value `MatchStateStatusLiteral` (`scheduled |
  called | started | finished`) and its `coerce_unknown_status` validator,
  which silently maps anything else — `retired` included — to `scheduled`.
  That vocabulary is the PUT route's legacy wire-input shape, not a total
  projection of the canonical match states, and reusing it on the public
  read route repeated the drop the contract requires fixed. Added a
  board-owned `DisplayMatchStateDTO` (5-value `Literal`, `retired`
  included) and `_row_to_display_state`, which round-trips
  `row.status` through `shared.match_vocabulary.legacy_to_canonical` /
  `canonical_to_legacy` — the bidirectional, total map — before handing it
  to the wire model. A genuinely unrecognised value still falls back to
  `scheduled` (unchanged pre-existing behaviour for garbage input; that
  fallback was never the D4 defect — dropping a *known* canonical value
  was). `MatchStateDTO`/`row_to_dto` imports from `operations` were
  removed; the route now returns `Dict[str, DisplayMatchStateDTO]`.
- **`apps/api/src/entries/entries_site.py`** (D1, `_merge_live_bracket_courts`
  only). Replaced the function's own `claims`/`unit_courts` conflict
  bookkeeping with a call into `shared.court_occupancy.derive_court_states`
  over a small `_LiveClaim` adapter (`id`/`status="playing"`/`court_id`) built
  from exactly the same "started, not ended, not finished" pre-filter as
  before. A court the authority calls `disputed` withholds the court field
  for every unit claiming it (ruling C2) — the match rows themselves are
  untouched by this function either way; the public projection route
  upstream already keeps every match listed regardless of whether `courts`
  carries an entry for it. Dropped the separate "one unit claims two
  different courts" edge case the old code also tracked: untested,
  unrelated to court-occupancy disputes, and not part of D1's scope — a
  data-integrity anomaly, not a court dispute.
- **`apps/console/src/platform/domain/courtOccupancy.ts`** (D19, additive
  only). New exported `NowWindow = 'desk' | 'board'` type, documented in a
  docstring. `occupiesCourtNow(status, nowWindow = 'desk')`: the `'desk'`
  branch is byte-identical to the old always-desk behaviour (default
  argument, so every existing call site — `runModel.ts`'s `deriveSummary`
  included — is unaffected); `'board'` additionally treats `called` as
  occupying-now. `deriveCourtStates`/`deriveDisputes` gained the same
  optional trailing `nowWindow` parameter, threaded straight to
  `occupiesCourtNow`, default unchanged.
- **`apps/console/src/modules/display/publicDisplay/courtLanes.ts`** (D1,
  D19 doc). `currentMatchesByCourt` and `assignLanes` no longer group
  claims and count duplicates by hand; both build a small
  `OccupancyMatchLike[]` (`toOccupancyMatches`, synthetic `'playing'`
  status for every id `nowState` names) and ask
  `platform/domain/courtOccupancy.ts`'s `deriveCourtStates`/`deriveDisputes`
  which court is `occupied` vs `disputed`. Public signatures unchanged
  (`items`, `nowState: ReadonlySet<string>`) — the redirect is internal, so
  `courtLanes.test.ts` needed no changes. Added a module doc-comment
  explaining why this file itself stays ignorant of desk/board and only
  ever asks "is this id live" (the caller decides what belongs in
  `nowState`).
- **`apps/console/src/modules/display/MeetDisplayPage.tsx`** (D1, D19).
  Deleted the page's own `active`/`conflicts` grouping loop (lines
  151–169 in the code map); `matchesByCourt` now builds an
  `OccupancyMatchLike[]` from `matchesByStatus.started` and calls
  `deriveCourtStates`/`deriveDisputes` for the occupied/disputed buckets,
  then layers the `called` fallback on top exactly as before (unchanged:
  `called` never disputes a court, contract §4.1). `nowIds` (feeds
  `assignLanes`'s Now/Next/Later lanes) now calls
  `occupiesCourtNow(status, 'board')` over the `started`+`called` union
  instead of hand-unioning two pre-built maps — this is the D19 fix: the
  board's wider "now" window is now the named, documented `nowWindow:
  'board'` parameter, not an undocumented board-local union.
- **`apps/console/src/modules/display/bracketDisplay/BracketLiveView.tsx`**
  (band words, V3-OC24.1). Band chip: `'Conflict'` → `'Court assignment
  unavailable'`; the occupied chip now reads `STATE_WORD.onCourt` ("On
  court") instead of a hardcoded `'On court'` string. Body copy on a
  disputed court: deleted the second paragraph ("The tournament desk is
  resolving a court assignment.") and changed the first to exactly `"Court
  assignment unavailable."` — the contract §4.1 public label restated as
  one sentence, never an announcement instruction.
- **`apps/console/src/modules/display/publicDisplay/CourtsView.tsx`** (band
  words, V3-OC24.1). Card-mode band: `STATE_WORD.live` → `STATE_WORD.onCourt`
  for the occupied state (contract §2.1: "On court" is the match-state word
  for `playing`; `live` is retired from the match-state role); the
  `'Conflict'` chip literal → `'Court assignment unavailable'`. Card-mode
  body on a disputed court: replaced "Two current matches claim this
  court." / "Ask the tournament desk to resolve the assignment." with the
  single sentence "Court assignment unavailable." (the per-match code list
  below it is unchanged — both claiming matches stay named, only the court
  field is withheld, per C2). List-mode body: replaced "Current match
  unavailable." / "The tournament desk is resolving this court assignment."
  with the same single "Court assignment unavailable." sentence.

## Tests

Backend (`.venv/bin/pytest tests/backend/test_display_public.py
tests/backend/test_entries_site_api.py tests/backend/test_public_schedule_api.py -q`):

```
..............................................................           [100%]
62 passed in 79.69s (0:01:19)
```

- **New**: `tests/backend/test_display_public.py::
  test_match_states_vocabulary_is_total_and_bidirectional` — seeds a
  `started` and a `retired` `match_states` row (via a real PUT of state to
  satisfy the `match_states → matches` composite FK) and asserts
  `/display/{token}/match-states` reports `"started"` and `"retired"`
  verbatim rather than coercing either to `"scheduled"` (D4).
- **New**: `tests/backend/test_public_schedule_api.py::
  test_bracket_court_conflict_withholds_court_field_only_third_court_unaffected`
  — three bracket assignments, two currently-playing on court 1 and one on
  court 2; asserts both disputing units are absent from `courts` (court
  withheld for both, C2) and the third court's assignment is untouched
  (D1's dispute derivation via the authority does not over-fire).
- **Changed**: none of the pre-existing `test_public_schedule_api.py` /
  `test_entries_site_api.py` assertions needed to change — the
  redirect-to-authority rewrite of `_merge_live_bracket_courts` and the new
  `display.py` DTO preserve every existing wire shape and behaviour byte for
  byte; the existing suite (62 tests, all above) is the regression evidence.

Console (`npm --prefix apps/console run test:run -- src/modules/display
src/platform/domain`):

```
 Test Files  39 passed (39)
      Tests  248 passed (248)
```

- **New**: `apps/console/src/platform/domain/__tests__/courtOccupancy.test.ts`
  — five added cases pinning `nowWindow` desk/board behaviour:
  `occupiesCourtNow('called')` / `('called', 'desk')` both `false`;
  `('called'|'playing'|'started', 'board')` `true`, `('done'|'scheduled',
  'board')` `false`; `deriveCourtStates`/`deriveDisputes` default (no
  `nowWindow` arg) ignore two `called` claims on one court; the same input
  under `'board'` calls that court `disputed`. All ADDED, none of package
  03's existing assertions in this file were changed (they all call the
  two-argument functions with one argument, which is exactly the default
  path these new tests also exercise).
- **New**: `apps/console/src/modules/display/__tests__/
  crossTierCourtDispute.test.ts` — the desk/board parity test: one shared
  fixture (two matches on court 1, one on court 2) fed to
  `platform/domain/courtOccupancy.ts`'s `deriveCourtStates` directly (the
  same call `runModel.ts`'s `deriveSummary` makes — this file cannot import
  `runModel.ts` itself without creating a new Display→Operations
  cross-module edge, which dependency-cruiser treats as an ERROR) and to
  `publicDisplay/courtLanes.ts`'s `currentMatchesByCourt`/`assignLanes`;
  asserts both call court 1 disputed and court 2 occupied, and that
  `assignLanes` never assigns court 1's matches a `'now'` lane while court
  2's live match still gets one.
- **New**: `apps/console/src/modules/display/__tests__/
  MeetDisplayPage.lanes.test.tsx::a disputed court (two started matches on
  one court) withholds Now and shows the public dispute label` — full
  `MeetDisplayPage` render with two `started` matches on one court; asserts
  the rendered text is exactly `"Court assignment unavailable."` and
  neither claiming match's court code renders (D1 end-to-end through
  `matchesByCourt` → `CourtsView`).
- **Unchanged**: `courtLanes.test.ts` needed no edits — its existing "does
  not select one of two live records as now" case already pins the D19
  "no now for a disputed court" behaviour, and the internal
  redirect-to-authority rewrite of `currentMatchesByCourt`/`assignLanes`
  preserves the function signatures and outputs for every existing case
  (confirmed by the full pass above). `bracketDisplayData.test.ts` needed
  no edits — `liveMatches`'s own on-court/conflict grouping (bracket
  `AssignmentDTO` has no canonical match-state field to hand the shared
  authority) was left as characterized; only its consumer's band WORDS
  changed, in `BracketLiveView.tsx`.

## Findings V3-OC24.1 / V3-OC24.2

Both live in `docs/audits/v3-consolidated/findings.json` under surface
`OC24` ("Venue board with conflict projection"), and both are formally
assigned to package **17**, not 04 — checked directly in the findings file
rather than assumed. This slice's task explicitly directed the band-word
fix now (deliverable 3), ahead of package 17's own pass, so it is reported
here with evidence rather than deferred silently.

- **V3-OC24.1** (major, H1): "Conflict cards say 'The tournament desk is
  resolving a court assignment.' … Spectators receive assurance of active
  work that may not be true." Ruled decision in the findings file: *"Use
  'Court assignment unavailable.' Add an announcement instruction only if
  that is a confirmed venue process. Never claim staff are already
  resolving it."* — **fixed** in this slice. Found three live instances of
  exactly the banned pattern: `BracketLiveView.tsx` ("The tournament desk
  is resolving a court assignment."), `CourtsView.tsx` card mode ("Ask the
  tournament desk to resolve the assignment."), `CourtsView.tsx` list mode
  ("The tournament desk is resolving this court assignment."). All three
  deleted; every disputed-court surface in `apps/console/src/modules/
  display/**` now renders exactly the ruled sentence, "Court assignment
  unavailable.", with no second line and no announcement instruction.
  Evidence: `grep -rn "tournament desk is resolving\|Ask the tournament
  desk" apps/console/src/modules/display` returns nothing after the edit;
  the new `MeetDisplayPage.lanes.test.tsx` case renders the real component
  tree and asserts the exact text. `findings.json`'s `status` field for
  this entry was left as `"open"` — updating audit-tracking status fields
  belongs to whoever owns closing package 17's checklist, not to this
  slice's file-scope edits.
- **V3-OC24.2** (minor, T4): a timestamp/timezone defect ("The header
  reads '04:07 AM' and 'Updated 04:07 AM', without a date or timezone" —
  a remote viewer or an overnight board cannot interpret it reliably).
  This is a freshness/clock-formatting concern, not a court-vocabulary or
  occupancy one — it is outside D1/D4/D19/D20 and outside every file this
  slice's scope named. **Not addressed here**; it remains package 17's to
  fix (`useDisplaySync`'s `lastSyncedAt` formatting in `MeetDisplayPage.tsx`
  is the likely site, but that formatting logic was not touched since it
  is unrelated to this slice's court-state/vocabulary deliverables).

## Gates run

- `.venv/bin/pytest tests/backend/test_display_public.py
  tests/backend/test_entries_site_api.py
  tests/backend/test_public_schedule_api.py -q` → `62 passed`.
- `.venv/bin/ruff check apps/api/src/display/display.py
  apps/api/src/entries/entries_site.py tests/backend/test_display_public.py
  tests/backend/test_public_schedule_api.py` → `All checks passed!`.
  (`.venv/bin/ruff check apps/api tests/backend` repo-wide reports one
  pre-existing `F841` in `apps/api/src/workspaces/tournaments.py`, a file
  outside this slice's scope and already modified at baseline by a
  concurrent package — not touched here.)
- `cd apps/api/src && ../../../.venv/bin/lint-imports --config
  ../.importlinter` → `Contracts: 15 kept, 0 broken` (Display still names
  only `shared`/`bracket`/`core`/`db`/`repositories`; the new
  `shared.court_occupancy` import from `entries_site.py` is within
  Entries' existing `shared`-import allowance).
- `npm --prefix apps/console run test:run -- src/modules/display
  src/platform/domain` → `39 files / 248 tests passed`.
- `npm run lint:scheduler` → `0 errors, 134 warnings` (pre-existing
  warnings across the console tree, none newly introduced in
  `modules/display` or `platform/domain`).
- `npx tsc -b apps/console` → clean, no output.
- `npm run depcruise` → `0 errors, 16 warnings` (all 16 are pre-existing
  `no-cross-module-debt` entries already enumerated in
  `KNOWN_CROSS_MODULE`; none involve a file this slice touched).
