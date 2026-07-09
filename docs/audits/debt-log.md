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
- **DrawView crashes on unknown score blobs.** `DrawView.tsx:896` does `result.score?.sets.map(...)` — a `score` dict without a `sets` array throws a TypeError (whole draw view down); a `sets` array of the wrong element shape renders "undefined-undefined" pills. The backend stores the blob opaquely (`RecordResultIn.score: Optional[dict]`), so any non-frontend writer (sync restore, import, API client) can poison it. Guard with `Array.isArray` + per-set shape check, fall back to winner-only. The blob's expected shape (`{sets:[{sideA,sideB}]}`) is documented nowhere — worth a line in ADR 0006. Size S.
- **Deleted-workspace polling never stops → endless 403 storm.** With a bracket page open, deleting the tournament (this or another session) leaves the ~2.5s poll running forever against 403s; no user-facing "workspace gone" state. Also: access-check runs before existence-check, so deleted reads as *Forbidden*, not *Not Found*. Stop polling on 403/404 + surface a dead-workspace banner. Size M.
- **The Run nav item is two different surfaces.** Meet-only workspaces get the legacy meet Live page (Director/Disruption/Re-optimize/XLSX, score entry); hybrid workspaces get the SP-G1b unified board (queue/inspector/zoom, no meet tools). Same label, disjoint affordances — an operator moving between workspaces re-learns the page. Deliberate convergence decision needed (this is the F-ARCH-3 neighborhood). Size L (decision first).
- **Actual-time chips render off-axis.** On both Run boards, playing/done chips place at wall-clock-derived actual slots while the axis only spans the planned range — chips float in unlabeled space far right (meet-only board) or off-viewport (hybrid). Any day that starts late (or any compressed replay) degrades this way. Extend the axis to `max(planned, actual, now)` or clamp actuals. Size M.
- **Lifecycle states never reach the control plane.** A 43%-played (or 100%-done) tournament still shows Hub filter *Draft*, header pill *DRAFT*, "Next action: Set date", Overview "0 to do"/"results ✓", "Next up" listing already-finished matches as `Sched` (reads schedule, not match states), and a fully-resolved draw card saying *STARTED*. Display shows *DELAYED* on a finished meet. No surface says "in progress" or "complete". Size M–L (one derived-status seam would fix most).
- **Plan invites destructive actions mid-tournament.** Plan page on a live tournament: footer says "Solver idle — click Generate to begin", Generate/Re-plan enabled, finished matches drag-able, no played-state indication on chips. A mid-day Generate re-solves everything. Needs a planFinalized/live guard or confirm. Size M.
- **Match naming is triple-dialect.** Same match is `MS1` (chips), `M1` (Plan list "Match" column), `#1` (Run advisory banner "Match #1 was called…"). Operators must mentally join three keys; the advisory is the worst (no court/event context). Standardize on eventRank codes. Size S.
- **Minor**: "(moved)" tag shows on an in-progress match that was never moved (mid-day sim, MD2) — trigger appears to be command-path court/slot writes differing from schedule assignment; Radix Select uncontrolled→controlled warning (console, Hub/Display config); Score "Save" disabled-state styling reads as enabled; bracket draw card leaks internal event id (`ev-de`) as a label chip; solver jargon in Plan header ("Score: 50", "Time: 0ms").
