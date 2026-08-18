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

- **Remaining**: C4 Run migrations (meet score entry via ScoreEditor +
  `useLiveTracking.updateMatchStatus`; Finished section + undo-finish;
  undo-start; check-in/substitute/remove; impact analysis; Alerts &
  Activity rail CMP-4) · per-migration tests + PICK/B2 negative-control
  demonstrations · B3 flip (ModuleOutlet engines routing + `VITE_LEGACY_OPS`
  fallback + grep-guard test) · scripted meet-day smoke (B3 gate) · B4
  deletion + vocabulary-fork ledger close + docs · full `make check` +
  screenshots.
