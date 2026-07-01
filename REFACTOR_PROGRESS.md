# Refactor Program Ledger

READ THIS FILE FIRST, before doing anything else, in every refactor
session. UPDATE THIS FILE LAST, before ending every session. This is the
single source of truth for where the program stands — not memory, not
the last chat, this file.

## ABSOLUTE RULE (applies to every phase, always)
Do not modify or regress function. If continuing a phase and the "Open
questions / stops" section below has an unresolved entry, resolve or
escalate it before making any further code change.

## Current state

- **Program started:** 2026-06-30
- **Baseline tag:** `pre-refactor-20260630` (commit `6d8d6e8`)
- **Current phase:** 2-REFACTOR (**IN PROGRESS** — Kyle authorized 2026-06-30, "proceed as ordered")
- **Status:** IN PROGRESS. Entry sequence: (1) safety-net characterization tests
  for F-SAFETY-1 (`sync_service.py`, `matchStateStore.ts`) → (2) F-ARCH-1
  (platform→app) → … → **STOP at F-ARCH-3** (matchStateStore ownership, needs
  Kyle's judgment). Each slice: scope → change → full gate → independent review.

## Phase log

### Phase 1 — Exploration
- Status: **COMPLETE** (2026-06-30)
- Output: docs/audits/00-baseline.md, 00-dependency-graph-baseline.json, 01-findings.md ✅
- Summary: All gates GREEN at baseline (1289 tests: 720 FE / 569 BE; eslint 0
  err/87 warn; depcruise 0 err/17 warn; ruff-F clean; FE cov 34.92% lines / BE
  81%). The prior audit's 4 coupling findings **shifted**: K1 (module contract)
  RESOLVED; K2/K3/K4 now declared + test-pinned by `moduleContract.ts` but
  structurally present. 17-item backlog produced, blast-radius ascending: mostly
  cheap dead-code cleanup (F-DEAD-*, confirmed via knip+grep) up front, then
  safety-net tests (F-SAFETY-1: sync_service.py + matchStateStore.ts), then
  architectural work (F-ARCH-*). Zero code files changed by the audit.

### Phase 2 — Refactor
- Status: **IN PROGRESS** (started 2026-06-30) — at the Phase 2→3 checkpoint, awaiting Kyle
- Findings resolved:
  - **F-SAFETY-1** — safety-net characterization tests (`bc8dd3e`): sync_service.py 72%→86%, matchStateStore.ts 36%→100%.
  - **F-ARCH-1** — relocate workspaceNav to platform/product-shell (`fef1c3b`); 3 platform-no-app violations gone, rule ratcheted warn→error. See `02-review-1.md`.
  - **F-ARCH-2 / A** — move AppearanceSettings meet→settings (`13a0a6a`); settings→meet edge gone. See `02-review-2-3.md`.
  - **F-ARCH-2 / C** — extract shared discipline names to lib/disciplineNames (`028a96e`); bracket→meet edge gone. Adversarial review caught a real prototype-key divergence → fixed (null-prototype map) + regression test. See `02-review-2-3.md`.
  - depcruise no-cross-product: 17 baseline → 14 (F-ARCH-1) → 13 (A) → **12 (C)**; gate green throughout (vitest now 743).
- F-ARCH-2 remaining (NOT executed): 8 accept-as-legit (incl. **B** operations→bracketLabels, reclassified legit), 1 resolve-via-dead-code (`settings/OverviewTab.tsx` → Phase 3), 2 needs-design-decision.
- Deferred to Kyle's judgment: **F-ARCH-3** (matchStateStore ownership) + the 2 F-ARCH-2 needs-design-decision edges (operations rendering bracket UI).
- **Phase 2 actionable refactors COMPLETE** — at the Phase 2→3 checkpoint.
- Last commit in this phase: `028a96e`
- Executed via `sp-refactor-phase2` + `sp-refactor-phase2-relocations` workflows (one-workflow-per-phase model, each slice: exec → gate → adversarial review → commit).

### Phase 3 — Directory cleanup
- Status: **IN PROGRESS** — inventory done (`wf_769efbab-f79`), awaiting Kyle's deletion approval
- Inventory: `docs/audits/03-cleanup-inventory.md` + `03-cleanup-unclear.md`
- Proposed: delete 15 confirmed-dead source files (orphaned meet/schedule+setup+tournaments
  subtree + services/api.ts + settings/OverviewTab.tsx + types/schedule.ts); delete disposable
  artifacts (29 root *.png, .playwright-mcp/, already gitignored); add gitignore entries
  (.ruff_cache/, **/e2e/shots/). OverviewTab deletion also clears an F-ARCH-2 edge.
- Kyle-decides: retain-vs-delete useBulkOperations.ts + usePlayerSelection.ts (design doc says
  keep for planned Phase-2 engines); the ~92 export/type source-edits (separate follow-up).
- codanna MCP token expired mid-run; agents used grep + dependency-graph BFS (two methods agreed).

### Phase 4 — Documentation
- Status: NOT STARTED
- Summary: <fill in when done>

## Open questions / stops
<Anything a prior session flagged as a STOP condition and hasn't been
resolved yet goes here, with a link to the relevant docs/audits/*.md
file. A new session must read this before touching code — an unresolved
stop here means pick up the conversation with Kyle, not the keyboard.>

- **F-ARCH-3 (matchStateStore ownership)** — pre-flagged STOP for Phase 2. The
  prior "move it to Operations" would create new `no-cross-product` violations
  from Meet (3 files) + Bracket (`LiveView`), since the store is cross-cutting,
  not Operations-exclusive. Two reasonable approaches, no clear winner from the
  code — needs Kyle's decision before any slice touches it. Options in
  `docs/audits/01-findings.md` §F-ARCH-3.
- **[RESOLVED 2026-06-30] Ledger tracking** — Kyle chose to track this file.
  `.gitignore` now has `!/REFACTOR_PROGRESS.md`; the ledger is committed and
  survives Phase 3's `git clean -fdx`. (Phase 3 still must not blind-`-fdx` other
  gitignored root `.md` files Kyle cares about — see 01-findings "Program hazard".)
- **[OPEN] F-ARCH-3 checkpoint** — Phase 2 will STOP at F-ARCH-3 (matchStateStore
  ownership) and escalate to Kyle before touching it.

## How to use this file
- At the start of a session: read this file, read CLAUDE.md, then read
  whatever `docs/audits/*.md` file the current phase points to.
- At the end of a session (whether the phase finished or you hit a
  STOP): update "Current state," the relevant phase log entry, and
  "Open questions / stops." Commit this file alongside your other
  changes so the ledger and the code never drift apart.
- If picking this up mid-phase, do not restart the phase — read what's
  already logged and continue from there.