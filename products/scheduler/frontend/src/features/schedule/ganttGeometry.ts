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
