# Debt Log

The **visible backlog** the code-health practice feeds (`CODE_HEALTH.md` #6):
when a change spots debt outside its own scope, it lands here instead of being
silently fixed (scope creep) or silently dropped. Each entry: **what · where ·
why it matters · rough size**. This is a living file — add rows as debt is
found, strike rows as it is cleared, and keep it honest so "the log growing
faster than it shrinks" stays a real signal (that's the trigger to run another
bounded program, per `CODE_HEALTH.md`).

Seeded 2026-07-01 (SP-REFACTOR **Phase 5**) from a fresh measurement pass + the
design-gated items deferred out of Phases 1–4; reconciled again in **Phase 6**
(doc-consolidation sweep — a fresh knip/radon/depcruise **diff** confirmed no code
drift since Phase 5, so no entries changed state). The current authoritative
snapshot is `docs/audits/06-state-of-codebase.md`; the ledger is
`REFACTOR_PROGRESS.md`.

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

Per `CODE_HEALTH.md` #10, this is the highest-risk category. **Both were covered
in Phase 7** (`docs/audits/07-locked-functions.md`, commit `caf5275`) → they are
**no longer locked** (now high-complexity-but-*covered* = decompose-when-touched,
not load-bearing-untouchable). Decomposition (Part-2 Steps 4–5) is **HELD** — see
the ⏳ note below.

| Function | Location | Complexity | Coverage | Status |
| --- | --- | --- | --- | --- |
| `GreedyBackend.solve` | `scheduler_core/engine/backends.py:67` | **E (37)**, class E(38) | ~~19%~~ → **97%** | ✅ characterized (Phase 7). **Open Q resolved:** confirmed a *fallback / alt-backend with no in-repo production caller* (`analyze_impact` → isolated; live path uses `CPSATBackend`). Low blast radius → decomposition low-value. |
| `SchedulingProblemBuilder.build` | `scheduler_core/engine/bridge.py:99` | **C (19)**, class C(20) | ~~19%~~ → **96%** | ✅ characterized (Phase 7). **Corrected claim:** it does **NOT** "guard every schedule build" — the Meet/Bracket production paths build `ScheduleRequest` directly (`api/schedule.py:111`, `services/bracket/adapter.py:89`); `build` is only reached via `live_ops.reschedule` (itself in-repo-unused). |

⏳ **Decomposition HELD (decompose-when-touched).** Cover-before-modify is done;
the risk-reduction goal is met. Because both functions have **zero in-repo
production callers**, decomposition (Steps 4–5) is low-risk *and* low-value, and
`build`'s is entangled with the config-drop bug below. **Kyle decided HOLD at the
Phase-7 Step-3→4 checkpoint (2026-07-01)** (see `07-locked-functions.md §5`). Do it
*when a future task brings you into these functions*, not speculatively.

## Latent bugs found while characterizing (Phase 7) — FIXED 2026-07-01

Found while characterizing; per the Part-2 STOP rule they were pinned (not fixed)
in the characterization commit, then **fixed in a follow-up** on Kyle's call
("fix the bugs"). Both verified — full backend suite 620 green.

| Bug | Where | Fix ✅ |
| --- | --- | --- |
| **`build` config field-drop** | `scheduler_core/engine/bridge.py:118–137` | Both rebuilds switched from a hand-listed copy to `dataclasses.replace(config, …)` (prior art: `handle_court_outage`), so every field is preserved except the overridden one(s). The tripwire test flipped to a preservation regression-guard (`test_freeze_override_preserves_all_config_fields` + `..._rolling_horizon_..._preserving_fields`). **No production impact** — the override path had no in-repo caller. |
| **Stale example** | `examples/badminton_event_setup.py` | Rewritten to the current API (manual `PlayUnit`s → `SchedulingProblemBuilder.build` → `CPSATBackend`); the cut generation layer (`PoolGenerationPolicy`/`CompetitionGraph`) is gone for good. Verified runnable (`Status: optimal, assignments: 6`). |

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

The backlog pass was **finished** 2026-07-01 (see **Cleared**). The mechanical
export/type/dep items are done; what remains is **one product call** + the
design-gated items above + engine coverage.

| Item | Detail | Status |
| --- | --- | --- |
| **Unused exported types (dto)** | Verified each against `dto.generated.ts` (the authoritative backend contract): **deleted 10** truly-dead frontend-private types + **un-exported 11** used-internally-by-kept-types in `dto.ts`, and **un-exported 6** back-compat internal shapes in `bracketDto.ts`. **8 backend-mirror types intentionally retained** (`CourtClosure`, `SoftViolation`, `AvailabilityWindow`, `PlayerImpact`, `SchoolImpact`, `MetricDelta`, `ProposalKind`, `SuggestedAction`) — present in the generated contract, so deleting would create reconcile drift. They read "unused" to knip but are the hand-maintained mirror | ✅ done |
| **Unused package deps** | Removed `@radix-ui/react-dialog` + `@radix-ui/react-tooltip` + `date-fns` (genuinely dead — verified zero imports anywhere; existed only as dead `vite.config.ts` `manualChunks` strings, which were pruned too) and `tailwindcss-animate` (design-system's tailwind preset provides it). knip-ignored `@radix-ui/react-select` + `clsx` + `tailwind-merge` (live via design-system, named in `manualChunks`) and `openapi-typescript` (the `generate-api` CLI). **knip unused-deps → 0** | ✅ done |
| **Duplicate export** (`slotToTime`\|`formatSlotTime`) | **Accepted as intentional** — `formatSlotTime` is a live alias (`export const formatSlotTime = slotToTime`) with ~20 call sites each. Renaming is risky cosmetic churn with no behavior benefit; not debt | ✅ accept |
| **Unused exports (display presets)** | `DISPLAY_PRESETS` / `getPreset` / `DisplayPreset` (`displayPresets.ts`) — a coherent, authored preset-picker unit (8 venue presets) in the live Display module. **Product decision (2026-07-01): KEEP for the future picker.** Intentionally retained; knip will keep flagging them as unused — expected, not overlooked. | ✅ keep (by decision) |
| **Engine coverage** | ~~`backends.py`/`bridge.py` 19%~~ → **97%/96% (Phase 7 ✅)**; `live_ops.py` 40%, `extraction.py` 68% remain | ⏳ backends/bridge done; live_ops/extraction are light characterization wins when touched |

> Note: knip still reports the 8 retained contract mirrors + the displayPresets
> unit + the `slotToTime` alias as "unused." That is expected and intentional —
> they are kept for the reasons above, not overlooked.
>
> Classification caveat: mirror-vs-private was decided by name-matching each
> flagged type against `dto.generated.ts`. If a hand-written `dto.ts` name ever
> diverged from its generated counterpart, a mirror type could have been
> classified private and deleted. This cannot affect runtime (types are
> compile-time only, tsc-verified) — worst case is minor reconcile drift, and the
> deleted set is unmistakably frontend-private by nature (import DTOs, Graph viz,
> the `TournamentExportV2` tied to the removed file manager). Flagged so a future
> `generate-api` reconcile isn't surprised.

---

## Measurement / enforcement gaps

| Gap | Detail | How to close |
| --- | --- | --- |
| **Frontend complexity unmeasured** | `radon` is Python-only; the FE (`products/scheduler/frontend/src`) has no complexity number | Add ESLint `complexity` as a **report-only** (`warn`) rule, or run `npx ts-complex` ad-hoc, and record the FE tail here |
| **Broad ruff deferred** | Gate is `select=["F"]`; the `E,I,B,UP` set is ~1506 findings (mostly stylistic, + `B008` FastAPI `Depends()` false-positives) | Kyle gate decision — see `pyproject.toml` + `CLAUDE.md` lean-gate philosophy |
| **Stale gate ratchets** | `no-cross-product` (warn, blocked on the 2 ops→bracket edges above); a complexity gate (`radon`/`xenon` threshold) is *not* wired | All are **Kyle** decisions — logged here as candidates, not tightened unilaterally (`CODE_HEALTH.md` #5) |

---

## Cleared

- **2026-07-01 (Phase 7 — bug fixes, follow-up)** — fixed the two latent bugs found
  during characterization: (1) `bridge.build` config field-drop → `dataclasses.replace`
  on both rebuilds (`bridge.py:118–137`), tripwire tests flipped to preservation
  guards; (2) rewrote the stale `examples/badminton_event_setup.py` to the current
  API (verified runnable). Full backend suite 620 green, ruff-F clean. Verified the
  same copy-and-override bug class exists nowhere else (grep: all other `ScheduleConfig`
  builds are from params/DTO inputs, not config copies; `handle_court_outage` already
  used `replace`).
- **2026-07-01 (Phase 7 — cover-before-modify)** — characterized both locked
  engine functions: `GreedyBackend.solve` **19%→97%**, `SchedulingProblemBuilder.build`
  **19%→96%** (28 golden-master tests, commit `caf5275`, test-only). Confirmed both
  are library surface with **no in-repo production caller** (corrected the "build
  guards every schedule build" claim). They are no longer *locked*. Decomposition
  (Steps 4–5) **held** as decompose-when-touched (low blast radius). Found + logged
  two latent bugs (config field-drop; stale example) above. An independent
  fresh-context review verified all claims + added 2 tripwires (30 tests total, full
  suite 620 green). See `docs/audits/07-locked-functions.md`.
- **2026-07-01 (Phase 5 — practice install)** — stale `no-cross-product` comment
  in `.dependency-cruiser.cjs` ("16 known" → 11); 5 truly-dead FE symbols removed +
  `DEFAULT_EVENT_COLOR` un-exported.
- **2026-07-01 (Phase 5 — backlog pass)** — unused **exports 37→3**, **exported
  types 60→36**, **duplicate exports 2→1** (dropped the redundant `apiClient`
  default), and **7 unused deps + `@types/uuid`** removed. 44 symbols un-exported
  (used internally, tsc-verified), the rest deleted. Dep removals verified by
  `npm install` (clean −107-line lockfile diff) + a real `vite build` + 743 tests
  green. See `REFACTOR_PROGRESS.md` Phase 5.
- **2026-07-01 (Phase 5 — backlog finish)** — dto/bracketDto **types 36→9** (the 9
  = 8 retained contract mirrors + `DisplayPreset`): deleted 10 dead + un-exported
  17, verified vs `dto.generated.ts`. Deps: removed 4 more (`react-dialog`,
  `react-tooltip`, `date-fns`, `tailwindcss-animate`) + pruned their dead
  `manualChunks` entries; knip-ignored the 4 legit config/CLI deps → **knip
  unused-deps 0**. Cleaned the `SettingsNav` orphan left by the `SettingsShell`
  deletion. `slotToTime`/`formatSlotTime` accepted as an intentional alias.
  Verified: `tsc` + real `vite build` + eslint 0-err + **743 tests** + pytest 590.
  **Corrected a prior mis-finding:** the "design-system undeclared deps" latent bug
  was wrong — `react-dialog`/`react-tooltip`/`date-fns` are imported nowhere; they
  were dead `manualChunks` strings, now removed.
- **2026-07-01 (Phase 6 — doc consolidation + staleness sweep)** — grounded the
  canonical docs against code (codanna down → grep/Read; 4 Explore agents + a
  change-set pass). Fixed **9** canonical docs (5 layer/package READMEs + `data-flow`,
  `operations`, `repo-layout`, `build-on-the-engine`) and banner-labeled the
  historical trees (`superpowers/**`, `architecture/workspace-suite/**`, the
  2026-06-25 handoff). Code sweep was a **diff** vs this log: no new dead code, no new
  complexity crossings → nothing removed. Outputs: `06-doc-inventory.md`,
  `06-stale-doc-findings.md`, `06-state-of-codebase.md`.
