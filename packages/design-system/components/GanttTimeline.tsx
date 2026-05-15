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
 * Perf: each positioned block's pixel box is precomputed inside the
 * `byCourtIndex` memo, and `PositionedBlock` is wrapped in `React.memo`
 * — so a parent re-render that leaves a placement's identity, its
 * precomputed box reference, and the `renderBlock` reference untouched
 * skips that subtree (default shallow compare succeeds on all three
 * props). CONSUMER CONTRACT: pass `useCallback`-stable `renderBlock` /
 * `renderCell` references and identity-stable `placements` (e.g. via
 * `useMemo` on the consumer side), or the memo busts every render.
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

/** Wraps one absolutely-positioned block. Wrapped in `React.memo` with
 *  the default shallow compare over `{ placement, box, renderBlock }`.
 *  The `box` reference is supplied identity-stable from the parent's
 *  `byCourtIndex` memo (recomputed only when placements, minSlot, or
 *  the geometry tier changes), so a parent re-render that touches none
 *  of those AND keeps a stable `renderBlock` reference skips this
 *  subtree entirely. `placement.key` is the React reconciler key, NOT
 *  the memo's comparison identity. */
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
        pointerEvents: 'auto',
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
  const bodyHeight = courts.length * tier.row;

  const slotIds = useMemo(
    () => Array.from({ length: slotCount }, (_, i) => minSlot + i),
    [minSlot, slotCount],
  );

  // Single flat list of (placement, precomputed box). The precomputed
  // box references stay identity-stable across renders for unchanged
  // (placement, minSlot, tier), which is what lets `PositionedBlock`'s
  // `React.memo` bail out — the default shallow compare sees the same
  // `box` reference across renders.
  const placementsWithBoxes = useMemo(
    () => placements.map((p) => ({ placement: p, box: placementBox(p, minSlot, tier) })),
    [placements, minSlot, tier],
  );

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

        {/* Grid body: court rows (bg + mesh + renderRow) + overlay for blocks.
            The body wrapper is position: relative so the overlay positions
            against it; the overlay starts after the label column so
            box.left (which is relative to the mesh, not the full grid)
            aligns correctly. */}
        <div className="relative" style={{ width: gridWidth, height: bodyHeight }}>
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

              {/* Mesh */}
              <div className="relative gantt-grid" style={{ flex: '1 1 auto' }}>
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

                {/* Per-row decoration BEHIND the blocks */}
                {renderRow ? renderRow(courtId) : null}
              </div>
            </div>
          ))}

          {/* Positioned blocks — one overlay for the whole grid body.
              `left: tier.label` skips the court-label column so
              `box.left` (relative to the mesh) lands correctly without
              extra math. `pointer-events: none` keeps cell clicks alive;
              each PositionedBlock re-enables pointer events on itself. */}
          <div
            className="pointer-events-none absolute"
            style={{
              top: 0,
              left: tier.label,
              right: 0,
              bottom: 0,
            }}
          >
            {placementsWithBoxes.map(({ placement, box }) => (
              <PositionedBlock
                key={placement.key}
                placement={placement}
                box={box}
                renderBlock={renderBlock}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
