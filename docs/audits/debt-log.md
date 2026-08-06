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
| `GreedyBackend.solve` | `scheduler_core/engine/backends.py` | ~~E (37)~~ → **A (5)** (class ~~E38~~→B7) | ~~19%~~ → **99%** | ✅ characterized **+ decomposed** (Phase 7). Split into `_GreedyPlacer` (engine) + `_locked_match_ids` (intake) + `_result` (emit). **Open Q resolved:** confirmed a *fallback with no in-repo production caller*. |
| `SchedulingProblemBuilder.build` | `scheduler_core/engine/bridge.py` | ~~C (19)~~ → **A (2)** (class ~~C20~~→A3) | ~~19%~~ → **97%** | ✅ characterized **+ decomposed** (Phase 7). Split into `_select_unit_ids`/`_apply_horizon`/`_build_players`/`_build_matches`/`_build_previous_assignments`. **Corrected claim:** does **NOT** "guard every schedule build" — Meet/Bracket build `ScheduleRequest` directly (`api/schedule.py:111`, `services/bracket/adapter.py:89`). |

✅ **Decomposition DONE (2026-07-01, `d09396c` + `1534756`).** Initially held at
the Step-3→4 checkpoint, then reversed on Kyle's call ("finish the last part").
Both decomposed along intake → engine → emit with the characterization net green
throughout; complexity dropped and distributed (largest new unit B9); an independent
fresh-context review verified behavior-equivalence line-by-line. Neither is *locked*
any longer. See `07-locked-functions.md §7`.

## Latent bugs found while characterizing (Phase 7) — FIXED 2026-07-01

Found while characterizing; per the Part-2 STOP rule they were pinned (not fixed)
in the characterization commit, then **fixed in a follow-up** on Kyle's call
("fix the bugs"). Both verified — full backend suite 620 green.

| Bug | Where | Fix ✅ |
| --- | --- | --- |
| **`build` config field-drop** | `scheduler_core/engine/bridge.py:118–137` | Both rebuilds switched from a hand-listed copy to `dataclasses.replace(config, …)` (prior art: `handle_court_outage`), so every field is preserved except the overridden one(s). The tripwire test flipped to a preservation regression-guard (`test_freeze_override_preserves_all_config_fields` + `..._rolling_horizon_..._preserving_fields`). **No production impact** — the override path had no in-repo caller. |
| **Stale example** | `examples/badminton_event_setup.py` | Rewritten to the current API (manual `PlayUnit`s → `SchedulingProblemBuilder.build` → `CPSATBackend`); the cut generation layer (`PoolGenerationPolicy`/`CompetitionGraph`) is gone for good. Verified runnable (`Status: optimal, assignments: 6`). |

## Live-ops match-state divergence (found 2026-07-01, frontend-revamp verification) — ✅ FIXED (same day)

Found while visually verifying the Run surface; **reproduced end-to-end**, then fixed
on Kyle's "fix things in your follow up" call.

| What | Where | Status |
| --- | --- | --- |
| **Commands didn't write through to `match_states`** | `repositories/local.py` `process_command` Step 5 set `matches.status` only; the Run surface polls the legacy `/match-states` table, so a command-applied call/start vanished on reload and a retried Call 409'd forever ("cannot transition from 'playing' to 'called'") | ✅ **Fixed**: the apply branch now mirrors the transition into the `match_states` row in the same transaction (legacy spelling map; `retired`→`finished`; postpone/uncall clear live timing). Pinned by `tests/unit/test_commands.py` §8 (mirror + postpone-clears). QA residue (WS1/WS2 stuck canonical-`playing`) healed via the legacy PUT route → both consistent `finished`. |
| **409 toast leaks internals** | conflict toast on the Run surface shows the raw match UUID + `request <id>` instead of the match code ("WS2") | ✅ **Fixed 2026-07-02**: `useLiveTracking` now resolves the meet match's display code (`Match M12`, via `matchNumber`) at both toast call-sites instead of `matchId.slice(0,8)`. The backend `detail` is kept as secondary diagnostic text. |

---

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
| **workspace→display UI edges** (added 2026-07-03, Display-redesign Task 6) | `displayConfig/DisplayPreview.tsx → display/publicDisplay/{CourtsView,displayPresets}` — the new Display Configuration board-layout preview reuses the public board's actual card renderer + preset table for visual fidelity (2 new `no-cross-product` **warns**, confirmed via `npm run depcruise`: 0 errors). Same shape as the ops→bracket edges above: accept as a legit consumer edge, or relocate `CourtsView`/`displayPresets` to a neutral shared location (`components/` or a `products/display/shared/`) per the `SourceChip` precedent. | Design call, then S |

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
| **Bracket drag-validate ignores roster availability** (found 2026-07-02, SP-D7 S2) | `services/bracket/validation.py:109` (`validate_bracket_move`) builds engine Players **without** the new `player_extras` channel, so `POST /bracket/validate` won't flag a drag into a roster player's blocked-out window — the subsequent `/pin` re-solve *does* honor it (the solver just moves things), so this is a UX-advisory gap, not a correctness hole. Fix = thread `session.player_extras` into `validate_bracket_move` → `build_players(extras=...)` (+ a conflict kind for window violations). ~1–2 h incl. tests | ✅ **Fixed 2026-07-02**: `validate_bracket_move` takes `player_extras` and passes `extras=` to `build_players`; the route threads `session.player_extras`. `find_conflicts` already emits `type="availability"`/`"rest"`, so no new conflict kind was needed. Pinned by `test_validate_move_respects_roster_availability` (feasible without extras, availability conflict with them). |
| **Participant seeds don't survive an echo through `eventUpsert`** (found 2026-07-02, SP-D7 S3) | `ParticipantOut` (`api/brackets.py:229`) serializes `id`/`name`/`members` but **not** `seed` (stored in participant metadata), so any flow that echoes an event's current participants back through the create-or-replace upsert silently drops seeds set via CSV/JSON import or direct API. Pre-existing gap: the Draws picker always rebuilt the full list seedless; the S3 roster entry toggles echo the same shape. No UI assigns seeds today, so no live regression. Fix = add `seed` to `ParticipantOut` (incl. the new `EventOut.participants`), mirror on frontend `Participant`, echo in `toUpsertParticipant` + the picker. ~1 h incl. tests | ✅ **Fixed 2026-07-02**: `ParticipantOut.seed` added (both flat + `EventOut.participants`, from `metadata["seed"]`); frontend `Participant.seed` mirror; `toUpsertParticipant` echoes seed; the Draws picker carries an existing participant's seed on re-commit. Pinned by `test_upsert_event_preserves_seeds_through_echo` + `rosterEvents.test.ts` (`toUpsertParticipant`). |
| **Meet Matches row-click dead zone** (found 2026-07-02, SP-D7 S5 live pass) | ~~Side A/B cell wrappers swallowed clicks on their empty space~~ **FIXED 2026-07-02**: the wrapper's `onClick` now stops propagation only for clicks on actual editors (`button`/`input`/the `[data-player-picker]` dropdown, or any click while the picker is open); empty-space clicks bubble to the row and open the panel. Regression test in `MatchesSpreadsheet.test.tsx` ("no dead zone") | ✅ fixed |
| **Plan board grid→zoom-bar doubled hairline** (found 2026-07-02, P12 T5 live pass) | Inside the shared board component: the last court row's `border-b border-border/60` sits adjacent to the zoom bar's `border-t border-border/60` (~2px line at 60% alpha). Pre-existing, not from the P12 commits (Run doesn't double there — a scrollbar strip separates them). Fix = drop one of the two hairlines. Size XS | ✅ **Fixed 2026-07-02**: dropped the `border-t` from the Plan zoom bar (`UnifiedOpsBoard`); the grid's last-row `border-b` is now the single seam. Run keeps its own `border-t` (scrollbar-separated). |
| **Hub "Next up" can show already-played meet matches** (found 2026-07-03, Phase-14 review) | `api/workspace_signals.py` `_meet_match_signals` builds Next-up from the schedule assignments in `data` sorted by slot, with no finished-filter — a meet match's finished state lives in the `match_states` table, not the loaded `data` blob, so filtering it would break the summary's no-per-row-query guarantee. On a mid-run/completed meet, Next-up surfaces the earliest (likely already-played) matches as "Sched". **Bracket is already filtered** (its blob carries `actual_end_slot`). Meet fix options: (a) accept (Hub is a glance; Operations Run is the live surface), (b) add a per-tournament grouped finished-match-id set to `RowCounts` and exclude them (one more grouped query — trades the zero-query purity), or (c) cap Next-up to future slots vs a stored "now". Size S–M · **product call** | ⏳ open |
| **Shared StatusPill `pulse` glow is dormant** (found 2026-07-02, P12 T5 live pass) | `2601f93` gave pulsing dots sw-pulse + own-hue glow, but no reachable surface passes `pulse` to `src/components/StatusPill.tsx` (Display-page pills are separate local components). Utilities verified synthetically. Either wire `pulse` on live-ish pills (e.g. bracket Live tab) or fold the Display pills onto the shared component. Size S | ✅ **Fixed 2026-07-02**: the bracket "Started" (live) draw pill now renders `dot pulse` (`BracketDrawsTab.StatusPillFor`), so the `sw-pulse` + own-hue glow is reachable on a genuinely-live status; "Generated" uses a static `dot`. |
| **Error toasts stack without auto-dismiss** (observed 2026-07-02, SP-D7 S5 live pass) | ~~Repeated 409s accumulated identical toasts~~ **FIXED 2026-07-02**: `uiStore.pushToast` dedupes on (level, message) — an identical toast refreshes the existing entry (latest detail wins) instead of stacking. Verified live (double MD2X generate → one toast). Errors remain persistent (no TTL) by design | ✅ fixed |
| **`useAdvisories()` call in `MeetDisplayPage` is now dead weight** (found 2026-07-03, Display-redesign Task 3 — removed the operator `AdvisoryBanner` from the public board) | The hook's own source of a tournament id (`useTournamentIdOrNull()`) is a **route path param only** — no `?id=` query fallback (unlike `useLiveTracking`/`useDisplaySync`). On the standalone `/display?id=` route that id is always null, so the poll effect returns before firing — the call is inert there. On the embedded AppShell "TV preview" tab, `AppShell` already mounts `useAdvisories()` globally (gated to `kind==='meet'`), so the call is redundant there too. With the banner gone, nothing on this page reads `useUiStore.advisories` anymore. Left in place unchanged — removing it is a behavior change outside Task 3's scope (import + render-block removal only). Fix = delete the `useAdvisories()` call + its import from `MeetDisplayPage.tsx` once confirmed no other consumer needs it re-added here. Size XS | ⏳ open |
| **Bracket result `reason` not mirrored to Supabase** (found 2026-07-14, task 5b — commit `1a55358` threaded a new `reason` field (walkover/retired/forfeit) through the bracket result path, including the outbox payload) | `services/sync_service.py` `_bracket_result_to_payload` briefly pushed `"reason": result.reason` to the Supabase upsert, but the cloud `bracket_results` schema is applied out-of-band (see `docs/deploy/cloud.md`'s migration chain: `step_a_matches_table_and_rls`, `step_t_a_bracket_schema_and_rls`, `step_t_d_bracket_realtime_publication`) and has **no** `reason` column — an unknown key fails the upsert, and the outbox row's `attempts` climbs and caps at 10, silently degrading sync for any deployed cloud mirror. Reverted the key (local SQLite already persists `reason` via migration `k4a7b1c9d3e5`, and the UI reads the local API, so nothing user-facing regresses). Fix = add a `reason` column to Supabase `bracket_results` via a migration in the documented chain style, THEN re-add `"reason": result.reason` to `_bracket_result_to_payload`. Size S | ✅ **closed 2026-08-06 — obsolete, not fixed.** The mirror was removed entirely in SP-CLOUD-3 ([ADR 0012](../decisions/0012-remove-the-supabase-mirror.md)): `services/sync_service.py` is deleted, `_bracket_result_to_payload` has zero call sites, and `sync_queue` was dropped in migration `p9a3b7c1d5e6`. There is no cloud schema to add a column to. Local SQLite already persists `reason` (migration `k4a7b1c9d3e5`) and the UI reads the local API, so nothing was ever user-visible. The prescribed fix is now unperformable — recorded rather than deleted so the entry's disappearance does not read as a silent fix. |
| **`matchStateStore.liveState` is now fully dead** (found 2026-07-14/15, perf pass 2 — render-hotspot fix) | Perf pass 2 removed `useLiveTracking`'s 1s `setInterval` that wrote a fresh `liveState` object into the store every second via the now-deleted `setCurrentTime` setter (it forced every `useLiveTracking()` consumer, e.g. the 746-line `MatchControlCenterPage`, to re-render once a second regardless of data). Investigation (grep across `src` for `currentTime`/`liveState`/`liveTracking.`) found **no component reads `useLiveTracking().liveState`** — `MeetDisplayPage`/`BracketDisplayPage` compute their own page-local `now`/`currentTime` (needed for freshness derivation, untouched here) rather than consuming the store's copy. `buildLiveState`/`setLastSynced`/the `LiveScheduleState.currentTime` DTO field were deliberately left in place (pass-1 sync code, out of scope) but are removal candidates: `setLastSynced` still rebuilds a new `liveState` object every 5s in `syncMatchStates` for a value nothing reads. Fix = delete `liveState`/`buildLiveState`/`setLastSynced`/the DTO field once confirmed still unused. Size S | ⏳ open |

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

- **2026-07-15 (bracket solver-options negative guard)** — closed the
  2026-07-14 debt-log entry: added
  `test_bracket_solver_options_ignores_config_time_limit`
  (`tests/unit/test_bracket_hydrate_config.py`), which sets
  `solverTimeLimitSeconds` in the camel config and asserts
  `_bracket_solver_options(...)` still returns the passed-in
  session/request `time_limit_seconds`, unmodified by the config. Test-only
  change; backend suite green.
- **2026-07-02 (loose-ends pass)** — cleared the five open polish/UX items in one
  sweep alongside the Hub dashboard integration: the 409-toast raw-UUID (meet match
  code at the `useLiveTracking` call-sites), the Plan zoom-bar doubled hairline
  (dropped the zoom bar's `border-t`), the dormant shared `StatusPill` pulse (wired
  on the live "Started" bracket pill), the bracket drag-validate availability gap
  (`player_extras` threaded into `validate_bracket_move`), and participant-seed drop
  on upsert echo (`ParticipantOut.seed` + `toUpsertParticipant`/picker echo). Each
  pinned by a test (see the struck rows above). Gates: frontend tsc/eslint 0-err,
  backend ruff-F + pytest green.
- **2026-07-01 (Phase 7 — decompose, Steps 4–5)** — decomposed both engine functions
  along intake → engine → emit: `GreedyBackend.solve` **E37→A5** (extracted `_GreedyPlacer`
  + `_locked_match_ids` + `_result`); `SchedulingProblemBuilder.build` **C19→A2** (extracted
  `_select_unit_ids`/`_apply_horizon`/`_build_*`). Largest new unit B9; coverage held (99%/97%);
  full suite 620 green; independent review verified behavior-equivalence line-by-line. Commits
  `d09396c` + `1534756`. See `07-locked-functions.md §7`.
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

## Display redesign follow-ups (found in the 2026-07-04 final whole-feature review — non-blocking)
- **Standings vs columns use different court-count bases.** `MeetDisplayPage.tsx` drives `defaultColumns()` from the *visible* court count (`displayedCourtRows.length`) but `standingsPlacement()` from the *raw* count (`config.courtCount`). Hiding courts down to ≤6 shrinks the column grid but does NOT flip a large venue's standings from `rotate` back to `side`. Both are sensible operator-overridable defaults; pick one base if unified behavior is wanted. Size S.
- **Grid-mode column default is now responsive on the real board (behavior note, not a bug).** Task 7's `defaultColumns` replaced the old hard `GRID_COLS[2]` fallback — the public board in grid mode now auto-picks 2/3/4 columns by court count instead of always 2. Intended, within the Display blast radius (not scheduling). Recorded so it isn't a surprise.
- Minor cosmetics deferred: `Optional[list[int]]` vs `typing.List` style (schemas.py); standings rotation dwell 15s + side-panel `w-96` magic numbers; `previewByCourt` computes lanes for busy courts that don't consume them; `actualCourtId ?? courtId` inlined 3× in MeetDisplayPage.

## Full-flow UI audit findings (2026-07-09, tournament-sim–seeded dev server + browser walk — non-blocking)
Found by driving four simulated tournaments (mid-day meet / full meet / DE bracket / mixed) through the real UI at :5173 → :8600. Ordered by severity.
**Resolution (same day, commits `65d9edd` + `bf8309b`):** DrawView score guard, deleted-workspace poll stop, Run-board axis extent, PanZoomCanvas drag crash, useSmoothedAssignments hydration deadlock, phantom (moved), Display-preview freshness, signals.phase lifecycle seam (Hub/shell/inspector/draw-card), live-aware+eventRank nextUp, one naming dialect (advisories/suggestions/Plan list), live-day Generate guard, Run eyebrow alignment. STILL OPEN: Run-surface convergence decision (meet Live page vs unified board — F-ARCH-3 neighborhood); Radix Select controlled/uncontrolled warning; ev-de id chip on draw cards; solver jargon in Plan header; 403-vs-404 ordering on deleted tournaments (backend).

- **DrawView crashes on unknown score blobs.** `DrawView.tsx:896` does `result.score?.sets.map(...)` — a `score` dict without a `sets` array throws a TypeError (whole draw view down); a `sets` array of the wrong element shape renders "undefined-undefined" pills. The backend stores the blob opaquely (`RecordResultIn.score: Optional[dict]`), so any non-frontend writer (sync restore, import, API client) can poison it. Guard with `Array.isArray` + per-set shape check, fall back to winner-only. The blob's expected shape (`{sets:[{sideA,sideB}]}`) is documented nowhere — worth a line in ADR 0006. Size S.
- **Deleted-workspace polling never stops → endless 403 storm.** With a bracket page open, deleting the tournament (this or another session) leaves the ~2.5s poll running forever against 403s; no user-facing "workspace gone" state. Also: access-check runs before existence-check, so deleted reads as *Forbidden*, not *Not Found*. Stop polling on 403/404 + surface a dead-workspace banner. Size M.
- **The Run nav item is two different surfaces.** Meet-only workspaces get the legacy meet Live page (Director/Disruption/Re-optimize/XLSX, score entry); hybrid workspaces get the SP-G1b unified board (queue/inspector/zoom, no meet tools). Same label, disjoint affordances — an operator moving between workspaces re-learns the page. Deliberate convergence decision needed (this is the F-ARCH-3 neighborhood). Size L (decision first).
- **Actual-time chips render off-axis.** On both Run boards, playing/done chips place at wall-clock-derived actual slots while the axis only spans the planned range — chips float in unlabeled space far right (meet-only board) or off-viewport (hybrid). Any day that starts late (or any compressed replay) degrades this way. Extend the axis to `max(planned, actual, now)` or clamp actuals. Size M.
- **Lifecycle states never reach the control plane.** ~~A 43%-played (or 100%-done) tournament still shows Hub filter *Draft*, header pill *DRAFT*, "Next action: Set date", Overview "0 to do"/"results ✓"~~, "Next up" listing already-finished matches as `Sched` (reads schedule, not match states), ~~and a fully-resolved draw card saying *STARTED*~~. Display shows *DELAYED* on a finished meet. Size M–L (one derived-status seam would fix most). **Mostly closed:** the `signals.phase` seam landed 2026-07-10 (Hub row action, shell badge, inspector, draw card) and SP-UI-1 closed the **Overview** half on 2026-08-06 — it is now phase-keyed and says Setup/Ready/Live/Complete outright. Still open: the meet `nextUp` finished-match filter (its own row above), Display's *DELAYED* on a finished meet, and the Hub *facet* set, which still partitions on the operator-managed `status` column (`Draft`/`Active`) rather than the derived phase, so a live event still files under *Draft*.
- **Plan invites destructive actions mid-tournament.** Plan page on a live tournament: footer says "Solver idle — click Generate to begin", Generate/Re-plan enabled, finished matches drag-able, no played-state indication on chips. A mid-day Generate re-solves everything. Needs a planFinalized/live guard or confirm. Size M.
- **Match naming is triple-dialect.** Same match is `MS1` (chips), `M1` (Plan list "Match" column), `#1` (Run advisory banner "Match #1 was called…"). Operators must mentally join three keys; the advisory is the worst (no court/event context). Standardize on eventRank codes. Size S.
- **Minor**: "(moved)" tag shows on an in-progress match that was never moved (mid-day sim, MD2) — trigger appears to be command-path court/slot writes differing from schedule assignment; Radix Select uncontrolled→controlled warning (console, Hub/Display config); Score "Save" disabled-state styling reads as enabled; bracket draw card leaks internal event id (`ev-de`) as a label chip; solver jargon in Plan header ("Score: 50", "Time: 0ms").

## Residual polish from the 2026-07-09 design-skills audit (post-fix pass — all non-blocking)
Audited against `.agents/skills/shuttleworks-design` (archetype/token/voice rules) on post-fix screenshots. The lifecycle/naming/axis/guard fixes verified as landing; remaining, by weight:
- **Advisory duplication + tone**: the same advisory renders as BOTH the top banner and a red error toast (two Review buttons); on Plan the toasts are error-red for what is an operational nudge — brand tone puts over-time in the amber called/late ramp. Render once; demote to amber. Size S–M.
- **Repair strip legibility**: "0 min finish, 0 moves" has no unit/direction and `Apply` with 0 moves invites "apply what?" — turn the metric into a sentence ("saves ~0 min, moves 0 matches"). Match-code fix for the title already landed (`_repair_title` eventRank) — pending a backend restart to show. Size S.
- **One hue, two meanings**: Run OUTLINE legend uses orange for both Resting and Late, blue for both Selected and Impacted ("color is status" violation). Late keeps amber + `LATE +n`; Resting → neutral dashed. Size S.
- **Freshness pill vs lifecycle badge**: Display preview shows shell `COMPLETE` beside board `LIVE` (freshness) — spectator-calm vocabulary is deliberate on the TV, but in the operator preview the adjacency misreads; consider `Updated · 2s` phrasing in preview only. Size S.
- **Solver verb pile-up**: Generate / Re-plan / Re-optimize / Apply all visible with no destructiveness hierarchy (Generate now carries the live-day guard; the others don't). Ties into the Run-convergence decision. Size M.
- Minor: `Solutions: –`/`Score: 50` jargon; unlabeled green `Idle` health chip; unlabeled red check-in dots on Plan rows; standings `0L` in red; `COURT 1 —` dangling dash + duplicate fullscreen affordances; 12h clock on Display vs 24h axis on Run; hybrid board strikethrough reads "cancelled" for done; DE round selector R1–R6 doesn't say which bracket it scopes.

## Viewer read-only vocabulary — remaining surfaces (2026-07-13, audit A2-followup)
The **correctness** half is closed: no viewer write leaves the browser. The two
seams that were ungated — `hooks/useProposals.ts` (Commit repair / Commit move)
and `api/bracketClient.tsx` (**every** bracket mutation) — now refuse
client-side, and `platform/domain/permissions.ts` fails closed on an unknown
role.

To be precise about what was at risk: the backend already required
`operator` on all of those routes, so a viewer never could corrupt data. The bug
was the client experience — the press went to the wire, 403'd, and offered a
retry that could never succeed. What remains below is purely **vocabulary**:
controls that render enabled for a viewer and then no-op. Nothing here is unsafe;
each is a control that should say "you can't" before it is pressed, not after.

Gated so far: the live-day clusters (Run/workflow cards/MatchDetailsPanel incl.
Sub, Remove, Move, Mark overrun, Cancel match, Close court), Generate, roster
Add-school + Bulk-import, Add-match, and — via self-gating shared components —
every `ConfirmDeleteButton` row delete and every bracket `WinnerButton`.

Still rendering enabled for a viewer, by surface:
- **Meet roster**: `PlayerDetailPanel` (school select, availability, min-rest,
  notes, event-rank toggles); `positionGrid/*` (assign/unassign/add-partner,
  column reorder/hide/reset).
- **Meet matches**: `MatchesSpreadsheet` per-row event input + `PlayerCellEditor`
  side pickers; `RegenerateMenu`.
- **Bracket**: `BracketDrawsTab` (create/generate/delete event),
  `BracketDataSection` (remove/reset), `BracketRosterTab`, `BracketPlayerFields`,
  `BracketEngineSection`, `DrawView` (generateNext, scoring), `ParticipantPicker`,
  `BracketScoreEntry`, `BracketViewHeader`. (All are *refused at the seam* — this
  is the one area where the gap is most visible, since bracket had no gating at
  all before.)
- **Workspace/admin**: `SharingTab`, `SyncBackupsTab`, `ModulesSettingsTab`,
  `VenueScheduleTab`, and the `displayConfig/` layout editor.

Size S each, mechanical: `useCanEdit()` folded into the file's existing
`locked`/`disabled` expression. The pattern to copy is `MatchDetailsPanel`
(`const locked = updating || !canEditWorkspace`) or, for a control that is always
a mutation, self-gate it like `ConfirmDeleteButton` / `WinnerButton`.

**Verification note:** the unit suite cannot prove this. It mocks `useBracketApi`
and the store seams, which is exactly why an ungated bracket write path survived
a green 1,100-test suite. The real check is the viewer flow in
`e2e/tests/interaction-smoke.spec.ts` (now running in CI): it asserts zero
`POST/PUT/PATCH/DELETE` leave the browser as a viewer.

- ~~**2026-07-14 · bracket/contingency**~~ ✅ **resolved 2026-07-15**:
  `record_result` commands carry `reason: walkover|retired|forfeit`, persisted
  end-to-end locally (scheduler_core `Result` → DB column → DTO). PRODUCT
  DECISION (2026-07-15): **BYE-downstream-only**. A `retired`/`forfeit` result
  now routes its LOSER exactly like a walkover for the loser feed only — the
  affected loser's consolation/plate/`feeder_take='loser'` slot becomes a BYE
  — but the stored `Result` keeps `walkover=False` / `reason` set; a
  retirement/forfeit is not reported as a walkover. Winner advancement is
  unchanged. Deliberately NO automatic withdrawal from the player's OTHER
  draws — the operator decides that manually per draw (out of scope by
  design, not deferred). Implementation: single predicate
  `services.bracket.advancement.loser_cannot_continue(walkover, reason)`,
  used by `_loser_participant_id`; the auto-walkover BYE sweep
  (`_sweep_walkovers`) and its own result construction are untouched. Tests:
  `tests/unit/test_advancement_loser_routing.py::test_retired_loser_is_bye_and_plate_cascades`
  and `::test_forfeit_loser_is_bye_and_plate_cascades` (twins of the existing
  `test_walkover_loser_is_bye_and_plate_cascades`), plus a negative guard
  `::test_plain_result_with_no_reason_routes_loser_normally`. Entry points:
  `app/schemas.py BracketCommandRequest.reason`,
  `BracketMatchDetailPanel.ContingencySection`,
  `services/bracket/advancement.py`.
- ~~**2026-07-14 · bracket solver-options negative guard untested**~~ ✅ **fixed
  2026-07-15**: added `test_bracket_solver_options_ignores_config_time_limit`
  (`tests/unit/test_bracket_hydrate_config.py`) — asserts
  `_bracket_solver_options(5.0, {"solverTimeLimitSeconds": 999}).time_limit_seconds
  == 5.0`, proving `config.solverTimeLimitSeconds` does not override the
  session/request time budget. Behavior was already correct (per the
  function's docstring); only the regression guard was missing. See
  **Cleared** below.

- ~~**2026-07-15 · bracket GET is a full session rebuild per request**~~ ✅
  **resolved 2026-07-15**: added a bounded-staleness in-process cache,
  `services/bracket/response_cache.py` — `GET /tournaments/{id}/bracket`
  serves the cached serialized `TournamentOut` when younger than
  `TTL_SECONDS` (2.0 s, below the frontend's 2.5 s poll period so staleness
  never exceeds existing poll latency), and rebuilds via `_hydrate_session` +
  `_serialize_session` on a miss. Every mutating bracket route (create,
  delete, schedule-next, schedule-next/commit, event upsert/patch/generate/
  delete, rounds/next, results, commands, match-action, pin, assign,
  unassign, import.json, import.csv — 17 sites) calls `invalidate(tid)`
  after its write, before returning; `PUT /tournaments/{id}/state
  ?clearSchedule=true` (`api/tournaments.py`) also invalidates when it nulls
  bracket assignments. The command path's POST-then-immediate-GET (the one
  user-visible staleness case) is covered explicitly. Fail-safety: a missed
  invalidation site degrades to ≤2 s staleness then self-heals — never
  permanent — and the cache assumes the single uvicorn process CLAUDE.md
  documents (no cross-process coherence). Tests:
  `tests/unit/test_bracket_response_cache.py` (cache-module unit tests +
  cache-hit-skips-hydrate, write-invalidation incl. the command path, TTL
  expiry, `clearSchedule` invalidation) — full backend suite (804 tests)
  green with the cache live, proving invalidation coverage rather than
  disabling the cache in tests.
- **2026-07-15 · GET /tournaments/{id}/state recomputes meet standings per
  call** (`api/tournaments.py` `_meet_standings_for`: module-catalog lookup +
  an extra `match_states.list_for_tournament` read + `compute_meet_standings`
  over all matches on every GET) and the debounced 500 ms PUT writes the
  whole blob whose `scheduleHistory` grows unboundedly over a tournament's
  life (every PUT also snapshots a backup row). Not the measured lag source
  today, but both scale with tournament size. Fix directions: standings memo
  keyed on results version; cap/compact `scheduleHistory`. Size S–M.
- **2026-07-15 · RunSurface's RunInspector column not yet on DetailDock**
  (`products/operations/run/RunSurface.tsx` ~382-436): the Live Run surface
  keeps its own always-mounted inspector column instead of the shared
  `DetailDock` host every other detail pane now uses (docked width column +
  container-query table reflow + narrow-viewport overlay fallback). It does
  NOT exhibit the push-on-click bug (it is persistent, so width never
  changes on selection), which is why it was deferred from the 2026-07-15
  docked-pane rework. Aligning it would unify the last rail onto one
  primitive and give it the narrow-viewport fallback. Size S.
- **2026-07-15 · docked-pane + polish rework — residuals** (from the
  DetailDock/LockRibbon/polish sessions; all shipped-around, none blocking):
  - **Hard-lock read-only is visual, not semantic.** `LockedFieldset`'s
    `sw-readonly` restores full contrast (via `!important` overrides of the
    per-control `disabled:` utilities) but controls stay natively `disabled` —
    not keyboard-focusable, values not selectable. True per-control
    `readOnly`/`aria-readonly` means touching Toggle/Select/Slider
    individually. Size M.
  - **The new interaction-smoke scenario has not been executed.** The
    docked-pane spec block in `e2e/tests/interaction-smoke.spec.ts` (and it is
    the ONLY gate on real container-query reflow — jsdom can't) was written
    but not run: it needs the Docker stack + seed-smoke fixture. Run it before
    trusting the reflow gate. Size S (just run it).
  - **`minContentWidth={760}` on BracketDrawsTab is a hand-summed magic
    number** (fixed-cell total with Format collapsed). If DRAW_COLUMNS
    changes width, it silently drifts; derive it or pin it with a test. Size S.
  - **Gantt header time-labels may bleed** onto the following (label-less)
    column since the `overflow-visible whitespace-nowrap` clipping fix; at
    extreme zoom-out two labels could touch. Cosmetic. Size S.
  - **DetailDock close-retention shows stale children ≤450 ms** (deleted
    entity's pane content persists for the close animation). Accepted
    trade-off; noting in case a deleted-row flash ever confuses someone.
  - **Members page can only name the OWNER** (summary.ownerName); other
    members still render derived id chips because the members API exposes no
    name/email. Backend gap. Size S–M (API + row).
- **2026-07-16 · /code-review follow-ups (post-fix residuals)**:
  - **DetailDock overlay-fallback keeps docked semantics.** In the narrow
    fallback the pane COVERS the table yet stays `role="complementary"` with
    no outside-click dismissal (children are hardcoded `variant="docked"`).
    Right fix: dock exposes its mode to children (context/render-prop) so
    overlay mode re-acquires dialog role + outside-mousedown close. Size M.
  - **Venue & schedule lock signal is meet-only.** The LockRibbon + new
    confirm-unlock guard read the meet store flag; a bracket-only lock
    (committed bracket schedule / draw in play) shows nothing there because
    bracket lock state needs bracket data not loaded at workspace level.
    Backstop today: the server 409s (CONFIG_LOCKED/DRAW_STARTED). Size M.
  - Cleanup shortlist from the same review (below the findings cap): shared
    date-format helper (fmtDate is ~7th private copy), LockRibbon inline SVG
    → phosphor `LockSimple`, shared `prefersReducedMotion()` (2 copies),
    `DetailPanel.width` dead API, dead `::-webkit-scrollbar` rules on
    Chromium ≥121 + thin scrollbars silently applying to the TV display,
    `useContainerWidth` per-resize setState (threshold/hysteresis + initial
    sync measurement), ops board lacks column-priority degradation when the
    Courts dock takes width. Size S each.
- **2026-08-03 · SP-CLOUD-1 Phase 0 audit findings (adjacent, out of slice scope)**:
  - **docker-compose.release.yml sets no DATABASE_URL** — the release image
    falls back to `sqlite:///./local.db` on a read-only rootfs, so first
    write fails. Add the explicit URL the main compose already carries. Size S.
  - ~~**`test_backup_create_and_list_newest_first` created_at-tie flake**~~
    **CLEARED 2026-08-03** (with a diagnosis correction: the query already
    carried the `, id DESC` tiebreaker — but `id` is a *random* UUID, so the
    tiebreaker makes same-tick ordering deterministic, not "newest". The test
    was the bug: it relied on sub-tick timestamp separation. Fixed by
    stamping strictly increasing `created_at`, the same pattern the
    neighboring rotate/list_all tests already used.)
  - **Bracket `POST /events/{id}/generate` ignores session solver config** —
    builds `TournamentDriver` with no `solver_options` (brackets.py:2225-2230),
    silently dropping the session's time_limit/deterministic/seed. Size S.
  - ~~**docker-compose.dev.yml header advertises `make dev-postgres`**~~ —
    ✅ **CLEARED 2026-08-04.** The target was added (plus `dev-postgres-stop`)
    rather than the comment reworded: `CLOUD_PROGRESS.md` referenced it too,
    and it is the quickest way to get a Postgres for the dual-dialect tests.
  - **Nothing enforces "a streaming generator must not touch the repository".**
    The repo-closing middleware (`app/main.py`) runs when `call_next` returns,
    which for a `StreamingResponse` is *before* the body streams — so the
    session goes back to the pool while the generator is still yielding. The
    one live streaming route (`schedule_next_round_stream`) is safe only
    because `_hydrate_session` materializes everything into a Pydantic object
    first; a future route that lazy-loads inside its generator would fail in
    production under a shape unit tests don't reproduce (TestClient drains the
    stream differently). Verified safe today, 2026-08-04 — the gap is that
    it's an unguarded invariant, not a live bug. Candidate check: assert in a
    test that no `StreamingResponse` route both depends on `get_repository`
    and references it after the first yield, or give streaming routes their
    own session lifetime. Size S.
  - **A worker that loses its lease keeps solving to completion.** The
    heartbeat ownership guard (2026-08-04, `solve_jobs.heartbeat`) stops a
    ghost worker from *extending* a lease it lost, and `_record_outcome`
    already discards its result — but nothing tells the ghost's child to stop.
    It burns a core until it finishes, then throws the answer away. Fixing it
    means giving the beat a return channel to the runner: `solve_runner`'s
    `heartbeat` param is `Callable[[], None]`, so a "you lost the lease"
    signal has nowhere to go — either widen that type or fold the check into
    the existing `cancel_check` (which already kills the child and is called
    on the same 2s tick). Cost of not fixing: one wasted solve per lease loss,
    bounded and rare. Size S.
  - **api/README.md still documents an EventSource SSE flow** (now fully
    retired — solves are jobs; the meet SSE routes answer 410); and
    `unscheduledMatches` is returned by every solve but rendered nowhere. Size S.
  - ~~**scheduler_core `_player_matches()` iterates hash-ordered sets**~~ —
    ✅ **Fixed 2026-08-04 (SP-CLOUD-3, commit below).** The honest fix landed:
    `get_player_ids` now returns a sorted list, so `_player_matches`' key
    order — and therefore constraint emission order — follows from the input
    alone. Measured: before, four `PYTHONHASHSEED` values gave four distinct
    CP-SAT model fingerprints (`5d6d4ff8…` pinned); after, six seeds give one
    (`88f2ee35…`). All three compensations were removed **together** per
    Rule 7 — the child's `PYTHONHASHSEED=0` pin, its hard-refusal to run
    unpinned, and `services/determinism.py` entirely. A warning whose stated
    justification has become false is worse than silence. The replacement
    guard is a test that double-solves *unpinned*
    (`tests/unit/test_engine_build_order.py`), which the log line could never
    be. Negative control performed: dropping the `sorted()` fails 3 of its 4
    tests.

- **2026-08-03 — SP-CLOUD-2 (auth & tenancy) adjacent findings:**
  - **GDPR/export/delete tooling is a pre-launch requirement** (explicitly
    deferred by the SP-CLOUD-2 prompt): account deletion, data export, and
    the `owner_email` PII already mirrored into Supabase `tournaments` all
    need a story before public launch. Size L.
  - **`GET /tournaments` loads all rows and filters in Python** against the
    caller's memberships; fine at solo scale, wrong shape for multi-tenant
    cloud. Move the membership filter into SQL (index
    `ix_tournament_members_user` now exists). Size S.
  - ~~**`GET /invites/{token}` is a token-existence oracle**~~ — ✅ **Fixed
    2026-08-04 (SP-CLOUD-3, commit `7e62f0c`).** One uniform 404
    (`INVITE_NOT_FOUND`) for unknown / revoked / expired / workspace-deleted on
    both resolve and accept (accept's 410 collapsed in too); the public DTO
    dropped `valid`/`expiresAt`/`revokedAt`. Timing equalized structurally — a
    query-count probe showed 1 vs 2 queries, so the no-invite branch now does a
    sentinel lookup. Pinned by `tests/test_invite_oracle.py`.
  - ~~**Supabase mirror ignores the new tenancy columns** (`org_id` gap + the
    unpopulated-RLS story)~~ — ✅ **Closed 2026-08-04 (SP-CLOUD-3 / 0.E,
    commit `d3a46b6`).** Resolved by deletion, not by fixing: the mirror was
    removed entirely. Both halves of this entry die with the subsystem. See
    [ADR 0012](/decisions/0012-remove-the-supabase-mirror).
  - **VitePress docs don't yet cover SP-CLOUD-2** (auth model, tenancy seam,
    display capability link) — `backend/README.md` is the current source;
    fold into `docs/architecture/` + `contracts/` pages. Size S.
  - **Members remain unmanageable over HTTP** (no remove/demote/transfer
    endpoints) — unchanged from pre-slice, now more visible since People &
    Access shows real identities. Size M.

- **2026-08-04 — SP-CLOUD-3 adjacent findings:**
  - **No in-product off-site durability for local mode — documented as operator
    responsibility, not an oversight.** `tournament_backups` rows live in the
    same database as the data they protect, so a lost disk loses both. The
    Supabase mirror nominally covered this dimension but never actually did (it
    was one-way, restore-less, and never configured), so removing it in
    [ADR 0012](/decisions/0012-remove-the-supabase-mirror) took away nothing
    real. **This is a deliberate choice, recorded so a future reader doesn't
    rediscover it as a bug:** local mode is one operator on their own machine,
    where off-site copies are their responsibility exactly as for any desktop
    application, and `docs/how-to/install-local.md` states that plainly. Cloud
    mode — where it genuinely isn't optional — has a real answer in
    `install-selfhost.md` (`pg_dump` + `pg_dumpall --globals-only`, encrypted,
    off-host, with a monthly restore drill). Revisit only if local mode ever
    stops being single-operator. Size — (accepted, not scheduled).
  - **`dto.generated.ts` freshness is on the honour system.** Nothing gates it,
    and it had silently drifted since before SP-CLOUD-2 Phase 3 (missing every
    `/auth/*` and `/display/{token}/*` route) until regenerated in `bb29b21`. A
    CI check that regenerates and diffs would catch it. Size S.
  - **`_enforce_cloud_secrets` is API-shaped.** It fires on `ENVIRONMENT=cloud`
    and demands `AUTH_MODE`, `SESSION_COOKIE_SECURE`, and SMTP — none of which
    the standalone worker reads, so a worker-only host would need dummy SMTP
    credentials just to boot. Make the validator role-aware. Size S.
    *(Scheduled: SP-CLOUD-3 Phase 3.)*
  - **`/health/deep` never touches the database** — it checks data-dir
    writability and the ortools import, so it reports `healthy` with Postgres
    unreachable. A health check that cannot fail turns an outage into a silent
    outage. Size S. *(Scheduled: SP-CLOUD-3 Phase 3, 0.F.6.)*
  - **Schema-vs-model drift is unchecked, and we know it exists.** Removing
    `sync_queue` surfaced that migration `e2a5f3b8c1d6` created
    `ix_sync_queue_created_attempts` while the `SyncQueue` model **never declared
    it** — the ORM metadata and the real schema had silently diverged. It was
    caught only because writing a downgrade forced reproducing the true schema;
    nothing in the test suite or CI would have found it, and there is no reason
    to assume `sync_queue` was the only table affected. Proposed check: on a
    scratch database, run `alembic upgrade head`, then compare the resulting
    schema against `Base.metadata` (either `metadata.create_all` on a second
    scratch DB and diff, or `alembic revision --autogenerate` and assert the
    generated migration is empty). Cheap CI step, dual-dialect, would find the
    rest. Size S.
  - **`docs:freshness` tracked globs are too coarse.** Four areas reported BEHIND
    after the mirror removal purely because an unrelated symbol left `models.py`
    and a comment changed in `useBracket.ts`; none of those pages ever mentioned
    the mirror. A freshness signal that cries wolf gets ignored, and the next
    real staleness will look identical. Either narrow the globs (per-symbol or
    per-directory rather than whole files like `database/models.py`, which every
    slice touches) or teach it to ignore commits that only remove content the
    docs never referenced. Size S.
  - **`/health/metrics` full-table aggregate.** The status counts are a
    `GROUP BY` over every row in `solve_jobs`, including terminal rows retained
    for `JOB_RETENTION_DAYS` (30 by default) — a sequential scan on Postgres on
    every scrape, growing between prunes. The obvious narrowing (restrict the
    `WHERE` to live statuses) is **wrong**: `succeeded` and `failed` are part of
    the endpoint's published response, so filtering them out would silently
    zero two documented numbers. The right fix is an index on `solve_jobs.status`
    if volumes ever make the scrape visible. Not doing it now: at present
    volumes the scan is not measurable, and it costs a migration. Size S.
    *(Found in the 2026-08-05 review; deliberately left after confirming the
    suggested fix would have been a regression.)*
  - **`OverflowMenu` disabled items still close the menu.** Activation is blocked
    in the click handler, but Headless UI closes the menu on select regardless,
    so clicking a disabled item dismisses the menu while doing nothing — it
    reads as a dead control. The doc comment now states this; the behaviour is
    unfixed. Needs either an `onClose` guard or a non-`MenuItem` render for
    disabled entries. Size S. *(2026-08-05 review.)*
  - **The backend CSV importer is dead code.** `backend/services/csv_importer.py`
    (`CSVImporterService.parse_roster_csv` / `parse_matches_csv`) and
    `RosterImportDTO` in `app/schemas.py` have **zero references** anywhere in
    the repo — no route, no service, no test. SP-SEC-1 Phase 0 filed the
    unguarded `int(parts[3])` in it as finding SEC-16 (a malformed column raises
    an uncaught `ValueError`); Phase 1 established the code is unreachable, so
    the finding is not exploitable and was closed rather than fixed — patching
    dead code just makes it look maintained. Delete both, or wire the importer
    up if roster CSV import is still wanted (the UI's CSV affordances are all
    export today). Size S. *(SP-SEC-1 Phase 1.)*
  - ~~**The deploy runbook's path is the wrong case.**~~ **RESOLVED 2026-08-05**
    (SP-SEC-1 Phase 3 runbook commit — 26 occurrences corrected across five
    files; the docs were wrong, not the host). `docs/how-to/deploy.md:66`
    (and `install-selfhost.md:44`) instruct `cd /opt/shuttleworks`; the actual
    deployment is `/opt/ShuttleWorks`, and on the case-sensitive Linux host the
    lowercase directory does not exist, so the runbook's very first step fails.
    Worth fixing carefully rather than blindly: decide whether the *docs* or the
    *host* is wrong (renaming the live directory means recreating the compose
    project name and its volumes, so the docs are almost certainly the thing to
    change). Size S. *(Found in SP-REPO-1 while verifying what cayde ran; not
    fixed there because that slice was no-code-changes.)*
  - **The documented remote worker is not deployed.** `docs/how-to/add-a-worker.md`
    describes `neo` as a remote compute host, and the SP-CLOUD-3 audit's env
    matrix has a `neo (worker)` column, but neo runs no ShuttleWorks container
    at all — its Docker is entirely homelab (jellyfin, signoz, bookstack,
    nginx-proxy-manager). All solve work is carried by cayde's
    `EMBEDDED_WORKER=true`. Either deploy the worker or mark the runbook as
    aspirational; a runbook describing a host that isn't running the thing is
    how an operator loses an hour during an event. Size M (deploy) / S (doc).
    *(Found in SP-REPO-1 while locating the deployment host.)*
  - **`seen_version` is optional on `POST /bracket/results`.** The DTO declares
    it `Optional[int]` and the guard runs only `if body.seen_version is not
    None`, so any caller that omits it is silently unprotected — a fail-*open*
    optimistic-concurrency check. SP-CLOUD-4 closed the identical defect one
    route over by making `If-Match` mandatory on `PUT …/state` (412 when
    absent); this route was left as-is because the frontend already sends the
    token, so tightening it is a small, low-risk follow-up rather than a
    behaviour change anyone would notice. Size S. *(SP-CLOUD-4; re-confirmed
    by the 2026-08-06 review.)*
  - **Two conflict dialects on the same concept.** `PUT …/match-states/{id}`
    answers **412** on a stale version; `PUT …/state` answers **409** with the
    current state in the body. Both are correct in isolation — 412 is the
    strict HTTP reading of a failed precondition, 409-with-state is what lets a
    client reconcile in one round trip — but a codebase should not teach two
    answers for one question. Converging them means changing a shipped, tested
    path with a working client-side counterpart (`MatchVersionMismatch`), so it
    is a deliberate breaking change, not a cleanup. Size M. *(SP-CLOUD-4.)*
  - **Bracket writes advance `state_version` without returning it.**
    `api/brackets.py` persists session metadata and clears draws through
    `upsert_data`, which bumps the concurrency token, but those routes return
    bracket payloads and have no `ETag`. A client that performs a bracket
    action and then saves meet state gets one spurious `409`, which now
    self-heals (the recovery re-reads and re-syncs) but is still a visible
    hiccup. Threading a token through ~21 call sites was judged
    disproportionate to that; the alternative is a small response hook that
    stamps the ETag centrally for any route under `/tournaments/{id}/`.
    Size M. *(2026-08-06 review.)*
  - **`DESIGN.md` still enforces the retired brutalist direction.** The agent
    rulebook's §1.2/§1.3/§1.8.b/§1.9/§1.10/§1.11 describe Signal-Orange, 90°
    corners, and hard-offset-only shadows — none of which ship. The 2026-08-06
    design review added a superseded-rules banner and flipped the §10
    precedence to `tokens.css` → `DESIGN_COLOR.md` → `DESIGN.md`, but the
    individual rule bodies were left intact rather than rewritten: they are
    load-bearing for agents and a blind rewrite risks loosening rules that are
    still correct. The full rewrite (restate each rule against the current
    token ladder, drop the `products/tournament/frontend` consumer) is the
    follow-up. Size M. *(2026-08-06 frontend design review — see
    `docs/audits/15-frontend-design-review.md`.)*
  - **50 raw `<input>` elements remain outside `TextField`.** The review added
    the missing input primitive and adopted it on the auth surface and global
    settings (4 files), leaving ~50 hand-rolled inputs across ~24 files, each
    re-deriving its own border/radius/focus treatment. They are not broken —
    they mostly use `border-border` correctly — so this is drift-prevention,
    not a defect fix, and it is a wide mechanical sweep best done as its own
    slice. Size M. *(2026-08-06 frontend design review.)*
  - **`--status-started` (sky) reads as interactive next to the azure accent,
    and `--module-meet` is the accent hex.** The system's "one accent" rule is
    literally satisfied but perceptually broken: a *scheduled* chip and a
    clickable control are both blue on the Ops board, and the Meet module's
    categorical identity color is the same value as `--action-primary`. Fixing
    it is a token-mapping change, but it moves colors on a shipped operational
    surface, so it belongs with the palette direction decision rather than
    ahead of it. Size S. *(2026-08-06 frontend design review.)*
  - **`Eyebrow` uppercases its text content in JS as well as in CSS.** So
    `<Eyebrow>Details</Eyebrow>` puts `DETAILS` in the DOM while the equivalent
    `<span className={EYEBROW_CLASS}>Details</span>` puts `Details`. Visually
    identical (CSS `uppercase` does the work either way), but screen readers
    may spell out an all-caps string, and it makes the component and the class
    constant disagree about DOM text. Six call sites. Deferred because removing
    it changes DOM text that tests may query, which is unrelated to the config
    unification it surfaced during. Size S. *(2026-08-06 config-surface
    unification — see `docs/audits/15-frontend-design-review.md` §6.)*
  - **A dead workspace link hangs on "Loading workspace…" forever.**
    `/tournaments/{unknown-id}/<segment>` renders the full workspace shell —
    sidebar, module sections, admin nav — for a workspace that does not exist,
    and never leaves the loading state. The only signal is a dismissible toast
    (`TOURNAMENT_NOT_FOUND`), so once it auto-dismisses the surface is a
    permanent spinner with a nav for nothing. A stale bookmark, a shared link
    to a deleted workspace, or a revoked membership all land here. Wants a
    not-found state with a route back to the Hub; `useTournamentState`'s
    hydrate failure is the seam. Size S. *(2026-08-06 full-flow route pass.)*
  - **8 of the 10 e2e spec files are stale and fail against the current UI.**
    `00-sanity`, `02-inline-roster`, `03-auto-generate-matches`,
    `04-solve-happy-path`, `05-drag-reschedule`, `06-persistence`,
    `07-schedule-xlsx-import`, `08-suggestions-inbox` (plus
    `99-baseline-screenshots`) were last touched 2026-05-11 and predate the
    Hub / workspace control-plane redesign. They assert
    `toHaveTitle(/schedul|tournament/i)` (the app is "ShuttleWorks") and
    `getByTestId('tab-setup')` — the horizontal TabBar that CLAUDE.md already
    documents as vestigial. `make test-e2e` reports 19 failures that are all
    rot, so the suite currently provides negative value: a real regression
    would be indistinguishable from the noise. Only
    `interaction-smoke.spec.ts` is in CI and it is actively maintained (16/16).
    Decision needed — repair against the sidebar nav, or delete and let
    interaction-smoke be the e2e surface. Size M. *(2026-08-06 full-flow pass.)*
  - **An unknown workspace segment silently renders Meet Configuration.**
    `/tournaments/{id}/not-a-segment` falls back to the Configuration surface
    while the URL keeps the bogus segment, so URL and content disagree and the
    address is misleading if bookmarked or shared. Unknown segments should
    redirect to `overview` the way unknown top-level routes redirect to the
    Hub. Size S. *(2026-08-06 full-flow route pass.)*
  - **Overview rail has no "last backup" row.** SP-UI-1's rail shows event
    date, public display and collaborators. Last-backup was specified but
    dropped: it needs a second list fetch (`ws-sync`'s backups endpoint) on
    every workspace landing to render a glance-only fact, and the Overview
    otherwise makes exactly one extra call. Add it if/when the summary payload
    or a cheap head endpoint can carry a `lastBackupAt` stamp. Size S.
    *(2026-08-06 SP-UI-1.)*
  - **The `ready` / `live` / `complete` Overview panels are minimal.** SP-UI-1
    shipped `setup` fully and gave the other three honest versions built only
    from data that already exists (`signals.matches`, `signals.nextUp`) —
    structure over completeness, deliberately, rather than faking richness.
    They want real content: live court occupancy, per-event progress, a
    results/export summary. Size M, product call on what each phase owes.
    *(2026-08-06 SP-UI-1.)*
  - **The shell identity bar can disagree with the Overview about a
    workspace's name.** Seen while verifying SP-UI-1: a `ready` workspace whose
    Overview header read "Interaction smoke" showed `Untitled` in the shell top
    bar. The two read different sources (`WorkspaceIdentity` vs the fetched
    summary) and one lags. Pre-existing; not touched by SP-UI-1 because the
    fix belongs to the identity seam, not the Overview. Size S.
    *(2026-08-06 SP-UI-1 verification.)*
  - **`comingSoon` keeps retired vocabulary alive in the contract.**
    `ModuleCountsDTO.comingSoon` and the `coming_soon` module status still
    exist in the backend schema, `dto.ts`, `dto.generated.ts` and ~8 test
    fixtures, but nothing renders a coming-soon state — `modulesFromDto` maps
    the value to `available`. "Coming soon" is retired product vocabulary, so
    the field is dead weight that invites someone to resurface it. Removing it
    touches the DTO contract both sides. Size S, needs a contract call.
    *(2026-08-06 SP-UI-1.)*
