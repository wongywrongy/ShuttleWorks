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

*(Not started. Gated on Phase A merged + green, then the B0
parity-audit STOP.)*
