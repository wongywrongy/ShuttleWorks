# 00 — Refactor Program Baseline (behavior-of-record)

**Captured:** 2026-06-30
**Baseline tag:** `pre-refactor-20260630`
**Baseline commit:** `6d8d6e8` (`chore(tooling): commit stability gate + guardrails to settle tree`)
**Branch:** `dev/workspace-suite`

This is the objective baseline every later refactor phase (SP-REFACTOR-2/3/4) is
checked against. **All gates are GREEN at baseline.** No behavior may regress
from the numbers below; coverage must not drop and depcruise violations must not
increase.

> Reproduce any row from the repo root with the command in its "Command" cell.
> Python commands use the repo `.venv` (`.venv/Scripts/python.exe`,
> `.venv/Scripts/ruff.exe`).

---

## Verification gates — pass/fail

| Gate | Command | Result | Detail |
| --- | --- | --- | --- |
| Frontend lint (eslint) | `npm run lint:scheduler` | **PASS** (exit 0) | 87 problems — **0 errors, 87 warnings** (newly-strict rules downgraded to `warn` per the lean-gate policy) |
| Frontend tests (vitest) | `npm --prefix products/scheduler/frontend run test:run` | **PASS** | **720 passed** / 720, 97 test files |
| Arch boundaries (depcruise) | `npm run depcruise` | **PASS** (0 errors) | 17 warnings, 423 modules, 1638 deps (see below) |
| Python lint (ruff, gate = `select F`) | `ruff check products/scheduler scheduler_core` | **PASS** | `All checks passed!` |
| Backend tests (pytest) | `cd products/scheduler && pytest` | **PASS** | **569 passed**, 1 warning, 148s |

**Total test count at baseline: 1289** (720 frontend + 569 backend). No failures,
no xfails masking failures observed. The single pytest warning is non-fatal
(not investigated here; noted for Phase 1C).

---

## Coverage

### Frontend (`vitest run --coverage`, v8)

| Scope | % Stmts | % Branch | % Funcs | % Lines |
| --- | --- | --- | --- | --- |
| **All files** | **34.92** | **80.84** | **59.95** | **34.92** |

Overall statement/line coverage is low because most UI component trees are
exercised via integration rather than unit tests. The **logic layers** that a
refactor would actually touch are the ones that matter — hotspots:

| Path | % Lines | % Funcs | Note |
| --- | --- | --- | --- |
| `src/store/matchStateStore.ts` | **35.95** | **16.66** | Known coupling finding **and** low coverage → highest refactor risk |
| `src/store/preferencesStore.ts` | 0 | 100 | unused? (cross-check knip) |
| `src/store/tournamentStore.ts` | 51.09 | 20 | large store, low func coverage |
| `src/store` (dir) | 50.37 | 28.76 | |
| `src/platform/auth` | 0 | 100 | |
| `src/platform/settings` | 49.25 | 52 | |
| `src/platform/domain` | 97.94 | 100 | well covered |
| `src/products/operations/runtime` | 98.31 | 100 | critical path, well covered ✅ |
| `src/lib` | 79.4 | 85.13 | |
| `src/utils` | 100 | 100 | |

### Backend + engine (`pytest --cov=backend --cov=scheduler_core`)

**TOTAL: 7173 statements, 1348 missed — 81%.** Verified to include **both**
`backend/` and the `scheduler_core/` engine (31 `scheduler_core\…` rows present;
the editable install reports absolute paths, so the engine rows sit above the
`backend\…` block in the raw report). The 81% floor therefore covers the typed
domain core, not just the API layer.

Lowest-coverage backend + engine modules (high blast-radius candidates;
safety-net before touching):

| Module | Stmts | % | Note |
| --- | --- | --- | --- |
| `backend/services/bracket/cli.py` | 129 | **0** | CLI entrypoint, untested |
| `backend/services/csv_importer.py` | 69 | **0** | untested importer |
| `backend/app/paths.py` | 9 | **0** | |
| `backend/services/bracket/formats/round_robin.py` | 39 | **13** | draw format |
| `scheduler_core/engine/backends.py` | 115 | **19** | ⚙️ engine core (solver backend selection) — low floor on the typed domain core |
| `scheduler_core/engine/bridge.py` | 81 | **19** | ⚙️ engine core (CP-SAT bridge) — low floor; highest-value refactor target |
| `backend/services/bracket/io/import_matches.py` | 152 | **43** | |
| `backend/services/bracket/io/export_schedule.py` | 68 | **50** | |
| `backend/app/main.py` | 111 | 68 | |
| `backend/services/sync_service.py` | 162 | **72** | ⚠️ live path (crash-safe outbox) — cover before refactor |
| `backend/repositories/local.py` | 666 | 96 | large but well covered |

---

## Architecture boundaries (dependency-cruiser)

**0 errors, 17 warnings** across 423 modules / 1638 dependencies. Full graph +
violation objects: `docs/audits/00-dependency-graph-baseline.json`.

| Rule | Severity | Count |
| --- | --- | --- |
| `no-cross-product` | warn | 14 |
| `platform-no-app` | warn | 3 |

> Drift note: CLAUDE.md cites "16 known WARN-level cross-product import
> violations." Actual today: **14** `no-cross-product` + **3** `platform-no-app`
> = 17 total. The prose is stale — recorded as a finding (docs, not code).

The 17 violating edges (verbatim):

```
platform-no-app:
  src/platform/product-shell/WorkspaceSidebar.tsx        → src/app/workspace/workspaceNav.ts
  src/platform/product-shell/WorkspaceShell.tsx          → src/app/workspace/workspaceNav.ts
  src/platform/contracts/__tests__/moduleContract.test.ts → src/app/workspace/workspaceNav.ts

no-cross-product:
  src/products/workspace/WorkspaceShellSurface.tsx → src/products/settings/{SyncBackups,Sharing,PeopleAccess,Modules,General,DangerZone}Tab.tsx  (6)
  src/products/workspace/WorkspaceOverview.tsx     → src/products/hub/{hubSignals,hubGrouping}.ts                                                (2)
  src/products/settings/OverviewTab.tsx            → src/products/hub/hubSignals.ts                                                              (1)
  src/products/settings/GlobalSettingsPage.tsx     → src/products/meet/settings/AppearanceSettings.tsx                                           (1)
  src/products/operations/OpsDetailRail.tsx        → src/products/bracket/MatchDetailPanel.tsx                                                   (1)
  src/products/operations/opsBlock.ts              → src/products/bracket/bracketLabels.ts                                                        (1)
  src/products/operations/OperationsProduct.tsx    → src/products/bracket/BracketScheduleModal.tsx                                               (1)
  src/products/bracket/bracketLabels.ts            → src/products/meet/roster/positionGrid/helpers.ts                                            (1)
```

---

## Duplication (jscpd)

`npm run jscpd` — **107 clones, 2.38% duplicated lines** (8797 dup tokens, 2.92%)
across 323 files. Low overall.

| Format | Files | Clones | Dup lines |
| --- | --- | --- | --- |
| python | 51 | 30 | 355 (2.17%) |
| tsx | 167 | 44 | 524 (1.92%) |
| typescript | 105 | 33 | 491 (3.55%) |
| **Total** | **323** | **107** | **1370 (2.38%)** |

---

## Dead code / unused (knip)

`npm run knip` (exit 1 — findings present, not gated):

- **18** unused files
- **12** unused dependencies, **2** unused devDependencies (`@types/uuid`, `openapi-typescript`)
- **37** unused exports
- **59** unused exported types
- **2** duplicate exports
- 2 configuration hints

Full output: `docs/audits/` scratch (`knip.txt`). To be triaged in Phase 1C
(knip can over-report exports consumed only by type or via dynamic paths — each
must be confirmed with codanna `retrieve callers` before it's called dead).

---

## Ruff — the deferred broad set (NOT gated)

The gate is `select = ["F"]` (passes clean). The deferred `E,I,B,UP` cleanup,
for context (`ruff check ... --select E,I,B,UP --statistics`):

**1506 findings, 1087 auto-fixable.** Top rules: `UP006` (493), `UP045` (391),
`B008` (130 — FastAPI `Depends()` false-positives), `UP035` (110), `I001`
(101 unsorted imports), `E501` (100 line-too-long), `E402` (54), `UP017` (53),
`B904` (27 raise-without-from). This matches CLAUDE.md's "~1400 mostly-stylistic"
note. Deferred by policy — not a Phase-2 target unless a slice touches the file
anyway.

---

## What "green" means for later phases

- pytest: **≥ 569 passed**, 0 failed.
- vitest: **≥ 720 passed**, 0 failed.
- eslint: **0 errors** (warnings may only decrease).
- depcruise: **0 errors**, **≤ 17 warnings** (must not increase).
- ruff (gate): `All checks passed!`.
- Coverage: frontend lines **≥ 34.92%**, backend + engine **≥ 81%** — and must
  *rise* on any file a Phase-2 slice touches (safety-net-first rule). The engine
  core (`scheduler_core/engine/backends.py`, `bridge.py`) is at 19% — if a slice
  touches it, safety-net first (see `01-findings.md` F-COV-1).
