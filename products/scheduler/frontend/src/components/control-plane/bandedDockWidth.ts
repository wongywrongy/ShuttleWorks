/**
 * dockMinContentWidth — the width a banded surface must KEEP for its own
 * column set, so opening a `DetailDock` never silently deletes a column.
 *
 * `DetailDock` docks only while `containerWidth - width >= minContentWidth`;
 * below that it stays 0-wide and overlays instead. That number was hand-picked
 * per site (560 default, 760, 820, 928) while column visibility is container-
 * query keyed at fixed widths, so three surfaces dropped a column the moment a
 * row was selected: Meet Matches and Bracket Matches lost `#` + `Status` (the
 * 560 default is under the 672 `@2xl` tier), Bracket Draws lost `Format` (760
 * is under the 896 `@4xl` tier). Nobody asked for that and nothing said it had
 * happened — the Hub's D11 defect, three more times.
 *
 * The floor is therefore derived from the columns, the way
 * `products/hub/hubDockGeometry.ts` derives the Hub's:
 *
 *   max( highest priority tier the column set actually uses,
 *        declared column widths + `gap-3` rhythm + the row's `px-5` inset )
 *
 * The tier term keeps every column visible; the sum term keeps the flexible
 * columns above their own `min-w` floors. Selecting a row then either keeps
 * the whole column set (docked) or leaves the list at full width under a
 * dismissible overlay. Neither branch deletes a column.
 *
 * Pinned by `__tests__/bandedRowGeometry.test.ts`.
 */
import type { BandedListColumn } from './BandedList';

/** Container width, in px, at which each priority tier becomes visible —
 *  Tailwind's `@2xl` / `@4xl` container breakpoints, the ones
 *  `COL_PRIORITY_CLASS` spells out. Tier 1 never hides. */
export const COL_PRIORITY_MIN_CONTAINER_PX: Record<1 | 2 | 3, number> = {
  1: 0,
  2: 672,
  3: 896,
};

/** `gap-3` — the banded row's column rhythm (`BANDED_ROW_CLASSES`). */
const ROW_GAP_PX = 12;
/** `px-5`, both sides — the banded row's horizontal gutter. The container
 *  query measures the wrapper, which contains that gutter; the column widths
 *  do not. */
const ROW_INSET_PX = 40;

/** px a Tailwind width utility declares: `w-8` → 32 (ladder step × 4px),
 *  `w-[5.5rem]` → 88, `min-w-[10rem]` → 160. 0 for anything else, which is
 *  exactly what a purely flexible column (`flex-1`, no floor) is worth to a
 *  minimum-width sum. `min-w-…` cannot match the `w-…` probe: its `w-` is
 *  preceded by `-`, not whitespace. */
function declaredPx(
  className: string | undefined,
  prefix: 'w' | 'min-w',
): number {
  const m = new RegExp(
    `(?:^|\\s)${prefix}-(?:\\[(\\d+(?:\\.\\d+)?)rem\\]|(\\d+))(?=\\s|$)`,
  ).exec(className ?? '');
  if (!m) return 0;
  return m[1] ? Number(m[1]) * 16 : Number(m[2]) * 4;
}

export function dockMinContentWidth(columns: BandedListColumn[]): number {
  const tier = Math.max(
    ...columns.map((c) => COL_PRIORITY_MIN_CONTAINER_PX[c.priority ?? 1]),
  );
  const row =
    columns.reduce(
      (sum, c) =>
        sum +
        Math.max(declaredPx(c.className, 'w'), declaredPx(c.className, 'min-w')),
      0,
    ) + ROW_GAP_PX * Math.max(columns.length - 1, 0);
  return Math.max(tier, row + ROW_INSET_PX);
}
