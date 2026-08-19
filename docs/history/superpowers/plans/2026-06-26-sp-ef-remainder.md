> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# SP-E/F Remainder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is executed by a background **Workflow** with a per-slice ralph loop (implement → run the slice's acceptance tests → loop until green → independent verifier).

**Goal:** Finish the genuinely-remaining SP-E/F work — bracket scoring + unified two-tab Configuration (E4), a centered bracket-tree canvas (E3), full bracket CP-SAT scheduling with SSE + candidate pool (F2), bracket results through the command queue (F3), and one unified Operations court view (F4) — without re-touching what already shipped.

**Architecture:** The control plane, shared scheduling core, sidebar/venue extraction, and the dedicated Draws page already exist. This plan layers feature work onto those seams. The CP-SAT engine and `build_schedule_config` params builder are already shared; bracket config already round-trips through the same `TournamentConfig` JSON blob as Meet. So most remaining work is frontend, plus one new backend SSE endpoint (F2) and one optimistic-concurrency result endpoint (F3).

**Tech Stack:** FastAPI · SQLAlchemy 2.0 (SQLite + Supabase mirror) · OR-Tools CP-SAT (`scheduler_core`) · Vite/React/TS · Zustand · react-router · Vitest · Playwright (MCP) · pytest · VitePress.

## Already shipped — DO NOT re-touch (verified 2026-06-26)

- **SP-E1** — Meet nav: `Matches` is a top-level sidebar item; Configuration is two tabs (Tournament, Engine); workspace settings live in `ws-*`. Done.
- **SP-E2** — Sidebar alignment + venue extraction: `VenueScheduleTab.tsx` at `ws-venue` owns courts / slot duration / day window; both module Configs nudge to it; bracket roster already labeled "Roster". Done.
- **SP-E3 (partial)** — dedicated `BracketDrawsTab` (spreadsheet, create-in-modal, open-draw), `PanZoomCanvas` (wheel-zoom/drag-pan), round-jump chips. Done **except** the centered layout (this plan's E3).
- **SP-F1** — shared `services/scheduling/params.py` (`SchedulingParams` + `build_schedule_config`) used by both Meet (`adapters/badminton.py`) and Bracket (`api/brackets.py`); single `scheduler_core.schedule()` entry. Match-record non-merge documented in ADR 0006 (Meet = integer side scores no winner; Bracket = opaque JSON + `winner_side`). Done.

## Global Constraints

- **Branch:** `dev/workspace-suite`. Commit only when the user asks; never commit to `main`.
- **Never edit existing Alembic migrations** — add new ones only. Current head: `j3e7f9a1b5c8`. **E4 needs no migration** (scoring fields already on `TournamentConfig`, persisted in the `Tournament.data` JSON blob; `bracket_results.score` is already JSON).
- **Do not touch:** Meet position-grid data model / lineup logic (`PositionGrid.tsx`, `rankCounts` semantics), bracket draw structure / seeding / advancement, the workspace control plane (`workspace_modules`, signals, hub), `moduleContract` ownership invariants (you may repoint `bracket-events`/`bracket-draw` but must not delete the segments).
- **Copy rules:** spell out discipline + format codes — no bare acronyms in user-facing copy (e.g. "Single elimination", "Men's singles"); sentence case; active-voice button labels that keep the same verb through their toast.
- **Backend gate:** from `products/scheduler`, `../../.venv/Scripts/python.exe -m pytest -q`. Baseline = **529 pass, 4 pre-existing fails** (`test_routes_registered`, `test_list_all_returns_newest_first`, `test_backup_create_and_list_newest_first`, `test_backup_rotate_keeps_newest_n` — FastAPI route-registration drift + Windows timestamp-tie flakiness). Bar = **no new failures beyond those four**.
- **Frontend gate:** from `products/scheduler/frontend`, `npx tsc -b` && `npx vitest run` (baseline **353 pass**) && `npm run build`.
- **Ralph-loop gate is slice-specific, written first.** "Suite green" only proves nothing broke. Each slice below defines acceptance tests that assert the *new behavior*; the loop is not done until those pass. For UI flows, confirm with the Playwright MCP, since Vitest can't observe a live SSE stream or a rendered hybrid court grid.

---

## Task E3: Centered bracket-tree canvas

**Files:**
- Modify: `products/scheduler/frontend/src/products/bracket/DrawView.tsx` (the `BracketView` layout, ~lines 199–245)
- Modify (if needed): `products/scheduler/frontend/src/products/bracket/PanZoomCanvas.tsx` (initial "Fit"/center transform; round-jump `[data-round]` lookup must still work)
- Test: `products/scheduler/frontend/src/products/bracket/__tests__/DrawView.centered.test.tsx` (new)

**Interfaces:**
- Consumes: `EventDTO.rounds: string[][]` (round-major), `playUnitSideLabels`, existing `BracketCell`.
- Produces: a layout where the Final column is horizontally centered and earlier rounds fan outward symmetrically (left and right), each match vertically centered between its two feeder matches. Round-jump chips and pan/zoom must keep working.

**Design:** Today rounds are a single left→right `flex` row (Final rightmost). Rewrite to a **mirrored two-wing layout**: split rounds into a left wing and a right wing that both converge on a centered Final column. Compute each match's vertical center as the midpoint of its two children (classic bracket midpoint recursion) so connectors are implied by alignment. Keep it CSS-transform based (no new dependency) to preserve `PanZoomCanvas`. Preserve `data-round={ri}` attributes on each round column (round-jump depends on `closest('[data-round]')`); for the mirrored layout, label round-jump by round index, not DOM order.

- [ ] **Step 1 — Write the failing acceptance test.** Assert: (a) the Final round column has a center x within a small tolerance of the canvas content center; (b) for a 8-participant single-elim event, a round-2 match's vertical center equals the average of its two round-1 feeders' centers (use `getBoundingClientRect` via jsdom layout shims already used by `ganttTimeline.test.tsx`, or assert on computed inline `style` offsets the layout sets); (c) `data-round` attributes 0..N still present.
- [ ] **Step 2 — Run it, verify it fails** (`npx vitest run src/products/bracket/__tests__/DrawView.centered.test.tsx`). Expected: FAIL.
- [ ] **Step 3 — Implement** the mirrored/centered layout in `DrawView.tsx`; adjust `PanZoomCanvas` initial transform to fit+center on mount.
- [ ] **Step 4 — Run** the new test + the existing `DrawView.test.tsx` + `bracketTabs`/canvas tests. Expected: PASS, no regressions.
- [ ] **Step 5 — Playwright confirm:** open a generated draw, screenshot; the Final sits centered, rounds fan outward, round-jump and zoom still work.
- [ ] **Step 6 — Gate:** `npx tsc -b` && `npx vitest run` (≥353) && `npm run build`.

---

## Task E4: Unified two-tab Configuration + bracket scoring

**No Alembic migration.** Scoring fields already exist on `TournamentConfig` (`scoringFormat`, `setsToWin`, `pointsPerSet`, `deuceEnabled`) and round-trip through `putTournamentState` for both modules.

**Files:**
- Meet tabs: `products/scheduler/frontend/src/products/meet/TournamentSetupPage.tsx` (`SECTION_OPTIONS`), `tournaments/TournamentConfigForm.tsx`, `settings/EngineSettings.tsx`.
- New Meet "Meet" tab content (meet type + lineup position **counts**): factor a `MeetStructureForm.tsx` from the `meetMode` + `rankCounts` controls (counts only — the player-assignment `PositionGrid.tsx` stays in Roster, untouched).
- Bracket tabs: `products/scheduler/frontend/src/products/bracket/BracketTournamentSection.tsx`, `BracketStructureSection.tsx`; add a bracket **Engine** tab surfacing scoring + `restBetweenRounds`, and a bracket **structure** tab (draw type / size / seeding method / active disciplines).
- Bracket score entry: wherever a bracket result is recorded (`DrawView.tsx`, `MatchDetailPanel.tsx`) — when `scoringFormat === 'badminton'`, capture set scores into `BracketResult.score` (JSON, already supported) instead of winner-only.
- Tests: `meet/__tests__/configTabs.test.tsx`, `bracket/__tests__/bracketConfigTabs.test.tsx` (new).

**Interfaces:**
- Consumes: shared `TournamentConfig` (frontend `api/dto.ts`), bracket config via `useTournamentStore`/`useTournamentState`.
- Produces: **Engine tab — identical field set in both modules**: score type, points per set (if Sets), match format (if Sets), deuce, rest (`defaultRestMinutes` for Meet / `restBetweenRounds` for Bracket — engine-specific timing stays), break (Meet only where it exists), plus a nudge line "Courts, slot duration, and the day window live in workspace settings." Meet-specific tab: meet type + lineup position counts. Bracket-specific tab: draw type / draw size / seeding method / active disciplines.

**Tab-content mapping (resolve the "Engine" ambiguity):** the spec's *Engine* tab = the CP-SAT input surface. Scoring + timing are inputs; the existing solver/optimisation controls in `EngineSettings.tsx` are also CP-SAT inputs, so they remain in Engine (below the scoring block, under an "Advanced solver" subsection). Meet's `meetMode` + `rankCounts` move OUT of `TournamentConfigForm` into the new Meet tab.

- [ ] **Step 1 — Failing tests:** (Meet) Configuration renders exactly two tabs "Engine" and "Meet"; the Engine tab shows score type/points/format/deuce/rest; the Meet tab shows meet type + per-discipline position-count inputs; changing a position count calls the store update with the new `rankCounts`. (Bracket) Configuration renders two tabs; the Engine tab shows the **same** scoring field set as Meet and a rest-between-rounds field; toggling score type to Sets reveals points/format/deuce; the structure tab shows draw type/size/seeding/active disciplines.
- [ ] **Step 2 — Run, verify fail.**
- [ ] **Step 3 — Implement** the Meet re-tab (extract `MeetStructureForm`, move scoring into Engine), the bracket Engine + structure tabs, and the bracket Sets score-entry path (writes `BracketResult.score`).
- [ ] **Step 4 — Run** new + existing meet/bracket config tests. No regressions.
- [ ] **Step 5 — Backend check:** add/confirm a pytest that a bracket `TournamentConfig` with `scoringFormat='badminton'` + a `bracket_results.score` JSON payload round-trips through `putTournamentState`/serialize (no migration; assert persisted JSON survives a reload).
- [ ] **Step 6 — Playwright confirm:** Meet and Bracket Configuration each show two tabs with the identical Engine field set; recording a bracket result in Sets mode captures set scores.
- [ ] **Step 7 — Gate:** frontend (tsc/vitest/build) + backend pytest.

---

## Task F2: Bracket full CP-SAT — SSE stream + candidate pool

**Files:**
- Backend: `products/scheduler/backend/api/brackets.py` — add `POST /tournaments/{tid}/bracket/schedule-next/stream` mirroring `backend/api/schedule.py:116–264` (bounded queue `_SSE_QUEUE_MAX`, critical events bypass backpressure, `is_disconnected()` poll, terminal `done`). Thread `candidate_pool_size` into the bracket solve (`services/bracket/scheduler.py` `schedule_next_round` → `scheduler_core.schedule(problem, candidate_pool_size=N)`), and add candidate alternatives to the result/DTO.
- Backend DTO: extend `ScheduleNextRoundOut` (or add `BracketScheduleCandidate`) with the candidate pool; keep the existing non-stream endpoint working.
- Frontend: `products/scheduler/frontend/src/products/bracket/BracketViewHeader.tsx` (the `handleScheduleNext` path) — consume the SSE stream and render progress mirroring Meet's `useSchedule` + `SolverProgressLog`/`LiveScheduleGrid`; add a candidate-selection step before commit (mirror Meet step 5a). Reuse Meet's progress components where possible.
- Tests: backend `tests/.../test_bracket_schedule_stream.py`; frontend extend `bracket/__tests__/BracketViewHeader.test.tsx` (the existing toast fixture is the bolt-on point).

**Interfaces:**
- Consumes: `TournamentDriver.schedule_next_round()`, `RoundResult`, `scheduler_core.schedule(..., candidate_pool_size=)`.
- Produces: an SSE endpoint emitting `model_built | phase | progress | complete | error | done` (same shapes as Meet), a candidate pool on the result, and a bracket scheduling UI with progress + candidate selection identical in feel to Meet's.

- [ ] **Step 1 — Failing backend test:** POST to the stream endpoint yields an SSE sequence ending in `done`, with at least one `progress` and a terminal `complete` carrying the assignment(s); a solve with `candidate_pool_size=3` returns ≤3 distinct candidates.
- [ ] **Step 2 — Run, verify fail.**
- [ ] **Step 3 — Implement** the streaming endpoint + candidate threading.
- [ ] **Step 4 — Failing frontend test:** clicking "Schedule next round" drives a progress UI from streamed events and presents candidates; selecting one commits it. Mirror the existing toast test's mock shape.
- [ ] **Step 5 — Implement** the bracket scheduling UI (reuse Meet progress components).
- [ ] **Step 6 — Playwright confirm:** live progress renders during a bracket solve; candidate selection commits. (Vitest cannot observe real SSE — this step is mandatory.)
- [ ] **Step 7 — Gate:** backend pytest + frontend tsc/vitest/build.

---

## Task F3: Bracket results through the command queue

**Design decision (review before the loop writes it):** Do **not** merge the match models (ADR 0006 stands). Generalize the client command queue to carry a **bracket result command** rather than forcing bracket into Meet's operational verbs. Meet's idempotency is client-side: a UUID key + IndexedDB + version-based optimistic concurrency. `BracketMatch` already has a `version` column, so mirror that — **no Alembic migration expected.** Add a bracket result endpoint variant that accepts `seen_version` and returns `ok | staleVersion | conflict` (the existing `POST /bracket/results` becomes the committed path behind the queue). Advancement stays bracket-owned: the queue carries the *result*; the bracket engine processes advancement as a consequence of commit (unchanged `record_result`).

**Files:**
- Frontend: `products/scheduler/frontend/src/lib/commandQueue.ts` (generalize `QueuedCommand` to a discriminated union: existing meet actions + a `bracket_result` command, or a parallel `bracketCommandQueue.ts` sharing the IndexedDB plumbing — implementer picks the lower-churn option and documents it), `hooks/useCommandQueue.ts` (or a `useBracketResultQueue.ts`), `products/bracket/DrawView.tsx` + `MatchDetailPanel.tsx` (replace direct `api.recordResult` with enqueue + optimistic apply), `api/bracketClient.tsx`.
- Backend: `products/scheduler/backend/api/brackets.py` — accept `seen_version` on result recording; return a typed stale/conflict outcome consistent with Meet's `getMatchState` 409 semantics.
- Tests: frontend `lib/__tests__/bracketCommandQueue.test.ts`, `hooks/__tests__/useBracketResultQueue.test.ts`; backend `tests/.../test_bracket_result_optimistic.py`.

**Interfaces:**
- Consumes: existing `commandQueue` IndexedDB plumbing (`enqueue`/`flush`/`withStore`), `BracketMatch.version`, `record_result`.
- Produces: idempotent bracket-result submission with optimistic UI + inline conflict surfacing; the 2.5s `useBracket` poll for result reflection is removed for result writes (poll may remain for cross-client refresh).

- [ ] **Step 1 — Failing backend test:** recording a bracket result with a stale `seen_version` returns a conflict outcome and does not double-advance; a fresh version commits and advances.
- [ ] **Step 2 — Run, verify fail.** **Step 3 — Implement** the optimistic-concurrency result endpoint.
- [ ] **Step 4 — Failing frontend test:** submitting a bracket result enqueues an idempotent command (same UUID is a no-op), applies optimistically, and on `staleVersion` refetches + surfaces a conflict (mirror `useCommandQueue` semantics).
- [ ] **Step 5 — Implement** the bracket result queue + wire `DrawView`/`MatchDetailPanel`.
- [ ] **Step 6 — Playwright confirm:** recording a winner updates instantly (optimistic), a simulated conflict surfaces inline.
- [ ] **Step 7 — Gate:** backend pytest + frontend tsc/vitest/build.

---

## Task F4: Unified Operations court view

**Files:**
- Frontend: `products/scheduler/frontend/src/app/workspace/workspaceNav.ts` (when both `meet` and `bracket` are enabled, render one Operations section, not a kind-gated one), a new hybrid surface (e.g. `products/operations/UnifiedCourtsView.tsx` + `UnifiedLiveView.tsx`) that concatenates `meetMatchesToOperational(...)` + `bracketToOperational(...)` and sorts by court/slot, `products/operations/SourceChip.tsx` (move from surface header onto each row, keyed on `OperationalMatch.source`). Dual write-back: live actions route to the correct engine's API by `source` (meet → command queue; bracket → F3 bracket result queue).
- The `operationalMatch.ts` view-model + both adapters already exist and are tested — build on them; the file's own TODO is the spec for this slice.
- Tests: `products/operations/__tests__/unifiedCourts.test.tsx`, extend any `operationalMatch` tests.

**Interfaces:**
- Consumes: `meetMatchesToOperational`, `bracketToOperational`, `OperationalMatch` (`source`, `courtLabel`, `slot`, `status`), `useCommandQueue` (meet), F3 bracket result queue (bracket).
- Produces: one Courts + one Live surface when both engines are enabled; every row carries a source chip; write-back routes by `source`. Single-engine workspaces keep today's behavior.

- [ ] **Step 1 — Failing test:** with both engines enabled, the unified Courts view lists meet+bracket rows interleaved by court/slot, each row shows its source chip; with one engine enabled, behavior is unchanged.
- [ ] **Step 2 — Run, verify fail.**
- [ ] **Step 3 — Implement** the hybrid surfaces + nav wiring + per-row chip + by-`source` write-back routing.
- [ ] **Step 4 — Run** new + existing operations/nav/moduleContract tests. No regressions (Operations stays `enableable:false`; `bracket-events`/`bracket-draw` segments intact).
- [ ] **Step 5 — Playwright confirm:** a dual-module workspace shows one court view with mixed-source cards; starting/finishing a card hits the right engine.
- [ ] **Step 6 — Gate:** frontend tsc/vitest/build (+ backend pytest if any endpoint touched).

---

## Self-Review

- **Spec coverage:** E1/E2/F1 explicitly marked done; E3 (centered) ✓ Task E3; E4 (two-tab + bracket scoring) ✓ Task E4; F2 (SSE + candidate pool) ✓; F3 (command queue) ✓; F4 (unified ops) ✓.
- **Migrations:** E4 and F3 both determined migration-free (JSON config blob; existing `version`/`score` columns). If implementation finds a column genuinely required, add a new revision off `j3e7f9a1b5c8` — never edit existing.
- **Type consistency:** `OperationalMatch.source` drives both the F4 chip and the write-back router; `seen_version` is the F3 optimistic token mirroring Meet's `seenVersion`; bracket Engine tab consumes the same `TournamentConfig` scoring fields as Meet.
- **Ordering:** E3 → E4 → F2 → F3 → F4 (sequential; they overlap on bracket/config/operations files, so no parallelism). F4 depends on F3 for bracket write-back.
