# GanttTimeline Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared `GanttTimeline` court×time scaffold into `@scheduler/design-system` and migrate the meet's three Gantt implementations (`LiveTimelineGrid`, `GanttChart`, `DragGantt`) onto it so geometry, grid mesh, and positioning math live in one place.

**Architecture:** `GanttTimeline` owns *only the scaffold* — `GANTT_GEOMETRY` (standard/compact density tiers), the court-label column, the time-header row, the grid mesh, and the pure `(courtIndex, startSlot, span)` → pixel math. Consumers stay responsible for everything variable: DTO→`placements` adaptation, chip bodies + state rings (via a `renderBlock` render-prop), cell decoration (via a `renderCell` render-prop), and interaction. dnd-kit stays entirely product-side: DragGantt wraps each scaffold cell in `useDroppable` through `renderCell` and each chip in `useDraggable` through `renderBlock`; the scaffold never imports `@dnd-kit`. Positioned children are memoized by `placement.key`.

**Tech Stack:** TypeScript · React 19 · Vite · Tailwind 3 · `@scheduler/design-system` · `@dnd-kit/*` (DragGantt only) · Vitest

**Reference plan:** `docs/superpowers/plans/2026-05-13-gantt-timeline-unification.md` (the strategic plan this expands)

**Pre-existing-condition note (read before verifying anything):** The `make test-e2e` Playwright suite is **stale** — every spec does `goto('/')` expecting the old app shell, but `/` is the dashboard now. The strategic plan's "Playwright spec green" verification lines are therefore obsolete. This plan replaces them with `tsc -b` + `npm run build:scheduler` + `npm run lint:scheduler` + (where a human-eye check is genuinely needed) a browser-harness visual check. Do **not** chase Playwright green.

**browser-harness note:** browser-harness currently needs a one-time user Chrome remote-debugging toggle that may not be enabled. Every visual-check step below is written as "browser-harness visual check (may be gated on the Chrome remote-debugging toggle — if unavailable, the executor flags it and the controller surfaces it)". No task **blocks** on a visual check; type-check + build + lint are the hard gates.

**Sequencing caveat (strategic plan risk #2):** `SchedulePage.tsx` and `MatchDetailsPanel.tsx` are megacomponent-refactor targets in a separate locked plan. `DragGantt` lives under `SchedulePage`. Run **this plan's Phase 3 entirely before or entirely after** that refactor — not interleaved. Phases 0–2 do not touch `SchedulePage` body and are safe regardless.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `products/scheduler/frontend/src/features/schedule/ganttGeometry.ts` | Modify (P0), Modify (P1), **Delete (P3)** | P0: add `GANTT_GEOMETRY` with standard/compact tiers alongside existing named exports. P1: becomes a thin re-export of the design-system source. P3: deleted once `DragGantt` is the last importer to move. |
| `packages/design-system/components/GanttTimeline.tsx` | **Create (P1)** | The shared scaffold: `GANTT_GEOMETRY`, `Placement` / `GanttTimelineProps` / `GanttCell` types, the pure `placementBox()` positioning math, the `GanttTimeline` component, the `React.memo`-wrapped `PositionedBlock`, and the default cell renderer. |
| `packages/design-system/components/index.ts` | Modify (P1) | Add the `GanttTimeline` barrel export line. |
| `products/scheduler/frontend/src/lib/__tests__/ganttTimeline.test.ts` | **Create (P1)** | Vitest unit tests for `GANTT_GEOMETRY` (tier values) and `placementBox()` (pure pixel math). Lives in the frontend tree because the Vitest runner's `include` glob only scans `src/**/__tests__/**`; imports the scaffold via the `@scheduler/design-system` workspace symlink. |
| `products/scheduler/frontend/src/features/schedule/live/LiveTimelineGrid.tsx` | Modify (P0), Modify (P1) | P0: drop local `48/32` consts, consume the compact tier. P1: rewrite as a thin `GanttTimeline` adapter (target ≈130 lines, down from 258). |
| `products/scheduler/frontend/src/features/control-center/GanttChart.tsx` | Modify (P2) | Rewrite as a `GanttTimeline` adapter; keeps `matchStates` adaptation, `getRenderSlot()`, sub-lane packing, the full state-ring vocabulary, click-select (target ≈220 lines, down from 480). |
| `products/scheduler/frontend/src/features/schedule/DragGantt.tsx` | Modify (P3) | Rewrite as a `GanttTimeline` adapter; dnd-kit `DndContext` wraps the scaffold, `useDroppable` attaches through `renderCell`, `useDraggable` through `renderBlock`; keeps `/schedule/validate`, drop FX, `pinAndResolve` (target ≈250 lines, down from 632). |

Unchanged shared modules the consumers keep importing directly: `eventColors.ts`, `courtClosures.ts`, `lib/time.ts`, `lib/indexById.ts`, `utils/trafficLight.ts`, `api/client.ts`, the Zustand stores, `hooks/useSchedule.ts`. None of these move into the scaffold.

---

## Phase 0 — Geometry consolidation

Warm-up, low risk. Single source of truth for geometry, with a compact tier; repoint `LiveTimelineGrid` onto it. Nothing structural — `GANTT_GEOMETRY` still lives in the product file at this phase.

### Task 0.1 — `GANTT_GEOMETRY` tiers + LiveTimelineGrid repoint

**Files:**
- Modify: `products/scheduler/frontend/src/features/schedule/ganttGeometry.ts`
- Modify: `products/scheduler/frontend/src/features/schedule/live/LiveTimelineGrid.tsx`

**Steps:**

- [ ] In `ganttGeometry.ts`, **keep** the three existing named exports (`SLOT_WIDTH`, `ROW_HEIGHT`, `COURT_LABEL_WIDTH`) so `DragGantt` and `GanttChart` compile untouched. Below them, add the tiered object and its type:
  ```ts
  /**
   * Density tiers for every court×time Gantt surface. `standard` is the
   * Schedule/Live operator grid (80×40); `compact` is the solver-
   * optimization view (48×32). The named `SLOT_WIDTH` / `ROW_HEIGHT` /
   * `COURT_LABEL_WIDTH` exports above alias the `standard` tier and are
   * retained until all consumers move to `GANTT_GEOMETRY` (then deleted).
   */
  export type GanttDensity = 'standard' | 'compact';

  export interface GanttGeometryTier {
    /** Pixel width of one time-slot column. */
    slot: number;
    /** Pixel height of one court row. */
    row: number;
    /** Pixel width of the left-hand court-label column. */
    label: number;
  }

  export const GANTT_GEOMETRY: Record<GanttDensity, GanttGeometryTier> = {
    standard: { slot: 80, row: 40, label: 56 },
    compact: { slot: 48, row: 32, label: 56 },
  };
  ```
- [ ] In `LiveTimelineGrid.tsx`, delete the local `const SLOT_WIDTH = 48;` and `const ROW_HEIGHT = 32;` lines.
- [ ] Add an import: `import { GANTT_GEOMETRY } from '../ganttGeometry';` and at the top of the component body add `const geom = GANTT_GEOMETRY.compact;`.
- [ ] Replace every `SLOT_WIDTH` usage with `geom.slot` and every `ROW_HEIGHT` usage with `geom.row` inside `LiveTimelineGrid` (header `style={{ width: SLOT_WIDTH }}`, grid-line `style={{ width: SLOT_WIDTH }}`, row `style={{ height: ROW_HEIGHT }}`, block `left`/`width`/`height` math at lines ~230–240).
- [ ] Replace the two `w-12` court-label classes (the header spacer `<div className="w-12 …" />` and the per-row `<div className="w-12 …">C{courtId}</div>`) with `style={{ width: geom.label }}` and drop `w-12` from the className. **This widens the compact court-label column from 48px to 56px** — an intentional visual delta so the compact tier's label column matches the standard tier (the strategic plan's contract). Note it in verification.
- [ ] Verify: `cd products/scheduler/frontend && npx tsc -b` → exit 0. Then `npm run build:scheduler` from repo root → build succeeds. Then `npm run lint:scheduler` → exit 0.
- [ ] browser-harness visual check (may be gated on the Chrome remote-debugging toggle — if unavailable, the executor flags it and the controller surfaces it): open the Schedule page mid-solve so `LiveTimelineGrid` renders. Expect: blocks/columns unchanged at 48×32; **court-label column visibly widened from 48→56px**; light + dark both render.
- [ ] **Commit:** `refactor(gantt): single geometry source with standard/compact tiers`
  ```
  Add GANTT_GEOMETRY with standard (80×40) and compact (48×32) tiers to
  ganttGeometry.ts and repoint LiveTimelineGrid onto the compact tier,
  replacing its local SLOT_WIDTH/ROW_HEIGHT constants. The compact court-
  label column widens 48→56px to match the standard tier. The legacy
  named exports remain for DragGantt/GanttChart until their migrations.
  ```

---

## Phase 1 — Extract the `GanttTimeline` scaffold + migrate LiveTimelineGrid

`LiveTimelineGrid` migrates first: read-only, no state rings, no interaction — it exercises the scaffold's positioning + render-props with the least risk. This phase also locks the full scaffold API; every later task references these exact symbols.

### Task 1.1 — Create the `GanttTimeline` scaffold + unit tests

**Files:**
- Create: `packages/design-system/components/GanttTimeline.tsx`
- Modify: `packages/design-system/components/index.ts`
- Create (Test): `products/scheduler/frontend/src/lib/__tests__/ganttTimeline.test.ts`

**Design decision — the dnd-kit ↔ scaffold boundary (resolves strategic plan risk #1):** The scaffold exposes a **`renderCell` render-prop**, not a refs-only API. A refs-only API (strategic plan option (a)) does not survive contact with the three consumers: cell *bodies* diverge, not just refs — `DragGantt`'s cell carries a `useDroppable` node ref **plus** `isOver` shading, a feasible/infeasible validation ring, `dropFx` animations, and closed-slot shading; `GanttChart`'s cell carries an every-other-slot divider, a `currentSlot` tint, and closed-slot fill; `LiveTimelineGrid`'s cell carries only the divider. Unifying those through refs would force the scaffold to know about validation/dropFx/closures — a domain leak. With `renderCell`, the scaffold lays out the cell grid and hands each consumer `{ courtId, slotId, slotIndex }`; the consumer paints whatever it needs and, for `DragGantt`, mounts `useDroppable` inside its own cell component. The scaffold ships a default cell renderer (every-other-slot divider) so `LiveTimelineGrid` barely overrides anything. Symmetrically, `renderBlock` already lets `DragGantt` mount `useDraggable` inside the chip. The scaffold imports zero `@dnd-kit`.

**Steps:**

- [ ] Create `packages/design-system/components/GanttTimeline.tsx` with the **complete** content below. This file is the API contract — every symbol here (`GANTT_GEOMETRY`, `GanttDensity`, `GanttGeometryTier`, `Placement`, `GanttCell`, `GanttBlockBox`, `GanttTimelineProps`, `placementBox`, `GanttTimeline`) is referenced verbatim by later tasks.
  ```tsx
  /**
   * GanttTimeline — shared court×time scaffold.
   *
   * Owns ONLY the scaffold: density geometry, the court-label column,
   * the time-header row, the grid mesh, and the pure (courtIndex,
   * startSlot, span) → pixel positioning math. Everything variable —
   * DTO adaptation, chip bodies, state rings, interaction — stays in
   * the consumer via the `renderBlock` / `renderCell` render-props.
   *
   * The scaffold is interaction-agnostic and imports no product code
   * and no `@dnd-kit`: consumers that need drag/drop mount their own
   * dnd-kit nodes INSIDE `renderBlock` (draggable chip) and `renderCell`
   * (droppable cell). See DESIGN.md §9 (extract the shared thing, not
   * the composition).
   *
   * Perf: positioned children are wrapped in `React.memo` keyed by
   * `placement.key`. CONSUMER CONTRACT — pass `useCallback`-stable
   * `renderBlock` / `renderCell` references or the memo busts on every
   * parent render.
   */
  import { memo, useMemo, type ReactNode } from 'react';
  import { cn } from '../lib/utils';

  // --- geometry --------------------------------------------------------------

  /** Density tiers. `standard` = Schedule/Live operator grid; `compact`
   *  = solver-optimization view. Single source of truth — no consumer
   *  hard-codes slot/row/label pixels. */
  export type GanttDensity = 'standard' | 'compact';

  export interface GanttGeometryTier {
    /** Pixel width of one time-slot column. */
    slot: number;
    /** Pixel height of one court row. */
    row: number;
    /** Pixel width of the left-hand court-label column. */
    label: number;
  }

  export const GANTT_GEOMETRY: Record<GanttDensity, GanttGeometryTier> = {
    standard: { slot: 80, row: 40, label: 56 },
    compact: { slot: 48, row: 32, label: 56 },
  };

  // --- types -----------------------------------------------------------------

  /** One positioned block. The consumer maps its DTO onto this shape;
   *  the scaffold positions it and `renderBlock` paints it.
   *  - `courtIndex` is 0-based (row 0 = first court).
   *  - `startSlot` is absolute (not yet offset by the visible window).
   *  - `span` is the block's width in slots (>= 1 enforced downstream).
   *  - `laneIndex` (default 0) drives horizontal sub-lane packing: a
   *    block with `laneCount > 1` is shrunk to `1/laneCount` width and
   *    offset by `laneIndex` lanes. `laneCount` defaults to 1.
   *  - `key` is the React key AND the memo identity. */
  export interface Placement {
    courtIndex: number;
    startSlot: number;
    span: number;
    laneIndex?: number;
    laneCount?: number;
    key: string;
  }

  /** Cell identity handed to `renderCell`. `slotIndex` is the 0-based
   *  column index within the visible window; `slotId` is the absolute
   *  slot. `courtId` is 1-based to match the consumers' domain. */
  export interface GanttCell {
    courtId: number;
    slotId: number;
    slotIndex: number;
  }

  /** Pixel box for one block, before the consumer's own inset padding. */
  export interface GanttBlockBox {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  export interface GanttTimelineProps {
    /** 1-based court IDs, in render order (e.g. [1,2,3,4]). */
    courts: number[];
    /** Absolute slot id of the first visible column. */
    minSlot: number;
    /** Number of visible slot columns. */
    slotCount: number;
    /** Geometry tier. */
    density: GanttDensity;
    /** Positioned blocks. */
    placements: Placement[];
    /** Paints one positioned block. MUST be `useCallback`-stable. */
    renderBlock: (placement: Placement, box: GanttBlockBox) => ReactNode;
    /** Optional per-cell decoration. Defaults to an every-other-slot
     *  hairline divider. MUST be `useCallback`-stable if provided. */
    renderCell?: (cell: GanttCell) => ReactNode;
    /** Optional bare-cell click — fires with the cell's court/slot when
     *  the click lands on the grid mesh (not on a block). */
    onCellClick?: (courtId: number, slotId: number) => void;
    /** Optional header text for the court-label column corner cell.
     *  Defaults to "Court". Pass `''` for a blank corner. */
    headerLabel?: string;
    /** Header slot-label renderer. Receives the absolute slot id and
     *  the 0-based visible column index; return the label string (the
     *  consumer decides the every-other-slot cadence and time format).
     *  When omitted, the header shows no per-slot text. */
    renderSlotLabel?: (slotId: number, slotIndex: number) => ReactNode;
    /** Optional per-row decoration BEHIND the blocks (e.g. a closed-
     *  court "court closed" overlay). Receives the 1-based court id. */
    renderRow?: (courtId: number) => ReactNode;
    /** Optional left-column cell renderer. Defaults to a "C{courtId}"
     *  label. Used by consumers that need a clickable closed-court
     *  button in the label column. */
    renderCourtLabel?: (courtId: number) => ReactNode;
    /** Highlights the current-time column in the header + mesh. */
    currentSlot?: number;
    /** Forwarded to the outer wrapper. */
    className?: string;
    /** Forwarded to the outer wrapper (e.g. `data-testid`). */
    'data-testid'?: string;
  }

  // --- pure positioning math -------------------------------------------------

  /**
   * Pure (courtIndex, startSlot, span) → pixel box. Unit-tested in
   * `ganttTimeline.test.ts`. `laneIndex`/`laneCount` apply horizontal
   * sub-lane packing: a 2-lane block is half width and offset by its
   * lane; a 1-lane block keeps full slot width. `span` is clamped to
   * >= 1 so a zero/garbage span still renders a visible block.
   */
  export function placementBox(
    placement: Placement,
    minSlot: number,
    tier: GanttGeometryTier,
  ): GanttBlockBox {
    const laneCount = Math.max(1, placement.laneCount ?? 1);
    const laneIndex = Math.min(Math.max(0, placement.laneIndex ?? 0), laneCount - 1);
    const span = Math.max(1, placement.span);
    const fullWidth = span * tier.slot;
    const width = laneCount > 1 ? fullWidth / laneCount : fullWidth;
    const baseLeft = (placement.startSlot - minSlot) * tier.slot;
    const left = laneCount > 1 ? baseLeft + laneIndex * width : baseLeft;
    const top = placement.courtIndex * tier.row;
    return { left, top, width, height: tier.row };
  }

  // --- memoized positioned block --------------------------------------------

  interface PositionedBlockProps {
    placement: Placement;
    box: GanttBlockBox;
    renderBlock: (placement: Placement, box: GanttBlockBox) => ReactNode;
  }

  /** Wraps one absolutely-positioned block. Memoized by `placement.key`
   *  (React.memo's default shallow compare over the props): a parent
   *  re-render that leaves a placement's identity + box + stable
   *  `renderBlock` ref untouched skips this subtree. */
  const PositionedBlock = memo(function PositionedBlock({
    placement,
    box,
    renderBlock,
  }: PositionedBlockProps) {
    return (
      <div
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        }}
      >
        {renderBlock(placement, box)}
      </div>
    );
  });

  // --- default renderers -----------------------------------------------------

  function defaultRenderCell(cell: GanttCell): ReactNode {
    return (
      <div
        className={cn(
          'h-full w-full',
          cell.slotIndex % 2 === 0 ? 'border-l border-border/30' : '',
        )}
      />
    );
  }

  function defaultRenderCourtLabel(courtId: number): ReactNode {
    return (
      <span className="flex h-full items-center px-2 text-xs font-semibold tabular-nums text-foreground">
        C{courtId}
      </span>
    );
  }

  // --- scaffold --------------------------------------------------------------

  export function GanttTimeline({
    courts,
    minSlot,
    slotCount,
    density,
    placements,
    renderBlock,
    renderCell = defaultRenderCell,
    onCellClick,
    headerLabel = 'Court',
    renderSlotLabel,
    renderRow,
    renderCourtLabel = defaultRenderCourtLabel,
    currentSlot,
    className,
    ...rest
  }: GanttTimelineProps) {
    const tier = GANTT_GEOMETRY[density];
    const gridWidth = tier.label + slotCount * tier.slot;

    // Absolute slot ids for the visible window, computed once per range.
    const slotIds = useMemo(
      () => Array.from({ length: slotCount }, (_, i) => minSlot + i),
      [minSlot, slotCount],
    );

    // Group placements by court row so each row absolutely-positions
    // only its own blocks.
    const byCourtIndex = useMemo(() => {
      const map = new Map<number, Placement[]>();
      for (let i = 0; i < courts.length; i++) map.set(i, []);
      for (const p of placements) {
        const row = map.get(p.courtIndex);
        if (row) row.push(p);
      }
      return map;
    }, [placements, courts.length]);

    return (
      <div className={cn('overflow-x-auto', className)} {...rest}>
        <div style={{ width: gridWidth }}>
          {/* Time-header row */}
          <div className="flex border-b border-border/60 bg-muted/40">
            <div
              style={{ width: tier.label }}
              className="flex-shrink-0 px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {headerLabel}
            </div>
            {slotIds.map((slotId, i) => (
              <div
                key={slotId}
                style={{ width: tier.slot }}
                className={cn(
                  'flex-shrink-0 border-l border-border px-1 py-1 text-center text-2xs tabular-nums',
                  slotId === currentSlot
                    ? 'bg-status-live/15 font-semibold text-status-live'
                    : 'text-muted-foreground',
                )}
              >
                {renderSlotLabel ? renderSlotLabel(slotId, i) : ''}
              </div>
            ))}
          </div>

          {/* Court rows */}
          {courts.map((courtId, courtIndex) => (
            <div
              key={courtId}
              className="relative flex border-b border-border/60"
              style={{ height: tier.row }}
            >
              {/* Left court-label column */}
              <div
                style={{ width: tier.label, height: tier.row }}
                className="flex-shrink-0 bg-muted/30"
              >
                {renderCourtLabel(courtId)}
              </div>

              {/* Mesh + blocks */}
              <div className="relative gantt-grid" style={{ flex: '1 1 auto' }}>
                {/* Cell mesh */}
                <div className="absolute inset-0 flex">
                  {slotIds.map((slotId, slotIndex) => (
                    <div
                      key={slotId}
                      style={{ width: tier.slot }}
                      className="flex-shrink-0"
                      onClick={
                        onCellClick
                          ? () => onCellClick(courtId, slotId)
                          : undefined
                      }
                    >
                      {renderCell({ courtId, slotId, slotIndex })}
                    </div>
                  ))}
                </div>

                {/* Per-row decoration behind blocks */}
                {renderRow ? renderRow(courtId) : null}

                {/* Positioned blocks for this court */}
                {(byCourtIndex.get(courtIndex) ?? []).map((placement) => (
                  <PositionedBlock
                    key={placement.key}
                    placement={placement}
                    box={placementBox(placement, minSlot, tier)}
                    renderBlock={renderBlock}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  ```
- [ ] In `packages/design-system/components/index.ts`, add after the `Toast` export line:
  ```ts
  export {
    GanttTimeline,
    GANTT_GEOMETRY,
    placementBox,
    type GanttDensity,
    type GanttGeometryTier,
    type Placement,
    type GanttCell,
    type GanttBlockBox,
    type GanttTimelineProps,
  } from './GanttTimeline';
  ```
- [ ] Create `products/scheduler/frontend/src/lib/__tests__/ganttTimeline.test.ts` with the **complete** content below. (Lives in the frontend tree because Vitest's `include` glob is `src/**/__tests__/**`; the scaffold resolves via the `@scheduler/design-system` workspace symlink. Precedent: `bracketTabs.test.ts`.)
  ```ts
  import { describe, it, expect } from 'vitest';
  import { GANTT_GEOMETRY, placementBox } from '@scheduler/design-system/components';
  import type { Placement } from '@scheduler/design-system/components';

  describe('GANTT_GEOMETRY', () => {
    it('standard tier is 80×40 with a 56px label column', () => {
      expect(GANTT_GEOMETRY.standard).toEqual({ slot: 80, row: 40, label: 56 });
    });
    it('compact tier is 48×32 with a 56px label column', () => {
      expect(GANTT_GEOMETRY.compact).toEqual({ slot: 48, row: 32, label: 56 });
    });
  });

  describe('placementBox', () => {
    const p = (over: Partial<Placement>): Placement => ({
      courtIndex: 0,
      startSlot: 0,
      span: 1,
      key: 'k',
      ...over,
    });

    it('positions a single-lane block at slot×width, court×row', () => {
      const box = placementBox(
        p({ courtIndex: 2, startSlot: 5, span: 3 }),
        0,
        GANTT_GEOMETRY.standard,
      );
      expect(box).toEqual({ left: 400, top: 80, width: 240, height: 40 });
    });

    it('offsets left by the visible window minSlot', () => {
      const box = placementBox(
        p({ startSlot: 5, span: 2 }),
        4,
        GANTT_GEOMETRY.standard,
      );
      expect(box.left).toBe(80); // (5 - 4) * 80
      expect(box.width).toBe(160);
    });

    it('halves width and offsets a 2-lane (lane 1) block', () => {
      const box = placementBox(
        p({ startSlot: 0, span: 2, laneIndex: 1, laneCount: 2 }),
        0,
        GANTT_GEOMETRY.standard,
      );
      expect(box.width).toBe(80); // (2*80)/2
      expect(box.left).toBe(80); // baseLeft 0 + lane 1 * 80
    });

    it('keeps full slot width for a 1-lane block', () => {
      const box = placementBox(
        p({ startSlot: 0, span: 2, laneIndex: 0, laneCount: 1 }),
        0,
        GANTT_GEOMETRY.compact,
      );
      expect(box.width).toBe(96); // 2 * 48
      expect(box.left).toBe(0);
    });

    it('clamps span to >= 1 so a zero span still renders', () => {
      const box = placementBox(
        p({ span: 0 }),
        0,
        GANTT_GEOMETRY.standard,
      );
      expect(box.width).toBe(80);
    });

    it('clamps laneIndex into [0, laneCount - 1]', () => {
      const box = placementBox(
        p({ span: 1, laneIndex: 9, laneCount: 2 }),
        0,
        GANTT_GEOMETRY.standard,
      );
      expect(box.left).toBe(40); // clamped to lane 1: 0 + 1 * 40
    });
  });
  ```
- [ ] Verify the unit tests: `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/ganttTimeline.test.ts` → all tests pass (8 assertions across 2 describe blocks, exit 0).
- [ ] Verify: `cd products/scheduler/frontend && npx tsc -b` → exit 0. `npm run build:scheduler` from repo root → succeeds. `npm run lint:scheduler` → exit 0.
- [ ] **Commit:** `feat(design-system): GanttTimeline scaffold`
  ```
  Add GanttTimeline to @scheduler/design-system: the shared court×time
  scaffold owning density geometry (GANTT_GEOMETRY), the court-label
  column, time-header row, grid mesh, and the pure placementBox()
  positioning math. Consumers paint chips via renderBlock and decorate
  cells via renderCell; positioned blocks are React.memo'd by
  placement.key. The scaffold imports no @dnd-kit and no product code.

  Unit-tests GANTT_GEOMETRY tiers and placementBox() in the frontend
  test tree (Vitest only scans src/**/__tests__/**).
  ```

### Task 1.2 — Repoint `ganttGeometry.ts` to the design system + migrate `LiveTimelineGrid`

**Files:**
- Modify: `products/scheduler/frontend/src/features/schedule/ganttGeometry.ts`
- Modify: `products/scheduler/frontend/src/features/schedule/live/LiveTimelineGrid.tsx`

**Steps:**

- [ ] Rewrite `ganttGeometry.ts` as a **thin re-export** so `DragGantt` and `GanttChart` (still importing `SLOT_WIDTH` etc. from here) compile unchanged until their own phases. Full new content:
  ```ts
  /**
   * Geometry re-export shim. The source of truth is now
   * `@scheduler/design-system` (`GANTT_GEOMETRY`). This file remains as
   * a thin alias so DragGantt + GanttChart keep compiling on the legacy
   * named imports until their migrations land; it is deleted in Phase 3
   * once DragGantt — the last importer — moves to `GANTT_GEOMETRY`.
   */
  import { GANTT_GEOMETRY } from '@scheduler/design-system/components';

  export { GANTT_GEOMETRY } from '@scheduler/design-system/components';
  export type {
    GanttDensity,
    GanttGeometryTier,
  } from '@scheduler/design-system/components';

  /** @deprecated Use `GANTT_GEOMETRY.standard.slot`. */
  export const SLOT_WIDTH = GANTT_GEOMETRY.standard.slot;
  /** @deprecated Use `GANTT_GEOMETRY.standard.row`. */
  export const ROW_HEIGHT = GANTT_GEOMETRY.standard.row;
  /** @deprecated Use `GANTT_GEOMETRY.standard.label`. */
  export const COURT_LABEL_WIDTH = GANTT_GEOMETRY.standard.label;
  ```
- [ ] Rewrite `LiveTimelineGrid.tsx` as a thin `GanttTimeline` adapter. **Complete** new content (target ≈130 lines):
  ```tsx
  /**
   * Live timeline grid — the solver-optimization view. Read-only:
   * matches stream in as the solver improves the schedule. A thin
   * adapter over the shared GanttTimeline scaffold; the only thing it
   * owns is the event-colored chip + its entry animation and the
   * header legend/status strip.
   */
  import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
  import {
    GanttTimeline,
    type Placement,
    type GanttBlockBox,
  } from '@scheduler/design-system/components';
  import { calculateTotalSlots, formatSlotTime } from '../../../lib/time';
  import { indexById } from '../../../lib/indexById';
  import type {
    ScheduleAssignment,
    MatchDTO,
    PlayerDTO,
    TournamentConfig,
  } from '../../../api/dto';
  import { EVENT_COLORS, DEFAULT_EVENT_COLOR, getEventColor } from '../eventColors';

  interface LiveTimelineGridProps {
    assignments: ScheduleAssignment[];
    matches: MatchDTO[];
    players: PlayerDTO[];
    config: TournamentConfig;
    status?: 'solving' | 'complete' | 'error';
  }

  function getMatchLabel(match: MatchDTO): string {
    if (match.matchNumber) return `M${match.matchNumber}`;
    if (match.eventRank) return match.eventRank;
    return match.id.slice(0, 4);
  }

  function getEventType(eventRank: string | null | undefined): string {
    if (!eventRank) return '';
    return eventRank.replace(/[0-9]/g, '');
  }

  export function LiveTimelineGrid({
    assignments,
    matches,
    players,
    config,
    status = 'solving',
  }: LiveTimelineGridProps) {
    const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());
    const prevAssignmentsRef = useRef<string[]>([]);

    const matchMap = useMemo(() => indexById(matches), [matches]);
    const playerMap = useMemo(() => indexById(players), [players]);
    const totalSlots = useMemo(() => calculateTotalSlots(config), [config]);

    const { minSlot, maxSlot } = useMemo(() => {
      if (assignments.length === 0) return { minSlot: 0, maxSlot: Math.min(12, totalSlots) };
      const slots = assignments.map((a) => a.slotId);
      const endSlots = assignments.map((a) => a.slotId + a.durationSlots);
      return {
        minSlot: Math.max(0, Math.min(...slots) - 1),
        maxSlot: Math.min(totalSlots, Math.max(...endSlots) + 1),
      };
    }, [assignments, totalSlots]);
    const slotCount = maxSlot - minSlot;

    const courts = useMemo(
      () => Array.from({ length: config.courtCount }, (_, i) => i + 1),
      [config.courtCount],
    );

    // DTO → placements.
    const placements = useMemo<Placement[]>(
      () =>
        assignments.map((a) => ({
          courtIndex: a.courtId - 1,
          startSlot: a.slotId,
          span: a.durationSlots,
          key: a.matchId,
        })),
      [assignments],
    );

    // Entry-animation tracking: newly-arrived assignments fade/scale in.
    useEffect(() => {
      const currentIds = assignments.map((a) => a.matchId);
      const prevIds = prevAssignmentsRef.current;
      const newIds = currentIds.filter((id) => !prevIds.includes(id));
      if (newIds.length > 0) {
        newIds.forEach((id, index) => {
          setTimeout(() => {
            setAnimatedIds((prev) => new Set([...prev, id]));
          }, index * 10);
        });
      }
      prevAssignmentsRef.current = currentIds;
    }, [assignments]);

    const renderSlotLabel = useCallback(
      (slotId: number, slotIndex: number) =>
        slotIndex % 2 === 0 ? formatSlotTime(slotId, config) : '',
      [config],
    );

    const renderBlock = useCallback(
      (placement: Placement, box: GanttBlockBox) => {
        const match = matchMap.get(placement.key);
        const colors = match?.eventRank
          ? EVENT_COLORS[getEventType(match.eventRank)] ?? DEFAULT_EVENT_COLOR
          : DEFAULT_EVENT_COLOR;
        const isAnimated = animatedIds.has(placement.key);
        const sideANames = match?.sideA
          ?.map((id) => playerMap.get(id)?.name || 'Unknown')
          .join(', ');
        const sideBNames = match?.sideB
          ?.map((id) => playerMap.get(id)?.name || 'Unknown')
          .join(', ');
        const tooltip = match
          ? [
              match.eventRank ?? match.id.slice(0, 4),
              sideANames ? `A: ${sideANames}` : '',
              sideBNames ? `B: ${sideBNames}` : '',
            ]
              .filter(Boolean)
              .join('\n')
          : placement.key;
        return (
          <div
            // top-0.5 inset within the scaffold's row box (4px shorter).
            className={`absolute inset-x-0 top-0.5 rounded border cursor-default hover:brightness-95
              ${colors.bg} ${colors.border}
              transition-[opacity,transform] duration-fast ease-brand
              ${isAnimated ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
            style={{ height: box.height - 4 }}
            title={tooltip}
          >
            <div className="px-1 h-full flex items-center overflow-hidden">
              <span className="text-xs font-medium truncate text-foreground">
                {match ? getMatchLabel(match) : '?'}
              </span>
            </div>
          </div>
        );
      },
      [matchMap, playerMap, animatedIds],
    );

    if (assignments.length === 0) {
      return (
        <div className="bg-muted/40 rounded border border-border p-4 text-center text-muted-foreground">
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 bg-status-started rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
            <div className="text-xs">Waiting for first solution…</div>
          </div>
        </div>
      );
    }

    return (
      <div>
        {/* Legend + solver status strip */}
        <div className="px-2 py-1 border-b border-border/60 bg-muted/40 flex items-center gap-3 text-xs">
          {Object.entries(EVENT_COLORS).map(([key, { bg, border, label }]) => (
            <span key={key} className="flex items-center gap-1 text-muted-foreground" title={label}>
              <span className={`w-2.5 h-2.5 rounded ${bg} border ${border}`} />
              {key}
            </span>
          ))}
          <div className="flex-1" />
          {status === 'solving' && (
            <span className="flex items-center gap-1 text-status-started">
              <span className="w-1.5 h-1.5 rounded-full bg-status-started animate-ping" />
              Optimizing
            </span>
          )}
          {status === 'complete' && (
            <span className="flex items-center gap-1 text-status-live">
              <span className="w-1.5 h-1.5 rounded-full bg-status-live" />
              Complete
            </span>
          )}
        </div>

        <GanttTimeline
          courts={courts}
          minSlot={minSlot}
          slotCount={slotCount}
          density="compact"
          placements={placements}
          renderBlock={renderBlock}
          renderSlotLabel={renderSlotLabel}
          headerLabel=""
        />
      </div>
    );
  }
  ```
  > Note on `getEventColor`: imported but `LiveTimelineGrid` resolves colors via `EVENT_COLORS[getEventType(...)]` to preserve its existing prefix-strip behavior. If the executor finds `getEventColor` unused after writing the file, drop it from the import (`noUnusedLocals` is on) — `getEventColor` already does the prefix strip, so the executor MAY simplify to `getEventColor(match?.eventRank)` and remove the local `getEventType`. Either is acceptable; the unit-of-work is "event-colored chip renders the same."
- [ ] Verify: `cd products/scheduler/frontend && npx tsc -b` → exit 0. `npm run build:scheduler` from repo root → succeeds. `npm run lint:scheduler` → exit 0.
- [ ] Verify the scaffold's tests still pass: `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/ganttTimeline.test.ts` → exit 0.
- [ ] browser-harness visual check (may be gated on the Chrome remote-debugging toggle — if unavailable, the executor flags it and the controller surfaces it): Schedule page mid-solve. Expect: compact-density grid, event-colored chips fade/scale in as the solver streams, legend + "Optimizing"/"Complete" strip render, light + dark both clean.
- [ ] **Commit:** `feat(design-system): LiveTimelineGrid migration onto GanttTimeline`
  ```
  Rewrite LiveTimelineGrid as a thin GanttTimeline adapter: map
  assignments → placements, paint the event-colored chip + entry
  animation via renderBlock. ganttGeometry.ts becomes a thin re-export
  of @scheduler/design-system's GANTT_GEOMETRY so DragGantt/GanttChart
  keep compiling on the legacy named imports until their migrations.
  LiveTimelineGrid drops from 258 to ~130 lines.
  ```

---

## Phase 2 — Migrate `GanttChart` (Live tab)

`GanttChart` is the medium-risk migration: click-select interaction (no dnd-kit), but the richest state vocabulary — traffic-light/impact/postponed/resting/late rings, sub-lane packing, and `getRenderSlot()` elapsed-time adjustment. All of that stays consumer-side; the scaffold only positions.

### Task 2.1 — Rewrite `GanttChart` as a `GanttTimeline` adapter

**Files:**
- Modify: `products/scheduler/frontend/src/features/control-center/GanttChart.tsx`

**Strategic-plan "keep in the consumer" checklist for this task:** `matchStates` adaptation ✓, `getRenderSlot()` elapsed-time adjustment ✓, sub-lane packing emitting `laneIndex`/`laneCount` ✓, the full ring vocabulary (selected > blocked > impacted > postponed > resting > late) inside `renderBlock` ✓, click-select via `renderBlock`'s own `onClick` ✓, closed-court row/cell shading via `renderCell` + `renderRow` + `renderCourtLabel` ✓.

**Steps:**

- [ ] Rewrite `GanttChart.tsx`. **Complete** new content (target ≈220 lines):
  ```tsx
  /**
   * GanttChart — meet Live tab. A GanttTimeline adapter that paints
   * status-colored blocks with the live state-ring vocabulary.
   *
   * Stays consumer-side (the scaffold only positions):
   *  - matchStates adaptation + getRenderSlot() elapsed-time shift
   *  - horizontal sub-lane packing (emits laneIndex / laneCount)
   *  - the ring priority ladder: selected > blocked > impacted >
   *    postponed > resting > late
   *  - click-select, animatedIds state-change pulse
   *  - closed-court row/cell shading
   */
  import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
  import { DoorOpen } from '@phosphor-icons/react';
  import {
    GanttTimeline,
    type Placement,
    type GanttCell,
    type GanttBlockBox,
  } from '@scheduler/design-system/components';
  import { calculateTotalSlots, formatSlotTime, getRenderSlot } from '../../lib/time';
  import {
    getClosedSlotWindows,
    isCourtFullyClosed,
    isSlotClosed,
  } from '../../lib/courtClosures';
  import { indexById } from '../../lib/indexById';
  import type { TrafficLightResult } from '../../utils/trafficLight';
  import type {
    ScheduleDTO,
    MatchDTO,
    MatchStateDTO,
    TournamentConfig,
    ScheduleAssignment,
  } from '../../api/dto';

  interface GanttChartProps {
    schedule: ScheduleDTO;
    matches: MatchDTO[];
    matchStates: Record<string, MatchStateDTO>;
    config: TournamentConfig;
    currentSlot: number;
    selectedMatchId?: string | null;
    onMatchSelect: (matchId: string) => void;
    impactedMatchIds?: string[];
    trafficLights?: Map<string, TrafficLightResult>;
    onRequestReopenCourt?: (courtId: number) => void;
  }

  // Status → block fill. Wired to the semantic status-* tokens.
  const STATUS_STYLES: Record<
    'scheduled' | 'called' | 'started' | 'finished',
    { bg: string; border: string; text: string }
  > = {
    scheduled: { bg: 'bg-status-idle-bg', border: 'border-status-idle/40', text: 'text-foreground' },
    called: { bg: 'bg-status-called-bg', border: 'border-status-called/60', text: 'text-status-called' },
    started: {
      bg: 'bg-status-live-bg shadow-[inset_0_0_0_1px_hsl(var(--status-live)/0.5)]',
      border: 'border-status-live/60',
      text: 'text-status-live',
    },
    finished: { bg: 'bg-status-done-bg', border: 'border-status-done/30', text: 'text-muted-foreground' },
  };

  function getMatchLabel(match: MatchDTO): string {
    if (match.eventRank) return match.eventRank;
    if (match.matchNumber) return `M${match.matchNumber}`;
    return match.id.slice(0, 6);
  }

  export function GanttChart({
    schedule,
    matches,
    matchStates,
    config,
    currentSlot,
    selectedMatchId,
    onMatchSelect,
    impactedMatchIds = [],
    trafficLights,
    onRequestReopenCourt,
  }: GanttChartProps) {
    const matchMap = useMemo(() => indexById(matches), [matches]);
    const impactedSet = useMemo(() => new Set(impactedMatchIds), [impactedMatchIds]);
    const totalSlots = calculateTotalSlots(config);

    const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());
    const prevStatesRef = useRef<Record<string, string>>({});

    const { minSlot, maxSlot } = useMemo(() => {
      if (schedule.assignments.length === 0) return { minSlot: 0, maxSlot: Math.min(12, totalSlots) };
      const slots = schedule.assignments.map((a) => a.slotId);
      const endSlots = schedule.assignments.map((a) => a.slotId + a.durationSlots);
      return {
        minSlot: Math.max(0, Math.min(...slots) - 1),
        maxSlot: Math.min(totalSlots, Math.max(...endSlots) + 1),
      };
    }, [schedule.assignments, totalSlots]);
    const slotCount = maxSlot - minSlot;

    const courts = useMemo(
      () => Array.from({ length: config.courtCount }, (_, i) => i + 1),
      [config.courtCount],
    );
    const closedWindows = useMemo(
      () => getClosedSlotWindows(config, totalSlots),
      [config, totalSlots],
    );

    // Group assignments by EFFECTIVE court (actualCourtId override),
    // sorted by render slot. Carries the renderSlot so packing + the
    // placement map don't recompute getRenderSlot.
    const courtRows = useMemo(() => {
      const byCourt = new Map<
        number,
        { assignment: ScheduleAssignment; renderSlotId: number; renderSpan: number }[]
      >();
      for (let c = 1; c <= config.courtCount; c++) byCourt.set(c, []);
      for (const a of schedule.assignments) {
        const effCourt = matchStates[a.matchId]?.actualCourtId ?? a.courtId;
        const r = getRenderSlot(a, matchStates[a.matchId], config);
        (byCourt.get(effCourt) ?? []).push({
          assignment: a,
          renderSlotId: r.slotId,
          renderSpan: r.durationSlots,
        });
      }
      byCourt.forEach((rows) =>
        rows.sort(
          (x, y) =>
            x.renderSlotId - y.renderSlotId || x.assignment.slotId - y.assignment.slotId,
        ),
      );
      return byCourt;
    }, [schedule.assignments, config, matchStates]);

    // Horizontal sub-lane packing. Each block's laneCount = max
    // concurrent blocks on its court during its lifetime; lane = lowest
    // free horizontal lane at placement time.
    const packing = useMemo(() => {
      const laneByMatchId = new Map<string, number>();
      const laneCountByMatchId = new Map<string, number>();
      courtRows.forEach((rows) => {
        let active: { matchId: string; lane: number; end: number }[] = [];
        for (const { assignment, renderSlotId, renderSpan } of rows) {
          const start = renderSlotId;
          const end = start + renderSpan;
          active = active.filter((x) => x.end > start);
          const used = new Set(active.map((x) => x.lane));
          let lane = 0;
          while (used.has(lane)) lane++;
          laneByMatchId.set(assignment.matchId, lane);
          active.push({ matchId: assignment.matchId, lane, end });
          const size = active.length;
          for (const x of active) {
            const prior = laneCountByMatchId.get(x.matchId) ?? 1;
            if (size > prior) laneCountByMatchId.set(x.matchId, size);
          }
        }
      });
      return { laneByMatchId, laneCountByMatchId };
    }, [courtRows]);

    // DTO → placements (render slot + packing applied).
    const placements = useMemo<Placement[]>(() => {
      const out: Placement[] = [];
      courtRows.forEach((rows, courtId) => {
        for (const { assignment, renderSlotId, renderSpan } of rows) {
          out.push({
            courtIndex: courtId - 1,
            startSlot: renderSlotId,
            span: renderSpan,
            laneIndex: packing.laneByMatchId.get(assignment.matchId) ?? 0,
            laneCount: packing.laneCountByMatchId.get(assignment.matchId) ?? 1,
            key: assignment.matchId,
          });
        }
      });
      return out;
    }, [courtRows, packing]);

    // State-change pulse: a block whose status flips scales up briefly.
    useEffect(() => {
      const currentStates: Record<string, string> = {};
      schedule.assignments.forEach((a) => {
        currentStates[a.matchId] = matchStates[a.matchId]?.status || 'scheduled';
      });
      const changedIds = Object.keys(currentStates).filter(
        (id) => prevStatesRef.current[id] !== currentStates[id],
      );
      if (changedIds.length > 0) {
        changedIds.forEach((id, index) => {
          setTimeout(() => {
            setAnimatedIds((prev) => new Set([...prev, id]));
            setTimeout(() => {
              setAnimatedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }, 300);
          }, index * 30);
        });
      }
      prevStatesRef.current = currentStates;
    }, [schedule.assignments, matchStates]);

    const renderSlotLabel = useCallback(
      (slotId: number, slotIndex: number) =>
        slotIndex % 2 === 0 ? formatSlotTime(slotId, config) : '',
      [config],
    );

    // Closed-cell shading + currentSlot tint + every-other divider.
    const renderCell = useCallback(
      ({ courtId, slotId, slotIndex }: GanttCell) => {
        const slotClosed = isSlotClosed(closedWindows, courtId, slotId);
        const showDivider = slotIndex % 2 === 0;
        return (
          <div
            className={`h-full w-full ${showDivider ? 'border-l border-border/30' : ''} ${
              slotClosed
                ? 'bg-muted/50'
                : slotId === currentSlot
                  ? 'bg-status-live/10'
                  : ''
            }`}
            title={slotClosed ? `Court ${courtId} closed` : undefined}
          />
        );
      },
      [closedWindows, currentSlot],
    );

    // Fully-closed court → "closed" overlay behind the blocks.
    const renderRow = useCallback(
      (courtId: number) => {
        const fullyClosed = isCourtFullyClosed(closedWindows, courtId, minSlot, maxSlot);
        if (!fullyClosed) return null;
        return (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-2xs uppercase tracking-wider text-muted-foreground/80">
            closed
          </div>
        );
      },
      [closedWindows, minSlot, maxSlot],
    );

    // Court-label column: a Reopen button when fully closed + callback present.
    const renderCourtLabel = useCallback(
      (courtId: number) => {
        const fullyClosed = isCourtFullyClosed(closedWindows, courtId, minSlot, maxSlot);
        if (fullyClosed && onRequestReopenCourt) {
          return (
            <button
              type="button"
              onClick={() => onRequestReopenCourt(courtId)}
              title={`Court ${courtId} closed — open Reopen panel`}
              aria-label={`Court ${courtId} is closed. Click to open Reopen panel.`}
              className="flex h-full w-full items-center gap-1 px-2 text-xs font-semibold tabular-nums bg-muted/60 text-muted-foreground hover:bg-status-warning-bg hover:text-status-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
            >
              <span className="line-through">C{courtId}</span>
              <DoorOpen className="h-3 w-3" aria-hidden="true" />
            </button>
          );
        }
        return (
          <span
            className={`flex h-full items-center px-2 text-xs font-semibold tabular-nums ${
              fullyClosed
                ? 'bg-muted/60 text-muted-foreground line-through'
                : 'bg-muted/30 text-foreground'
            }`}
          >
            C{courtId}
          </span>
        );
      },
      [closedWindows, minSlot, maxSlot, onRequestReopenCourt],
    );

    // Status-colored block + the full ring vocabulary + click-select.
    const renderBlock = useCallback(
      (placement: Placement, box: GanttBlockBox) => {
        const matchId = placement.key;
        const match = matchMap.get(matchId);
        const state = matchStates[matchId];
        const status = state?.status || 'scheduled';
        const styles = STATUS_STYLES[status];
        const isSelected = selectedMatchId === matchId;
        const isAnimated = animatedIds.has(matchId);
        const assignmentSlot = schedule.assignments.find((a) => a.matchId === matchId)?.slotId ?? 0;
        const isLate =
          currentSlot > assignmentSlot && (status === 'scheduled' || status === 'called');
        const isPostponed = state?.postponed === true;
        const isInProgress = status === 'started';
        const isImpacted = impactedSet.has(matchId);
        const traffic = trafficLights?.get(matchId);
        const conflictActionable =
          traffic && (status === 'scheduled' || status === 'called');
        const isBlocked = conflictActionable && traffic.status === 'red';
        const isResting = conflictActionable && traffic.status === 'yellow';

        // Ring priority: selected > blocked > impacted > postponed > resting > late.
        let ringClass = '';
        if (isSelected) ringClass = 'ring-2 ring-inset ring-status-started';
        else if (isBlocked) ringClass = 'ring-2 ring-inset ring-status-blocked';
        else if (isImpacted) ringClass = 'ring-2 ring-inset ring-purple-500';
        else if (isPostponed) ringClass = 'ring-2 ring-inset ring-red-400';
        else if (isResting) ringClass = 'ring-2 ring-inset ring-status-warning';
        else if (isLate) ringClass = 'ring-2 ring-inset ring-yellow-400';

        const multiLane = (placement.laneCount ?? 1) > 1;

        return (
          <div
            onClick={() => onMatchSelect(matchId)}
            className={`absolute inset-x-0 top-0.5 rounded border cursor-pointer
              ${styles.bg} ${styles.border}
              transition-[transform,box-shadow,filter] duration-fast ease-brand
              ${isAnimated ? 'scale-105' : ''}
              ${ringClass}
              ${isInProgress ? 'shadow-sm' : ''}
              hover:brightness-95`}
            style={{ height: box.height - 4 }}
            title={
              (match ? getMatchLabel(match) : '?') +
              (traffic?.reason && conflictActionable ? ` — ${traffic.reason}` : '')
            }
          >
            <div
              className={`h-full flex flex-col justify-center overflow-hidden leading-tight ${
                multiLane ? 'px-0 items-center' : 'px-2 items-start'
              }`}
            >
              <span
                className={`text-2xs font-semibold whitespace-nowrap overflow-hidden tabular-nums ${styles.text}`}
              >
                {match ? getMatchLabel(match) : '?'}
              </span>
            </div>
          </div>
        );
      },
      [
        matchMap,
        matchStates,
        selectedMatchId,
        animatedIds,
        currentSlot,
        impactedSet,
        trafficLights,
        schedule.assignments,
        onMatchSelect,
      ],
    );

    return (
      <div className="overflow-hidden">
        <GanttTimeline
          courts={courts}
          minSlot={minSlot}
          slotCount={slotCount}
          density="standard"
          placements={placements}
          renderBlock={renderBlock}
          renderCell={renderCell}
          renderRow={renderRow}
          renderCourtLabel={renderCourtLabel}
          renderSlotLabel={renderSlotLabel}
          currentSlot={currentSlot}
        />
      </div>
    );
  }
  ```
  > Decision note: `GanttChart` keeps `onMatchSelect` wired through `renderBlock`'s own `onClick` (a click on the *block*), not the scaffold's `onCellClick` — preserving the existing "click a block to select it" behavior exactly. The scaffold's `onCellClick` is unused here.
- [ ] Verify: `cd products/scheduler/frontend && npx tsc -b` → exit 0. `npm run build:scheduler` from repo root → succeeds. `npm run lint:scheduler` → exit 0.
- [ ] Verify the scaffold's tests still pass: `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/ganttTimeline.test.ts` → exit 0.
- [ ] browser-harness visual check (may be gated on the Chrome remote-debugging toggle — if unavailable, the executor flags it and the controller surfaces it): Live tab. Expect: status-colored blocks, traffic-light/impact rings, sub-lane packing for overlapping matches, click-select highlight, closed-court row greying + Reopen button, current-slot column tint — all unchanged from before; light + dark clean.
- [ ] **Commit:** `refactor(control-center): GanttChart consumes shared GanttTimeline`
  ```
  Rewrite GanttChart as a GanttTimeline adapter. The scaffold owns
  geometry + the grid mesh; GanttChart keeps matchStates adaptation,
  getRenderSlot() elapsed-time shift, horizontal sub-lane packing
  (emitting laneIndex/laneCount placements), the selected > blocked >
  impacted > postponed > resting > late ring ladder inside renderBlock,
  click-select, and closed-court shading via renderCell/renderRow/
  renderCourtLabel. Drops from 480 to ~220 lines.
  ```

---

## Phase 3 — Migrate `DragGantt` (Schedule tab) — highest risk

`DragGantt` is the highest-risk migration: full dnd-kit drag/drop, debounced `/schedule/validate`, drop-feedback animations, `pinAndResolve()`. The scaffold stays interaction-agnostic; dnd-kit attaches **entirely through the render-props** — `useDroppable` inside the cell component passed to `renderCell`, `useDraggable` inside the chip passed to `renderBlock`, the whole scaffold wrapped in `DndContext`. **Sequencing reminder:** run this task entirely before or entirely after the `SchedulePage` megacomponent refactor — not interleaved.

### Task 3.1 — Rewrite `DragGantt` as a `GanttTimeline` adapter + delete `ganttGeometry.ts`

**Files:**
- Modify: `products/scheduler/frontend/src/features/schedule/DragGantt.tsx`
- Delete: `products/scheduler/frontend/src/features/schedule/ganttGeometry.ts`

**Strategic-plan "keep in the consumer" checklist for this task:** `/schedule/validate` debounced validation (the inline `scheduleValidation` orchestrator with its debounce timer + AbortController + dedupe ref) ✓, green/red hover wash ✓, drop feedback `animate-drop-ok` / `animate-shake` ✓, `pinAndResolve()` ✓, pin marching-ants overlay ✓, generating-opacity ✓.

**dnd-kit ↔ scaffold boundary (the resolved decision in practice):** `DragGantt` keeps two small internal components — `DropCell` (calls `useDroppable`) and `MatchBlock` (calls `useDraggable`). `DropCell` is mounted by the `renderCell` prop; `MatchBlock` is mounted by the `renderBlock` prop. The whole `<GanttTimeline>` sits inside `<DndContext>`. The scaffold never sees dnd-kit; it only sees React nodes.

**Steps:**

- [ ] Rewrite `DragGantt.tsx`. **Complete** new content (target ≈250 lines):
  ```tsx
  /**
   * Drag-to-reschedule Gantt (meet Schedule tab).
   *
   * A GanttTimeline adapter. dnd-kit stays entirely consumer-side:
   *  - every (court, slot) cell is a `useDroppable` node, mounted via
   *    the scaffold's `renderCell` prop (DropCell)
   *  - every match block is a `useDraggable` node, mounted via the
   *    scaffold's `renderBlock` prop (MatchBlock)
   *  - the whole scaffold is wrapped in <DndContext>
   * The scaffold imports no @dnd-kit and knows nothing about drag.
   *
   * Kept consumer-side: the debounced /schedule/validate orchestrator
   * (its own timer + AbortController + dedupe ref), the green/red hover
   * wash, the animate-drop-ok / animate-shake drop feedback, and
   * pinAndResolve().
   */
  import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
  import { Check, DoorOpen, X as XIcon } from '@phosphor-icons/react';
  import {
    DndContext,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
    type DragEndEvent,
    type DragMoveEvent,
    type DragStartEvent,
  } from '@dnd-kit/core';
  import { CSS } from '@dnd-kit/utilities';
  import {
    GanttTimeline,
    GANTT_GEOMETRY,
    type Placement,
    type GanttCell,
    type GanttBlockBox,
  } from '@scheduler/design-system/components';
  import { apiClient } from '../../api/client';
  import { useTournamentStore } from '../../store/tournamentStore';
  import { useUiStore } from '../../store/uiStore';
  import { indexById } from '../../lib/indexById';
  import { Hint } from '../../components/Hint';
  import { useSchedule } from '../../hooks/useSchedule';
  import { calculateTotalSlots, formatSlotTime } from '../../lib/time';
  import {
    getClosedSlotWindows,
    isCourtFullyClosed,
    isSlotClosed,
  } from '../../lib/courtClosures';
  import type {
    MatchDTO,
    ScheduleAssignment,
    ScheduleDTO,
    TournamentConfig,
    ValidationResponseDTO,
  } from '../../api/dto';
  import { getEventColor, EVENT_COLORS } from './eventColors';

  const VALIDATE_DEBOUNCE_MS = 80;
  const STANDARD = GANTT_GEOMETRY.standard;

  interface DragGanttProps {
    schedule: ScheduleDTO;
    matches: MatchDTO[];
    config: TournamentConfig;
    selectedMatchId?: string | null;
    onMatchSelect?: (matchId: string) => void;
    currentSlot?: number;
    readOnly?: boolean;
    onRequestReopenCourt?: (courtId: number) => void;
  }

  type CellId = `cell:${number}:${number}`;
  type BlockId = `match:${string}`;

  function cellId(courtId: number, slotId: number): CellId {
    return `cell:${courtId}:${slotId}`;
  }

  function parseCell(
    id: string | number | null | undefined,
  ): { courtId: number; slotId: number } | null {
    if (typeof id !== 'string') return null;
    const m = /^cell:(\d+):(\d+)$/.exec(id);
    if (!m) return null;
    return { courtId: Number(m[1]), slotId: Number(m[2]) };
  }

  function matchLabel(m: MatchDTO): string {
    if (m.eventRank) return m.eventRank;
    if (m.matchNumber) return `M${m.matchNumber}`;
    return m.id.slice(0, 4);
  }

  type DropFx = { type: 'ok' | 'shake'; courtId: number; slotId: number; nonce: number };

  export function DragGantt({
    schedule,
    matches,
    config,
    selectedMatchId,
    onMatchSelect,
    currentSlot,
    readOnly = false,
    onRequestReopenCourt,
  }: DragGanttProps) {
    const players = useTournamentStore((s) => s.players);
    const pendingPin = useUiStore((s) => s.pendingPin);
    const setLastValidation = useUiStore((s) => s.setLastValidation);
    const { pinAndResolve } = useSchedule();
    const isGenerating = useUiStore((s) => s.isGenerating);

    const matchMap = useMemo(() => indexById(matches), [matches]);
    const totalSlots = calculateTotalSlots(config);

    const { minSlot, maxSlot } = useMemo(() => {
      if (schedule.assignments.length === 0)
        return { minSlot: 0, maxSlot: Math.min(16, totalSlots) };
      const starts = schedule.assignments.map((a) => a.slotId);
      const ends = schedule.assignments.map((a) => a.slotId + a.durationSlots);
      return {
        minSlot: Math.max(0, Math.min(...starts) - 1),
        maxSlot: Math.min(totalSlots, Math.max(...ends) + 2),
      };
    }, [schedule.assignments, totalSlots]);
    const slotCount = maxSlot - minSlot;

    const courts = useMemo(
      () => Array.from({ length: config.courtCount }, (_, i) => i + 1),
      [config.courtCount],
    );
    const closedWindows = useMemo(
      () => getClosedSlotWindows(config, totalSlots),
      [config, totalSlots],
    );

    // --- drag state --------------------------------------------------------
    const [activeId, setActiveId] = useState<string | null>(null);
    const [dragDelta, setDragDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [hoverCell, setHoverCell] = useState<{ courtId: number; slotId: number } | null>(null);
    const [validation, setValidation] = useState<ValidationResponseDTO | null>(null);
    const [dropFx, setDropFx] = useState<DropFx | null>(null);
    const validateAbortRef = useRef<AbortController | null>(null);
    const validateTimerRef = useRef<number | null>(null);
    const lastValidatedKeyRef = useRef<string | null>(null);

    const activeAssignment = useMemo(() => {
      if (!activeId || !activeId.startsWith('match:')) return null;
      const id = activeId.slice('match:'.length);
      return schedule.assignments.find((a) => a.matchId === id) ?? null;
    }, [activeId, schedule.assignments]);

    const clearDragState = useCallback(() => {
      setActiveId(null);
      setDragDelta({ x: 0, y: 0 });
      setHoverCell(null);
      setValidation(null);
      setLastValidation(null);
      if (validateTimerRef.current !== null) {
        window.clearTimeout(validateTimerRef.current);
        validateTimerRef.current = null;
      }
      if (validateAbortRef.current) {
        validateAbortRef.current.abort();
        validateAbortRef.current = null;
      }
      lastValidatedKeyRef.current = null;
    }, [setLastValidation]);

    useEffect(() => () => clearDragState(), [clearDragState]);

    // Inline /schedule/validate orchestrator — owns its debounce timer,
    // AbortController, and dedupe ref together (documented one-off
    // exception; extracting it would split drag state across two files).
    const scheduleValidation = useCallback(
      (matchId: string, targetCourt: number, targetSlot: number) => {
        if (!config) return;
        const key = `${matchId}:${targetCourt}:${targetSlot}`;
        if (lastValidatedKeyRef.current === key) return;
        lastValidatedKeyRef.current = key;
        if (validateTimerRef.current !== null) {
          window.clearTimeout(validateTimerRef.current);
        }
        validateTimerRef.current = window.setTimeout(async () => {
          if (validateAbortRef.current) validateAbortRef.current.abort();
          const ctl = new AbortController();
          validateAbortRef.current = ctl;
          try {
            const res = await apiClient.validateMove({
              config,
              players,
              matches,
              assignments: schedule.assignments,
              proposedMove: { matchId, slotId: targetSlot, courtId: targetCourt },
              signal: ctl.signal,
            });
            setValidation(res);
            setLastValidation({
              matchId,
              slotId: targetSlot,
              courtId: targetCourt,
              feasible: res.feasible,
              conflicts: res.conflicts,
            });
          } catch (err) {
            if ((err as Error)?.name === 'AbortError') return;
            setValidation({
              feasible: false,
              conflicts: [{ type: 'network', description: String(err) }],
            });
          }
        }, VALIDATE_DEBOUNCE_MS);
      },
      [config, players, matches, schedule.assignments, setLastValidation],
    );

    const sensors = useSensors(
      useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
      useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    );

    const onDragStart = useCallback((event: DragStartEvent) => {
      setActiveId(String(event.active.id));
    }, []);

    const onDragMove = useCallback(
      (event: DragMoveEvent) => {
        setDragDelta({ x: event.delta.x, y: event.delta.y });
        const cell = parseCell(event.over?.id);
        if (cell) {
          setHoverCell(cell);
          const matchId =
            typeof event.active.id === 'string' ? event.active.id.slice('match:'.length) : '';
          if (matchId) scheduleValidation(matchId, cell.courtId, cell.slotId);
        } else {
          setHoverCell(null);
          setValidation(null);
          lastValidatedKeyRef.current = null;
        }
      },
      [scheduleValidation],
    );

    const onDragEnd = useCallback(
      (event: DragEndEvent) => {
        const cell = parseCell(event.over?.id);
        const activeMatchId =
          typeof event.active.id === 'string' ? event.active.id.slice('match:'.length) : '';
        if (cell && activeMatchId) {
          const current = schedule.assignments.find((a) => a.matchId === activeMatchId);
          const unchanged =
            current && current.courtId === cell.courtId && current.slotId === cell.slotId;
          const feasible = validation?.feasible ?? true;
          if (!unchanged) {
            setDropFx({
              type: feasible ? 'ok' : 'shake',
              courtId: cell.courtId,
              slotId: cell.slotId,
              nonce: Date.now(),
            });
            window.setTimeout(() => setDropFx(null), 900);
            if (feasible) {
              void pinAndResolve({
                matchId: activeMatchId,
                slotId: cell.slotId,
                courtId: cell.courtId,
              });
            }
          }
        }
        clearDragState();
      },
      [schedule.assignments, pinAndResolve, clearDragState, validation?.feasible],
    );

    // --- scaffold render-props --------------------------------------------

    const renderSlotLabel = useCallback(
      (slotId: number, slotIndex: number) =>
        slotIndex % 2 === 0 ? formatSlotTime(slotId, config) : '',
      [config],
    );

    const renderCell = useCallback(
      ({ courtId, slotId }: GanttCell) => {
        const slotClosed = isSlotClosed(closedWindows, courtId, slotId);
        const hovered =
          hoverCell?.courtId === courtId && hoverCell?.slotId === slotId;
        const fx =
          dropFx?.courtId === courtId && dropFx?.slotId === slotId ? dropFx : null;
        return (
          <DropCell
            courtId={courtId}
            slotId={slotId}
            isCurrent={slotId === currentSlot}
            hovered={hovered}
            validation={hovered ? validation : null}
            dropFx={fx}
            readOnly={readOnly || slotClosed}
            closed={slotClosed}
          />
        );
      },
      [closedWindows, hoverCell, dropFx, validation, currentSlot, readOnly],
    );

    const renderRow = useCallback(
      (courtId: number) => {
        const fullyClosed = isCourtFullyClosed(closedWindows, courtId, minSlot, maxSlot);
        if (!fullyClosed) return null;
        return (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-2xs uppercase tracking-wider text-muted-foreground/80">
            court closed
          </div>
        );
      },
      [closedWindows, minSlot, maxSlot],
    );

    const renderCourtLabel = useCallback(
      (courtId: number) => {
        const fullyClosed = isCourtFullyClosed(closedWindows, courtId, minSlot, maxSlot);
        if (fullyClosed && onRequestReopenCourt) {
          return (
            <button
              type="button"
              onClick={() => onRequestReopenCourt(courtId)}
              title={`Court ${courtId} closed — open Reopen panel`}
              aria-label={`Court ${courtId} is closed. Click to open Reopen panel.`}
              className="flex h-full w-full items-center gap-1 px-2 text-xs font-semibold tabular-nums bg-muted/60 text-muted-foreground hover:bg-status-warning-bg hover:text-status-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
            >
              <span className="line-through">C{courtId}</span>
              <DoorOpen className="h-3 w-3" aria-hidden="true" />
            </button>
          );
        }
        return (
          <span
            className={`flex h-full items-center px-2 text-xs font-semibold tabular-nums ${
              fullyClosed
                ? 'bg-muted/60 text-muted-foreground line-through'
                : 'bg-muted/30 text-foreground'
            }`}
          >
            C{courtId}
          </span>
        );
      },
      [closedWindows, minSlot, maxSlot, onRequestReopenCourt],
    );

    const placements = useMemo<Placement[]>(
      () =>
        schedule.assignments.map((a) => ({
          courtIndex: a.courtId - 1,
          startSlot: a.slotId,
          span: a.durationSlots,
          key: a.matchId,
        })),
      [schedule.assignments],
    );

    const renderBlock = useCallback(
      (placement: Placement, box: GanttBlockBox) => {
        const m = matchMap.get(placement.key);
        if (!m) return null;
        const hiddenWhileDragging = activeId === `match:${placement.key}`;
        const a = schedule.assignments.find((x) => x.matchId === placement.key);
        const idx = a ? schedule.assignments.indexOf(a) : 0;
        return (
          <MatchBlock
            matchId={placement.key}
            match={m}
            box={box}
            isSelected={selectedMatchId === placement.key}
            isPinned={pendingPin?.matchId === placement.key}
            isGenerating={isGenerating}
            onSelect={onMatchSelect}
            readOnly={readOnly || isGenerating}
            translucent={hiddenWhileDragging}
            dragDelta={hiddenWhileDragging ? dragDelta : null}
            enterDelayMs={idx * 40}
          />
        );
      },
      [
        matchMap,
        activeId,
        schedule.assignments,
        selectedMatchId,
        pendingPin?.matchId,
        isGenerating,
        onMatchSelect,
        readOnly,
        dragDelta,
      ],
    );

    return (
      <div data-testid="drag-gantt" className="relative">
        <Hint id="schedule.drag-instructions" className="m-2">
          Drag a match to any cell — infeasible targets glow red. Drop pins the match and re-solves the rest.
        </Hint>
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-3 py-1.5 text-2xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">Events</span>
          {Object.entries(EVENT_COLORS).map(([key, { bg, border, label }]) => (
            <span key={key} className="inline-flex items-center gap-1" title={label}>
              <span className={`inline-block h-2.5 w-2.5 rounded ${bg} border ${border}`} />
              {key}
            </span>
          ))}
        </div>

        <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}>
          <GanttTimeline
            data-testid="drag-gantt-grid"
            courts={courts}
            minSlot={minSlot}
            slotCount={slotCount}
            density="standard"
            placements={placements}
            renderBlock={renderBlock}
            renderCell={renderCell}
            renderRow={renderRow}
            renderCourtLabel={renderCourtLabel}
            renderSlotLabel={renderSlotLabel}
            currentSlot={currentSlot}
          />

          <div
            className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-3 py-1.5 text-2xs"
            data-testid="drag-gantt-status"
          >
            {activeAssignment && hoverCell && validation ? (
              validation.feasible ? (
                <span className="inline-flex items-center gap-1 text-status-done">
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  Feasible — drop to pin at Court {hoverCell.courtId},{' '}
                  {formatSlotTime(hoverCell.slotId, config)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <XIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  Infeasible ({validation.conflicts.length} conflict
                  {validation.conflicts.length === 1 ? '' : 's'}):{' '}
                  {validation.conflicts[0]?.description}
                </span>
              )
            ) : (
              <span className="text-muted-foreground">
                {schedule.assignments.length} matches scheduled across {config.courtCount} court
                {config.courtCount === 1 ? '' : 's'}.
              </span>
            )}
            {pendingPin ? (
              <span className="text-accent" data-testid="drag-gantt-pin">
                Pin in flight: {pendingPin.matchId.slice(0, 6)} to Court {pendingPin.courtId},{' '}
                {formatSlotTime(pendingPin.slotId, config)}
              </span>
            ) : null}
          </div>
        </DndContext>
      </div>
    );
  }

  // ---------------------------------------------------------------------------

  function DropCell({
    courtId,
    slotId,
    isCurrent,
    hovered,
    validation,
    dropFx,
    readOnly,
    closed = false,
  }: {
    courtId: number;
    slotId: number;
    isCurrent: boolean;
    hovered: boolean;
    validation: ValidationResponseDTO | null;
    dropFx: { type: 'ok' | 'shake'; nonce: number } | null;
    readOnly: boolean;
    closed?: boolean;
  }) {
    const { setNodeRef, isOver } = useDroppable({
      id: cellId(courtId, slotId),
      disabled: readOnly,
    });
    const infeasible = !closed && hovered && validation && !validation.feasible;
    const feasible = !closed && hovered && validation && validation.feasible;
    const showOk = dropFx?.type === 'ok';
    const showShake = dropFx?.type === 'shake';
    return (
      <div
        ref={setNodeRef}
        data-testid={`cell-${courtId}-${slotId}`}
        title={closed ? `Court ${courtId} closed` : undefined}
        className={[
          'relative h-full w-full border-l border-border/30 transition-colors duration-fast',
          closed ? 'bg-muted/50' : isCurrent ? 'bg-accent/5' : '',
          !closed && isOver ? 'bg-muted/80' : '',
          !closed && hovered ? 'motion-safe:animate-cell-pulse' : '',
          infeasible ? 'ring-2 ring-inset ring-destructive bg-destructive/5' : '',
          feasible ? 'ring-2 ring-inset ring-status-done bg-status-done/5' : '',
          showShake
            ? 'motion-safe:animate-shake ring-2 ring-inset ring-destructive bg-destructive/10'
            : '',
        ].join(' ')}
      >
        {showOk ? (
          <span
            key={dropFx?.nonce}
            aria-hidden
            className="pointer-events-none absolute inset-0 motion-safe:animate-drop-ok"
          />
        ) : null}
      </div>
    );
  }

  function MatchBlock({
    matchId,
    match,
    box,
    isSelected,
    isPinned,
    isGenerating,
    onSelect,
    readOnly,
    translucent,
    dragDelta,
    enterDelayMs,
  }: {
    matchId: string;
    match: MatchDTO;
    box: GanttBlockBox;
    isSelected: boolean;
    isPinned: boolean;
    isGenerating: boolean;
    onSelect?: (id: string) => void;
    readOnly: boolean;
    translucent: boolean;
    dragDelta: { x: number; y: number } | null;
    enterDelayMs: number;
  }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: `match:${matchId}` as BlockId,
      disabled: readOnly,
    });
    const effectiveTransform = dragDelta ?? transform;
    const transformStyle = effectiveTransform
      ? CSS.Translate.toString({
          x: effectiveTransform.x,
          y: effectiveTransform.y,
          scaleX: 1,
          scaleY: 1,
        })
      : undefined;
    const positionTransition = isDragging
      ? 'none'
      : 'background-color 120ms var(--ease-brand), border-color 120ms var(--ease-brand)';
    const pinActive = isPinned && isGenerating;
    const eventColor = getEventColor(match.eventRank);
    return (
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => onSelect?.(matchId)}
        data-testid={`block-${matchId}`}
        {...listeners}
        {...attributes}
        style={{
          // inset 4px within the scaffold's positioned box.
          position: 'absolute',
          left: 0,
          top: 4,
          width: Math.max(STANDARD.slot - 4, box.width - 4),
          height: box.height - 8,
          transform: transformStyle,
          zIndex: isDragging ? 30 : isSelected ? 20 : isPinned ? 15 : 10,
          touchAction: 'none',
          opacity: translucent && !isDragging ? 0.4 : 1,
          transition: positionTransition,
          animationDelay: `${enterDelayMs}ms`,
        }}
        className={[
          'group rounded border text-left px-2 py-0.5 shadow-sm',
          'motion-safe:animate-block-in',
          isSelected
            ? 'bg-accent/10 border-accent text-accent ring-1 ring-accent/30'
            : `${eventColor.bg} ${eventColor.border} text-foreground hover:shadow-md hover:brightness-95`,
          isPinned && !pinActive ? 'ring-2 ring-inset ring-status-warning border-dashed' : '',
          readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        ].join(' ')}
        title={`${matchLabel(match)} · ${eventColor.label}`}
      >
        {pinActive ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-[1px] rounded pin-marquee motion-safe:animate-marching-ants"
          />
        ) : null}
        <span className="relative text-2xs font-semibold leading-tight block truncate">
          {matchLabel(match)}
        </span>
      </button>
    );
  }
  ```
  > Decision notes for the executor:
  > - `MatchBlock` is absolutely-positioned `left:0, top:4` *inside* the scaffold's `PositionedBlock` wrapper (which already holds the `left`/`top`/`width` from `placementBox`). The chip uses `box.width` for its own width math (`box.width - 4`) instead of recomputing from `SLOT_WIDTH * durationSlots` — same result, but sourced from the scaffold.
  > - The original `MatchBlock` animated its own `left`/`top` with a 420ms transition on re-layout. Since the scaffold's `PositionedBlock` wrapper now owns `left`/`top`, that re-layout smoothing moves up one level. **Flag:** the scaffold's `PositionedBlock` does *not* currently animate `left`/`top` transitions — so a re-solve will snap blocks rather than glide them. This is a deliberately-accepted minor visual regression for this plan (the strategic plan's scope is the scaffold + 3 consumers, not motion parity). If the controller wants glide-on-re-solve preserved, the cleanest follow-up is a `blockTransition?: string` prop on `GanttTimeline` applied to `PositionedBlock`'s style — note it as a candidate enhancement, do not block this task on it.
- [ ] Delete `products/scheduler/frontend/src/features/schedule/ganttGeometry.ts`. (`DragGantt` was the last importer of the legacy named exports; it now imports `GANTT_GEOMETRY` from `@scheduler/design-system`. `GanttChart` and `LiveTimelineGrid` already moved off it in Phases 1–2.)
- [ ] Verify no stale importers remain: `cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine" && grep -rn "ganttGeometry" products/scheduler/frontend/src` → **no matches** (exit 1 from grep is expected and correct).
- [ ] Verify: `cd products/scheduler/frontend && npx tsc -b` → exit 0. `npm run build:scheduler` from repo root → succeeds. `npm run lint:scheduler` → exit 0.
- [ ] Verify the scaffold's tests still pass: `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/ganttTimeline.test.ts` → exit 0.
- [ ] browser-harness visual check (may be gated on the Chrome remote-debugging toggle — if unavailable, the executor flags it and the controller surfaces it): Schedule tab with a generated schedule. Exercise the full loop by hand — drag a match, watch the hovered cell go green (feasible) / red (infeasible), drop on a feasible cell (expect `animate-drop-ok` wash + a pin in flight + re-solve), drop on an infeasible cell (expect `animate-shake`, no re-solve), confirm pin marching-ants while generating, confirm the event legend + hover status strip. Light + dark.
- [ ] **Commit:** `refactor(schedule): DragGantt consumes shared GanttTimeline`
  ```
  Rewrite DragGantt as a GanttTimeline adapter. dnd-kit stays entirely
  consumer-side: DropCell (useDroppable) mounts via the scaffold's
  renderCell prop, MatchBlock (useDraggable) via renderBlock, and the
  whole scaffold is wrapped in DndContext — the scaffold imports no
  @dnd-kit. The debounced /schedule/validate orchestrator, green/red
  hover wash, animate-drop-ok / animate-shake drop feedback, and
  pinAndResolve() all stay in the consumer.

  Delete features/schedule/ganttGeometry.ts — DragGantt was its last
  importer; all three consumers now read GANTT_GEOMETRY from
  @scheduler/design-system. DragGantt drops from 632 to ~250 lines.
  ```

---

## End-to-end verification

Run after Phase 3 (or after whichever phase is the last to land, if phases are landed incrementally):

- [ ] `cd products/scheduler/frontend && npx tsc -b` → exit 0
- [ ] `npm run build:scheduler` (from repo root) → succeeds
- [ ] `npm run lint:scheduler` (from repo root) → exit 0
- [ ] `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/ganttTimeline.test.ts` → all pass
- [ ] `grep -rn "ganttGeometry" products/scheduler/frontend/src` → no matches
- [ ] Line-count check (DESIGN.md §6, all must be well under 300): `wc -l products/scheduler/frontend/src/features/schedule/DragGantt.tsx products/scheduler/frontend/src/features/control-center/GanttChart.tsx products/scheduler/frontend/src/features/schedule/live/LiveTimelineGrid.tsx` → expect ≈250 / ≈220 / ≈130
- [ ] Do **not** run `make test-e2e` as a gate — the Playwright suite is pre-existing-stale (every spec `goto('/')`s the old shell). If the controller wants Playwright re-greened, that is a separate task outside this plan.
- [ ] browser-harness visual sweep (may be gated on the Chrome remote-debugging toggle — flag if unavailable): Schedule drag/drop/validate/pin loop; Live traffic-lights / impact rings / closed-court reopen / sub-lane packing; solver-optimization entry animation — all in light **and** dark.

---

## Self-review

**Strategic-plan coverage — every phase mapped to a task:**
- Phase 0 (geometry consolidation) → Task 0.1. ✓
- Phase 1 (extract scaffold + migrate LiveTimelineGrid) → Task 1.1 (scaffold + tests) + Task 1.2 (geometry re-export shim + LiveTimelineGrid migration). Split because the scaffold creation and the consumer migration are two coherent atomic commits, and the strategic plan's Phase-1 bullet list explicitly contains both "create the scaffold" and "rewrite LiveTimelineGrid". ✓
- Phase 2 (migrate GanttChart) → Task 2.1. ✓
- Phase 3 (migrate DragGantt + delete ganttGeometry.ts) → Task 3.1. ✓

**Strategic-plan "keep in the consumer" items — each mapped to a task:**
- GanttChart: `matchStates` adaptation → Task 2.1 `courtRows`. `getRenderSlot()` → Task 2.1 `courtRows`. Sub-lane packing emitting `laneIndex` → Task 2.1 `packing` + `placements` (emits `laneIndex`/`laneCount`). Ring vocabulary (selected > blocked > impacted > postponed > resting > late) → Task 2.1 `renderBlock`. Click-select → Task 2.1 `renderBlock` `onClick`. ✓
- DragGantt: `/schedule/validate` debounced validation → Task 3.1 `scheduleValidation`. Green/red hover wash → Task 3.1 `DropCell`. `animate-drop-ok` / `animate-shake` → Task 3.1 `DropCell` + `onDragEnd`. `pinAndResolve()` → Task 3.1 `onDragEnd`. ✓
- LiveTimelineGrid: event-colored chip + entry animation → Task 1.2 `renderBlock` + `animatedIds`. ✓

**Design decisions resolved (the strategic plan deferred these):**
1. dnd-kit ↔ scaffold boundary → resolved in Task 1.1's design-decision note: `renderCell` render-prop (not refs-only). Justified against the three consumers' divergent cell bodies. `useDroppable` mounts in `DropCell` via `renderCell`; `useDraggable` mounts in `MatchBlock` via `renderBlock`; `DndContext` wraps the whole scaffold. Scaffold imports zero `@dnd-kit`.
2. Exact `GanttTimeline` API → fully specified as complete code in Task 1.1: `GanttTimelineProps` with `courts` / `minSlot` / `slotCount` / `density` / `placements` / `renderBlock` / `renderCell?` / `onCellClick?` / `headerLabel?` / `renderSlotLabel?` / `renderRow?` / `renderCourtLabel?` / `currentSlot?`; `Placement = { courtIndex, startSlot, span, laneIndex?, laneCount?, key }`; `renderBlock: (placement, box) => ReactNode`. (Deviation from the strategic plan's sketch, made explicit: the sketch's `slotCount` is kept but a `minSlot` prop is added because all three consumers compute a visible window — without `minSlot` the scaffold can't offset block `left`. The sketch's bare `onCellClick` is kept; `renderSlotLabel`/`renderRow`/`renderCourtLabel` are added because all three consumers need header time labels, closed-court overlays, and closed-court label buttons respectively — these are unavoidable, not scope creep.)
3. `renderBlock` memoization → baked into Task 1.1: internal `PositionedBlock` wrapped in `React.memo`, keyed by `placement.key`; consumer contract (pass `useCallback`-stable render-props) documented in the file header and the props JSDoc, and every consumer's `renderBlock`/`renderCell`/`renderSlotLabel` is written as a `useCallback`.

**Placeholder scan:** No "TBD", no "add error handling", no "similar to Task N". `GanttTimeline.tsx`, `ganttTimeline.test.ts`, and all three migrated consumers are given as complete file contents. `ganttGeometry.ts` is given complete in P0 and complete again in P1 (re-export shim) and deleted in P3.

**Type consistency:** Every symbol a later task uses is defined in an earlier task with the identical name/signature — `GANTT_GEOMETRY`, `GanttDensity`, `GanttGeometryTier`, `Placement`, `GanttCell`, `GanttBlockBox`, `GanttTimelineProps`, `placementBox`, `GanttTimeline` (Task 1.1) are consumed verbatim by Tasks 1.2 / 2.1 / 3.1. `placementBox(placement, minSlot, tier)` and `renderBlock(placement, box)` signatures match between definition and all call sites. The `Placement` shape emitted by each consumer's `placements` `useMemo` matches the interface exactly.

**Flags (things I could not fully determine or deliberately deferred):**
- **Flag — `apiClient.validateMove` signature:** I read DragGantt's *call site* (`{ config, players, matches, assignments, proposedMove, signal }`) but not `api/client.ts` itself. The rewritten `scheduleValidation` reuses the exact call shape from the original DragGantt verbatim, so it is correct by construction — but if the executor's `tsc -b` flags it, check `api/client.ts`'s actual `validateMove` type.
- **Flag — `useUiStore` selectors:** `pendingPin`, `setLastValidation`, `isGenerating`, `useSchedule().pinAndResolve` are reused verbatim from the original DragGantt; their store types were not independently inspected. The rewrite changes none of these usages, so they carry over safely.
- **Flag — re-solve glide regression in DragGantt (Task 3.1):** the original `MatchBlock` animated its own `left`/`top` with a 420ms `--ease-brand` transition on re-layout. The scaffold's `PositionedBlock` now owns `left`/`top` and does **not** animate them, so a re-solve snaps blocks instead of gliding. Deliberately accepted as out-of-scope-for-this-plan minor motion regression; the clean follow-up is a `blockTransition?` prop on `GanttTimeline`. Surfaced for the controller to accept or schedule.
- **Not flagged (confirmed from primary sources):** `getRenderSlot` behavior (full body read), `useTrafficLights` / `useCurrentSlot` purity (call sites read in both pages — pure adapters returning a `Map` / a `number`), `.gantt-grid` CSS class (defined in `packages/design-system/globals.css`), the `@scheduler/design-system` workspace symlink (present in `node_modules/@scheduler/`), and tailwind already scanning `packages/design-system/components/**` (confirmed in `tailwind.config`).