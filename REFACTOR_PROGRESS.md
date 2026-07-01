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
- **Current phase:** DONE — Phases 1–4 (bounded program) + Phase 5 (practice install), 2026-06-30/07-01
- **Status:** COMPLETE. Full program summary: `docs/audits/04-refactor-program-summary.md`.
  depcruise 17→11, dead files 18→3 (kept), tests 1289→1333, all gates green.
  **Phase 5** installed the ongoing code-health discipline: `CODE_HEALTH.md` (standing
  practice) + `docs/audits/debt-log.md` (the visible backlog it feeds). The remaining
  deferred items are now tracked in the **debt-log**, not here — read it for the live
  backlog (F-ARCH-3, 2 operations→bracket-UI edges, unused export/type + dep cleanup,
  engine coverage, broad ruff, frontend complexity). Resume feature work from here,
  under `CODE_HEALTH.md`.

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
- Status: **COMPLETE** (2026-06-30) — at the Phase 3→4 checkpoint
- Inventory: `docs/audits/03-cleanup-inventory.md` + `03-cleanup-unclear.md` (`wf_769efbab-f79`)
- Executed (Kyle approved): 3B gitignore fix (`3b4052b`); 3C deleted 15 confirmed-dead files
  (`dc93992`, orphaned meet subtree + services/api.ts + settings/OverviewTab.tsx + types/schedule.ts;
  OverviewTab cleared an F-ARCH-2 edge). Removed 29 untracked root *.png + .playwright-mcp/ via
  targeted rm (NOT git clean -fdx — would have nuked node_modules/.venv).
- Gate green: tsc clean, vitest 743, eslint 0 err (89 warn), depcruise 0 err (no-cross-product
  12→11, 425→410 modules). knip 18→3 unused files (the 3 intentionally kept), no cascade.
- Kept per Kyle: useBulkOperations.ts + usePlayerSelection.ts (design-doc Phase-2 engines).
- Deferred follow-up: ~92 export/type source-edits (03-cleanup-inventory §C; needs source edits,
  out of Phase-3 artifact scope) + `slotToTime`/`formatSlotTime` canonical-name decision.
- codanna MCP token expired mid-run; agents used grep + dependency-graph BFS (two methods agreed).

### Phase 4 — Documentation
- Status: **COMPLETE** (2026-07-01)
- Summary: Reconciled docs to post-refactor reality. CLAUDE.md boundary section
  corrected (platform↛app now error; current counts; workspaceNav path). Fixed
  stale references to deleted/moved files in state-management, workspace-model,
  settings, and the how-to/tutorial guides (changelogs in docs/changes/ left as
  historical record). Added ADR 0010 (nav model in platform) + ADR 0011
  (cross-product boundary policy); reconciled the decisions index (0009 was
  missing) + vitepress sidebar. Produced 04-refactor-program-summary.md.
  docs:build (dead-link gate) green. F-DOC-2 resolved (both bracket routes exist;
  /commands canonical per ADR 0007). Left for follow-up: the stale "16" comment in
  .dependency-cruiser.cjs + the moduleContract.ts advancement comment (both source/
  config comments, out of docs-only scope).

### Phase 5 — Ongoing code-health practice (install the discipline)
- Status: **COMPLETE** (2026-07-01)
- **Framing (important):** Phase 5 is NOT another bounded campaign. Per the standing
  practice's own rule ("continuous small discipline, not periodic heroics"), it
  *installs* the discipline + clears only already-verified-safe backlog, then hands
  back to normal feature work. Deliberately did NOT force design-gated or open-ended
  work (that's the anti-pattern the practice exists to prevent).
- **Delivered (did now):**
  - `CODE_HEALTH.md` (repo root, un-ignored like CLAUDE.md) — the standing practice,
    verbatim + wired to the debt-log; linked from CLAUDE.md "Working practices".
  - `docs/audits/debt-log.md` (NEW) — the visible backlog the practice feeds
    (`CODE_HEALTH.md` #6). **This is the primary Phase-5 artifact** — it makes the
    practice real. Seeded from a fresh measurement pass + the Phase 1–4 deferred items.
  - **Measurement** (`radon` added to `requirements-dev.txt`, local-only, not a gate):
    690 blocks, **avg A (3.94)**, 54 blocks rank >10; engine coverage **80%**. Identified
    the 2 true locked functions (`backends.py:GreedyBackend.solve` E37 @19%,
    `bridge.py:build` C19 @19%) vs. complex-but-*covered* (`validation.py:find_conflicts`
    F68 @83% — worst score, but tested, so a decompose-when-touched, not locked).
  - **Dead code (#9):** removed 5 truly-dead symbols (`cn`, `INPUT_CELL_STYLE` in
    `lib/utils.ts`; `closuresForCourt` in `lib/courtClosures.ts`; `getSchoolAccent` in
    `lib/schoolAccent.ts`; `computeMoveDelta` in `meet/schedule/ScheduleDiffView.tsx`) +
    un-exported `DEFAULT_EVENT_COLOR` (used internally). Orphaned imports cleaned.
    Each verified project-wide-unused (grep, knip counts tests).
  - **Stale comment:** `.dependency-cruiser.cjs` no-cross-product "16 known" → 11 +
    current buckets (SourceChip/EVENT_LABEL cleared in Phase 2/3; ops→bracket is the debt).
- Gate green: tsc 0, eslint **0 err / 88 warn** (89→88), depcruise **0 err / 11 warn**,
  vitest **743**, ruff-F clean, pytest **590** (no Python source changed).
- **Logged for later (in `debt-log.md`, deliberately NOT done):** F-ARCH-3, the 2
  ops→bracket UI edges (design calls); ~32 remaining unused exports + 59 unused types
  (careful: `dto.ts` codegen, `moduleContract` `*_SEGMENTS`/`DtoName`); 12+2 unused
  package deps (risky — needs design-system cross-check); `slotToTime`/`formatSlotTime`
  dup; engine 19% coverage safety nets; broad ruff; frontend complexity unmeasured.

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