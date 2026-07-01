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
- **Current phase:** Phases 1–4 (bounded program) + Phase 5 (practice install) +
  Phase 6 (doc consolidation) + **Phase 7 (cover-before-modify, locked functions)**,
  2026-06-30/07-01
- **Status:** bounded program COMPLETE; **Phase 7 (CODE_HEALTH Part-2 application)
  COMPLETE** — both engine locked functions characterized (30 tests) AND decomposed
  (`solve` E37→A5, `build` C19→A2); 2 latent bugs found + fixed; independent review
  verified behavior-equivalence. Program summary:
  `docs/audits/04-refactor-program-summary.md`;
  **authoritative current snapshot: `docs/audits/06-state-of-codebase.md` — read that first.**
  depcruise 17→11, dead files 18→3 (kept), tests 1289→**1363**, all gates green.
  **Phase 5** installed the code-health discipline (`CODE_HEALTH.md` + `docs/audits/debt-log.md`).
  **Phase 6** consolidated the docs + swept staleness. **Phase 7** covered the two
  engine locked functions (`GreedyBackend.solve` 19→97%, `bridge.build` 19→96%) →
  no longer locked; decomposition **held** as decompose-when-touched (both have zero
  in-repo callers). The live backlog is the **debt-log**; remaining items are
  design/coverage calls (F-ARCH-3, 3 operations→bracket edges, the held engine
  decomposition, broad ruff, frontend complexity). Resume feature work from here,
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
- **Backlog pass (Kyle chose "work the debt-log backlog"):** cleared the safe majority
  of the unused export/type/dep backlog, batched + gated:
  - Unused **exports 37→3**, **exported types 60→36**, **duplicate exports 2→1**
    (dropped the redundant `apiClient` default). 44 symbols un-exported (used
    internally, by line-number, tsc-verified); ~11 truly-dead symbols deleted (incl.
    `SettingsShell` component, `TextInput`/`DateInput`/`ColorSwatchRow`/`ACCENT_PALETTE`,
    the 3 dead `selectors.ts` hooks, `_clearAllForTests` ×2, `WORKSPACE_HOME`,
    `WorkspaceNoun`, the stale `usePositionGridColumns` re-export) with import cleanup.
  - Unused **deps 14→7** + **devDeps 2→1**: removed 7 provably-safe deps
    (`@radix-ui/react-checkbox`/`label`/`separator`/`slider`/`slot`/`switch`, `cva`) +
    `@types/uuid`. Verified by `npm install` (clean −107-line lockfile diff) + a real
    `vite build` + 743 tests. **Kept + logged** the 7 manualChunks-coupled / CLI-tool
    deps (removal needs a coordinated `vite.config.ts` edit).
  - Held back at the time (codegen surface): `dto.ts`/`bracketDto.ts` types — now
    FINISHED (see next bullet).
- **Backlog finish (Kyle: "finish it, preserve functionality"):** verified the codegen
  path first — `make generate-api` writes a *separate* `dto.generated.ts`; `dto.ts` is
  the hand-maintained mirror. Classified each flagged type against the generated
  contract: **deleted 10** dead frontend-private dto types + **un-exported 17**
  used-internally (11 dto + 6 bracketDto); **retained 8 backend-mirror types**
  (present in the contract — deleting would create reconcile drift). Types **36→9**
  (8 mirrors + `DisplayPreset`). Removed **4 more dead deps** (`react-dialog`/
  `react-tooltip`/`date-fns` — verified zero imports, only dead `manualChunks`
  strings, which were pruned too; + `tailwindcss-animate`, provided by the
  design-system preset) and knip-ignored the 4 legit config/CLI deps → **knip
  unused-deps 0**. Cleaned the `SettingsNav` orphan created by the `SettingsShell`
  deletion. Accepted `slotToTime`/`formatSlotTime` as an intentional alias.
  **Corrected a mis-finding:** the earlier "design-system undeclared deps" latent bug
  was wrong — those deps are imported nowhere (dead `manualChunks` strings, now gone).
- **`displayPresets` — product decision (2026-07-01): KEEP** for the future
  preset-picker. Authored feature scaffolding in the live Display module; unwired
  but intentionally retained (Kyle's call). Not debt — tracked in `debt-log.md`.
- Gate green after the finish: `tsc` 0 + real `vite build`, eslint **0 err / 85 warn**,
  depcruise **0 err / 11 warn**, vitest **743**, knip **unused-deps 0**, ruff-F clean,
  pytest **590**.
- **Still logged for later (in `debt-log.md`):** F-ARCH-3 + the 2 ops→bracket UI edges
  (design calls); engine 19% coverage safety nets; broad ruff; frontend complexity
  unmeasured. (The dto/type + dep backlog is DONE; `slotToTime`/`formatSlotTime`
  accepted as intentional; `displayPresets` kept by product decision.)

### Phase 6 — Documentation consolidation, staleness sweep & state record
- Status: **COMPLETE** (2026-07-01)
- **Doc-only phase** (ABSOLUTE RULE): **zero source files changed — only markdown.**
  The Step-5 code sweep was a *diff* against the Phase-5 debt-log (per the reframe),
  not a re-derivation: fresh radon/knip/depcruise showed **no drift** since Phase 5
  (690 blocks / avg A 3.94 / 54 >10; knip = only the documented intentional-kept set;
  depcruise 11/0), so nothing met the removal bar → no code removed.
- **Grounding:** codanna MCP was down (token expired → needs `/mcp` re-auth); grounded
  against real code via grep/Read + 4 read-only Explore agents + a change-set pass
  (grepped canonical docs for everything Phases 3/5 deleted/moved — highest precision).
- **Delivered:**
  - `docs/audits/06-doc-inventory.md`, `06-stale-doc-findings.md`, `06-state-of-codebase.md`.
  - **9 canonical docs fixed** to match code: `hooks/README` (5 phantom hooks + store
    names), `components/README` (4 phantom entries), `api/README` (useUiStore),
    `scheduler_core/README` (api_compat.py + test cmd), `backend/README` (banner + routes
    + test cmd), `data-flow.md` (VALID_TRANSITIONS postpone edge), `operations.md`
    (SourceChip is shared / operationalWriteback), `repo-layout.md` (workspaceNav path),
    `build-on-the-engine.md` (pytest cmd).
  - **Historical trees banner-labeled** (not deleted/rewritten): `docs/superpowers/**`,
    `docs/architecture/workspace-suite/**`, the 2026-06-25 session-handoff (it claimed to
    be "the single source of truth"). Roadmap left forward-looking (STOP condition honored).
  - Refreshed `debt-log.md` (Phase 6 diff note + cleared entry).
- **Verified CURRENT (no change):** all VitePress architecture docs except data-flow;
  all modules/contracts/api except operations; most getting-started/how-to. Phase 4's
  reconciliation held up — staleness concentrated in the older layer/package READMEs.
- Gate green: **docs:build 0** (dead-link), tsc 0, eslint 0-err/85, depcruise 0-err/11,
  vitest 743, ruff clean, pytest 590.
- **Next highest-priority candidate** (per Phase-5 precedent; see `06-state-of-codebase.md §4`):
  the engine **locked functions** — `GreedyBackend.solve` (E 37 @ 19% cov) + `bridge.py:build`
  (C 19 @ 19%) — a deliberately scoped **cover-then-modify** pass (characterization tests
  first, per CODE_HEALTH Part 2) before any engine refactor. Then the 3 operations→bracket
  edges + F-ARCH-3 (design calls).

### Phase 7 — Cover-and-modify: engine locked functions
- Status: **COMPLETE (2026-07-01).** Steps 1–6 all done: measure → understand →
  cover → (initial hold, then Kyle-reversed) seam/decompose → re-measure + review.
  `GreedyBackend.solve` **E37→A5**, `SchedulingProblemBuilder.build` **C19→A2**.
- Scope: exactly `GreedyBackend.solve` (backends.py) + `SchedulingProblemBuilder.build`
  (bridge.py) — the two functions flagged locked (high complexity **and** 19% cov).
- **Step 1–2 (measure + understand):** `docs/audits/07-locked-functions.md`. Complexity
  unchanged (E37 / C19); coverage 19%/19% (method bodies 0%). **Call-graph reframe
  (codanna `analyze_impact` + grep):** both are **public library surface with no
  in-repo production caller** — `GreedyBackend` is isolated (live path uses
  `CPSATBackend`); `build` is reached only by `live_ops.reschedule`, itself
  in-repo-unused. **Corrected the debt-log claim** that `build` "guards every schedule
  build" (the Meet/Bracket paths build `ScheduleRequest` directly — `api/schedule.py:111`,
  `services/bracket/adapter.py:89`). Both are library-internal-unused, **not** deletable
  dead code (exported API) → characterize, don't delete.
- **Step 3 (cover):** 30 characterization tests (commits `caf5275` + `ccfe57d`,
  **test-only, zero non-test files**): `test_backends_greedy_characterization.py` +
  `test_bridge_build_characterization.py`. Coverage **19→97%** (backends) / **19→96%**
  (bridge); the 6 unhit lines are defensive-unreachable branches. Full backend suite
  **620 passed** (+30), ruff-F clean. Both functions are **no longer locked** (now
  high-complexity-but-*covered*). An **independent fresh-context review** (CODE_HEALTH
  #4) verified no vacuous assertions, both latent-bug claims, all call-graph claims,
  and unreachable-branch soundness; its 3 nits were folded in as tripwires (`ccfe57d`).
- **Two latent bugs found during characterization, then FIXED (Kyle: "fix the bugs"):**
  (a) `build`'s config rebuild hand-listed fields → silently dropped newer `ScheduleConfig`
  fields on any freeze/rolling override → **fixed** by switching both rebuilds to
  `dataclasses.replace` (`bridge.py:118–137`, prior art `handle_court_outage`); the
  tripwire tests were flipped to preservation regression-guards. No production impact
  (override path had no in-repo caller). (b) stale `examples/badminton_event_setup.py`
  (imported the cut `PoolGenerationPolicy`/`CompetitionGraph`) → **rewritten** to the
  current manual-PlayUnits→bridge→CPSAT API, verified runnable. Audit confirmed the
  copy-and-override bug class exists nowhere else. Full suite 620 green. See `debt-log.md` Cleared.
- **Steps 4–5 DONE (`d09396c` + `1534756`):** initially held (recommendation:
  decompose-when-touched, since zero in-repo callers = low value), then **reversed on
  Kyle's call** ("finish the last part"). Seam == decomposition (both are pure functions
  of their args — no DB/shared state to inject). Decomposed along intake → engine → emit:
  `GreedyBackend.solve` **E37→A5** (extracted `_GreedyPlacer` engine + `_locked_match_ids`
  intake + `_result` emit); `SchedulingProblemBuilder.build` **C19→A2** (extracted
  `_select_unit_ids`/`_apply_horizon`/`_build_players`/`_build_matches`/`_build_previous_assignments`).
  Complexity dropped **and distributed** (largest new unit B9, not relabeled); coverage held
  (backends 99%, bridge 97%); characterization net green after every extraction.
- **Step 6 DONE:** full backend suite **620 green**, full ruff-F clean; complexity re-measured
  (confirmed the score dropped, not moved); an **independent fresh-context review** verified
  behavior-equivalence line-by-line (iteration order, occupancy-mutation timing, the guard
  swaps, `moved_count`, config-field preservation, None-side coercion — all confirmed, no divergence).
- Executed inline (single session) under `CODE_HEALTH.md` Part 2, not a workflow.

## Open questions / stops
<Anything a prior session flagged as a STOP condition and hasn't been
resolved yet goes here, with a link to the relevant docs/audits/*.md
file. A new session must read this before touching code — an unresolved
stop here means pick up the conversation with Kyle, not the keyboard.>

- **[RESOLVED 2026-07-01 — HOLD, then reversed → DONE] Phase-7 Step-3→4 checkpoint
  (decomposition of the two engine locked functions)** — Kyle initially chose HOLD
  (decompose-when-touched; a value call, since both have zero in-repo callers), then
  **reversed** ("finish the last part"). Both were decomposed (solve E37→A5, build
  C19→A2), gate green, behavior-equivalence independently verified. Nothing left open.
  See `docs/audits/07-locked-functions.md §7`.
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