# Work package 03 — conflict recovery and live counts

Baseline `871ee621` (HEAD moved to `ce78d426` mid-package as packages 05/06
were committed concurrently; this package's own changes were not affected and
are reported against the tree as it stands). Branch `feat/surface-book-remediation`.
Scope per the brief: `apps/api/src/shared/match_vocabulary.py` and
`court_occupancy.py` (new) + their unit tests, `apps/api/src/operations/**`,
`apps/api/src/core/constants.py`, `apps/api/src/repositories/local.py`
(command-processing section only), `apps/api/src/workspaces/workspace_signals.py`;
console `platform/domain/courtOccupancy.ts` + `matchState.ts` (new),
`lib/stateWords.ts`, `hooks/useLiveOperations.ts`, `modules/operations/**`,
`store/matchStateStore.ts`, `lib/commandQueue.ts`, their tests, and
`api/client.ts` + `dto.ts` + `dto.generated.ts` via `make generate-api` (run
last). `apps/api/src/entries/`, `apps/api/src/display/`,
`apps/console/src/modules/display/`, `apps/entrant/`, `packages/design-system`,
and settings/setup modules were not touched.

## Files changed

### Backend

- `apps/api/src/shared/match_vocabulary.py` (**new**) — canonical `MatchStatus`
  set, the **total, bidirectional** legacy alias map (`CANONICAL_TO_LEGACY` /
  `LEGACY_TO_CANONICAL`, including `retired`, the case D4 used to drop), and
  the two occupancy predicates `occupies_court_now` (true only for `playing`)
  and `holds_court_commitment` (true for `called`/`playing`/`finished`/`retired`
  — exactly `operations.match_state.LOCKED_STATUSES`).
- `apps/api/src/shared/court_occupancy.py` (**new**) — `derive_court_states`
  (free/occupied/disputed over a match list), `derive_disputes` (→
  `CourtDispute`/`CourtClaim` dataclasses per §4.2's shape), `courts_free`,
  `occupied_court_count`, `disputed_court_count`.
- `apps/api/src/operations/match_state.py` — `assert_court_available` rewritten
  to redirect to `shared.court_occupancy.derive_court_states` /
  `shared.match_vocabulary.occupies_court_now` instead of its own inline
  `MatchStatus.PLAYING.value` string comparison; behaviour (409 on a second
  `playing` match per court) is unchanged, verified by the existing
  `test_court_availability_rejects_second_playing_match_but_allows_called`.
- `apps/api/src/operations/match_state_routes.py` — `_LEGACY_TO_CANONICAL`
  now redirects to `shared.match_vocabulary.LEGACY_TO_CANONICAL` (D4).
- `apps/api/src/repositories/local.py` — deleted the inline duplicate
  double-current-match guard in `process_command` (D1) and replaced it with a
  call to `operations.match_state.assert_court_available`, mapping its raised
  `ConflictError` onto the same rejection-stamping path as every other
  validation step. Added `process_resolve_court_command` (the `resolve_court`
  command handler) and `_apply_resolution_to_displaced` (applies
  `keep_and_move` / `keep_and_unassign` / `keep_and_finish` to each displaced
  match), plus the `_RESOLVE_COURT_ACTIONS` constant.
- `apps/api/src/core/constants.py` — added `MatchAction.RESOLVE_COURT =
  "resolve_court"` and its (unused-but-total) `ACTION_TO_TARGET_STATUS` entry.
- `apps/api/src/operations/commands.py` — the route branches on
  `MatchAction.RESOLVE_COURT` before the generic single-match pipeline: it
  validates the payload shape (422 on a missing/empty `displacedMatchKeys` or
  missing `action`) and calls `repo.process_resolve_court_command` instead of
  `repo.process_command`.
- `apps/api/src/operations/conflict_metrics.py` — docstring only: states
  explicitly that this module is a metric, not a court-state/dispute
  authority (kept as a documented view-local rule, §4.4).
- `apps/api/src/workspaces/workspace_signals.py` — `MatchMetricsDTO` gained
  `disputedCourts: int = 0`. Both `_meet_match_signals` and
  `_bracket_match_signals` now build a small match list per court and call
  `shared.court_occupancy.derive_court_states`/`courts_free`/
  `occupied_court_count`/`disputed_court_count` instead of their own
  `len(set(courts))` / conflict-blind arithmetic (D2/D3). The old ad hoc
  `_IN_PLAY` frozenset is gone, replaced by `shared.match_vocabulary
  .occupies_court_now` (D20).

### Backend tests

- `tests/backend/unit/test_match_vocabulary.py` (**new**) — totality/
  bidirectionality of the legacy map including `retired`; both predicates.
- `tests/backend/unit/test_court_occupancy.py` (**new**) — the two-playing-
  one-court dispute fixture; disputed-excluded-from-both-free-and-occupied;
  called/finished do not claim a court.
- `tests/backend/unit/test_court_dispute_resolution.py` (**new**) — resolving
  clears the dispute; idempotent replay under a repeated `command_id`; each
  of the three resolution actions; malformed payload rejected.
- `tests/backend/unit/test_commands.py` (extended) — `resolve_court` end to
  end through the HTTP route: clears the dispute, is idempotent on replay,
  422s on a malformed payload.
- `tests/backend/unit/test_workspace_signals.py` (extended) — a disputed
  court is excluded from both `playing` and `courtsFree` and counted once in
  `disputedCourts`, for both the meet and bracket signal paths.

### Console

- `apps/console/src/platform/domain/courtOccupancy.ts` (**new**) — the
  console twin of `shared/court_occupancy.py`: same three-value `CourtState`,
  same two predicates (accepting either the `RunStatus` or engine spelling),
  `deriveCourtStates`, `deriveDisputes`, `courtsFree`, `occupiedCourtCount`,
  `disputedCourtCount`.
- `apps/console/src/platform/domain/matchState.ts` (**new**) — the canonical
  state set (persisted + the two derived-only `pending`/`ready` readiness
  values), `deriveReadiness`, and `matchStateLabel()`, sourced from
  `lib/stateWords.ts`.
- `apps/console/src/lib/stateWords.ts` — added the `retired` word (`Retired`)
  so `matchState.ts` has a canonical source for it; `onCourt` (`On court`)
  is now used everywhere `playing` is rendered as a match state.
- `apps/console/src/modules/operations/runtime/runModel.ts` —
  `deriveCourtLanes`'s live-conflict rule now calls `occupiesCourtNow` from
  the authority instead of a local `status === 'playing'` check (keeps the
  additional called-called lane rule as a documented, narrower addition:
  see "Notable design decisions" below). `deriveSummary` now derives
  `playing` (occupied-court count), `courtsFree`, and a new `disputedCourts`
  field from `courtOccupancy.deriveCourtStates` instead of its own
  match-counting arithmetic; the false "one definition now" comment at
  280-286 that predated this fix is replaced with an accurate one (D2/D3).
- `apps/console/src/modules/operations/runtime/runMachine.ts` —
  `RUN_STATUS_LABEL.playing` redirects from `STATE_WORD.live` to
  `STATE_WORD.onCourt` (D5).
- `apps/console/src/modules/operations/UnifiedOpsBoard.tsx` and
  `OperationsProduct.tsx` — the two remaining `STATE_WORD.live` match-state
  usages (board legend, match inspector status) redirect to
  `STATE_WORD.onCourt`.
- `apps/console/src/modules/operations/UnifiedOpsList.tsx` — deleted the
  inline `'Live'`/`'Called'`/`'Waiting'`/`'Finished'` vocabulary (D5) in
  favour of `STATE_WORD`; split the "Up next" bucket into a new "On court"
  bucket (started + court-assigned) and a narrower "Up next" (court-assigned,
  not yet started) — V3-OC05.1.
- `apps/console/src/modules/operations/plan/PlanCallList.tsx` — deleted the
  literal `'Playing'` in `PLAN_STATE_LABEL` (D5), redirected the whole map to
  `STATE_WORD`.
- `apps/console/src/modules/operations/run/RunCourtGrid.tsx` — the "now"
  band's `playing` word redirects to `STATE_WORD.onCourt`; the conflict tile
  now says "Needs resolution" (not "Conflict") and "Two matches are assigned
  to this court" (not "Resolve this in Operations", V3-OC19.1); each claim
  button now carries an "Open ›" affordance matching an ordinary occupied
  card's footer.
- `apps/console/src/modules/operations/run/RunSummaryBand.tsx` — new
  `disputedCourts` prop and a "court conflicts" stat tile, rendered only when
  non-zero, so a disputed court is never folded into "playing" (V3-OC19.2).
- `apps/console/src/modules/operations/run/RunSurface.tsx` — derives
  `disputes` from `courtOccupancy.deriveDisputes` and renders them as a
  keyboard-reachable, named assignment block (`role="group"`, one real
  `<button>` per resolution action per claim) separate from the existing
  rejected-command toast strip (D18: rejections stay toasts for the *action*,
  disputes are *assignments*). `handleResolveCourt` submits `resolve_court`
  through the existing `useCommandQueue` seam; a bracket-involved dispute
  disables the buttons with an explanatory note (see debt V3-03-1).
- `apps/console/src/hooks/useCommandQueue.ts` — `ACTION_TO_LEGACY_STATUS` is
  now `Record<Exclude<MatchAction, 'resolve_court'>, MatchStatus>`; `submit`
  skips the optimistic-status step for `resolve_court` (it has no single
  target status — only the *displaced* matches change).
- `apps/console/src/lib/commandQueue.ts` — added `'resolve_court'` to
  `MatchAction`, documented as flowing through the identical idempotency-key
  / `seenVersion` / offline-replay machinery as every other command.
- `apps/console/src/hooks/useLiveOperations.ts` — the `'00:00'` fallback
  (D9) is now `'Not scheduled'` (this wrapper has no call sites today; fixed
  so it never lies if one appears).
- `apps/console/src/modules/operations/plan/PlanToolbar.tsx` — "Schedule next
  round (N)" → "Schedule N unscheduled matches", matching what
  `schedulableCount` actually measures (every eligible-but-uncourted play
  unit, not specifically the next round) — V3-OC18.2, minimal fix.
- `apps/console/src/modules/operations/UnifiedOpsBoard.tsx` — the drag-hover
  status line ("Feasible: drop to pin at C1 · S152") now renders through
  `formatSlot` like the rest of the board, instead of the raw slot index —
  V3-OC18.1, minimal fix (see debt V3-03-2 for the rest of that finding's
  scope).
- `apps/console/src/api/client.ts` was not changed — `submitCommand` already
  passes `action`/`payload` through generically; no `resolve_court`-specific
  logic was needed there.
- `apps/console/src/api/dto.ts` — `MatchAction` union gained `'resolve_court'`.
- `apps/console/src/api/dto.generated.ts` — regenerated via `make
  generate-api` (run last, after all backend changes); picked up
  `MatchAction` and `MatchMetricsDTO.disputedCourts` alongside unrelated
  concurrent packages' schema changes (verified in the diff before accepting
  it — see Commands run below).

### Console tests

- `apps/console/src/lib/__tests__/stateWords.test.ts` (**new**).
- `apps/console/src/platform/domain/__tests__/courtOccupancy.test.ts`
  (**new**) — same fixtures as the backend test, same expected counts.
- `apps/console/src/platform/domain/__tests__/matchState.test.ts` (**new**).
- `apps/console/src/modules/operations/__tests__/runModel.test.ts` (extended)
  — a disputed court excluded from both `playing` and `courtsFree`, counted
  once in `disputedCourts`.
- `apps/console/src/modules/operations/__tests__/runSummaryBand.test.tsx`
  (extended) — never renders a disputed court as free or as extra playing
  matches; omits the tile entirely when zero.
- `apps/console/src/modules/operations/__tests__/runSurface.test.tsx`
  (extended) — the dispute block renders, named by identity, distinct from
  the rejected-command strip; submits `resolve_court` with the right
  chosen/displaced keys; disables and explains itself for a bracket-involved
  dispute.
- `apps/console/src/modules/operations/__tests__/conflictAssignment.a11y.test.tsx`
  (**new**) — the dispute is a labelled, focusable `role="group"` with real,
  enabled `<button>`s, not a status banner.
- `apps/console/src/lib/__tests__/commandQueue.offlineConflict.test.ts`
  (**new**) — a `resolve_court` command queued through a simulated network
  error stays pending, then replays exactly once on the next flush; a 409 on
  that replay surfaces as the terminal `conflict` status and is never
  retried again.
- `apps/console/src/modules/operations/__tests__/unifiedOpsList.test.tsx`,
  `runMachine.test.ts`, `planCallList.test.tsx` — updated for the vocabulary
  and bucket changes (see "Tests changed" below).

## Commands run and results

- `.venv/bin/pytest tests/backend/unit/test_match_vocabulary.py
  tests/backend/unit/test_court_occupancy.py
  tests/backend/unit/test_court_dispute_resolution.py
  tests/backend/unit/test_commands.py tests/backend/unit/test_workspace_signals.py
  tests/backend/unit/test_match_state.py tests/backend/unit/test_match_state_transitions.py
  tests/backend/unit/test_match_state_application.py tests/backend/unit/test_bracket_command_reason.py
  tests/backend/unit/test_state_locks.py -q` → **119 passed** (focused run
  during development).
- `.venv/bin/pytest tests/backend -n auto --dist worksteal -q` (full suite,
  after all backend edits) → **2380 passed, 72 skipped, 0 failed**.
- `.venv/bin/ruff check apps/api/src tests/backend` → **All checks passed.**
- `cd apps/api/src && ../../../.venv/bin/lint-imports --config
  ../.importlinter` → **15 kept, 0 broken.**
- `npm --prefix apps/console run test:run` (full suite, run three times:
  after the console edits, again after the em-dash-contract fix, and again
  after `make generate-api`) → **235 test files, 2072 tests, all passed**
  each time.
- `npx tsc -b apps/console` → clean, no output, each time it was run.
- `npm run lint:scheduler` → **0 errors, 134 warnings** (all pre-existing;
  confirmed none of the warnings are in a file this package touched, except
  `RunSurface.tsx`'s pre-existing `computeAutoPull`
  react-refresh/only-export-components warning, unrelated to this change).
- `npm run depcruise` → **0 errors, 16 warnings**, identical to the
  pre-existing `KNOWN_CROSS_MODULE` list (no new cross-module edge).
- `make generate-api` → regenerated `dto.generated.ts`; diffed before
  accepting: only `MatchAction`/`MatchMetricsDTO.disputedCourts` (this
  package) plus two unrelated schema changes from concurrent packages
  (an email-resend docstring, and two entrant schedule DTO status fields
  becoming nullable) — nothing from this package's edits was lost or
  clobbered.

## Per-finding acceptance

- **V3-OC05.1** ("Up next" includes live matches) — **met.**
  `UnifiedOpsList.tsx`'s "Up next" bucket now excludes started/on-court
  matches (moved to a new "On court" bucket); both buckets render through
  `STATE_WORD`, so a current item never reads anything but "On court".
  Evidence: `unifiedOpsList.test.tsx`'s updated fixture (`pu1`, started +
  court-assigned) now lands in "On court · 1", not "Up next".
- **V3-OC18.1** (Plan toolbar internal jargon: "ENGINE Meet Bracket",
  "C1 · S152") — **partially met, minimal fix per the brief.** The one
  literal internal slot number actually found in the package-03 file scope
  (`UnifiedOpsBoard.tsx`'s drag-hover status) now renders through
  `formatSlot`. The "Engine" filter chip in `UnifiedOpsList.tsx` already
  used human labels (Meet/Bracket), not raw enum values — no change needed
  there. Full sweep of Plan's other row surfaces is package 12's, logged as
  debt V3-03-2.
- **V3-OC18.2** (button count vs. helper-line scope mismatch) — **met.**
  "Schedule next round (N)" → "Schedule N unscheduled matches", which is
  what `schedulableCount` actually measures (every eligible, uncourted play
  unit — not specifically "the next round"). No hidden scope remains between
  the label and the number.
- **V3-OC19.1** ("Resolve this in Operations" with no route) — **met.**
  The conflict tile says "Needs resolution" / "Two matches are assigned to
  this court", and each claim carries a direct "Open ›" route, matching an
  ordinary occupied card. The Run surface's new dispute block additionally
  gives each claim three explicit resolution actions the operator chooses
  from — the system never auto-picks a winner.
- **V3-OC19.2** ("8 PLAYING MATCHES" over conflicted courts) — **met.**
  `RunSummaryBand` now separates `playing` (occupied-court count) from a
  distinct "court conflicts" tile; the same separation exists in
  `workspace_signals.py`'s `MatchMetricsDTO.disputedCourts`. Evidence:
  `runSummaryBand.test.tsx`'s new test asserts 4 playing / 2 conflicts over
  8 total claims, never "8 playing". The Overview surface (`PhasePanels.tsx`)
  is outside this package's console scope and does not yet render
  `disputedCourts` — logged as debt V3-03-3 (honest omission, not the
  false-confidence bug, but incomplete against the finding's full
  acceptance).

## Tests changed (pre-existing) and why

Behaviour changed by ruling, per the brief's expectation:

- `apps/console/src/modules/operations/__tests__/unifiedOpsList.test.tsx` —
  the fixture's started+court-assigned bracket row moved from "Up next" to
  a new "On court" bucket (V3-OC05.1's fix). Updated the counts asserted:
  `Up next · 2` → `On court · 1` + `Up next · 1`.
- `apps/console/src/modules/operations/__tests__/runMachine.test.ts` —
  `RUN_STATUS_LABEL.playing` asserted `'Live'`; now asserts `'On court'`
  (contract §2 ruling: "Live" is retired from the match-state role).
- `apps/console/src/modules/operations/__tests__/planCallList.test.tsx` —
  a `started` row's rendered label asserted `'Playing'`; now asserts
  `'On court'` (same ruling; D5's deleted literal).
- `apps/console/src/modules/operations/__tests__/runSummaryBand.test.tsx` —
  the `RunSummary` fixture gained the new required `disputedCourts` field
  (0 in the existing fixtures, since none of them involve a dispute); no
  existing assertion's expected value changed.

No pre-existing test contradicted the contract in a way that could not be
reconciled — every change above was either a required word/bucket update or
an additive field.

## Debt logged

Three entries added under "v3 consolidated plan → Work package 03" in
`docs/reference/debt-log.md`:

- **V3-03-1** — `resolve_court` can only resolve a dispute where every
  claimant is a meet match (the unified `matches` SQL table is meet-only per
  ADR 0006's non-merged records); a bracket-involved dispute is detected and
  displayed but not resolvable through this command yet. Needs a
  `POST /bracket/commands` equivalent.
- **V3-03-2** — V3-OC18.1 received only a minimal, single-site fix; a full
  sweep of Plan's other row surfaces for engine-internal vocabulary is
  package 12's.
- **V3-03-3** — V3-OC19.2's `disputedCourts` fix is per-surface (Run); the
  Overview's `PhasePanels.tsx` still reads only `playing`/`courtsFree` and
  needs the new field wired in by package 12.

## Notable design decisions

- **Ruling C1 applied literally**: no new table. `derive_disputes` /
  `deriveDisputes` are pure functions over current match rows, called on
  demand; only the *resolution* (the resulting match-row mutations plus the
  `Command` audit row) is persisted, through the existing idempotent command
  pipeline.
- **The console's called-called lane conflict is kept as a narrower,
  documented addition, not folded into the contract's "disputed" definition.**
  Contract §4.1 defines `disputed` strictly over `occupiesCourtNow` (i.e.
  `playing`). `deriveCourtLanes`'s pre-existing rule that two *called* (not
  yet playing) matches on one court also produces a lane-level `conflict` is
  a different, narrower assignment concern (nobody is on the court yet, but
  two calls have gone out for it) and is retained with an explanatory
  comment rather than removed — removing it would have silently dropped a
  desk signal the contract doesn't forbid, just doesn't itself require.
  `deriveSummary`'s counts (`playing`/`courtsFree`/`disputedCourts`) are
  unaffected by this narrower rule; they redirect fully to the authority.
- **`resolve_court`'s wire shape**: `CommandRequest.match_id` carries the
  *chosen* match id (so idempotency/`seen_version` anchor on it, consistent
  with every other command); `payload` carries `chosenMatchKey` (redundant
  with `match_id`, kept for parity with the contract's named
  `CourtResolution` shape), `displacedMatchKeys`, `action`, and `note`.
- **`keep_and_finish` bypasses the strict transition guard** for the
  displaced match, deliberately — like the existing bulk admin routes, this
  is an operator escape hatch for a state a prior misassignment already
  produced, not a normal single-step transition.
