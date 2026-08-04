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

/** Canonical type treatment for a column label. Applied per-cell by
 *  `ColumnHeaderRow`; import directly for `<th>` cells in real tables. */
export const COLUMN_HEADER_ROW_CLASSES =
  'text-3xs font-semibold uppercase tracking-[0.08em] text-ink-faint';

/** Canonical shell for a banded-list data row: flex row, `min-h-[32px]`,
 *  `px-5` horizontal gutter, `gap-3` column rhythm, hairline `border-b`,
 *  muted hover wash. Consumers compose their own cells (and extras like
 *  `group` or an accent stripe) on top of this string so Meet Matches and
 *  Bracket Matches rows stay visually indistinguishable. */
export const BANDED_ROW_CLASSES =
  'flex min-h-[32px] items-center gap-3 border-b border-border px-5 transition-colors duration-fast ease-brand hover:bg-muted/30';

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

const COL_PRIORITY_CLASS_FLEX: Record<1 | 2 | 3, string> = {
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
      className={[
        'flex items-center gap-3 border-b border-border bg-muted/40 py-1.5',
        inset,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {columns.map((col, i) => (
        <span
          key={i}
          className={[COLUMN_HEADER_ROW_CLASSES, colClass(col)]
            .filter(Boolean)
            .join(' ')}
          aria-hidden={col.label ? undefined : true}
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
  count,
  collapsed,
  onToggle,
  'data-testid': testid,
}: {
  label: string;
  /** Optional accent short-code shown before the label (e.g. "MS"). */
  code?: string;
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
      <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      <span className="text-2xs sw-num text-muted-foreground">{count}</span>
    </button>
  );
}
