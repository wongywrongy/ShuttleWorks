/**
 * The geometry a banded surface derives from its OWN column set: the width it
 * must keep (`dockMinContentWidth`) and the number of text lines its rows
 * reserve (`bandedRowLines` / `bandedRowClasses`). Both are read off the
 * column definitions rather than hand-set per site, because a hand-set number
 * is a second knob that goes out of step with the first.
 *
 * ── dockMinContentWidth — the width a banded surface must KEEP for its own
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
 * ── bandedRowLines — how tall a row has to be to hold its own content, so a
 * list of names stops reading ragged WITHOUT charging a list of numbers for
 * the same reservation.
 *
 * Pinned by `__tests__/bandedRowGeometry.test.ts`.
 */
import type { BandedListColumn } from './BandedList';
import { BANDED_ROW_BASE, NAME_COL_MIN } from './BandedList';

/**
 * A row's line reservation, per line count, as a min-height class:
 *
 *   text-sm (0.875rem = 14px) × leading-relaxed (1.625) = 22.75px per line
 *   1 line  → 22.75px → 24px = `min-h-6`   (first spacing-ladder rung above
 *                                           it, and exactly WCAG 2.2 SC
 *                                           2.5.8's 24px minimum target for
 *                                           a clickable row)
 *   2 lines → 45.50px → 48px = `min-h-12`  (the next rung; 64 would waste
 *                                           18px on every row)
 *
 * `min-height`, deliberately, not `height`. Truncation is banned product-wide
 * (`truncationContract.test.ts`), so a label longer than anything in the
 * measured data has to be able to take another line and push its row taller
 * rather than lose characters. The reservation is sized so nothing in real
 * data does that: uniform in practice, lossless in the exception.
 */
export const BANDED_ROW_MIN_H: Record<1 | 2, string> = {
  1: 'min-h-6',
  2: 'min-h-12',
};

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

/**
 * Lines of text a surface's rows RESERVE, derived from its own columns, so a
 * singles row and a doubles pairing measure the same and the list stops being
 * ragged — without every other list paying for it.
 *
 * TWO when a column carries a person/team NAME (`NAME_COL_MIN` is the marker;
 * the name-ness is declared once, in the column definition). The 2 comes from
 * the seeded data, 194 real side labels:
 *
 *   longest side label                        37 chars
 *     ("Diego Alcantara / Shruti Kalyanaraman")
 *   it wraps at the " / ", so its longest LINE 19 chars
 *   19 chars fit one line at `NAME_COL_MIN`
 *   ⇒ 2 lines holds the measured worst case; p95 (33 chars) also needs 2.
 *
 * That measurement is of NAMES ONLY — and since the owner's 2026-08-12 ruling
 * ("the side A and side B name for every row is too much. we dont need to list
 * it. waste of space") the row renders exactly the string that was measured.
 * Under 1a33203 it did not: the cell printed the name AND the school, so a
 * reservation derived from names alone was optimistic by a whole school name
 * ("Nashville Badminton Association", 31 chars) on every row.
 *
 * ONE otherwise. A column set of fixed-width numeric / status / action cells
 * has nothing that can wrap, so a second line is 24px a row spent on nothing.
 */
export function bandedRowLines(columns: BandedListColumn[]): 1 | 2 {
  return columns.some((c) => c.className?.includes(NAME_COL_MIN)) ? 2 : 1;
}

/** The complete row shell for a surface: the shared `BANDED_ROW_BASE` plus
 *  the line reservation its own column set derives. */
export function bandedRowClasses(columns: BandedListColumn[]): string {
  return `${BANDED_ROW_MIN_H[bandedRowLines(columns)]} ${BANDED_ROW_BASE}`;
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
