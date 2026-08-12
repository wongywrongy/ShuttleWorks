/**
 * BandedTable — the shared table shell over the banded-list vocabulary.
 *
 * One component owns what Meet Matches / Bracket Matches / Bracket
 * Roster each hand-assemble today from the BandedList pieces: the
 * column-label row (single- or two-tier), optional collapsible group
 * bands, and the canonical row shell (`bandedRowClasses`, whose line
 * reservation the passed `columns` derive) with optional click + selected
 * treatment. Consumers keep full control of cell content via `renderRow`;
 * the shell only owns the row chrome.
 *
 * The underlying `ColumnHeaderRow` / `GroupBandHeader` / class-string
 * exports stay available for surfaces not yet ported (SP-D7 S4).
 *
 * Modes (exactly one of `rows` / `groups`):
 *   - flat:    `rows={items}` — header row then rows.
 *   - grouped: `groups=[{key,label,items,…}]` — a `GroupBandHeader` per
 *     group (collapse state internal, all expanded initially).
 */
import { useState, type ReactNode } from 'react';
import { SELECTABLE_ROW_FOCUS, selectableRowProps } from '../../lib/selectableRow';
import {
  COLUMN_HEADER_ROW_CLASSES,
  ColumnHeaderRow,
  GroupBandHeader,
  colClass,
  type BandedListColumn,
} from './BandedList';
import { bandedRowClasses } from './bandedDockWidth';

export interface BandedTableColumn extends BandedListColumn {
  /** Optional second-tier label under the main label for two-tier
   *  headers (e.g. label "MD", subLabel "doubles"). Any column with a
   *  subLabel switches the whole header row to two-tier rendering. */
  subLabel?: string;
}

export interface BandedTableGroup<T> {
  key: string;
  label: string;
  /** Optional accent short-code before the label (e.g. "MS"). */
  code?: string;
  /** Optional band data in normal case after the eyebrow label — see
   *  `GroupBandHeader`'s `detail`. */
  detail?: string;
  items: T[];
  testId?: string;
}

export function BandedTable<T>({
  columns,
  rows,
  groups,
  rowId,
  renderRow,
  onRowClick,
  selectedId,
  rowClassName,
  rowTestId,
  rowAttrs,
  headerInset,
}: {
  columns: BandedTableColumn[];
  /** Flat mode — ignored when `groups` is provided. */
  rows?: T[];
  /** Grouped mode — collapsible `GroupBandHeader` per group. */
  groups?: BandedTableGroup<T>[];
  /** Stable row identity — React key + `selectedId` comparison. */
  rowId: (item: T) => string;
  /** Cell content for one row. The shell supplies the row wrapper
   *  (`BANDED_ROW_CLASSES` + click/selected chrome + `role="row"`) around
   *  it. Each cell MUST carry `role="cell"` — the shell publishes a table
   *  and cannot reach inside `renderRow` to mark them, so a row without
   *  them is a row that promises structure it doesn't have. Wrap a cell
   *  that is itself a control (an input, a select, a menu button) in
   *  `<span role="cell" className="contents">` so the control keeps its
   *  own role and the layout is untouched. */
  renderRow: (item: T) => ReactNode;
  onRowClick?: (item: T) => void;
  /** Row id to render with the selected treatment (accent wash +
   *  inset stripe + `data-selected`). */
  selectedId?: string | null;
  /** Extra per-row classes (e.g. `group` hover reveals, severity
   *  accent stripes). */
  rowClassName?: (item: T) => string | undefined;
  rowTestId?: (item: T) => string | undefined;
  /** Extra attributes spread onto the row element (e.g. `data-severity`
   *  for Meet's disruption-accented rows). `data-testid`/`data-selected`
   *  stay owned by the shell and win on collision. */
  rowAttrs?: (item: T) => Record<string, string | undefined>;
  /** Horizontal padding utility for the header row — see
   *  `ColumnHeaderRow`'s `inset`. Defaults to the canonical `px-5`. */
  headerInset?: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // The row shell, including the line reservation THESE columns derive — a
  // list of names reserves two lines, a list of fixed-width cells one.
  const rowShell = bandedRowClasses(columns);

  const renderRows = (items: T[]) =>
    items.map((item) => {
      const id = rowId(item);
      const selected = selectedId != null && selectedId === id;
      // A clickable row must be reachable by keyboard (audit G1) — the row
      // only becomes focusable when it is actually clickable. Its keyboard
      // contract comes from selectableRowProps; its ROLE does not. `button`
      // is a name-from-content role, so it flattens every cell in the row
      // into one label — the flat run of text the T7 audit found. Inside a
      // table the row is a `row`, and selection is `aria-selected`.
      const click = onRowClick
        ? selectableRowProps(() => onRowClick(item), selected)
        : null;
      return (
        <div
          key={id}
          {...(rowAttrs?.(item) ?? {})}
          data-testid={rowTestId?.(item)}
          data-selected={selected ? 'true' : undefined}
          role="row"
          aria-selected={click ? selected : undefined}
          {...(click && {
            tabIndex: click.tabIndex,
            onClick: click.onClick,
            onKeyDown: click.onKeyDown,
          })}
          className={[
            rowShell,
            onRowClick ? `cursor-pointer ${SELECTABLE_ROW_FOCUS}` : '',
            selected ? 'bg-accent/10 shadow-[inset_2px_0_0_hsl(var(--accent))]' : '',
            rowClassName?.(item) ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {renderRow(item)}
        </div>
      );
    });

  const twoTier = columns.some((c) => c.subLabel);

  // The wrappers below are plain block boxes carrying only roles — the flex
  // rows, the column widths and the `@container/table` priority classes are
  // untouched, so the layout is byte-identical to the role-less version.
  return (
    <div role="table" aria-colcount={columns.length}>
      <div role="rowgroup">
        {twoTier ? (
          <TwoTierHeaderRow columns={columns} inset={headerInset} />
        ) : (
          <ColumnHeaderRow columns={columns} inset={headerInset} />
        )}
      </div>
      {groups
        ? groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            return (
              // One rowgroup per band: the collapse toggle then owns a real
              // section, so collapsing it removes a group of rows rather than
              // an unexplained stretch of text.
              <div role="rowgroup" key={g.key}>
                <div role="row">
                  <div role="cell" aria-colspan={columns.length}>
                    <GroupBandHeader
                      label={g.label}
                      code={g.code}
                      detail={g.detail}
                      count={g.items.length}
                      collapsed={isCollapsed}
                      onToggle={() => toggle(g.key)}
                      data-testid={g.testId}
                    />
                  </div>
                </div>
                {!isCollapsed ? renderRows(g.items) : null}
              </div>
            );
          })
        : <div role="rowgroup">{renderRows(rows ?? [])}</div>}
    </div>
  );
}

/**
 * TwoTierHeaderRow — `ColumnHeaderRow`'s two-tier sibling: each cell
 * stacks the canonical column label over a muted sub-label. Same shell
 * (band background, hairline border, `px-5` rhythm) so single- and
 * two-tier headers measure identically apart from height.
 */
function TwoTierHeaderRow({
  columns,
  inset = 'px-5',
}: {
  columns: BandedTableColumn[];
  inset?: string;
}) {
  return (
    <div
      role="row"
      className={[
        'flex items-start gap-3 border-b border-border bg-muted/40 py-1.5',
        inset,
      ].join(' ')}
    >
      {columns.map((col, i) => (
        // Label-less spacer columns stay columnheaders — see ColumnHeaderRow.
        <span
          key={i}
          role="columnheader"
          // Two-tier cells stack label over sub-label with `flex flex-col`,
          // so a collapsed-priority column must restore to `flex` (the
          // default `block` restore would unstack this one).
          className={['flex flex-col', colClass(col, 'flex')]
            .filter(Boolean)
            .join(' ')}
        >
          <span className={COLUMN_HEADER_ROW_CLASSES}>{col.label}</span>
          {col.subLabel ? (
            <span className="text-3xs lowercase text-muted-foreground">
              {col.subLabel}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
