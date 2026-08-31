import { useEffect, useState, type ReactNode } from "react";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Check,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import {
  getDenseDataPage,
  isDenseColumnVisible,
  setDenseSort,
  type DenseDataColumn,
  type DenseDataFacetOption,
  type DenseDataPage,
  type DenseDataPageSize,
  type DenseDataState,
} from "./denseData";
import {
  SELECTABLE_ROW_FOCUS,
  selectableRowProps,
} from "../../lib/selectableRow";

const CONTROL =
  "min-h-9 rounded-md border border-border bg-card px-2.5 text-sm text-ink shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export interface DenseDataTableProps<T> {
  rows: readonly T[];
  columns: readonly DenseDataColumn<T>[];
  state: DenseDataState;
  onStateChange: (state: DenseDataState) => void;
  rowId: (row: T) => string;
  selectable?: boolean;
  selectedIds?: readonly string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  /** Independent detail-focus row, separate from bulk-selection checkboxes. */
  activeRowId?: string | null;
  onRowClick?: (row: T) => void;
  groupBy?: (row: T) => { key: string; label: string; testId?: string };
  rowTestId?: (row: T) => string | undefined;
  /** Optional leading selection/control lane. The value column remains the
   * sole owner of truncation under the strict record contract. */
  renderLeading?: (row: T) => ReactNode;
  renderActions?: (row: T) => ReactNode;
  emptyState?: ReactNode;
  /** Render a complete mobile card when the default field stack is not enough. */
  renderMobileRow?: (row: T) => ReactNode;
  /**
   * Opt into the strict record-row contract (F-PAIR-01/F-PAIR-02/F-PAIR-05).
   * Strict rows are a desktop table at every viewport: one record, one
   * 28px row, one line per cell, no group bands, and no mobile card branch.
   * Existing consumers stay on the legacy responsive behavior until they are
   * deliberately migrated (R-PAIR-8).
   */
  strictRows?: boolean;
  /** The one elastic column in strict mode. Defaults to the first visible
   * column, so callers cannot accidentally create a table with zero elastic
   * identity columns. */
  elasticColumnId?: string;
  /** Embedded record lists do not earn a pagination footer. */
  showPagination?: boolean;
  className?: string;
}

function displayValue<T>(column: DenseDataColumn<T>, row: T): ReactNode {
  const value = column.accessor(row);
  return column.render
    ? column.render(value, row)
    : value == null || value === ""
      ? "Not set"
      : String(value);
}

function cellClass<T>(column: DenseDataColumn<T>): string {
  return [
    "px-3 py-2.5 align-middle text-2sm",
    column.align === "right"
      ? "text-right"
      : column.align === "center"
        ? "text-center"
        : "text-left",
    column.className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Strict rows use a fixed density token: `h-7` is the 28px operator row.
 * Numeric columns opt into the shared lining-figure utility, while all cell
 * content is kept on one line. The identity column's elastic width is marked
 * by the caller so a future table cannot silently make two columns flexible.
 */
function strictCellClass<T>(
  column: DenseDataColumn<T>,
  elastic: boolean,
): string {
  return [
    "h-7 min-h-7 max-h-7 overflow-hidden whitespace-nowrap text-ellipsis px-2 py-0 align-middle text-xs",
    elastic ? "min-w-0" : "w-max shrink-0",
    column.align === "right"
      ? "text-right sw-num"
      : column.align === "center"
        ? "text-center"
        : "text-left",
    column.className,
  ]
    .filter(Boolean)
    .join(" ");
}

function strictHeaderClass<T>(
  column: DenseDataColumn<T>,
  elastic: boolean,
): string {
  return [
    strictCellClass(column, elastic),
    "font-semibold uppercase tracking-[0.08em] text-3xs text-ink-faint",
  ]
    .filter(Boolean)
    .join(" ");
}

function strictDisplayValue<T>(
  column: DenseDataColumn<T>,
  row: T,
): ReactNode {
  const value = column.accessor(row);
  if (column.render) {
    const rendered = column.render(value, row);
    // F-PAIR-01: a strict primitive owns the empty-value vocabulary. A custom
    // renderer that returns null cannot reintroduce a raw blank/null cell.
    return rendered == null || rendered === "" ? "—" : rendered;
  }
  // Accessors intentionally return unknown for sorting/filtering. The
  // unrendered path therefore narrows to the primitive's operator-facing
  // string instead of leaking an unknown value into ReactNode (and mirrors
  // the legacy displayValue fallback).
  return value == null || value === "" ? "—" : String(value);
}

function sortLabel(state: DenseDataState, columnId: string): string {
  if (state.sort?.id !== columnId) return "Sort";
  return state.sort.direction === "asc"
    ? "Sorted ascending. Activate to sort descending."
    : "Sorted descending. Activate to clear sort.";
}

function SortIcon({
  state,
  columnId,
}: {
  state: DenseDataState;
  columnId: string;
}) {
  if (state.sort?.id !== columnId) return null;
  return state.sort.direction === "asc" ? (
    <CaretUp aria-hidden size={14} />
  ) : (
    <CaretDown aria-hidden size={14} />
  );
}

/**
 * Accessible, responsive data surface for operator collections. The desktop
 * representation is a semantic table; below the medium breakpoint the same
 * rows become cards so a phone never requires two-direction scrolling.
 */
export function DenseDataTable<T>({
  rows,
  columns,
  state,
  onStateChange,
  rowId,
  selectable = false,
  selectedIds = [],
  onSelectedIdsChange,
  activeRowId,
  onRowClick,
  groupBy,
  rowTestId,
  renderLeading,
  renderActions,
  emptyState = "No records match this view.",
  renderMobileRow,
  strictRows = false,
  elasticColumnId: requestedElasticColumnId,
  showPagination = true,
  className,
}: DenseDataTableProps<T>) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  const visibleColumns = columns.filter((column) =>
    isDenseColumnVisible(state, column as DenseDataColumn<unknown>),
  );
  const safeColumns = visibleColumns.length
    ? visibleColumns
    : columns.slice(0, 1);
  const elasticColumnId = strictRows
    ? (safeColumns.find((column) => column.id === requestedElasticColumnId)?.id ??
      safeColumns[0]?.id)
    : null;
  const page = getDenseDataPage(rows, columns, state);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const pageIds = page.rows.map(rowId);
  const selected = new Set(selectedIds);
  const allPageSelected =
    selectable && pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleSelection = (id: string) => {
    if (!onSelectedIdsChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange([...next]);
  };

  const togglePageSelection = () => {
    if (!onSelectedIdsChange) return;
    const next = new Set(selected);
    if (allPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    onSelectedIdsChange([...next]);
  };

  const sort = (id: string) => onStateChange(setDenseSort(state, id));
  const densityClass =
    state.density === "compact"
      ? "dense-data-compact"
      : "dense-data-comfortable";
  const groupedRows = (() => {
    if (!groupBy)
      return [] as Array<{
        key: string;
        label: string;
        testId?: string;
        rows: T[];
      }>;
    const groups = new Map<
      string,
      { key: string; label: string; testId?: string; rows: T[] }
    >();
    page.rows.forEach((row) => {
      const descriptor = groupBy(row);
      const group = groups.get(descriptor.key) ?? { ...descriptor, rows: [] };
      group.rows.push(row);
      groups.set(descriptor.key, group);
    });
    return [...groups.values()];
  })();
  const toggleGroup = (key: string) =>
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const renderDesktopRow = (row: T) => {
    const id = rowId(row);
    const rowSelected = selected.has(id);
    const rowActive = rowSelected || activeRowId === id;
    const click = onRowClick
      ? selectableRowProps(() => onRowClick(row), rowActive)
      : null;
    return (
      <tr
        key={id}
        data-row-id={id}
        data-testid={!isMobile ? rowTestId?.(row) : undefined}
        data-selected={rowActive ? "true" : undefined}
        aria-selected={rowActive}
        {...(click && {
          tabIndex: click.tabIndex,
          onClick: click.onClick,
          onKeyDown: click.onKeyDown,
        })}
        className={[
          "border-b border-border last:border-b-0",
          onRowClick
            ? `cursor-pointer hover:bg-muted/30 focus-visible:bg-muted/40 ${SELECTABLE_ROW_FOCUS}`
            : "",
          rowActive ? "bg-accent/10" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {selectable ? (
          <td
            className="w-11 px-3 py-2.5"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              aria-label={`Select ${id}`}
              checked={rowSelected}
              onChange={() => toggleSelection(id)}
              className="size-4 accent-[hsl(var(--accent))]"
            />
          </td>
        ) : null}
        {safeColumns.map((column) => (
          <td
            key={column.id}
            title={
              column.cellTitle?.(row) ?? String(column.accessor(row) ?? "")
            }
            className={cellClass(column)}
          >
            {displayValue(column, row)}
          </td>
        ))}
        {renderActions ? (
          <td
            className="w-11 px-3 py-2.5"
            onClick={(event) => event.stopPropagation()}
          >
            {renderActions(row)}
          </td>
        ) : null}
      </tr>
    );
  };

  /** Strict mode deliberately has no mobile/card or grouped representation.
   * F-PAIR-01/F-PAIR-05: the shared primitive is the only owner of row
   * geometry, empty values, numeric alignment, and the trailing action lane.
   */
  const renderStrictRow = (row: T) => {
    const id = rowId(row);
    const rowSelected = selected.has(id);
    const rowActive = rowSelected || activeRowId === id;
    const click = onRowClick
      ? selectableRowProps(() => onRowClick(row), rowActive)
      : null;
    return (
      <tr
        key={id}
        data-row-id={id}
        data-testid={rowTestId?.(row)}
        data-strict-row="true"
        data-selected={rowActive ? "true" : undefined}
        aria-selected={rowActive}
        {...(click && {
          tabIndex: click.tabIndex,
          onClick: click.onClick,
          onKeyDown: click.onKeyDown,
        })}
        className={[
          "h-7 min-h-7 max-h-7 border-b border-border last:border-b-0",
          onRowClick
            ? `cursor-pointer hover:bg-muted/30 focus-visible:bg-muted/40 ${SELECTABLE_ROW_FOCUS}`
            : "",
          rowActive ? "bg-accent/10" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {selectable ? (
          <td
            className="h-7 w-7 overflow-hidden px-1 py-0 align-middle"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              aria-label={`Select ${id}`}
              checked={rowSelected}
              onChange={() => toggleSelection(id)}
              className="size-3.5 accent-[hsl(var(--accent))]"
            />
          </td>
        ) : null}
        {renderLeading ? (
          <td
            data-strict-leading="true"
            className="h-7 w-7 overflow-hidden px-1 py-0 align-middle"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-6 items-center justify-center overflow-hidden [&>*]:!h-6 [&>*]:!min-h-0">
              {renderLeading(row)}
            </div>
          </td>
        ) : null}
        {safeColumns.map((column) => {
          const elastic = column.id === elasticColumnId;
          return (
            <td
              key={column.id}
              data-strict-cell="true"
              data-elastic-column={elastic ? column.id : undefined}
              title={
                column.cellTitle?.(row) ??
                String(column.accessor(row) ?? "—")
              }
              className={strictCellClass(column, elastic)}
            >
              <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {strictDisplayValue(column, row)}
              </span>
            </td>
          );
        })}
        {renderActions ? (
          <td
            data-strict-action="true"
            className="h-7 w-7 overflow-hidden px-1 py-0 align-middle"
            onClick={(event) => event.stopPropagation()}
          >
            {/* F-PAIR-01: an action supplied by a consumer cannot make the
                fixed record row taller. Twenty-four pixels preserves WCAG's
                minimum target while leaving room for the row hairline. */}
            <div className="flex h-6 items-center justify-center overflow-hidden [&>*]:!h-6 [&>*]:!min-h-0">
              {renderActions(row)}
            </div>
          </td>
        ) : null}
      </tr>
    );
  };

  return (
    <div
      className={[
        "flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card",
        densityClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-density={state.density}
      data-strict-rows={strictRows ? "true" : undefined}
    >
      <div
        className={
          strictRows
            ? "min-h-0 flex-1 overflow-auto"
            : "hidden min-h-0 flex-1 overflow-auto md:block"
        }
      >
        <table
          data-strict-record-table={strictRows ? "true" : undefined}
          className={[
            strictRows
              ? "w-full min-w-0 table-fixed border-collapse"
              : "w-full min-w-[42rem] border-collapse",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-rowcount={page.total}
        >
          <thead className="sticky top-0 z-raised bg-muted/95 backdrop-blur-sm">
            <tr className="border-b border-border">
              {selectable ? (
                <th
                  scope="col"
                  className={
                    strictRows
                      ? "h-7 w-7 px-1 py-0 text-left"
                      : "w-11 px-3 py-2 text-left"
                  }
                >
                  <input
                    type="checkbox"
                    aria-label={
                      allPageSelected ? "Clear page selection" : "Select page"
                    }
                    checked={allPageSelected}
                    onChange={togglePageSelection}
                    className="size-4 accent-[hsl(var(--accent))]"
                  />
                </th>
              ) : null}
              {renderLeading ? (
                <th
                  scope="col"
                  aria-label="Select"
                  className={
                    strictRows
                      ? "h-7 w-7 px-1 py-0"
                      : "w-11 px-3 py-2"
                  }
                />
              ) : null}
              {safeColumns.map((column) => {
                const sorted = state.sort?.id === column.id;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    data-strict-header={strictRows ? "true" : undefined}
                    data-elastic-column={
                      strictRows && column.id === elasticColumnId
                        ? column.id
                        : undefined
                    }
                    aria-sort={
                      sorted
                        ? state.sort?.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={[
                      strictRows
                        ? strictHeaderClass(
                            column,
                            column.id === elasticColumnId,
                          )
                        : "px-3 py-2 text-3xs font-semibold uppercase tracking-[0.08em] text-ink-faint",
                      !strictRows
                        ? column.align === "right"
                          ? "text-right"
                          : column.align === "center"
                            ? "text-center"
                            : "text-left"
                        : "",
                      !strictRows ? column.className : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <button
                      type="button"
                      className="inline-flex min-h-7 items-center gap-1 rounded-sm text-left hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => sort(column.id)}
                      aria-label={`${column.label}: ${sortLabel(state, column.id)}`}
                    >
                      {column.label}
                      <SortIcon state={state} columnId={column.id} />
                    </button>
                  </th>
                );
              })}
              {renderActions ? (
                <th
                  scope="col"
                  aria-label="Actions"
                  className={
                    strictRows ? "h-7 w-7 px-1 py-0" : "w-11 px-3 py-2"
                  }
                />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {strictRows
              ? page.rows.map(renderStrictRow)
              : groupBy
              ? groupedRows.flatMap((group) => [
                  <tr key={`${group.key}-header`}>
                    <th
                      scope="rowgroup"
                      colSpan={
                        safeColumns.length +
                        (selectable ? 1 : 0) +
                        (renderActions ? 1 : 0)
                      }
                      className="bg-muted/40 px-3 py-2 text-left"
                    >
                      <button
                        type="button"
                        data-testid={group.testId}
                        aria-expanded={!collapsedGroups.has(group.key)}
                        onClick={() => toggleGroup(group.key)}
                        className="flex min-h-8 w-full items-center gap-2 text-left text-3xs font-semibold uppercase tracking-[0.08em] text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <CaretRight
                          aria-hidden
                          size={14}
                          className={
                            collapsedGroups.has(group.key) ? "" : "rotate-90"
                          }
                        />
                        {group.label}
                        <span className="text-muted-foreground">
                          {group.rows.length}
                        </span>
                      </button>
                    </th>
                  </tr>,
                  ...(collapsedGroups.has(group.key)
                    ? []
                    : group.rows.map(renderDesktopRow)),
                ])
              : page.rows.map(renderDesktopRow)}
          </tbody>
        </table>
        {page.rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {emptyState}
          </div>
        ) : null}
      </div>

      {!strictRows && isMobile ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="divide-y divide-border">
            {page.rows.map((row) => {
              const id = rowId(row);
              const rowSelected = selected.has(id);
              const rowActive = rowSelected || activeRowId === id;
              const click = onRowClick
                ? selectableRowProps(() => onRowClick(row), rowActive)
                : null;
              return (
                <article
                  key={id}
                  data-row-id={id}
                  data-testid={rowTestId?.(row)}
                  data-selected={rowActive ? "true" : undefined}
                  {...(click ?? {})}
                  className={[
                    "p-4",
                    click
                      ? `cursor-pointer hover:bg-muted/30 ${SELECTABLE_ROW_FOCUS}`
                      : "",
                    rowActive ? "bg-accent/10" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="mb-3 flex items-start gap-3">
                    {selectable ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${id}`}
                        checked={rowSelected}
                        onChange={() => toggleSelection(id)}
                        className="mt-0.5 size-4 accent-[hsl(var(--accent))]"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 font-medium text-ink">
                      {renderMobileRow
                        ? renderMobileRow(row)
                        : String(displayValue(safeColumns[0], row))}
                    </div>
                    {renderActions ? (
                      <span
                        className="shrink-0"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {renderActions(row)}
                      </span>
                    ) : null}
                  </div>
                  {!renderMobileRow ? (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pl-7">
                      {safeColumns
                        .slice(1)
                        .filter((column) => column.mobile !== false)
                        .map((column) => (
                          <div key={column.id} className="min-w-0">
                            <dt className="text-3xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                              {column.label}
                            </dt>
                            <dd className="break-words text-2sm text-ink">
                              {displayValue(column, row)}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  ) : null}
                </article>
              );
            })}
          </div>
          {page.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {emptyState}
            </div>
          ) : null}
        </div>
      ) : null}
      {showPagination ? (
        <DenseDataPagination
          page={page}
          onPageChange={(nextPage) => onStateChange({ ...state, page: nextPage })}
          onPageSizeChange={(pageSize) =>
            onStateChange({ ...state, page: 1, pageSize })
          }
        />
      ) : null}
    </div>
  );
}

export function DenseDataPagination({
  page,
  onPageChange,
  onPageSizeChange,
}: {
  page: DenseDataPage<unknown>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: DenseDataPageSize) => void;
}) {
  const first = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.total, page.page * page.pageSize);
  return (
    <footer className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2 text-2sm text-muted-foreground">
      <span aria-live="polite">
        {first}–{last} of {page.total}
      </span>
      <div className="flex items-center gap-2">
        <label className="hidden items-center gap-1.5 sm:flex">
          Rows{" "}
          <select
            aria-label="Rows per page"
            value={page.pageSize}
            onChange={(event) =>
              onPageSizeChange(Number(event.target.value) as DenseDataPageSize)
            }
            className={CONTROL}
          >
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <button
          type="button"
          aria-label="Previous page"
          disabled={page.page <= 1}
          onClick={() => onPageChange(page.page - 1)}
          className={`${CONTROL} inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <CaretLeft aria-hidden size={16} />
        </button>
        <span className="min-w-16 text-center text-2sm text-ink">
          Page {page.page} / {page.pageCount}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page.page >= page.pageCount}
          onClick={() => onPageChange(page.page + 1)}
          className={`${CONTROL} inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <CaretRight aria-hidden size={16} />
        </button>
      </div>
    </footer>
  );
}

export function DenseDataToolbar({
  state,
  onStateChange,
  facets = [],
  selectedCount = 0,
  searchTestId,
  searchPlaceholder = "Search",
  children,
}: {
  state: DenseDataState;
  onStateChange: (state: DenseDataState) => void;
  facets?: Array<{
    column: DenseDataColumn<unknown>;
    options: DenseDataFacetOption[];
  }>;
  selectedCount?: number;
  searchTestId?: string;
  searchPlaceholder?: string;
  children?: ReactNode;
}) {
  const activeFilters = Object.entries(state.filters).flatMap(([id, values]) =>
    values.map((value) => ({ id, value })),
  );
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      <label className="relative min-w-48 flex-1 sm:max-w-xs">
        <MagnifyingGlass
          aria-hidden
          size={16}
          className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground"
        />
        <span className="sr-only">Search records</span>
        <input
          data-testid={searchTestId}
          value={state.search}
          onChange={(event) =>
            onStateChange({ ...state, search: event.target.value, page: 1 })
          }
          placeholder={searchPlaceholder}
          className={`${CONTROL} w-full pl-8`}
        />
      </label>
      {facets.map(({ column, options }) => (
        <label key={column.id} className="flex items-center gap-1.5">
          <span className="sr-only">Filter by {column.label}</span>
          <select
            aria-label={`Filter by ${column.label}`}
            value={state.filters[column.id]?.[0] ?? ""}
            onChange={(event) =>
              onStateChange({
                ...state,
                page: 1,
                filters: {
                  ...state.filters,
                  [column.id]: event.target.value ? [event.target.value] : [],
                },
              })
            }
            className={CONTROL}
          >
            <option value="">{column.label}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </label>
      ))}
      {activeFilters.map((filter) => (
        <button
          type="button"
          key={`${filter.id}:${filter.value}`}
          onClick={() =>
            onStateChange({
              ...state,
              page: 1,
              filters: {
                ...state.filters,
                [filter.id]: (state.filters[filter.id] ?? []).filter(
                  (value) => value !== filter.value,
                ),
              },
            })
          }
          className="inline-flex min-h-7 items-center gap-1 rounded-full border border-accent/30 bg-action-selected-bg px-2 text-2sm text-action-selected-foreground"
        >
          <span>{filter.value}</span>
          <X aria-hidden size={13} />
        </button>
      ))}
      {activeFilters.length || state.search ? (
        <button
          type="button"
          onClick={() =>
            onStateChange({ ...state, search: "", filters: {}, page: 1 })
          }
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-ink"
        >
          <X aria-hidden size={15} />
          Clear
        </button>
      ) : null}
      {selectedCount > 0 ? (
        <span
          className="text-2sm font-medium text-foreground"
          aria-live="polite"
        >
          {selectedCount} selected
        </span>
      ) : null}
      {children}
    </div>
  );
}

export function DenseDataColumnVisibility<T>({
  columns,
  state,
  onStateChange,
}: {
  columns: readonly DenseDataColumn<T>[];
  state: DenseDataState;
  onStateChange: (state: DenseDataState) => void;
}) {
  const hidden = new Set(state.hiddenColumns);
  return (
    <details className="relative">
      <summary
        className={`${CONTROL} inline-flex cursor-pointer list-none items-center gap-1.5`}
      >
        <Check aria-hidden size={15} />
        Columns
      </summary>
      <div className="absolute right-0 z-popover mt-1 min-w-48 rounded-md border border-border bg-card p-2 shadow-lg">
        {columns
          .filter((column) => column.hideable !== false)
          .map((column) => (
            <label
              key={column.id}
              className="flex min-h-9 items-center gap-2 rounded px-2 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={!hidden.has(column.id)}
                onChange={() => {
                  const next = new Set(hidden);
                  if (next.has(column.id)) next.delete(column.id);
                  else next.add(column.id);
                  onStateChange({ ...state, hiddenColumns: [...next] });
                }}
                className="size-4 accent-[hsl(var(--accent))]"
              />
              {column.label}
            </label>
          ))}
      </div>
    </details>
  );
}
