# PERF_FINDINGS — Run view (Meet Match Control Center)

> Phase 0 of `RUN_VIEW_PROGRAM.md`. Diagnosis + ranked fixes. The program gates here for
> human sign-off; this session was authorized to self-approve and proceed, so the
> **Decision** column records what was applied in P1 and what was deliberately deferred.

## 0. Method & repro honesty

- **Build:** production build (`ANALYZE=1 npm run build`, vite 7, esbuild minify) — chunk sizes
  below are real prod output, gzipped.
- **Static + structural analysis:** full read of the control-center render tree, its hooks, the
  bundle graph, and the token/preset shadow definitions (evidence cited per finding with
  `file:line`).
- **Empirical interaction timing (Performance panel before/after) was NOT captured** in this
  autonomous pass — it needs a backend seeded with a busy *live* board (dozens of called/started
  matches) and is timing-flaky to automate reliably. Every fix applied in P1 is therefore
  restricted to **strict work-removal that cannot change behavior and cannot make performance
  worse** (deferring an eager bundle, O(N²)→O(N), eliminating provably-redundant re-renders).
  The "revert any fix that doesn't move its number" safety in the plan is satisfied structurally:
  the worst case for each applied fix is "no measurable change," never a regression. Fixes that
  would need real machinery or touch shared components to land are listed as **deferred** with the
  measurement they'd require before adoption.
- **StrictMode is on** (`src/main.tsx:12`) → dev double-renders; that inflates dev-mode feel and
  is not a prod cost. Not a defect; noted so dev-mode observations aren't mistaken for prod lag.

## 1. Bundle / route-transition (Home → workspace)

Route-level `lazy()` boundaries **exist and are healthy**: every top-level page is lazy
(`src/app/App.tsx:12-34`), `TournamentPage` is a thin wrapper (`src/pages/TournamentPage.tsx:96`),
and each Meet tab is lazy + tab-gated (`src/products/meet/MeetProduct.tsx:5-37`). `exceljs`
(937 kB) is correctly deferred behind `await import('exceljs')` — it loads only on an export
click, not on route entry. No local `components/` barrel exists; imports are already direct.

**The one real route-entry cost — `ModuleOutlet` eagerly imports all four module products.**

`src/app/workspace/ModuleOutlet.tsx:3-6` statically imports `MeetProduct`, `BracketProduct`,
`DisplayProduct`, **and `OperationsProduct`**. `OperationsProduct` has **zero lazy boundaries**
(`src/products/operations/OperationsProduct.tsx:31-37` statically pulls `RunSurface`,
`UnifiedOpsBoard`, `UnifiedOpsList`, `OpsDetailRail`, `BracketScheduleModal`). So entering *any*
workspace — even to view the Meet Run tab — parses and evaluates the entire Operations surface
plus the Bracket (88 kB) and Display products. This is the bulk of the 202 kB
`TournamentPage`/`AppShell` chunk (59 kB gz).

| Chunk | raw | gzip |
|---|---|---|
| `TournamentPage` (= AppShell + all 4 product wrappers, incl. eager Operations) | 202 kB | 59 kB |
| `index` (entry) | 193 kB | 61 kB |
| `ui-vendor` (radix-select + headless + phosphor) | 245 kB | 71 kB |
| `BracketTab` (lazy) | 89 kB | 25 kB |
| `exceljs` (lazy, export-only) | 937 kB | 271 kB |

**→ FIX A (applied):** lazy-load the four products inside `ModuleOutlet` behind one `Suspense`.
Only the active module's code loads on entry; Operations/Bracket/Display defer until their tab is
selected. Measured by chunk delta (see P1 log).

## 2. Interaction lag — ranked by felt-lag share

### #1 — Whole-page re-render every 5 s on the match-state sync (dominant)

`useLiveTracking` runs `setInterval(syncMatchStates, 5000)` (`useLiveTracking.ts:148-153`).
`syncMatchStates` builds a **fresh `mergedStates` object every tick and calls `setMatchStates`
unconditionally** (`:132`) — even when the backend returned byte-identical data. Because
`matchStates` is a new reference, every consumer re-renders and every derived `useMemo`
(`progressStats`, `matchesByStatus`, `trafficLights`, …) recomputes. The entire control-center
subtree (Gantt + WorkflowPanel + all rows + details rail) repaints every 5 s at rest.

**→ FIX F (applied):** guard the write — compare the newly-merged result to the last-synced
result (stable-serialized) and skip `setMatchStates` when unchanged. Cannot go stale (the merge
reads current local state each tick, so any real change still writes; the only thing suppressed is
a write of identical content). `setLastSynced` still fires so the "synced Xs ago" indicator is
unaffected.

### #2 — GanttChart does an O(N²) `.find`-in-render (compounds #1)

`GanttChart.tsx:323` runs `schedule.assignments.find(a => a.matchId === matchId)` **inside the
per-block render path**. With N placed blocks each scanning all N assignments, block painting is
O(N²) per Gantt render — and the Gantt re-renders on every 5 s sync and every interaction. (The
surrounding `courtRows`/`packing`/`placements` memos are correct; this `.find` is the outlier.)

**→ FIX B (applied):** build a `Map<matchId, assignment>` once (memoized) and look up O(1).
Pure work-removal, pixel-identical output.

### #3 — `analyzeImpact` + fresh props recompute every render

`selectedAnalysis = liveOps.analyzeImpact(selectedMatchId)` runs on **every** render
(`MatchControlCenterPage.tsx:134-136`), looping all assignments and returning a fresh
`directlyImpacted` array. That array is passed to `GanttChart` as `impactedMatchIds`
(`:554`) — a fresh reference each render — which rebuilds a `Set` inside GanttChart
(`GanttChart.tsx:84`). `onRequestReopenCourt={() => setDirectorOpen(true)}` (`:556`) is likewise a
fresh closure each render.

**→ FIX C (applied):** wrap `analyzeImpact` in `useMemo` keyed on `selectedMatchId` + the inputs
it reads; hoist `onRequestReopenCourt` to a `useCallback`. Removes a per-render graph walk and
stabilizes two props (also unblocks a future `React.memo` on GanttChart).

### #4 — N independent 1-second `ElapsedTimer` intervals (deferred)

Each called/in-progress row renders an `ElapsedTimer` that owns its own
`setInterval(tick, 1000)` (`components/common/ElapsedTimer.tsx:57`). A busy board = dozens of
independent 1 s intervals, each re-rendering its row every second.

**→ Deferred.** The clean fix is a single shared second-precision tick (context/store) that all
timers subscribe to. It touches a component shared with the Operations product and adds a small
primitive, so per the plan's "remove work over add machinery, measure first" rule it should land
as its own measured change after #1–#3 (which remove the larger steady-state cost). Requires a
before/after Performance-panel capture on a ≥12-row live board to justify.

### #5 — Static `shadow-glow` box-shadows scale with row count (accepted)

`shadow-glow` (a static `box-shadow: var(--glow-accent)`) is on every accent action button;
on a busy board ~20+ paint simultaneously (`WorkflowPanel`, `UpNextCard`, `InProgressCard`,
rail). These are **static** (paint/composite cost, not per-frame) and are the approved brand
signature (design canon). The **only infinite animation, `phase-glow`, is NOT on this view** —
it's confined to `SolverHud` during an active solve (`SolverHud.tsx:125`). No persistent
`backdrop-filter` on the Run surface. **No action** — within budget; revisit only if a
shadow-budget guardrail (added in P1.F) is exceeded after the Operations migration.

## 3. Known-bug verify sweep (§0.3 of the program)

The program prompt predates Phase 0a (commit `94cf7a7`). Re-verified today:

| Item | Status |
|---|---|
| Unwired classes (`bg-bg-subtle`/`text-fg`) | ✅ fixed in 0a + `check-classes.mjs` gate; re-ran, green |
| Sub-4.5:1 alpha text; dark `bg-muted` no-op selected rows | ✅ fixed in 0a; contrast gate green |
| Dead DS components (PageHeader/Input/Label) | ✅ deleted in 0a |
| Backend 409 lock mirrors | ✅ shipped in 0a (7 tests) |
| **Display `StatusPill` name collision** | ⚠️ **still present** — local `function StatusPill` at `CourtsView.tsx:429` shadows the canon pill. Fixed in P1.0 (rename, correctness commit). |

## 4. Applied plan (P1)

Order, each its own commit, gates green after each:

1. **P1.0** StatusPill collision rename (correctness).
2. **FIX A** ModuleOutlet lazy — bundle delta recorded.
3. **FIX B** Gantt O(N²)→O(N).
4. **FIX C** memoize analyzeImpact + stabilize props.
5. **FIX F** dirty-check match-state sync.
6. **P1.F** guardrails appended to `DESIGN_SPEC_DRAFT.md` + CLAUDE.md draft.

Deferred (documented, not applied): #4 ElapsedTimer shared tick; a `React.memo` pass on
GanttChart/WorkflowPanel (now unblocked by FIX C but wants an empirical re-render count first).
