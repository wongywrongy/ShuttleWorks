/**
 * Shared sizing for the two Gantt surfaces (DragGantt on Schedule,
 * GanttChart on Live). Keeping these as a single source of truth
 * makes sure the operator's eye doesn't recalibrate when they switch
 * between tabs — the cell grid is byte-identical.
 */
export const SLOT_WIDTH = 80;
export const ROW_HEIGHT = 40;
export const COURT_LABEL_WIDTH = 56;

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
