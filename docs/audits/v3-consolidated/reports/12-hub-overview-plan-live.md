# Work package 12 — hub, overview, Plan and Live day hierarchy

Baseline HEAD `97449c07` (moved to `0e124ca4` mid-package as packages 10a/11/15
landed concurrently; this package's own changes were unaffected by that
churn). Branch `feat/surface-book-remediation`. Scope per the brief:
`apps/console/src/modules/hub/**` (`HubPage.tsx`, `WorkspaceRow.tsx`,
`WorkspaceInspector.tsx`, `hubSignals.ts`, `nextAction.ts`),
`apps/console/src/modules/workspace/overview/**` (`PhasePanels.tsx`),
`apps/console/src/components/control-plane/NextUpList.tsx`,
`apps/console/src/modules/operations/plan/PlanToolbar.tsx`,
`apps/console/src/modules/operations/{UnifiedOpsBoard,UnifiedOpsList,
OperationsProduct}.tsx`, `apps/api/src/workspaces/workspace_signals.py` +
`tests/backend/unit/test_workspace_signals.py`, and one small supporting
export (`apps/console/src/platform/domain/setupChecklist.ts`, needed to keep
the new Hub-inspector Attention section from re-duplicating a checklist
reason — see below). `run/RunSurface.tsx`, `RunSummaryBand.tsx`,
`RunQueue.tsx`, `RunCourtGrid.tsx`, `PlanCallList.tsx` were read and audited
per the brief but needed no change — package 03 had already brought them to
contract (see per-finding sections). No DTO/schema field was added, so
`make generate-api` was not run.

## Files changed

### Backend

- `apps/api/src/workspaces/workspace_signals.py` — `_bracket_match_signals`'s
  `next_up` filter now excludes any assignment already on court
  (`actual_start_slot` set, `actual_end_slot` unset), mirroring the meet
  path's existing exclusion of any assignment with a canonical status
  (V3-OC05.1). `next_up`'s `status` field for bracket rows is now always
  `"scheduled"` (the `"playing"` branch was dead code the console never
  rendered, and is now provably dead since the on-court case is filtered out
  upstream).

### Backend tests

- `tests/backend/unit/test_workspace_signals.py` —
  `test_bracket_live_assignments_report_court_population_and_status` updated:
  the on-court fixture ("live") is no longer expected in `nextUp` at all
  (was asserted `status == "playing"`); only "later" remains. This is a
  **pinned test changed by ruling** (contract §2: a status the UI never
  renders is not a state word; V3-OC05.1 requires "Up next" to be
  upcoming-only) — see "Tests changed" below.

### Console

- `apps/console/src/modules/hub/nextAction.ts` — new `entriesReviewAction`:
  when the leading attention reason is entries-shaped (`ENTRIES_CLOSING_SOON`,
  `UNRESOLVED_PAIRS`, `AT_CAP_WITH_WAITLIST`, `ENTRIES_NOT_COMMITTED`,
  `COMMITTED_ENTRY_WITHDREW`, `UNPAID_ENTRIES`), `rowActionFor` returns
  `'Review entries'` → `participants/entries` instead of falling through to
  `'View draws'`/`'View results'` for a `complete`-phase or `past`-group
  workspace (V3-OC02.2). `REASON_DESTINATION` gained the six entries codes,
  all routed to the entries desk.
- `apps/console/src/modules/hub/WorkspaceRow.tsx` — the Attention cell's
  undecoded `' +{n}'` is now `' · {n} more issue(s)'` (V3-OC02.2).
- `apps/console/src/modules/hub/WorkspaceInspector.tsx` — new "Attention"
  section, rendered only when at least one attention reason has **no**
  corresponding checklist step (i.e. is not already stated as a step's
  subline). This is where the row's "N more issues" resolves to actual
  names. It deliberately does **not** reintroduce a duplicate list for
  reasons the merged checklist already states (SP-UI-1's fix, verified
  still holds — see "Notable design decisions").
- `apps/console/src/platform/domain/setupChecklist.ts` — exported
  `STEP_REASON_CODE` (was module-private) so the Inspector's new Attention
  section can compute "reasons the checklist has no step for" without a
  second copy of that map.
- `apps/console/src/modules/workspace/overview/PhasePanels.tsx` —
  `LivePanel`: (1) the live line now shows `disputedCourts` alongside
  `playing`, matching Run's `RunSummaryBand` treatment, and renders whenever
  *either* count is nonzero (a dispute must never be masked by an otherwise-
  idle floor) — finishes debt V3-03-3; (2) a new "Review court assignments"
  button, shown when `disputedCourts > 0`, navigating to the workspace's
  Live day — V3-OC19.1's direct-route requirement, extended to the Overview
  surface package 03 explicitly left out of scope.
- `apps/console/src/modules/operations/plan/PlanToolbar.tsx` — new optional
  `blockedCount` prop; when `schedulableCount === 0` but `blockedCount > 0`,
  renders `'{n} match(es) waiting on a result before they can be scheduled'`
  instead of the action silently disappearing (V3-OC18.2, finishing what
  package 03 flagged as needing the full toolbar sweep).
- `apps/console/src/modules/operations/OperationsProduct.tsx` — computes
  `blockedCount` (the complement of the existing `schedulableCount`
  predicate: unscheduled bracket play units missing a side or with an
  unresolved feeder) and passes it to `PlanToolbar`.
- `apps/console/src/modules/operations/UnifiedOpsBoard.tsx` — the idle
  status-strip instruction shortened from `'Drag a match to any cell to
  reschedule: meet and bracket share one court plan.'` to `'Drag a match to
  any cell to reschedule.'` (V3-OC18.1 — the engine-sharing detail is
  implementation rationale, not an operator action).
- `apps/console/src/modules/operations/UnifiedOpsList.tsx` — the search
  bar's engine filter chip is relabelled `'Engine'` → `'Match type'` and now
  renders only when both engines are actually present in the list
  (`sourcesPresent.size > 1`) — a chip with nothing to filter is a control
  with no effect (V3-OC18.1).

### Console tests

- `apps/console/src/modules/hub/__tests__/nextAction.test.ts` — new
  `describe('rowActionFor — entries attention (V3-OC02.2)')`: entries reason
  overrides `'View draws'`/`'View results'` for both the `complete`-phase and
  `past`-group paths; a non-entries reason (`NO_ROSTER`) is confirmed
  unaffected.
- `apps/console/src/modules/hub/__tests__/WorkspaceRow.test.tsx` — two new
  tests: the "+1" wording fix, and the "Review entries" override end to end
  through the rendered button.
- `apps/console/src/modules/hub/__tests__/WorkspaceInspector.test.tsx` — two
  new tests: an entries reason (no checklist step) appears in the new
  Attention section while a roster reason (has a checklist step) does not
  also appear there; and the section is entirely absent when every reason is
  already a checklist step (guards against reintroducing SP-UI-1's
  duplicate-list problem).
- `apps/console/src/modules/operations/plan/__tests__/PlanToolbar.test.tsx`
  (**new** — no test file existed for this component before). Four tests:
  the exact-count label for 24 and for 1 (singular/plural), the new
  prerequisite-naming fallback, and the fully-empty case (nothing eligible,
  nothing blocked → neither element renders).
- `apps/console/src/modules/operations/__tests__/unifiedOpsList.test.tsx` —
  one new test: the match-type filter renders with two engines present in
  the list, and is absent with one.
- `apps/console/src/modules/workspace/overview/__tests__/PhasePanels.test.tsx`
  (**new** — no test file existed for this component before). Three tests:
  disputed count shown alongside playing with a working route; disputed
  count and route shown even when nothing is currently playing; no live line
  at all when both counts are zero.

## Commands run and results

```
.venv/bin/pytest tests/backend/unit/test_workspace_signals.py -q
  → 28 passed

.venv/bin/ruff check apps/api tests/backend
  → All checks passed!

npm --prefix apps/console run test:run -- src/modules/hub src/modules/workspace src/modules/operations src/components
  → Test Files 67 passed (67); Tests 614 passed (614)

npm run lint:scheduler
  → 134 problems (0 errors, 134 warnings) — identical warning count/category
    to the pre-existing baseline (package 03's report recorded the same 134);
    no new warning introduced by this package's files.

npx tsc -b apps/console
  → clean (no output)

npm run depcruise
  → 12 dependency violations (0 errors, 12 warnings) — the pre-existing
    KNOWN_CROSS_MODULE warn list; no new cross-module edge from this
    package's files.
```

`make generate-api` was not run — no backend response field changed shape;
`disputedCourts` was already on the wire (package 03) and this package only
changed which rows populate `nextUp` and what value `status` carries, neither
of which changes the schema.

## Per-finding acceptance

- **V3-OC02.1** (routine reassurance / dot legend) — **verified, already
  met by package 07.** `WorkspaceRow.tsx` renders the health dot + word only
  for the `attention` exception; `HEALTH_LEGEND` already reads `'Dot: needs
  attention'` (the one dot that still appears). No further change needed;
  confirmed by `WorkspaceRow.test.tsx`'s existing "leaves the attention cell
  empty" test and `HubPage.test.tsx`.
- **V3-OC02.2** ("+1" / "View draws" for an entries problem) — **met.** The
  row CTA now says "Review entries" and opens the entries desk whenever the
  leading attention reason concerns entries, regardless of the workspace's
  play phase. The "+1" is now "N more issue(s)"; the Hub inspector's new
  Attention section makes those extra issues fully readable by name, without
  duplicating a reason the merged setup checklist already states. Evidence:
  `nextAction.test.ts`, `WorkspaceRow.test.tsx`, `WorkspaceInspector.test.tsx`.
- **V3-OC05.1** ("Up next" containing live matches) — **met, and finishes
  package 03's report note that flagged this as unverified on the bracket
  path.** Package 03 had already fixed the meet path and the Run/
  `UnifiedOpsList` bucket split; this package found and fixed the same defect
  one level down, in the backend's `_bracket_match_signals`, which is the
  shared data source for **both** the Hub inspector's and the Overview's
  "Up next" list. An on-court bracket assignment is now excluded from
  `nextUp` entirely rather than included with an unrendered `"playing"`
  status. Evidence: `test_bracket_live_assignments_report_court_population_
  and_status` (updated), `PhasePanels.test.tsx`.
- **V3-OC18.1** (Plan engine jargon: "ENGINE Meet Bracket", "C1 · S152") —
  **met — full sweep completed, closing debt V3-03-2.** Audited every named
  Plan/Live row and toolbar surface (`PlanToolbar`, `PlanCallList`,
  `UnifiedOpsBoard`, `UnifiedOpsList`, `RunQueue`, `RunCourtGrid`,
  `RunSummaryBand`, `OperationsProduct`): all court/time rendering already
  goes through `formatSlot`/`STATE_WORD` (package 03 had already fixed the
  literal `S152` site and the board's `Court {n}` phrasing). Two remaining
  jargon sites were found and fixed: the drag instruction's engine-internal
  detail ("meet and bracket share one court plan") was cut down to the
  available action, and the search bar's `'Engine'` filter — naming an
  internal category rather than what the chip does — is now `'Match type'`
  and hides itself entirely on a single-engine workspace (nothing to filter
  by). Evidence: `unifiedOpsList.test.tsx`.
- **V3-OC18.2** (button count vs. prerequisite) — **met, finishing package
  03's minimal fix.** The count/label agreement package 03 fixed
  ("Schedule N unscheduled matches") is retained and re-verified
  (`PlanToolbar.test.tsx`). Added the missing half of the ruling: when
  nothing is eligible (`schedulableCount === 0`) but matches exist that are
  blocked on a side or a predecessor's result, the toolbar now names that
  prerequisite instead of the action disappearing with no explanation.
  When truly nothing is left unscheduled, neither element renders (correct
  per X16 — no button for an action with nothing to do, and no note for a
  prerequisite that does not exist).
- **V3-OC19.1** ("Resolve this in Operations" with no route) — **met on
  both named surfaces.** Live day: verified package 03's fix stands
  unchanged (`RunCourtGrid.tsx`'s "Needs resolution" tile with a working
  "Open ›" per claim, plus `RunSurface.tsx`'s full resolution-action block).
  Overview: this surface had **no** route to a conflict at all before this
  package — added a "Review court assignments" button, shown exactly when
  `disputedCourts > 0`, that opens the Live day. Evidence:
  `PhasePanels.test.tsx`.
- **V3-OC19.2** ("8 PLAYING MATCHES" masking conflicts) — **met, finishing
  debt V3-03-3.** Package 03 fixed the Run surface
  (`RunSummaryBand`/backend `MatchMetricsDTO.disputedCourts`); the Overview's
  `PhasePanels.tsx` still only read `playing`/`courtsFree` and could hide a
  dispute behind an idle floor (`playing === 0` suppressed the whole live
  line, including a nonzero `disputedCourts`). The Overview now shows
  `disputedCourts` alongside `playing` whenever either is nonzero — a
  dispute is never masked by there being nothing else on court. Evidence:
  `PhasePanels.test.tsx`'s three cases, including the "0 playing, 1
  disputed" case that was the actual gap.

## Tests changed (pre-existing) and why

- `tests/backend/unit/test_workspace_signals.py`
  `test_bracket_live_assignments_report_court_population_and_status` — the
  on-court fixture ("live") used to be asserted present in `nextUp` with
  `status == "playing"`. Per V3-OC05.1's ruling (contract §2: a status word
  the console never renders is not a state word an operator can read; "Up
  next" is upcoming-only, matching the meet path's pre-existing behaviour),
  it is now excluded from `nextUp`; only the fixture's genuinely-upcoming
  "later" assignment remains. `sig.matches.playing == 1` (the metrics count)
  is unchanged — only the next-up *list* changed, not the occupancy count.
  No other pinned test contradicted a ruling in this package's scope.

## Debt logged

None new. This package **closes** two debt entries package 03 logged against
itself:

- **V3-03-2** (full sweep of Plan's other row surfaces for engine-internal
  vocabulary) — closed. See V3-OC18.1 above for the sweep and the two sites
  fixed.
- **V3-03-3** (Overview's `PhasePanels.tsx` not wired to `disputedCourts`) —
  closed. See V3-OC19.2 above.

## Notable design decisions

- **The Hub inspector's new Attention section does not resurrect the
  pre-SP-UI-1 duplicate-list pattern.** `WorkspaceInspector.test.tsx` has a
  standing test (predating this package) asserting the old separate
  `inspector-todos` list stays gone, because "the attention copy appears as
  the step's subline instead of in a list of its own." A blanket "list every
  attention reason" section would have violated that ruling for any reason
  that maps to a checklist step (today: `NO_ROSTER`/`NOT_SCHEDULED`/
  `NO_BRACKET`). The new section filters those out via the setup-checklist's
  own `STEP_REASON_CODE` map (now exported for this reuse) and only ever
  shows reasons the checklist has no step for — which, today, is exactly the
  entries-shaped codes V3-OC02.2 is about. This is asserted directly by a
  new test ("renders no Attention section when every reason is already a
  checklist step").
- **`entriesReviewAction`'s precedence is scoped, not global.** It only
  overrides the `phase === 'complete'` and `group === 'past'` branches of
  `rowActionFor` — the two branches that produced the reported bug ("View
  draws" for a finished/past workspace with an outstanding entries issue).
  It deliberately does **not** override `phase === 'live'` ("Open live day"
  stays the primary action for a workspace mid-play, even with an entries
  loose end — operating the live day is more urgent) or the `undated`/
  `upcoming` paths (which already route through `nextActionFor`'s general
  reason-to-action mapping and were not the reported defect).
- **`blockedCount` reuses `schedulableCount`'s exact predicate, inverted.**
  Rather than introduce a new eligibility concept, `OperationsProduct.tsx`'s
  new `blockedCount` is defined as "unscheduled, not done, and NOT
  (`schedulableCount`'s three conditions)" — so the two counts partition the
  unscheduled set by construction and can never disagree about what "the
  rest" means.
