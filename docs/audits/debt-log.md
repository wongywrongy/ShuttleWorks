# Debt Log

The **visible backlog** the code-health practice feeds (`CODE_HEALTH.md` #6):
when a change spots debt outside its own scope, it lands here instead of being
silently fixed (scope creep) or silently dropped. Each entry: **what · where ·
why it matters · rough size**. This is a living file — add rows as debt is
found, strike rows as it is cleared, and keep it honest so "the log growing
faster than it shrinks" stays a real signal (that's the trigger to run another
bounded program, per `CODE_HEALTH.md`).

Seeded 2026-07-01 (SP-REFACTOR **Phase 5** — see `REFACTOR_PROGRESS.md`) from a
fresh measurement pass + the design-gated items deferred out of Phases 1–4.

---

## Measurement snapshot — 2026-07-01

**Cyclomatic complexity** (`radon cc 6.0.1`, `scheduler_core` + backend
`app/adapters/services/repositories/api`, tests/migrations excluded):

- **690 blocks analyzed · average `A` (3.94)** — the codebase is healthy in
  aggregate; this is a *targeted* backlog, not a systemic problem.
- **54 blocks rank above the >10 threshold** (`C`+). The tail, not the body.
- Re-run: `python -m radon cc scheduler_core products/scheduler/backend/{app,adapters,services,repositories,api} -nc -s --total-average -e "*/tests/*,*/migrations/*,*/alembic/*"`

**Engine coverage** (`pytest --cov=scheduler_core`): **80%** total (590 BE tests).

**Frontend complexity: UNMEASURED** (gap logged below — `radon` is Python-only).

---

## Locked-function candidates (high complexity **AND** low coverage)

Per `CODE_HEALTH.md` #10, this is the highest-risk category. Treat as
load-bearing; **cover before modifying** (#11). Do **not** refactor these under
routine feature work without the characterization safety net first.

| Function | Location | Complexity | Coverage | Note / open question |
| --- | --- | --- | --- | --- |
| `GreedyBackend.solve` | `scheduler_core/engine/backends.py:67` | **E (37)**, class E(38) | **19%** | Missing lines 68–187 = the whole method. **Open Q:** is `GreedyBackend` a live path or a rarely-exercised fallback behind the CP-SAT backend? 19% suggests fallback — confirm before investing; that changes the priority. |
| `SchedulingProblemBuilder.build` | `scheduler_core/engine/bridge.py:99` | **C (19)**, class C(20) | **19%** | Missing 111–190. Bridge from DTO → engine problem; a safety net here guards every schedule build. |

**Rough size:** each is a bounded "worked example" of the Part-2 method
(measure → characterize → seam → extract), ~0.5–1 day incl. tests. NOT started
in Phase 5 (design-gated engine work; the reframe kept Phase 5 to installing the
practice). These are the obvious first Part-2 targets when engine work is next on
the table.

## High complexity but well-covered (decompose *when touched*, not locked)

Complex, but the tests exist — so they are **not** high-risk in the locked sense.
Apply the Boy-Scout rule (#2) when a task already brings you into them; don't
open them speculatively.

| Function | Location | Complexity | Coverage |
| --- | --- | --- | --- |
| `find_conflicts` | `scheduler_core/engine/validation.py:71` | **F (68)** — worst single score | 83% |
| `generate_event_route` | `products/scheduler/backend/api/brackets.py:1624` | **F (41)** — worst backend | BE ~81% (API-tested) |
| `Objective.apply` | `scheduler_core/engine/constraints/objective.py:68` | E (36) | 85% |
| `_slice_for` | `products/scheduler/backend/api/schedule_repair.py:103` | E (35) | — |
| `compute_impact` | `products/scheduler/backend/services/schedule_impact.py:77` | E (32) | — |
| `_hydrate_session` | `products/scheduler/backend/api/brackets.py:442` | D (29) | — |
| `parse_matches_csv` | `products/scheduler/backend/services/csv_importer.py:70` | D (26) | — |
| `on_solution_callback` | `scheduler_core/engine/cpsat_backend.py:124` | D (23) | 94% |
| `process_command` | `products/scheduler/backend/repositories/local.py:1504` | D (21) | — |

Moderate watch: `extraction.py:extract_solution` C(18)@68%; `engine/live_ops.py`
40% coverage (low complexity, low coverage — a light characterization win).

---

## Design-gated (need Kyle's decision, not mechanical work)

Carried over from SP-REFACTOR Phases 1–4. These are **not** "do them" items —
they are decisions to make, then execute.

| ID | What | Why it matters | Size |
| --- | --- | --- | --- |
| **F-ARCH-3** | `matchStateStore` ownership: stays in shared `store/` vs. move to Operations | Moving it *creates* new `no-cross-product` violations (Meet + Bracket also consume it). Two reasonable options, no code-driven winner. See `docs/audits/01-findings.md §F-ARCH-3` + ADR 0011. | Design call, then S |
| **ops→bracket UI edges** | `OpsDetailRail→MatchDetailPanel`, `OperationsProduct→BracketScheduleModal` | The **last 2** `no-cross-product` violations. Clearing them (or accepting them as legit) is the blocker to ratcheting that rule warn→**error**. | Design call, then M |

---

## Cleanup backlog (behavior-preserving; mechanical but not free)

| Item | Detail | Careful-of | Size |
| --- | --- | --- | --- |
| **Unused exports** | knip 2026-07-01: **37** exports flagged. Phase 5 deleted the truly-dead whole-symbol subset; the rest are "drop the `export`" (used internally) | `ADMIN_SEGMENTS`/`*_SEGMENTS`/`WORKSPACE_HOME` and `DtoName`/`DtoRegistry` are contract surface — the `moduleContract.test.ts` pins them; verify before un-exporting | M |
| **Unused exported types** | knip: **59** types flagged | Most in `api/dto.ts` — feeds `make generate-api` (hand-reconciled). A type "unused" to knip may be an intentional codegen/public surface. Verify against the codegen path first | M |
| **Unused package deps** | knip: **12** deps + **2** devDeps (`@radix-ui/*`, `class-variance-authority`, `date-fns`, `tailwindcss-animate`, `@types/uuid`, `openapi-typescript`) | **Do NOT remove blind.** Cross-check the `packages/design-system` package and any dynamic/string usage first — removing a still-needed dep breaks the build/runtime, not the gate | M, risky |
| **Duplicate exports** | `slotToTime` \| `formatSlotTime` (`src/lib/time.ts`) — pick one canonical name; `apiClient` \| `default` (`src/api/client.ts`) | both live; rename touches call sites | S |
| **Engine coverage** | `backends.py`/`bridge.py` 19%, `live_ops.py` 40%, `extraction.py` 68% | cover-before-modify candidates (see locked table) | see above |

---

## Measurement / enforcement gaps

| Gap | Detail | How to close |
| --- | --- | --- |
| **Frontend complexity unmeasured** | `radon` is Python-only; the FE (`products/scheduler/frontend/src`) has no complexity number | Add ESLint `complexity` as a **report-only** (`warn`) rule, or run `npx ts-complex` ad-hoc, and record the FE tail here |
| **Broad ruff deferred** | Gate is `select=["F"]`; the `E,I,B,UP` set is ~1506 findings (mostly stylistic, + `B008` FastAPI `Depends()` false-positives) | Kyle gate decision — see `pyproject.toml` + `CLAUDE.md` lean-gate philosophy |
| **Stale gate ratchets** | `no-cross-product` (warn, blocked on the 2 ops→bracket edges above); a complexity gate (`radon`/`xenon` threshold) is *not* wired | All are **Kyle** decisions — logged here as candidates, not tightened unilaterally (`CODE_HEALTH.md` #5) |

---

## Cleared

- **2026-07-01 (Phase 5)** — stale `no-cross-product` comment in
  `.dependency-cruiser.cjs` ("16 known" → current count); truly-dead
  whole-symbol exports removed (see `REFACTOR_PROGRESS.md` Phase 5 for the list).
