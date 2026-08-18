# SP-CONSOLE-4 — Branch reconciliation & Operations convergence · ledger

Read at session start, update at session end. Final console slice: Phase A
merges `design/console-3` into the working branch; Phase B retires the
legacy single-engine Operations surfaces onto unified Operations. Hard
gate between phases; Phase B additionally gated on the B0 parity audit.

## Phase A — branch reconciliation

### A0 findings (2026-08-18, owner-ratified)

- Merge base `ab117e5` (SP-CONSOLE-2 close). `design/console-3` carried 9
  commits (X6 sweep, INS-N1, HDR-1, BRST/DRW, recoveries, SP-CONSOLE-3A);
  `feat/p7-public-entrant` carried 14 (SP-P7 P1–P5 + the console-2 merge
  `fc788e3` + its own three-file recovery `15bc839`). `main` is an
  ancestor of both — nothing to reconcile there; repo precedent for
  console work is fc788e3 (console → entrant branch).
- **Conflict inventory: exactly one.** Of 4 both-touched files, 3 were
  byte-identical twin recoveries (`stateWords`/`drawProgress`/`rotation`).
  The 4th — alembic `v6a1c5e8f3b4_backup_origin.py` — was an add/add with
  the same revision id but different parents; **p7's side wins** (it was
  already re-parented after p7's `v6b2d6f9a4c5` for a linear chain, which
  `test_entries_migration.HEAD_REVISION` pins; the DDL is identical).
- The expected hot spots (MatchCard / status renderers / chips) do NOT
  collide — p7 never touched them.
- **3B has not started anywhere** (no branch, no ledger, no code; the
  stray worktree branches were stale entrant-era commits). A2 is a no-op;
  exactly one `ResultSideBlock` exists (console-3's), so no duplication
  guard is needed per the directive's own "if two were found" condition.
- Loose ends dispositioned: the pre-console-2 staged deletions of
  `docs/audits/2026-05-15_screenshots/` (console-2's O-7, deferred then)
  — **owner ruled: commit the deletion**; landed as `d2ea408` with the
  three unstaged stragglers included and the audit doc pointing at git
  history. Two stale untracked doc drafts (`entrant-tier.md`,
  `entries.md` — longer pre-commit ancestors of pages p7 shipped through
  the docs gate) parked in place as `*.superseded-draft-2026-08.md`
  (untracked) for owner review; an untracked byte-identical copy of
  `SP-P7-phase0-audit.md` deleted. The `.claude/worktrees/p7-public-entrant`
  worktree was retired (metadata pruned; its directory may linger on disk
  — OneDrive held a handle — delete at leisure); the primary worktree now
  tracks the merged branch.

### A1 record

- **Ruling: console-3 → p7** (Option 1, the fc788e3 mirror). Merge commit
  `f7e88d9` on `feat/p7-public-entrant`; single conflict resolved to p7's
  migration as inventoried above.
- **Negative controls re-demonstrated at the merged head** (a merge can
  silently defang a guard):
  - X6: `STATUS_TREATMENT.ready` flipped to `'chip'` →
    `MatchStatus.test.tsx` **1 failed | 4 passed** ("ready renders as
    plain text — no container"). Reverted.
  - INS-N1: `finished` forced `false` → `MatchDetailPanel.test.tsx`
    **2 failed | 14 passed** (both exclusivity assertions). Reverted.
  - PICK-4: `useEventResultsGuard` stubbed to constant `false` →
    `playerEventsPicker.test.tsx` **3 failed | 4 passed** (all three lock
    assertions). Reverted; tree byte-clean after reverts.
- **Gates at the merged head (`f7e88d9`): `make check` exit 0** — vitest
  **1798 passed / 0 failed** (204 files; console-3's 1795 + p7's entrant
  additions), pytest **1648 passed / 66 skipped** (p7's backend tests
  absorbed), depcruise 0 errors / 16 warnings, eslint + tsc + ruff green;
  the docs-freshness BEHIND report is advisory as ever.

### A2

No-op — no 3B work existed to rebase (see A0).

## Phase B — Operations convergence

### B0 rulings (2026-08-18, owner-ratified)

- **Phase A confirmed** (pushed `82b469e..1e4d0b7`); Phase B open.
- **Disposition table ratified as presented.** Migrate → Plan: disruption
  repair (relabel at B1 after confirming flow shape), director tools,
  warm restart, re-optimize (frozen-horizon — verified distinct from
  Re-plan: pins started/finished as locked + freeze≥2 + bracket windows;
  both live in Plan paired by lifecycle, restoring the lost live-day
  guard), move/postpone-with-preview, advisory banner + dispatcher,
  stale banner, meet XLSX + bracket JSON/CSV/ICS exports, solve
  telemetry (progress log / candidates / infeasible / violations),
  list search + filter chips (absorbs the bracket events-filter need),
  closed-court affordance on the board, suggestions rail (CMP-4),
  read-only + live-day guards on Generate. Migrate → Floor/Run: meet
  score entry (quick + sets, reusing ScoreEditor), finished section +
  undo-finish (via the existing per-match state route — no wire change),
  undo-start (originalSlotId/CourtId already on the DTO), check-in /
  substitute / remove player, shared-player impact analysis.
  Retire-with-reason: court×time on Run (R-G: Floor = dispatch; the time
  axis is one segment away on Plan), schedule-next on the live segment
  (R-H tempo split), bracket chip-state legend (X6 vocabulary is uniform
  + documented; a legend restates the design system), `?director=` deep
  link (superseded by `?select=` + Plan-hosted tools), legacy progress-%
  header (RunSummaryBand carries the facts in console vocabulary), the
  events dim-strip widget (its need migrates as list filters).
- **Alerts & Activity rail: migrate to Run, CMP-4** (collapsed when
  empty).
- **Fallback flag: `VITE_` env flag** (build-time, the
  `VITE_ERROR_HARNESS` precedent) — `VITE_LEGACY_OPS`; default off;
  deleted at B4.
- Component ownership at B1: migrated dialogs/panels MOVE to
  `products/operations/` (Operations owns operating the schedule); the
  legacy pages import from the new home during the flag window (warn-tier
  cross-product edges that die with the pages at B4).

### B1–B4 progress (checkpoint 2026-08-18)

- **Landed** (`c4e4370` groundwork+matrix, `4f668f7` Plan migrations; tsc
  green, operations vitest 152/152):
  - Component moves: Operations owns DisruptionDialog, DirectorToolsPanel,
    WarmRestartDialog, MoveMatchDialog, StaleBanner, SuggestionsRail (+its
    helpers + ScheduleDiffView), AlertsActivityPanel, ScoreEditor,
    SolverProgressLog, CandidatesPanel — legacy pages import from the new
    home (meet→operations warn-tier edges, die at B4). One reverse edge:
    PlanToolbar imports `meet/exports/xlsxExports` (shared with the roster
    export) — split `exportScheduleXlsx` into operations at B4.
  - B2 core: `lifecycleMatrix.ts` + matrix test (negative-control
    demonstration still owed at close).
  - Plan (B1 items 1–13): PlanToolbar (Generate/Re-plan armed + live-day
    hardened copy + read-only guard; "Re-optimize remaining" on LIVE;
    "Report a problem" (relabelled repair); Director tools; "Re-plan, stay
    close"; Export menu = meet XLSX + bracket JSON/CSV/ICS; plan-ready);
    PlanDialogHost (fresh-mount prefills, cancel-on-close);
    `dialogForAdvisory` dispatcher + AdvisoryBanner on Plan; StaleBanner;
    SuggestionsRail; SolveTelemetryPanel (progress log / violations /
    infeasible / candidates); UnifiedOpsList search + engine chips;
    ClosedCourtsStrip (deviation, ledger-ruled: strip above the board
    rather than an in-grid marker — same capability without forking the
    shared board grid); OpsDetailRail "Move or postpone…" (manual-edit
    proposal); COMPLETE renders plan-review (solver/proposal actions
    absent). Ratified test edits: `courtStatus.test.tsx` (owner role for
    the new read-only gate; adjacency walk keeps its protected property
    across the grouped toolbar). Defensive `?? []` on the advisories +
    suggestions store slices (wholesale-replaced stores in tests).
  - `OperationsProduct` gained `engines` prop (defaults both) for B3.

### C4 + B3 + B4 record (2026-08-18)

- **C4 Run migrations landed** (`c3c1cc1`): `useMeetRunOps` bridge
  (useLiveTracking's versioned state route + roster edits + undo-start
  restore + analyzeImpact — its mount also subsumed the old
  `useMatchStateSync` mount in Operations: one loader);
  `MeetMatchPanel` below the RunInspector (ScoreEditor quick+sets →
  `updateMatchStatus('finished')` → record completion, undo-start,
  check-in pills + All in, substitute picker, armed remove, impacted
  list — the inspector's static Players section yields to it);
  `RunFinished` section (score readout + armed undo-finish
  finished→started clearing score/sets/end stamp; bracket rows
  read-only); AlertsActivityPanel on Run with `collapseWhenEmpty`
  (CMP-4 — operator toggle pins); alert Review routes to the
  Plan-hosted dialogs (segment switch + `dialogForAdvisory`). 16 new
  runMeet tests + 2 AlertsActivityPanel cases. The B1 em-dash strings
  (pre-existing contract failure) repunctuated.
- **Negative controls demonstrated**: B2 `opsPlanMode` flip →
  lifecycleMatrix test 1 failed | 22 passed; undo-finish payload
  sabotage → 1 failed (after HARDENING the test — vitest deep-equality
  ignores undefined-valued keys, so the clearing contract is asserted
  by key *presence*); check-in gate flip (`called`→`scheduled`) →
  3 failed. All reverted; tree green.
- **B3 flip** (`4a01eb4`): ModuleOutlet routes EVERY Operations segment
  to `OperationsProduct` with an `engines` prop from AppShell's real
  module catalog; `VITE_LEGACY_OPS=1` build flag restored pre-flip
  routing during the window; grep-guard test pinned the flag to
  ModuleOutlet.
- **B3 gate — scripted meet-day smoke PASSED** (dev stack, cloud auth,
  seeded 6-player/4-match meet workspace, Playwright): single-engine
  meet workspace renders unified Plan (toolbar/board/list) and Run;
  call → check-in (pill + All in) → start → score entry (21–15) →
  Finished + armed undo-finish → undo-start → armed quick Record all
  verified live; alerts trail logged each transition and auto-expanded
  from the CMP-4 collapsed state; the called-not-started warning
  condition cleared itself. **Found + fixed a pre-existing bug**
  (`85c48ae`): the match-state WRITE success paths applied the server
  echo verbatim, silently reverting the local-only
  `playerConfirmations`/`postponed` fields the instant a write
  round-tripped (the polls always preserved them) — check-in had never
  stuck on any surface. Fixed at the seam with the polls' merge;
  regression test + negative control.
- **B4 deletion** (`58b0ac6`): meet SchedulePage +
  MatchControlCenterPage + control-center/ + schedule/ + TimelineKey +
  timelineEncoding deleted (MeetProduct = setup/roster/matches);
  bracket ScheduleView/LiveView/LiveMatchList/BracketScheduleHeader/
  BracketScheduleSidebar/BracketMatchesTable/EventsFilterStrip deleted
  (BracketTab = setup/roster/draws/draw/matches; BracketViewHeader
  draw-only); `VITE_LEGACY_OPS` + its tests removed;
  `exportScheduleXlsx` moved to `operations/exports/scheduleXlsx`
  (shared plumbing in `lib/xlsxExportShared`; the operations→meet
  reverse edge is gone); schedule-next streaming coverage moved to a
  direct BracketScheduleModal test; conflictUI test moved to
  `components/__tests__` (it covers shared PendingBadge/ConflictBanner);
  orphans useTrafficLights/ElapsedTimer/SchoolDot deleted. Depcruise
  cross-product warnings 33 → 16.
- **Vocabulary fork closed**: OpsDetailRail was the last operations
  surface hand-rolling "In progress" — now reads `STATE_WORD`
  ("Awaiting court" stays: positional fact, not a state word).
- Screenshots: `.playwright-mcp/c4-smoke-plan.png`,
  `c4-smoke-run-finished.png`, `c4-b4-run-final.png` (gitignored,
  recapture recipe as in SP-CONSOLE-REFINE).
- **Viewer guard follow-through** (`b940c6d`): reviewing the CI
  interaction-smoke against the flipped surface exposed that the unified
  Run controls carried neither the legacy pages' `useCanEdit` disabling
  nor a client-side seam refusal on the meet command path (A2 class).
  `useCommandQueue.submit` now refuses for viewers; RunInspector /
  RunCourtGrid / RunQueue write controls disable with
  `READ_ONLY_MESSAGE`; the smoke's viewer + 409-drift tests target the
  unified surface (run-card select → `run-act-*` disabled;
  undo-start/postpone/armed undo-finish as the return transitions).
- Gates at close: tsc green · eslint 0 errors · vitest 196 files /
  1756 passed · pytest 1648 passed / 66 skipped · depcruise 0 errors /
  16 warnings · `make check` green on the settled tree (the
  docs-freshness BEHIND report is advisory as ever).
