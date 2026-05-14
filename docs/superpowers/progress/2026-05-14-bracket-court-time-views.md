# Working Log — Bracket Court×Time Views

**Purpose:** Durable session-state log. This session has run long; context will be summarised. If you are resuming with thin context, read this file first, then the two docs it points to. It is the source of truth for *where we are*.

**Branch:** `dev2` (working in place — not a worktree). Working tree is clean except `.gitignore` (a `.superpowers/` ignore added earlier) and pre-existing `package-lock.json` churn.

---

## The arc of this session

1. **Bracket chrome unification** — DONE, committed. Brainstormed → spec → plan → 5-task subagent-driven execution (two-stage review per task) → 4-agent maintainability audit → audit follow-up fixes. The bracket surface now navigates Draw/Schedule/Live via the same top `TabBar` as the meet.
2. **Bracket court×time views** — IN PROGRESS. Brainstormed the strategic shape; decomposed into 4 sub-projects; about to brainstorm sub-project #1.

## Committed on `dev2` this session (oldest → newest)

```
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
47b576a docs(spec): bracket court×time views — decomposition record
```

Pre-session HEAD was `3a80147`.

## Verification state (chrome unification)

- `tsc -b && vite build` clean · `vitest` 32/32 · route-correct Playwright probe 3/3 (probe was temporary, deleted).
- `make test-e2e` is **pre-existing stale** — every spec does `goto('/')` expecting the app shell, but `/` is the dashboard. NOT a regression from this work; rehabilitating the suite is its own project.
- Visual sweep (browser-harness) **not done** — needs the user's one-time Chrome toggle: `chrome://inspect/#remote-debugging` → "Allow remote debugging for this browser instance" → Allow. Saved for the implementation sweep.

## Parked — awaiting user decision

- **Merge/PR decision** for the chrome-unification work on `dev2` (`finishing-a-development-branch`).
- **Audit structural findings** (surfaced, not done): the `eyebrow` micro-pattern is hand-rolled 21×/14 files at 3 disagreeing tracking values (`.eyebrow` class 0.06em, `PageHeader` 0.2em, the rest 0.18em); the operator-header-strip pattern hand-rolled 8× → a `<ViewHeader>` extraction; `ScheduleView` has pre-existing un-memoised O(n²)-on-poll derivations.
- The `bracketDataReady`-via-store seam is a spec-approved trade-off (provider scope) — noted, not a defect.

---

## CURRENT POSITION: brainstorming sub-project #1

**The court×time effort decomposition** lives in `docs/superpowers/specs/2026-05-14-bracket-court-time-views-decomposition.md`. Read it. Summary:

- **Goal:** bracket Schedule + Live become meet-style court×time Gantts.
- **Locked decisions:** (1) interactive Schedule — drag/validate/re-solve like the meet's `DragGantt`; (2) all events on shared physical court rows, event selector becomes a highlight/dim filter; (3) Coordinated — extract the shared `GanttTimeline` scaffold, don't duplicate Gantt code.
- **4 sub-projects, build order #2 → #1 → #4 → #3:**
  - **#2 GanttTimeline scaffold** — has a committed plan (`docs/superpowers/plans/2026-05-13-gantt-timeline-unification.md`), assessed execute-ready.
  - **#1 bracket interactive-scheduling backend** — ← *being brainstormed now*.
  - **#4 bracket Live Gantt** — `LiveView` list → click-select Gantt; needs #2.
  - **#3 bracket Schedule Gantt** — `ScheduleView` table → interactive Gantt; needs #1 + #2.

### Sub-project #1 — what it is, and what's already known

**#1 = bracket per-match `/validate` endpoint + pin-and-re-solve**, mirroring the meet's `/schedule/validate` + `pinAndResolve`. Decision (1) — interactive drag — depends on it.

Already established (recon, this session):
- The bracket backend (`products/scheduler/backend/api/brackets.py`) has **no** per-match validate / pin / reschedule endpoint. Its routes: `POST ""` (create), `GET ""`, `DELETE ""`, `POST /schedule-next` (round bulk-solve), `POST /results` (record result, advances draw), `POST /match-action` (start/finish/reset), `POST /import`, `POST /import.csv`, exports.
- The bracket solver **already assigns `(slot, court)` pairs** — same CP-SAT engine as the meet (`scheduler_core/engine/cpsat_backend.py`). `AssignmentDTO` carries `court_id`/`slot_id`/`duration_slots`. So #1 is about *interaction endpoints*, not a new solver model.
- Bracket scheduling is round-by-round: `TournamentDriver.schedule_next_round()` (`backend/services/bracket/scheduler.py`) finds "ready" PlayUnits and solves that wave; `adapter.py` translates to the shared `ScheduleRequest`.
- The meet's interactive layer: `DragGantt.tsx` debounces `/schedule/validate` on drag-move; on a feasible drop calls `pinAndResolve()` (pin + re-run solver). #1 must mirror this for the bracket.

**Next concrete step:** explore the meet's `/schedule/validate` + `pinAndResolve` backend implementation (not yet read) — that's what #1 mirrors. Then #1's clarifying questions → approaches → design → spec → plan.

### Open questions to settle during #1's brainstorm

- Does bracket pin-and-re-solve re-solve just the current round, or all unscheduled play_units?
- What does bracket `/validate` check — court/slot overlap only, or also player rest and draw-dependency ordering (a match can't precede its feeder matches)?
- How closely should the bracket endpoints mirror the meet's request/response shapes (reuse vs parallel)?

---

## How to resume if context is lost

1. Read this file.
2. Read `docs/superpowers/specs/2026-05-14-bracket-court-time-views-decomposition.md` (the decomposition).
3. Read `docs/superpowers/plans/2026-05-13-gantt-timeline-unification.md` (#2's ready plan).
4. `git log --oneline 3a80147..HEAD` to confirm committed state.
5. Resume the #1 brainstorm at "Next concrete step" above.
