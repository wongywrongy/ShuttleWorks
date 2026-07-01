# 04 — Refactor Program Summary

**Program:** SP-REFACTOR (Phases 1–4), `dev/workspace-suite`, 2026-06-30.
**Baseline:** tag `pre-refactor-20260630` (`6d8d6e8`). **Method:** every code change
gated; every refactor slice adversarially reviewed for behavior change before
commit; every deletion verified (two methods) and Kyle-approved. Behavior was
preserved throughout — no test was edited to pass a changed behavior.

## Before → after

| Metric | Baseline | After | Δ |
| --- | --- | --- | --- |
| depcruise violations | 17 warn / 0 err | **11 warn / 0 err** | −6 |
| — `platform-no-app` | 3 (warn) | **0 (now error)** | eliminated + locked |
| — `no-cross-product` | 14 (warn) | **11 (warn)** | −3 |
| Modules cruised | 423 | 410 | −13 (dead code) |
| knip unused files | 18 | **3** (all intentionally kept) | −15 |
| Frontend tests | 720 | **743** | +23 |
| Backend tests | 569 | **590** | +21 |
| Coverage — `sync_service.py` | 72% | **86%** | safety net |
| Coverage — `matchStateStore.ts` | 36% / 16% funcs | **100%** | safety net |
| eslint | 0 err / 87 warn | 0 err / 89 warn | +2 warn (net: safety-net test +, dead-file −) |
| ruff (gate, `F`) | clean | clean | — |

All CI gates green at the finish: `tsc`, eslint, vitest (743), depcruise (0 err),
ruff-F, pytest (590).

## What was resolved

- **Safety net** (`bc8dd3e`) — characterization tests pinning the two highest
  risk×exposure files (the crash-safe outbox + the live match-state store) before
  any refactor touched them.
- **F-ARCH-1** (`fef1c3b`) — nav model relocated to `platform/product-shell`;
  `platform-no-app` ratcheted to error. → [ADR 0010](/decisions/0010-nav-model-in-platform).
- **F-ARCH-2/A** (`13a0a6a`) — `AppearanceSettings` moved meet→settings.
- **F-ARCH-2/C** (`028a96e`) — shared `lib/disciplineNames`; bracket stops
  importing meet. An adversarial reviewer caught a real `Object.prototype`-key
  divergence → fixed (null-prototype map) + regression test.
  → [ADR 0011](/decisions/0011-cross-product-boundary-policy).
- **F-ARCH-2/B** — reclassified *accept-as-legit* (a legitimate consumer edge).
- **Dead code** (`dc93992`) — 15 confirmed-dead files removed (an orphaned meet
  subtree + `services/api.ts` + `settings/OverviewTab.tsx` + `types/schedule.ts`);
  no cascade. `OverviewTab` deletion also cleared a `no-cross-product` edge.
- **Artifacts / gitignore** (`3b4052b`) — `.ruff_cache/` + `**/e2e/shots/` ignored;
  29 throwaway root `*.png` + `.playwright-mcp/` removed (targeted `rm`, never
  `git clean -fdx`).
- **Docs** — CLAUDE.md boundary section corrected (platform↛app error, current
  counts, workspaceNav path); stale references to deleted/moved files fixed in
  `state-management`, `workspace-model`, `settings`, the how-to/tutorial guides;
  ADRs 0010 + 0011 added; decisions index reconciled (0009 was missing).
- **Prior-audit re-validation** — the four coupling findings had shifted: **K1
  (module contract) was already resolved**; K2/K3/K4 are now declared + test-pinned
  by `moduleContract.ts`. **F-DOC-2 resolved:** both `POST /bracket/results`
  (legacy) and `/commands` (canonical, ADR 0007) exist; CLAUDE.md was accurate.

## What was deliberately deferred (open)

These need a design decision, not a mechanical pass — the program correctly did
**not** force them:

- **F-ARCH-3** — `matchStateStore` ownership (shared vs Operations-owned). Stays
  in shared `store/` for now; moving it would create new violations. [ADR 0011].
- **Operations rendering Bracket UI** (`MatchDetailPanel`, `BracketScheduleModal`)
  — the last two `no-cross-product` design edges; blocks erroring the rule.
- **~92 export/type source-edits** (`03-cleanup-inventory.md` §C) — ~69 "drop the
  `export`" + ~23 truly-dead; behavior-preserving but source edits, a follow-up pass.
- **`slotToTime`/`formatSlotTime`** — pick one canonical name (both are live).
- **Engine coverage** — `scheduler_core/engine/{backends,bridge}.py` at 19%; a
  safety-net candidate before any engine refactor.
- **Stale config comment** — `.dependency-cruiser.cjs` `no-cross-product` comment
  still says "16 known" (now 11); a config-comment cleanup (out of docs-only scope).
- **Broad ruff** (`E,I,B,UP`, 1506) — the deferred one-time style cleanup.

## Program shape (for the next session)

`REFACTOR_PROGRESS.md` is the live ledger. The safety net (characterization tests,
dependency rules, the ADR log) is now part of normal work, not a one-off. Resume
feature work from here; pick up the deferred items above when their design
questions are answered.
