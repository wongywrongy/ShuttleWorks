# 06 — State of the Codebase (SP-REFACTOR Phase 6 snapshot)

**As of:** 2026-07-01 · **Branch:** `dev/workspace-suite` · **Baseline tag:**
`pre-refactor-20260630` (`6d8d6e8`).

The single authoritative snapshot of where ShuttleWorks stands after SP-REFACTOR
Phases 1–6. A future phase (7+) or any new session should start here instead of
re-deriving context. Grounded against current code (codanna was down — grep/Read
fallback; see `06-stale-doc-findings.md`).

---

## 1. Doc map

**Canonical (living) — check these first:**
- VitePress site: `docs/architecture/`, `docs/modules/`, `docs/contracts/`,
  `docs/api/`, `docs/decisions/` (ADRs 0001–0011), `docs/getting-started/`,
  `docs/how-to/`.
- `REFACTOR_PROGRESS.md` (ledger), `CLAUDE.md` + `CODE_HEALTH.md` (practices),
  `docs/audits/debt-log.md` (live backlog), **this file** (current snapshot).
- Layer/package READMEs live next to their code (`frontend/src/*/README.md`,
  `scheduler_core/`, `backend/`, `packages/design-system/`).

**Historical (banner-labeled, do NOT cite as current):** `docs/superpowers/**`
(+ the 2026-06-25 handoff), `docs/architecture/workspace-suite/**`,
`docs/architectural-roadmap.md`, `docs/tech-stack.md`, `docs/changes/**`, dated
`docs/audits/2026-05*/06-10*`. **Frozen:** `archive/tournament-pre-merge/**`.

Full inventory + consolidation decisions: `06-doc-inventory.md`. Staleness fixes:
`06-stale-doc-findings.md`.

---

## 2. Architecture summary

**Control plane, not a stack of apps.** Hub (`/`) lists workspaces; each workspace
enables **modules**. Four architectural modules share `intake → engine → emit`:

- **Meet** & **Bracket** — ENGINES: roster/config/draw → the shared pure CP-SAT
  engine in `scheduler_core/` → matches. Neither Meet lineup nor Bracket advancement
  is a CP-SAT constraint (both pre-resolve matches). Params centralize in
  `backend/services/scheduling/params.py` (`build_schedule_config`); constraints are
  plugins in `scheduler_core/engine/constraints/`.
- **Operations** — OPERATES matches: Plan board + live Run surface, owned match-state
  machine (`scheduled→called→playing→finished|retired`, plus `playing→scheduled`
  postpone) + idempotent command queue. **Tier-2** (always-on, no enable flag).
- **Display** — PROJECTS results (read-only poll; owns no backend routes).

**Seams (named cross-module edges):** Meet→Operations `scheduleFinalized`,
Bracket→Operations `drawGenerated`, Operations→Display `matchStateChanged`.
Operations→Bracket *advancement* is deliberately **UNWIRED** (pinned by
`moduleContract.test.ts`). Bracket results flow through `POST /bracket/commands`
(idempotent); legacy `/bracket/results` still exists.

**Data:** SQLite is the source of truth; Supabase is a mirror via a crash-safe
outbox (`sync_service.py`). `commands`/`sync_queue`/`match_states` are local-only.

### Known architecture violations still open (dependency-cruiser, all `warn`)

`platform-no-app` = **0** (ratcheted to error in Phase 2, clean). `no-cross-product`
= **11**, unchanged since Phase 5:

| Edge(s) | Count | Assessment |
| --- | --- | --- |
| `WorkspaceShellSurface` → 6 `settings/*Tab` | 6 | Legit aggregator edge |
| `WorkspaceOverview` → `hub/{hubSignals,hubGrouping}` | 2 | Legit consumer edge |
| `OpsDetailRail` → `bracket/MatchDetailPanel` | 1 | **Real debt** (ops renders bracket UI) — design call |
| `OperationsProduct` → `bracket/BracketScheduleModal` | 1 | **Real debt** — design call |
| `opsBlock.ts` → `bracket/bracketLabels.ts` | 1 | Minor (labels util); candidate for shared relocation |

Clearing the 3 `operations → bracket` edges (or accepting them) is the blocker to
ratcheting `no-cross-product` warn→error. See ADR 0011 + `debt-log.md`.

---

## 3. Metrics trend (Phase 0 → Phase 5 → now)

| Metric | Phase 0 baseline (06-30) | Phase 5 (07-01) | Phase 6 now |
| --- | --- | --- | --- |
| Frontend tests (vitest) | 720 | 743 | **743** |
| Backend tests (pytest) | 569 | 590 | **590** |
| Total tests | 1289 | 1333 | **1333** |
| eslint | 0 err / 87 warn | 0 err / 85 warn | **0 err / 85 warn** |
| depcruise violations | 17 (14 ncp + 3 pna) | 11 (11 ncp + 0 pna) | **11 (11 ncp + 0 pna)** |
| Modules cruised | 423 | 410 | **410** |
| knip unused files | 18 | 3 | **3** (all intentionally kept) |
| knip unused exports | 37 | 2 | **2** (displayPresets, kept by decision) |
| knip unused types | 59 | 9 | **9** (8 contract mirrors + DisplayPreset) |
| knip unused deps | 12 + 2 dev | 0 + 0 | **0 + 0** |
| knip duplicate exports | 2 | 1 | **1** (`slotToTime` alias, intentional) |
| radon: blocks / avg / >10 | not measured | 690 / A(3.94) / 54 | **690 / A(3.94) / 54** |
| FE coverage (lines) | 34.92% | unchanged | **unchanged** (no FE logic changed 5→6) |
| BE+engine coverage | 81% (backend+engine) | 80% (scheduler_core scope) | **unchanged** (no backend changed 5→6) |
| jscpd duplication | 2.38% | — | — (not re-run; no code churn) |

**Reading the trend:** the debt paydown is visible and monotonic — depcruise 17→11,
knip dead-code effectively to only the documented intentional-kept set, tests +44.
**Phase 6 added no code churn** (docs-only + a confirmatory code sweep), so the code
metrics are identical to Phase 5 — exactly the expected outcome for a doc-consolidation
phase. Complexity is healthy in aggregate (avg A; only 54 of 690 blocks above the >10
threshold).

---

## 4. Debt-log status (since Phase 5)

- **Resolved (Phase 5):** the unused export/type/dependency backlog (exports 37→2,
  types 60→9, deps 14→0, duplicate 2→1) — see `debt-log.md` **Cleared**.
- **This phase (6):** documentation staleness swept — 9 canonical docs corrected,
  3 historical trees banner-labeled. Code sweep found **no new dead code and no new
  complexity-threshold crossings** since Phase 5, so nothing met the removal bar
  (ABSOLUTE RULE respected: diff, not re-derive).
- **Newly found:** none in code. (One prior mis-finding — a supposed "design-system
  undeclared deps" bug — was corrected in Phase 5; re-confirmed here: those deps were
  dead `manualChunks` strings, since removed.)
- **Still deferred (need a design decision or a scoped cover-and-modify, not mechanical
  cleanup):**
  - **F-ARCH-3** — `matchStateStore` ownership (shared vs Operations-owned).
  - **3 `operations → bracket` edges** — the last `no-cross-product` debt.
  - **Engine coverage / locked functions** — see below.
  - `displayPresets` unit — **kept by product decision** (not debt).
  - Broad ruff (`E,I,B,UP` ~1506) — Kyle gate decision.
  - **Frontend complexity — still unmeasured** (radon is Python-only; add ESLint
    `complexity` report-only or `ts-complex` to close this gap).

### Highest-priority remaining item

**`scheduler_core/engine/backends.py:GreedyBackend.solve`** — complexity **E (37)** at
**19%** coverage, and **`bridge.py:SchedulingProblemBuilder.build`** — **C (19)** at
**19%**. These are the codebase's only genuine "locked functions" (high complexity +
low coverage). Per `CODE_HEALTH.md` Part 2 they need a deliberately-scoped
cover-then-modify pass (characterization tests first) *before* any engine refactor —
**not** routine feature work. `validation.py:find_conflicts` is worse by raw score
(**F 68**) but is 83% covered, so it's a decompose-when-touched candidate, not locked.

---

## 5. Verification gate (at this snapshot)

| Gate | Result |
| --- | --- |
| `tsc -b` | **0 errors** |
| eslint | **0 errors** / 85 warnings |
| vitest | **743 passed** |
| depcruise | **0 errors** / 11 warnings |
| ruff (`select=F`) | **clean** |
| pytest | **590 passed** |
| `vite build` (real) | **passes** (verified Phase 5 finish; no code changed since) |
| `docs:build` (VitePress dead-link) | run in Step 6 of this phase |

All meet or beat the Phase-0 baseline floor (`00-baseline.md §What "green" means`).
