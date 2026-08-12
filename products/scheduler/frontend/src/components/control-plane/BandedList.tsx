/**
 * BandedList — the shared "banded list" grammar for flat row surfaces:
 * a column-label row above the rows plus collapsible group band
 * headers. Meet Matches, Bracket Matches and Bracket Roster all speak
 * this grammar; extracting it here makes the vocabulary literal shared
 * code instead of copy-pasted class strings.
 *
 *   - `ColumnHeaderRow`   — the column-label row (`padding: 6px 20px`,
 *     border-b, band background). Columns carry their own width/flex/
 *     alignment classes so each surface keeps its exact column set.
 *
 * The grammar carries real table semantics via ARIA roles (`table` /
 * `rowgroup` / `row` / `columnheader` / `cell`) rather than `<table>`
 * elements: these rows are flex containers whose cells carry `flex-1` /
 * `shrink-0` widths and `@container/table` priority classes, and several
 * "cells" are `<input>`s, selects and menus. Real `<td>`s would need every
 * one of those re-expressed in table layout. The roles are the same
 * structure `PositionGrid`'s `<table>` publishes, over the DOM we have.
 * They are only complete if the CELLS carry `role="cell"`, which is the
 * consumer's job — `renderRow` owns the cells.
 *   - `GroupBandHeader`   — the collapsible band header button: caret +
 *     optional accent short-code (e.g. "MS") + label + count.
 *   - `COLUMN_HEADER_ROW_CLASSES` — the canonical column-label type
 *     treatment, exported for consumers that must stay `<th>`-based
 *     (real `<table>`s share the string, not the component).
 *   - `BANDED_ROW_CLASSES`   — the canonical data-row shell (min-height,
 *     `px-5` gutter, `gap-3` column rhythm, hairline border, hover wash)
 *     so every banded surface's rows measure identically.
 */
import { CaretRight } from '@phosphor-icons/react';
import { EYEBROW_CLASS } from '../../lib/utils';

/** Canonical type treatment for a column label. Applied per-cell by
 *  `ColumnHeaderRow`; import directly for `<th>` cells in real tables. */
export const COLUMN_HEADER_ROW_CLASSES =
  'text-3xs font-semibold uppercase tracking-[0.08em] text-ink-faint';

/**
 * Lines of text every banded row RESERVES, so a singles row and a doubles
 * pairing measure the same and the list stops being ragged. Derived from the
 * seeded data (194 real side labels, both demo workspaces), not chosen:
 *
 *   longest side label                        37 chars
 *     ("Diego Alcantara / Shruti Kalyanaraman")
 *   it wraps at the " / ", so its longest LINE 19 chars
 *     ("Shruti Kalyanaraman")
 *   19 chars fit one line at `NAME_COL_MIN` below
 *   ⇒ 2 lines holds the measured worst case; p95 (33 chars) also needs 2.
 *
 * One line leaves every doubles pairing wrapping past the row (the ragged
 * list this fixes); three would spend a blank line on the 50%+ of rows at or
 * under the 16-char median.
 */
export const BANDED_ROW_LINES = 2;

/**
 * `BANDED_ROW_LINES` expressed as a min-height class:
 *
 *   text-sm (0.875rem = 14px) × leading-relaxed (1.625) = 22.75px per line
 *   22.75 × 2 lines                                     = 45.5px
 *   next rung of the spacing ladder at or above 45.5    = 48px = `min-h-12`
 *
 * `min-height`, deliberately, not `height`. Truncation is banned product-wide
 * (`truncationContract.test.ts`), so a label longer than anything in the
 * measured data has to be able to take a third line and push its row taller
 * rather than lose characters. The reservation is sized so nothing in real
 * data does that: uniform in practice, lossless in the exception.
 */
export const BANDED_ROW_MIN_H = 'min-h-12';

/**
 * Floor for a flexible column carrying a PERSON NAME — a match side, a roster
 * player, an entrant. Replaces `min-w-0`, which is Flexbox §4.5 permission to
 * collapse to zero: at the old 560px dock floor the two match sides measured
 * ~145px each and every doubles pairing shredded into a ribbon.
 *
 *   the row reserves 2 lines, so the column must hold the longer half of the
 *   worst measured pairing on one line     19 chars ("Shruti Kalyanaraman")
 *   Geist mixed-case advance, conservative 0.55em
 *   19 × 0.55 × 14px                       ≈ 146px
 *   → 10rem (160px), the next step up, as headroom for names longer than
 *     this demo's.
 *
 * That also clears the hard floor with room to spare: the longest UNBREAKABLE
 * token in the data is 12 chars ("Kalyanaraman") ≈ 92px, and a column under
 * that forces a mid-word break — the "Nashville / Badminto / n" failure
 * already fixed on the Hub, whose `min-w-[12rem]` is the pattern this copies.
 */
export const NAME_COL_MIN = 'min-w-[10rem]';

/** Canonical shell for a banded-list data row: flex row, the
 *  `BANDED_ROW_MIN_H` line reservation, `px-5` horizontal gutter, `gap-3`
 *  column rhythm, hairline `border-b`, muted hover wash. Consumers compose
 *  their own cells (and extras like `group` or an accent stripe) on top of
 *  this string so Meet Matches and Bracket Matches rows stay visually
 *  indistinguishable — and so every banded surface inherits the reservation
 *  from one place. */
export const BANDED_ROW_CLASSES =
  `flex ${BANDED_ROW_MIN_H} items-center gap-3 border-b border-border px-5 transition-colors duration-fast ease-brand hover:bg-muted/30`;

export interface BandedListColumn {
  /** Column label. Empty string renders an `aria-hidden` spacer cell. */
  label: string;
  /** Per-column width/flex/alignment classes (e.g. `w-20`, `min-w-0 flex-1`,
   *  `w-16 text-right`). */
  className?: string;
  /** Responsive priority — how soon the column collapses as the surface
   *  narrows (a docked detail pane opening, a small window):
   *    1 (default) — always visible.
   *    2 — hidden below the `@2xl` (672px) container width.
   *    3 — hidden below the `@4xl` (896px) container width.
   *  Requires an `@container/table` ancestor (the surface's scroll
   *  wrapper) — without one the container query never matches and the
   *  column stays hidden. */
  priority?: 1 | 2 | 3;
}

/** Container-query visibility classes per priority tier. CSS-driven so
 *  columns collapse continuously WHILE the DetailDock width animates —
 *  zero React renders. `block` restore is right for every single-tier
 *  banded cell (they're flex items, so display is blockified regardless);
 *  cells whose INNER layout is flex (two-tier header stacks) use the
 *  `flex` restore via `colClass(col, 'flex')`. Both maps are spelled out
 *  literally so Tailwind's scanner generates the variants. */
export const COL_PRIORITY_CLASS: Record<1 | 2 | 3, string> = {
  1: '',
  2: 'hidden @2xl/table:block',
  3: 'hidden @4xl/table:block',
};

/** Flex-restore twin of `COL_PRIORITY_CLASS` — exported alongside it since
 *  WorkspaceRow's hand-rolled cells (not `columns`-config-driven) need the
 *  flex variant directly for a cell whose own inner layout is a flex row. */
export const COL_PRIORITY_CLASS_FLEX: Record<1 | 2 | 3, string> = {
  1: '',
  2: 'hidden @2xl/table:flex',
  3: 'hidden @4xl/table:flex',
};

/** A column's full cell class string: geometry + priority visibility. */
export const colClass = (
  col: BandedListColumn,
  restore: 'block' | 'flex' = 'block',
): string =>
  [
    col.className,
    (restore === 'flex' ? COL_PRIORITY_CLASS_FLEX : COL_PRIORITY_CLASS)[
      col.priority ?? 1
    ],
  ]
    .filter(Boolean)
    .join(' ');

/**
 * ColumnHeaderRow — a flex row of column labels sitting above the
 * data rows with the same horizontal rhythm.
 *
 * Carries `role="row"` + `role="columnheader"`, so it must be rendered
 * inside a `role="table"` (BandedTable supplies one). A standalone use —
 * a header shown above an empty state — has to wrap itself in one.
 */
export function ColumnHeaderRow({
  columns,
  className,
  inset = 'px-5',
}: {
  columns: BandedListColumn[];
  /** Extra root classes (e.g. `shrink-0` when the row is a flex-column
   *  child that must not collapse). */
  className?: string;
  /** Horizontal padding utility — `px-5` is the canonical rhythm. A
   *  dedicated prop (not `className`) because a conflicting `px-*`
   *  override can't reliably beat the default in Tailwind's output
   *  order. Pass `px-4` when the consumer's rows use the tighter inset. */
  inset?: string;
}) {
  return (
    <div
      role="row"
      className={[
        'flex items-center gap-3 border-b border-border bg-muted/40 py-1.5',
        inset,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {columns.map((col, i) => (
        // A label-less spacer column (a gutter, an action column) is still a
        // column: it stays a columnheader rather than being aria-hidden, or
        // the header count stops matching the cell count and every column
        // after it is announced one place off.
        <span
          key={i}
          role="columnheader"
          className={[COLUMN_HEADER_ROW_CLASSES, colClass(col)]
            .filter(Boolean)
            .join(' ')}
        >
          {col.label}
        </span>
      ))}
    </div>
  );
}

/**
 * GroupBandHeader — collapsible group section header. Caret + optional
 * accent short-code + label + count, hairline-separated like the rows
 * it groups.
 */
export function GroupBandHeader({
  label,
  code,
  detail,
  count,
  collapsed,
  onToggle,
  'data-testid': testid,
}: {
  /** Long name for the band. Rendered as the eyebrow AFTER `code`, and
   *  DROPPED when it is the same string as `code`. Callers resolve the long
   *  name with `?? code` (`EVENT_LABEL[key]?.full ?? key`,
   *  `disciplineLabel`), so an event with no long name — every
   *  operator-defined code — arrived here with `label === code` and the band
   *  printed it twice: "BS BS 20", "MDC MDC 1", beside a working "XD MIXED
   *  DOUBLES 11". The duplication is one fallback landing in both slots, so
   *  it is resolved here rather than at each of the three callers. */
  label: string;
  /** Optional accent short-code shown before the label (e.g. "MS"). */
  code?: string;
  /** Optional band DATA, rendered in normal case after the eyebrow label.
   *  The label is styled as an eyebrow (uppercase, tracked), which is right
   *  for a word like "Entered by" and wrong for a value like an email
   *  address — an address rendered in caps reads as shouting and is not
   *  even reliably the same string. So bands that carry a value put the
   *  word in `label` and the value here.
   *
   *  A string rather than a node, deliberately: a slot that took arbitrary
   *  markup would become the place a second row of controls appeared. The
   *  value WRAPS (the band header grows) — it used to be ellipsised, which
   *  cut exactly the identifying tail of an address. */
  detail?: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      data-testid={testid}
      className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-5 py-1.5 text-left transition-colors duration-fast ease-brand hover:bg-muted/60"
    >
      <CaretRight
        aria-hidden
        weight="bold"
        className={[
          'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-fast ease-brand',
          collapsed ? '' : 'rotate-90',
        ].join(' ')}
      />
      {code ? (
        <span className="text-2xs font-semibold uppercase text-accent sw-num">
          {code}
        </span>
      ) : null}
      {/* The LABEL yields, not the code: the code slot is the one that lines
          up down the list, so "BS" stays where "XD" is on the band above. */}
      {label !== code ? (
        <span className={`${EYEBROW_CLASS} shrink-0 text-ink-3`}>
          {label}
        </span>
      ) : null}
      {detail ? (
        <span className="min-w-0 break-words text-2xs text-muted-foreground">
          {detail}
        </span>
      ) : null}
      <span className="text-2xs sw-num text-muted-foreground">{count}</span>
    </button>
  );
}
