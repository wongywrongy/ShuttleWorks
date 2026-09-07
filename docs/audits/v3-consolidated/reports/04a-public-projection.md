# Work package 04 slice 04a — repair public court and schedule projection

Baseline `871ee621`, branch `feat/surface-book-remediation`, HEAD at delivery
`ce78d426`. Scope: `apps/api/src/shared/schedule_slots.py` (new),
`apps/api/src/entries/entries_site.py`, `entries_json.py`/`entries_me.py`
(audited, unchanged), `apps/entrant/app/routes/schedule.tsx`, `draw.tsx`
(schedule-facing lines only), `apps/entrant/app/components/MatchCard.tsx`,
`apps/entrant/app/lib/schedule.types.ts`, entrant tests, backend tests
(`test_public_schedule_api.py`, `test_entries_site_api.py`,
`test_entrant_ssr_contract.py`, new `test_slot_formatting.py`), per
`docs/reference/contracts/state-and-formatting.md` §2.2/§3/§9,
`docs/audits/v3-consolidated/maps/02-04-contracts.md` §3 D6–D12, and
`docs/audits/v3-consolidated/findings.json` V3-PE09.1/.2/.3, V3-PE11.1.
Concurrent packages 03/05/06 were mid-flight on `apps/api/src/workspaces/`,
`apps/api/src/operations/`, and `apps/console/**`; none of those files were
touched except the explicitly-authorized `apps/console/src/api/dto.ts` /
`dto.generated.ts` DTO reconciliation after `make generate-api`.

## Files changed

- **`apps/api/src/shared/schedule_slots.py`** (new) — the D10 authority:
  `add_minutes_wrapping` (the `_hhmm_plus` primitive), `slot_wall_clock`
  (the `_slot_time_label` shape — lenient nulls, wraps at midnight),
  `slot_time_from_start` (the `_slot_time` shape — bracket session start +
  slot grid), and the `slot_approved`/`slot_pending` predicate pair from
  contract §3.1.
- **`apps/api/src/entries/entries_site.py`**:
  - `_hhmm_plus` and `_slot_time` now redirect to `shared/schedule_slots.py`
    (D10), unchanged call sites.
  - New `_meet_public_status(raw_state)` — the single D7/D8 fix: an
    unrecognised status returns `None` (never coerced to `"scheduled"`),
    and the mapping is **not** gated on `results_on` (results-off hides
    scores, never states — contract §9.1 rule 2). Both `_meet_schedule_matches`
    (the public `/matches` route) and the player-page ladder in
    `_meet_matches` now call it, replacing two independently-buggy inline
    dicts with one.
  - `ScheduleMatchDTO.status` and `PlayerMatchDTO.status` are now
    `Optional` (`None` = unrecognised/omitted, contract §2.2). The schedule
    facets computation excludes `None` from `states`.
  - `_merge_live_bracket_courts` / `_schedule_runtime_snapshot`: audited
    against V3-PE09.1 and ruling C2, **not changed** — see "V3-PE09.1 root
    cause" below.
  - `entries_json.py` / `entries_me.py`: read in full. Neither duplicates
    match-schedule status or court logic — `entries_me.py`'s only
    status-shaped field is unrelated entry-application status
    (pending/waitlisted/etc.). No change needed.
- **`apps/entrant/app/lib/schedule.types.ts`**: `ScheduleMatchDTO.status`
  is `ScheduleState | null`; `scheduleStateLabel` accepts
  `null`/`undefined` and returns `null` (no chip) for either. New
  `schedulePublicState(match)` → `'scheduled' | 'time_tbc'` (contract
  §3.1: an approved `scheduledTime` is the only signal, independent of
  side resolution) and `schedulePublicStateLabel` → exactly "Scheduled" /
  "Time to be confirmed".
- **`apps/entrant/app/components/MatchCard.tsx`**: deleted the placeholder
  footer (`'Date to be confirmed'`, `'Time not assigned'`, `'Court
  information unavailable'`) and the `showAssignmentPlaceholders` flag
  entirely (D9). Footer now: date shown only if the caller supplies one
  (schedule.tsx controls this — see below), time is the real value or
  `schedulePublicStateLabel('time_tbc')`, court is the real value or
  omitted. Deleted the 3-way `stateLabel` ternary (D6); delegates to
  `scheduleStateLabel(match.status)` and renders no chip when it is
  `null`. `aria-label` on the bracket-node variant filters out a null
  state word instead of interpolating `"null"`.
- **`apps/entrant/app/routes/schedule.tsx`**: removed
  `showAssignmentPlaceholders: true` and `"Court pending"` (renamed the
  "By court" group heading for an unassigned court to `"Court to be
  confirmed"` — a group still needs a bucket name; the per-card line is
  what the contract bans). `"Time pending"` (the "By time" group key
  fallback) → `schedulePublicStateLabel('time_tbc')`. Day-heading count
  fix (V3-PE09.3): a bare numeric `count` glued to a date reads as part of
  the date (`"Friday, July 31 124"`); both day-nav renderings now bake
  `"124 matches"`/`"1 match"` into the label text via a new
  `dayMatchCountLabel` helper, and no longer pass a bare `count` to
  `SegmentedNav`. Cards no longer print the raw ISO `scheduledDate`
  (D12): `scheduleToMatch` gained a `showDate` option, threaded from
  `LiveBand`/`ByTime`/`ByCourt` down from `!filters.day` — a card inside
  an active day filter shows no date (the nav already states it,
  V3-PE09.3), and a card in an unfiltered, multi-day list shows
  `scheduleDateLabel(scheduledDate)` (the same formatter the day heading
  already uses) instead of the ISO string.
- **`apps/entrant/app/routes/draw.tsx`**: removed
  `showAssignmentPlaceholders: true` at the one call site (`nodeToMatch`);
  no other schedule-state/time/court logic lives here — it fully delegates
  to `MatchCard`.
- **Tests**:
  - `tests/backend/unit/test_slot_formatting.py` (new) — pins
    `shared/schedule_slots.py` byte-identical against inlined copies of
    the three replaced implementations over a slot/interval matrix
    including a midnight crossing, plus `slot_approved`/`slot_pending`.
  - `tests/backend/test_public_schedule_api.py` (extended) —
    `test_unknown_status_is_never_coerced_to_scheduled`,
    `test_called_publishes_as_called_never_live_with_results_off` (also
    proves `playing`/`finished` are not downgraded when results are off).
  - `tests/backend/test_entries_site_api.py` (extended) —
    `test_approved_slot_with_unresolved_predecessor_still_reads_scheduled`
    (V3-PE09.2), `test_courts_reach_live_bracket_matches_assigned_directly`
    and `test_courts_reach_live_bracket_matches_assigned_via_solver_commit`
    (V3-PE09.1 — see below).
  - `apps/entrant/tests/scheduleState.test.ts` (new) — the contract §10
    "Scheduling" row verbatim: no time/date/court line and none of the
    five banned placeholder strings anywhere in the tree; `schedulePublicState`
    unit behaviour; no chip for `null`/unrecognised status; `called` never
    reads as live.
  - `apps/entrant/tests/components.test.ts` (extended/rewritten — see
    "Tests that changed" below).

## V3-PE09.1 root cause (courts not reaching live bracket cards)

The finding: "All six visible live cards ... say 'Court information
unavailable' despite the page inviting browsing 'by court'." Investigated
by reproducing both ways a bracket match becomes live in this codebase:

1. **Direct assignment** (`POST /bracket/assign` → `BracketAssignmentService`)
   materializes the Operations `Match` row's `court_id` immediately, then
   `POST /bracket/match-action {action: "start"}` only flips
   `actual_start_slot` — `test_courts_reach_live_bracket_matches_assigned_directly`
   confirms the public `/matches` item carries the real court.
2. **Solver commit** (`POST /bracket/schedule-next/commit`, the normal
   "schedule the next round" flow) writes only the bracket session's own
   `TournamentAssignment` (court + slot) and **never** touches the
   Operations `Match` row — no `_materialize_operations_assignment` call
   exists on that path. A match started from here
   (`test_courts_reach_live_bracket_matches_assigned_via_solver_commit`)
   has no materialized court at all, yet the public projection still
   returns the real court, because `_merge_live_bracket_courts`'s fallback
   (`if unit_id not in courts: fallback[unit_id] = court_id`) backfills it
   from the bracket session's own assignment for exactly this case.

Both flows pass. `_merge_live_bracket_courts` was also re-verified against
ruling C2 (a disputed court withholds only the court field; both matches
stay listed) — it already pops only from the `courts` dict, never from the
match list, so no change was needed there.

**Conclusion:** the backend data path is correct for both routes a court
assignment can reach the public schedule through. The observed defect is
entirely attributable to the entrant frontend: `MatchCard.tsx:77` rendered
`'Court information unavailable'` whenever `match.court === null`
*regardless of why* it was null, gated by `showAssignmentPlaceholders:
true` which `schedule.tsx:183` set unconditionally on every card. Deleting
that flag (D9) is the actual fix; a genuinely missing court now omits the
line entirely, and a present court (the common case per the reproduction
above) renders as before. Logged as `V3-04-2` in the debt log so a future
reader does not go looking for a second backend bug.

## Per-finding acceptance

- **V3-PE09.1** ("six live cards say court unavailable") — Root cause
  above. Fixed by deleting the frontend placeholder mechanism (D9); the
  backend data path was audited and is now permanently regression-tested
  (two new tests covering both ways a court reaches a live bracket match).
  Acceptance ("every live card has a verified court or an explicit
  unavailable state") is met: a real court renders; a genuinely absent one
  simply has no court line (no false "unavailable" claim).
- **V3-PE09.2** ("final/QF/R16 all show 'Scheduled' with unresolved
  winners") — `_meet_public_status` and the bracket path were audited: the
  bracket schedule state was already correctly slot-driven
  (`scheduledDate`/`scheduledTime` are `None` unless an assignment/slot
  exists); the actual defect was the frontend showing the literal word
  "Scheduled" for *any* card via the old 3-way `stateLabel`, independent of
  whether a slot existed. Fixed by deleting that literal (D6) and, on the
  entrant side, giving the schedule domain its own honest word via
  `schedulePublicState`/`schedulePublicStateLabel` (only "Scheduled" /
  "Time to be confirmed", used in the MatchCard footer). New backend test
  `test_approved_slot_with_unresolved_predecessor_still_reads_scheduled`
  pins the companion rule (contract §3.1): an approved slot with an
  unresolved side is legitimately public "Scheduled · `<time>`", not a
  defect to reverse.
- **V3-PE09.3** ("Friday, July 31 124" / raw ISO on cards) — Fixed: the
  day-heading count now always carries a noun (`dayMatchCountLabel`,
  both the consecutive-days and month-fallback renderings), and cards no
  longer print the raw ISO `scheduledDate` — omitted inside an active day
  filter, human-formatted (`scheduleDateLabel`) otherwise.
- **V3-PE11.1** ("Round cards say 'Scheduled' while metadata says 'Date to
  be confirmed · 10:00 · Court information unavailable'") — Fixed at the
  shared root: `MatchCard.tsx` is used by both `schedule.tsx` and
  `draw.tsx`'s round view, so the D9/D6 fixes apply identically there.
  "Time to be confirmed" now appears only when the time is genuinely
  missing (never beside a real time), and the state chip no longer reads
  "Scheduled" merely because a card lacks scheduling data.

## Tests that changed, and why

- `apps/entrant/tests/components.test.ts`:
  - `'does not render an empty footer for an internal demo source'` →
    renamed/rewritten as `'suppresses the source link for an internal
    demo source, but still states the honest schedule time'`. Reason: the
    old fixture (`scheduledTime: null`, no placeholders flag) used to
    produce a fully empty footer; contract §3.2 now makes "Time to be
    confirmed" unconditional, so a footer is never truly empty for an
    unscheduled match. The test's actual intent (suppress "Match source"
    for a demo-generated ref) is preserved; the empty-footer premise is
    not.
  - `'renders a public source without a leading separator when it is the
    only footer item'` → renamed `'renders a public source with a leading
    separator when other footer content exists'`, assertion flipped from
    `not.toContain` to `toContain`. Reason: identical cause — "Match
    source" can structurally never be the *only* footer item anymore,
    since the time slot is always populated (real value or the honest
    label). The separator logic itself is unchanged; only the fixture's
    footer composition changed.
  - `'uses neutral copy when public court information is unavailable'` →
    replaced with three tests (no-placeholder-apology, court-omitted,
    court-shown) plus one new state-chip test. Reason: the string and the
    flag it asserted (`showAssignmentPlaceholders`, `'Court information
    unavailable'`) are deleted outright by D9; this was not a copy change
    but a removed mechanism, so the test needed a full rewrite rather than
    a wording edit.
- No other existing test asserted the deleted strings or flag; `grep` for
  all five banned phrases plus `showAssignmentPlaceholders` across
  `apps/entrant/` and `tests/backend/` after the change found only the new
  tests' own negative assertions and one unrelated doc comment.
- No test contradicted the contract in a way I could not reconcile —
  nothing was stopped/flagged.

## Debt logged (`docs/reference/debt-log.md`, "Work package 04a")

- **V3-04-1**: no literal "Day to be confirmed" **group heading** exists
  for a dateless match in the By-time/By-court listings (the day
  *navigation* facet just silently excludes it; per-card omission is
  correct and tested). Needs a synthetic day-facet bucket plus a rendered
  section — S–M, deferred.
- **V3-04-2**: the V3-PE09.1 root-cause note above, logged so it is not
  re-investigated as if unresolved.

## Deferred to 04b / other packages (not attempted here, per brief)

- Console display module consolidation (`apps/console/**`, `display/`) —
  04b, after package 03.
- `_merge_live_bracket_courts`'s conflict predicate redirecting to
  `shared/court_occupancy.py` — 04b, package 03 owns that module.
- D11/D12 full timezone/date-format unification — package 11. This slice
  only removed *new* raw-ISO prose (V3-PE09.3's specific instance) and did
  not touch `schedule.types.ts`'s hardcoded-UTC formatters or the
  console's operator-local time helpers.
- D5 (`stateWords.ts`/`matchStatus.tsx` console vocabulary), D6's *word*
  fix ("Live now" → "On court" as the actual match-state label — this
  package only removed the duplicate 3-way literal and delegated to the
  existing, not-yet-reworded authority) — package 11/09.
- V3-PE09.4 (saturated "LIVE NOW" visual treatment) — a visual/density
  finding, not a truthfulness one; out of scope for 04a.
- `workspace_signals.py::_slot_time_label` redirect (D10) — **skipped
  deliberately**: `git diff --stat apps/api/src/workspaces/workspace_signals.py`
  showed active, unrelated edits from package 03 mid-flight at the time
  this slice ran. Left untouched per the brief's explicit instruction;
  the function still works correctly standalone, it simply has not yet
  been pointed at the new shared authority. A follow-up redirect (three
  lines) is cheap once package 03 lands.

## Commands run and results (verbatim summaries)

```
.venv/bin/pytest tests/backend/test_public_schedule_api.py tests/backend/test_entries_site_api.py \
  tests/backend/test_entrant_ssr_contract.py tests/backend/unit/test_slot_formatting.py -q
70 passed in 65.61s

.venv/bin/ruff check apps/api tests/backend
All checks passed!

cd apps/api/src && ../../../.venv/bin/lint-imports --config ../.importlinter
Contracts: 15 kept, 0 broken.

npm run -w apps/entrant test:run
Test Files  1 failed | 50 passed (51)
Tests  1 failed | 896 passed (897)
  (the one failure, tests/launch-scripts.test.ts, asserts against
  tests/e2e/run-console-contracts.sh and tools/fixture-up.sh — both owned
  and mid-flight under other packages, outside this slice's file scope;
  unrelated to any file this slice touched)

npm run typecheck:entrant
(clean — react-router typegen && tsc, no errors)

npm run lint:entrant
(clean — eslint ., no errors)

npx -w apps/console tsc -b   # after make generate-api / dto.ts reconciliation
(clean, no output)

npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts
Test Files  1 passed (1) · Tests  6 passed (6)

.venv/bin/pytest tests/backend/test_dto_generated_freshness.py -q
3 passed in 2.80s   (after make generate-api + dto.ts reconciliation)
```

Also spot-checked for cross-impact (not part of the required list, run for
confidence given the shared `entries_site.py`/`PlayerMatchDTO` surface):
`tests/backend/test_display_public.py` (15 passed), `test_auth_surface.py`,
`test_event_code_unrenameable.py`, `test_partner_invites.py`,
`test_entries_commit_seam.py`, `test_public_person_contract.py`,
`test_public_projection_erasure.py` (109 passed combined).

## `make generate-api`

Ran last, as instructed, since `ScheduleMatchDTO.status` and
`PlayerMatchDTO.status` became `Optional`. The regenerated
`dto.generated.ts` also picked up package 03's concurrent
`resolve_court`/`disputedCourts` additions (expected — regeneration reads
the whole OpenAPI schema). Reconciled `apps/console/src/api/dto.ts` by
hand for both: added the `status?: (...) | null` nullability is
structural in the generated file only (the console's own `dto.ts` never
modeled `ScheduleMatchDTO`/`PlayerMatchDTO` — entrant-only DTOs), and added
the missing `disputedCourts?: number` field to `MatchMetricsDTO` (package
03's addition, not yet reconciled on the console side at the time this ran).
`test_dto_generated_freshness.py` and the console `dtoParity` test both
pass after reconciliation.
