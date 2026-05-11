/**
 * Shared sizing for the two Gantt surfaces (DragGantt on Schedule,
 * GanttChart on Live). Keeping these as a single source of truth
 * makes sure the operator's eye doesn't recalibrate when they switch
 * between tabs — the cell grid is byte-identical.
 */
export const SLOT_WIDTH = 80;
export const ROW_HEIGHT = 40;
export const COURT_LABEL_WIDTH = 56;
