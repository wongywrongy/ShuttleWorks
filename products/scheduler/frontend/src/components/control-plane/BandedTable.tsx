/**
 * BandedTable — the shared table shell over the banded-list vocabulary.
 *
 * One component owns what Meet Matches / Bracket Matches / Bracket
 * Roster each hand-assemble today from the BandedList pieces: the
 * column-label row (single- or two-tier), optional collapsible group
 * bands, and the canonical `BANDED_ROW_CLASSES` row shell with optional
 * click + selected treatment. Consumers keep full control of cell
 * content via `renderRow`; the shell only owns the row chrome.
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
import {
  BANDED_ROW_CLASSES,
  COLUMN_HEADER_ROW_CLASSES,
  ColumnHeaderRow,
  GroupBandHeader,
  type BandedListColumn,
} from './BandedList';

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
   *  (`BANDED_ROW_CLASSES` + click/selected chrome) around it. */
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

  const renderRows = (items: T[]) =>
    items.map((item) => {
      const id = rowId(item);
      const selected = selectedId != null && selectedId === id;
      return (
        <div
          key={id}
          {...(rowAttrs?.(item) ?? {})}
          data-testid={rowTestId?.(item)}
          data-selected={selected ? 'true' : undefined}
          onClick={onRowClick ? () => onRowClick(item) : undefined}
          className={[
            BANDED_ROW_CLASSES,
            onRowClick ? 'cursor-pointer' : '',
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

  return (
    <>
      {twoTier ? (
        <TwoTierHeaderRow columns={columns} inset={headerInset} />
      ) : (
        <ColumnHeaderRow columns={columns} inset={headerInset} />
      )}
      {groups
        ? groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            return (
              <div key={g.key}>
                <GroupBandHeader
                  label={g.label}
                  code={g.code}
                  count={g.items.length}
                  collapsed={isCollapsed}
                  onToggle={() => toggle(g.key)}
                  data-testid={g.testId}
                />
                {!isCollapsed ? renderRows(g.items) : null}
              </div>
            );
          })
        : renderRows(rows ?? [])}
    </>
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
      className={[
        'flex items-start gap-3 border-b border-border bg-muted/40 py-1.5',
        inset,
      ].join(' ')}
    >
      {columns.map((col, i) => (
        <span
          key={i}
          className={['flex flex-col', col.className].filter(Boolean).join(' ')}
          aria-hidden={col.label || col.subLabel ? undefined : true}
        >
          <span className={COLUMN_HEADER_ROW_CLASSES}>{col.label}</span>
          {col.subLabel ? (
            <span className="text-3xs lowercase text-muted-foreground/70">
              {col.subLabel}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
