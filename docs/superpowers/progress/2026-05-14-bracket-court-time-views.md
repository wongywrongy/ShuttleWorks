# Working Log — Bracket Court×Time Views

**Purpose:** Durable session-state log. This session has run long; context will be summarised. If you are resuming with thin context, read this file first, then the docs it points to. It is the source of truth for *where we are*.

**Branch:** `dev2` (working in place — not a worktree). Working tree is clean except `.gitignore` (a `.superpowers/` ignore added earlier) and pre-existing `package-lock.json` churn.

**Last reconciled:** 2026-05-14, after sub-project #2 (GanttTimeline scaffold) landed via subagent-driven-development.

---

## The arc of this session

1. **Bracket chrome unification** — **DONE, committed.** Brainstormed → spec → plan → 5-task subagent-driven execution (two-stage review per task) → 4-agent maintainability audit → audit follow-up fixes. The bracket surface now navigates Draw/Schedule/Live via the same top `TabBar` as the meet. Frontend verified file-by-file against plan intent during the reconciliation audit — matches.
2. **Bracket court×time views** — **IN PROGRESS.** Decomposed into 4 sub-projects. **#1 (interactive-scheduling backend) DONE.** **#2 (GanttTimeline scaffold) DONE — landed via subagent-driven-development (5 tasks, two-stage review each, whole-implementation review at close); the meet's 3 Gantts (DragGantt, GanttChart, LiveTimelineGrid) now consume a shared `@scheduler/design-system/components/GanttTimeline` scaffold; `ganttGeometry.ts` retired.** #3 and #4 not started — both can now be built ON the scaffold.

## Committed on `dev2` this session (oldest → newest)

```
# --- Chrome unification + early docs ---
b726b12 refactor(design-system): extract StatusBar from bracket TopBar
c2ecb69 docs(plans): GanttTimeline unification implementation plan
dcbe5db docs(spec): bracket chrome unification design
a230e97 docs(plan): bracket chrome unification implementation plan
e4aa39d feat(uiStore): bracket-* tab ids + bracketDataReady flag
55cbecf feat(bracket): pure tab helpers — ids, view derivation, activeTab normalization
b8f9f75 feat(bracket): BracketViewHeader — per-view header strip
5977151 refactor(bracket): topbar-dominant chrome — Draw/Schedule/Live as TabBar tabs
3bf6f91 fix(bracket): BracketViewHeader right-cluster gap-2 for meet parity
a1b804a refactor(bracket): chrome-unification audit follow-ups
# --- Court×time decomposition + sub-project #1 docs ---
47b576a docs(spec): bracket court×time views — decomposition record
6e16b87 docs(progress): working log — bracket court×time views
1b91b92 docs(spec): bracket interactive-scheduling backend design
64e753b docs(spec): bracket scheduling backend — advisor follow-ups
7cb0ebf docs(plan): bracket interactive-scheduling backend implementation plan
# --- Sub-project #1 implementation (6 tasks + cleanup + 1 review fix) ---
d524767 feat(bracket): thread previous_assignments through build_problem
7fa4bdc feat(bracket): add pure-Python bracket move feasibility check
a31817a feat(bracket): add TournamentDriver.repin_and_resolve
3a4e308 feat(bracket): add POST /bracket/validate route
010b5e0 feat(bracket): add POST /bracket/pin route + validate-pin contract test
3703525 feat(bracket): wire validate/pin into the bracket API client
c83e0ac refactor(bracket): interactive-scheduling backend — review follow-ups
c6a722d fix(bracket): /validate rejects unscheduled play_units (validate<->pin contract)
# --- Doc reconciliation + sub-project #2 (GanttTimeline scaffold) ---
9b471bb docs: reconcile session docs with reality (post-audit)
2d65c9f docs(plan): GanttTimeline scaffold — bite-sized implementation plan
21f91cc refactor(gantt): single geometry source with standard/compact tiers       [Task 0.1]
e4af727 feat(design-system): GanttTimeline scaffold                                [Task 1.1, memo bail-out fix amended]
8d1f184 feat(design-system): LiveTimelineGrid migration onto GanttTimeline         [Task 1.2, setTimeout cleanup amended]
cde83a4 refactor(control-center): GanttChart consumes shared GanttTimeline         [Task 2.1, setTimeout cleanup amended]
be8728a refactor(schedule): DragGantt consumes shared GanttTimeline                [Task 3.1, msg + dropFxTimer + indexByKey amended]
fd3086e chore(schedule): drop unreachable STANDARD.slot - 4 floor in DragGantt     [whole-impl-review hygiene]
```

Pre-session HEAD was `3a80147`.

## Verification state

**Chrome unification:** `tsc -b && vite build` clean · `vitest` 32/32 · route-correct Playwright probe 3/3 (probe was temporary, deleted).

**Sub-project #1 (interactive-scheduling backend):** new pytest file `products/scheduler/tests/unit/test_bracket_interactive_scheduling.py` — **22 tests, all passing**; full bracket suite (`test_bracket_interactive_scheduling.py` + `test_bracket_routes.py` + `test_bracket_repository.py`) **68 passed**; frontend `tsc -b` clean. Every task two-stage-reviewed (spec + code-quality); cleanup pass + whole-implementation review done; the review's one Important finding (a `/validate`↔`/pin` asymmetry on ready-but-unscheduled play_units) was fixed in `c6a722d`.

**Sub-project #2 (GanttTimeline scaffold):** new vitest file `products/scheduler/frontend/src/lib/__tests__/ganttTimeline.test.ts` — **8/8 tests passing** (`GANTT_GEOMETRY` tiers + `placementBox()` pure math). `tsc -b` + `vite build` (`build:scheduler`) clean. `lint:scheduler` exit 1 but **zero errors in the four migration files** (`GanttTimeline.tsx`, `LiveTimelineGrid.tsx`, `GanttChart.tsx`, `DragGantt.tsx`) — all pre-existing in unrelated files. `wc -l`: DragGantt 626, GanttChart 381, LiveTimelineGrid 202, GanttTimeline 333. Every task two-stage-reviewed (spec + opus code-quality); 4 review-loop fixes applied as amends (Task 1.1: PositionedBlock memo bail-out; 1.2: setTimeout cleanup; 2.1: setTimeout cleanup; 3.1: dropFxTimer + indexByKey O(N²) → O(1)); whole-implementation opus review at close — verdict: "Migration complete" (zero Critical/Important, 2 Minor disposed in hygiene commit `fd3086e`, 3 deferred follow-ups documented).

**Common across the session:**
- `make test-e2e` is **pre-existing stale** — every spec does `goto('/')` expecting the app shell, but `/` is the dashboard. NOT a regression; rehabilitating the suite is its own project.
- The pytest env had a pre-existing `sqlalchemy`-not-installed gap; it was installed during #1's execution so route tests run.
- Visual sweep (browser-harness) **not done** — needs the user's one-time Chrome toggle: `chrome://inspect/#remote-debugging` → "Allow remote debugging for this browser instance" → Allow.

## Parked — awaiting user decision

- **Merge/PR decision** for the work on `dev2` (`finishing-a-development-branch`). Not yet done.
- **Audit structural findings** (surfaced, not done): the `eyebrow` micro-pattern hand-rolled 21×/14 files at 3 disagreeing tracking values (`.eyebrow` class 0.06em, `PageHeader` 0.2em, the rest 0.18em); the operator-header-strip pattern hand-rolled 8× → a shared `<ViewHeader>` extraction (note: `BracketViewHeader` is bracket-specific and does **not** discharge this); `ScheduleView` pre-existing un-memoised O(n²)-on-poll derivations.
- **Browser-harness visual sweep** — pending the user's Chrome toggle (above).
- The `bracketDataReady`-via-store seam is a spec-approved trade-off (provider scope) — noted, not a defect.

---

## CURRENT POSITION: sub-projects #1 + #2 done; #4 then #3 are next

**The court×time decomposition** lives in `docs/superpowers/specs/2026-05-14-bracket-court-time-views-decomposition.md`. Locked decisions: (1) interactive Schedule — drag/validate/re-solve like the meet's `DragGantt`; (2) all events on shared physical court rows, event selector becomes a highlight/dim filter; (3) Coordinated — extract the shared `GanttTimeline` scaffold, don't duplicate Gantt code.

**4 sub-projects, build order #2 → #1 → #4 → #3:**
- **#2 GanttTimeline scaffold** — ✅ **DONE** (strategic plan `c2ecb69`, bite-sized plan `2d65c9f`, implemented `21f91cc`→`fd3086e`). The shared scaffold lives at `packages/design-system/components/GanttTimeline.tsx`. Its API: `{ courts, minSlot, slotCount, density, placements, renderBlock, renderCell?, renderRow?, renderCourtLabel?, renderSlotLabel?, onCellClick?, headerLabel?, currentSlot?, className?, 'data-testid'? }`. Density tiers: `standard: {slot:80,row:40,label:56}`, `compact: {slot:48,row:32,label:56}`. The 3 meet Gantts (DragGantt, GanttChart, LiveTimelineGrid) consume it. `ganttGeometry.ts` retired.
- **#1 bracket interactive-scheduling backend** — ✅ **DONE** (spec `1b91b92`+`64e753b`, plan `7cb0ebf`, implemented `d524767`…`c6a722d`). The `/validate` + `/pin` endpoints, `repin_and_resolve`, `services/bracket/validation.py`, the shared `is_assignment_locked` predicate, and thin frontend API-client wiring all exist and are reviewed.
- **#4 bracket Live Gantt** — `LiveView` list → click-select Gantt; needs #2 (done). **Not started.** ← *next per build order*
- **#3 bracket Schedule Gantt** — `ScheduleView` table → interactive Gantt; needs #1 (done) + #2 (done). **Not started.**

**Important — the user's ultimate goal (the bracket Schedule/Live court×time *UI*) is NOT yet built.** Sub-projects #1 and #2 were the *backend* and the *shared scaffold* it depends on. `ScheduleView.tsx` is still the static `<table>` grid; `LiveView.tsx` is still the flat list table. The interactive court×time Gantts are sub-projects #3 and #4 — future work, but both foundations are now in place.

**Open follow-ups from #2** (deferred — not blocking; logged in `docs/superpowers/plans/2026-05-14-gantt-timeline-scaffold.md` self-review):
- Scaffold prop `blockTransition?: string` — restore DragGantt's 420ms `--ease-brand` glide on block re-layout (was on `MatchBlock`; scaffold now owns `left/top` and snaps).
- Scaffold prop `rowClassName?(courtId): string` — restore DragGantt's `opacity-60` whole-row dim on fully-closed courts (closed state still indicated by line-through label + `bg-muted/50` cells + "court closed" overlay).
- `useVisibleWindow(assignments, totalSlots)` shared hook — `minSlot`/`maxSlot` derivation is identical across all 3 adapters.
- `useDragOrchestrator` extraction in DragGantt — the inline `scheduleValidation` + drag state machine is intentional consolidation, but the file landed at 611 lines (plan target was an optimistic ~250).

**Next concrete step:** the build order says #4 (the bracket Live Gantt — `LiveView` list → click-select court×time Gantt). It needs brainstorm → spec → plan → execution. Alternatively the parked decisions (chrome-unification merge, the audit's structural findings, the visual sweep) may be addressed first depending on user direction.

---

## How to resume if context is lost

1. Read this file.
2. Read `docs/superpowers/specs/2026-05-14-bracket-court-time-views-decomposition.md` (the decomposition + locked decisions).
3. For #2: read `docs/superpowers/plans/2026-05-13-gantt-timeline-unification.md` (ready plan).
4. For #1 (done, for reference): `docs/superpowers/specs/2026-05-14-bracket-interactive-scheduling-backend-design.md` + `docs/superpowers/plans/2026-05-14-bracket-interactive-scheduling-backend.md`.
5. `git log --oneline 3a80147..HEAD` to confirm committed state.
