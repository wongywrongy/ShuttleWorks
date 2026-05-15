# GanttTimeline Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Proposed — not yet started. Written 2026-05-13 as a spin-off from the ShuttleWorks design-system reconciliation (the parent ask wanted 7 components extracted; audit found this is the one with a genuine multi-consumer extraction case under DESIGN.md §9).

**Goal:** Collapse the three flexbox-based court×time Gantt implementations into one shared `GanttTimeline` scaffold in `@scheduler/design-system`, so the operator's eye never recalibrates between Schedule, Live, and the solver-optimization view, and so state-visualization fixes land once.

**Explicitly out of scope:** `products/scheduler/frontend/src/features/bracket/ScheduleView.tsx`. It is a `<table>`/`colSpan` grid over the bracket `TournamentDTO` domain (slots, not time) — a different paradigm and a different data model. Folding it in would force a lowest-common-denominator API that helps no one. It stays as-is; revisit only if a fourth time-axis consumer appears.

> **⚠ Superseded note (2026-05-14):** the "revisit if a fourth time-axis consumer appears" condition has been met. `docs/superpowers/specs/2026-05-14-bracket-court-time-views-decomposition.md` makes the bracket Schedule + Live views the 4th and 5th consumers of this scaffold. This plan still executes **as written** for the meet's 3 consumers; the bracket consumers are sub-projects #3 (Schedule Gantt) and #4 (Live Gantt) in that decomposition and slot in afterward — sub-project #1 (the bracket interactive-scheduling backend they depend on) is already implemented.

---

## Current state

| File | Lines | Role | Geometry | Interaction | State viz |
|---|---|---|---|---|---|
| `features/schedule/DragGantt.tsx` | 632 | Meet Schedule tab | 80×40, label 56 | dnd-kit drag/drop + validate | selection ring, pin marching-ants, generating opacity |
| `features/control-center/GanttChart.tsx` | 480 | Meet Live tab | 80×40, label 56 | click-select | traffic-light/impact/postponed/resting/late rings, sub-lane packing, render-slot adjustment |
| `features/schedule/live/LiveTimelineGrid.tsx` | 258 | Solver-optimization view | **48×32** (local consts) | none (read-only) | entry animation only |
| `features/schedule/ganttGeometry.ts` | 11 | Shared geometry (DragGantt + GanttChart only) | `SLOT_WIDTH=80 ROW_HEIGHT=40 COURT_LABEL_WIDTH=56` | — | — |

**What's already shared:** `ganttGeometry.ts` — but only two of the three consume it; `LiveTimelineGrid` redeclares `48/32` locally.

**What's genuinely shared across all three (≈80% scaffold):** flexbox court rows + absolute-positioned match blocks, the court-label column, the time-header row, the grid mesh, and the `left`/`width`/`top` positioning math from `(slot, court)` → pixels.

**What's genuinely divergent:**
- **Data source** — DragGantt/LiveTimelineGrid read `ScheduleDTO`/`assignments`; GanttChart additionally reads `matchStates` and does `getRenderSlot()` elapsed-time adjustment.
- **Interaction** — full dnd-kit (DragGantt) vs click-select (GanttChart) vs none (LiveTimelineGrid).
- **Chip body + state rings** — every variant draws a different chip with a different state vocabulary.
- **Sub-lane packing** — GanttChart only.
- **Geometry tier** — LiveTimelineGrid is intentionally compact (48×32); that is a feature, not drift.

---

## Architecture

A shared **`GanttTimeline`** component in `packages/design-system/components/` that owns *only the scaffold*:

- Geometry (accepts a `density: 'standard' | 'compact'` prop → `80×40` or `48×32`; no consumer hard-codes constants).
- The court-label column + time-header row + grid mesh.
- The positioning math: given a list of `{ courtIndex, startSlot, span, laneIndex }` placements, it absolutely-positions children into the grid.
- A `renderBlock` render-prop: each consumer draws its own chip (body text, colors, state rings) — the scaffold positions it, the consumer paints it.

Everything variable stays in the consumer:
- **Interaction** stays product-side. The scaffold renders positioned slots and exposes `onCellClick(court, slot)` / cell refs; DragGantt keeps its dnd-kit `DndContext`/`useDroppable` wrapping the scaffold. The scaffold must never assume an interaction model.
- **Data adaptation** stays product-side — each consumer maps its DTO to the scaffold's `placements` shape.
- **Sub-lane packing** stays in GanttChart (it produces `laneIndex` values the scaffold just honors).

This honors DESIGN.md §9 (extract the shared thing, not the product composition) and §6 (each migrated file should drop well under 300 lines).

**Tech stack:** TypeScript · React 19 · Vite · Tailwind 3 · `@scheduler/design-system` · `@dnd-kit/*` (DragGantt only) · Playwright (E2E).

---

## Phase 0 — Geometry consolidation (warm-up, low risk)

- [ ] Extend `features/schedule/ganttGeometry.ts` with a compact tier: export `GANTT_GEOMETRY = { standard: {slot:80,row:40,label:56}, compact: {slot:48,row:32,label:56} }` (keep the existing named exports as `standard` aliases for now).
- [ ] Repoint `LiveTimelineGrid.tsx` to consume the compact tier instead of its local `SLOT_WIDTH=48 ROW_HEIGHT=32`.
- [ ] Verify: `tsc -b`, `vite build`, eyeball the solver-optimization view.
- [ ] **Commit:** `refactor(gantt): single geometry source with standard/compact tiers`

## Phase 1 — Extract the `GanttTimeline` scaffold + migrate LiveTimelineGrid

LiveTimelineGrid is migrated first because it is read-only with no state rings — it exercises the scaffold without interaction risk.

- [ ] Create `packages/design-system/components/GanttTimeline.tsx`: props `{ courts, slotCount, density, placements, renderBlock, onCellClick?, headerLabel? }`. Move `GANTT_GEOMETRY` into the package (products re-import from the design system; delete `ganttGeometry.ts` once all consumers move, Phase 3).
- [ ] Scaffold renders: court-label column, time-header row, grid mesh, and absolutely-positioned `renderBlock(placement)` children. No domain types — `placement` is `{ courtIndex, startSlot, span, laneIndex?, key }`.
- [ ] Export from `packages/design-system/components/index.ts`.
- [ ] Rewrite `LiveTimelineGrid.tsx` as a thin adapter: map `assignments` → `placements`, pass a `renderBlock` that draws the event-colored chip + entry animation.
- [ ] Verify: `tsc -b`, `vite build`, solver-optimization view renders identically in both density modes, light + dark.
- [ ] **Commit:** `feat(design-system): GanttTimeline scaffold + LiveTimelineGrid migration`

## Phase 2 — Migrate GanttChart (Live tab)

- [ ] Rewrite `GanttChart.tsx` as an adapter over `GanttTimeline`. Keep in the consumer: `matchStates` adaptation, `getRenderSlot()` elapsed-time adjustment, sub-lane packing (emit `laneIndex`), and the full state-ring vocabulary inside `renderBlock` (selected > blocked > impacted > postponed > resting > late).
- [ ] Keep click-select via the scaffold's `onCellClick` / block click handler.
- [ ] Verify: `tsc -b`, `vite build`, Live tab — traffic lights, impact rings, court-closure reopen, selection all still work. Playwright Live-tab spec green.
- [ ] **Commit:** `refactor(control-center): GanttChart consumes shared GanttTimeline`

## Phase 3 — Migrate DragGantt (Schedule tab) — highest risk

- [ ] Rewrite `DragGantt.tsx` as an adapter: dnd-kit `DndContext` + `useDroppable` cells wrap the `GanttTimeline` scaffold; `useDraggable` lives inside the `renderBlock` chip. The scaffold stays interaction-agnostic — it must expose cell geometry/refs cleanly enough that dnd-kit can attach without the scaffold knowing about drag.
- [ ] Keep in the consumer: `/schedule/validate` debounced validation, green/red hover wash, drop feedback (`animate-drop-ok` / `animate-shake`), `pinAndResolve()`.
- [ ] Delete `features/schedule/ganttGeometry.ts` (all consumers now import `GANTT_GEOMETRY` from the design system).
- [ ] Verify: `tsc -b`, `vite build`, full Schedule-tab drag/drop/validate/pin loop by hand + Playwright Schedule spec green.
- [ ] **Commit:** `refactor(schedule): DragGantt consumes shared GanttTimeline`

---

## End-to-end verification

- [ ] `npx tsc -b` clean (from `products/scheduler/frontend`)
- [ ] `npm run build:scheduler` succeeds
- [ ] `npm run lint:scheduler` clean
- [ ] Playwright E2E: Schedule + Live tab specs green
- [ ] Manual: Schedule drag/drop/validate/pin; Live traffic-lights/impact/reopen; solver-optimization animation — all in light **and** dark, standard **and** compact density
- [ ] Each migrated file is under the DESIGN.md §6 300-line limit

## Open questions / risks

1. **dnd-kit ↔ scaffold boundary (Phase 3).** The scaffold must expose droppable cell geometry without importing `@dnd-kit`. If a clean ref/coordinate API can't be found, fallback: the scaffold accepts a `cellWrapper` render-prop so DragGantt can wrap each cell in `useDroppable`. Decide during Phase 1 API design, before LiveTimelineGrid locks the shape.
2. **Coordination with the locked design-unification plan.** `SchedulePage.tsx` (834) and `MatchDetailsPanel.tsx` (923) are Phase-5 megacomponent-refactor targets in `docs/superpowers/plans/2026-05-13-design-unification-dashboard-bracket.md`'s parent effort. DragGantt lives under `SchedulePage`; sequence this plan's Phase 3 *before or after* that refactor, not interleaved.
3. **`renderBlock` perf.** GanttChart animates on state change via an `animatedIds` set. Confirm the render-prop boundary doesn't defeat memoization — the scaffold should `memo` positioned children by `placement.key`.
