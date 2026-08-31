/**
 * Shared state and data helpers for operator data views.
 *
 * Dense views (entries, participants, matches and the plan) all need the same
 * vocabulary: search, facets, sorting, paging, density and saved views. This
 * module deliberately has no knowledge of a particular feature so a view can
 * keep its domain row type while sharing the interaction contract.
 */

import type { ReactNode } from 'react';

export type DenseDataSortDirection = 'asc' | 'desc';
export type DenseDataDensity = 'comfortable' | 'compact';
export type DenseDataPageSize = 50 | 100;

export interface DenseDataSort {
  id: string;
  direction: DenseDataSortDirection;
}

export interface DenseDataState {
  search: string;
  sort: DenseDataSort | null;
  filters: Record<string, string[]>;
  hiddenColumns: string[];
  density: DenseDataDensity;
  page: number;
  pageSize: DenseDataPageSize;
  groupBy: string | null;
}

export const DEFAULT_DENSE_DATA_STATE: DenseDataState = {
  search: '',
  sort: null,
  filters: {},
  hiddenColumns: [],
  density: 'comfortable',
  page: 1,
  pageSize: 50,
  groupBy: null,
};

export interface DenseDataColumn<T> {
  id: string;
  label: string;
  accessor: (row: T) => unknown;
  /** Optional display formatter. Sorting and filtering still use accessor. */
  render?: (value: unknown, row: T) => ReactNode;
  /** Override the default locale-aware value comparison. */
  compare?: (a: T, b: T) => number;
  cellTitle?: (row: T) => string | undefined;
  /** Hide from the compact mobile card while retaining the table column. */
  mobile?: boolean;
  /** Columns can opt out of the column chooser. */
  hideable?: boolean;
  /** Initial visibility when no saved view has been applied. */
  defaultHidden?: boolean;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export interface DenseDataFacetOption {
  value: string;
  label: string;
  count: number;
}

export interface DenseDataPage<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: DenseDataPageSize;
  pageCount: number;
}

function normalizedValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(normalizedValue).join(' ');
  return String(value);
}

function compareValues(a: unknown, b: unknown): number {
  const aNumber = typeof a === 'number' ? a : Number.NaN;
  const bNumber = typeof b === 'number' ? b : Number.NaN;
  if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber)) return aNumber - bNumber;
  return normalizedValue(a).localeCompare(normalizedValue(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/** Apply the shared search, facet, sort and page behavior to a row collection. */
export function getDenseDataPage<T>(
  rows: readonly T[],
  columns: readonly DenseDataColumn<T>[],
  state: DenseDataState,
): DenseDataPage<T> {
  const search = state.search.trim().toLocaleLowerCase();
  const filtered = rows.filter((row) => {
    if (search) {
      const found = columns.some((column) =>
        normalizedValue(column.accessor(row)).toLocaleLowerCase().includes(search),
      );
      if (!found) return false;
    }

    return Object.entries(state.filters).every(([columnId, selected]) => {
      if (selected.length === 0) return true;
      const column = columns.find((candidate) => candidate.id === columnId);
      if (!column) return true;
      const values = normalizedValue(column.accessor(row))
        .split(',')
        .map((value) => value.trim());
      return selected.some((value) => values.includes(value));
    });
  });

  const sorted = state.sort
    ? [...filtered].sort((a, b) => {
        const column = columns.find((candidate) => candidate.id === state.sort?.id);
        const result = column?.compare
          ? column.compare(a, b)
          : compareValues(column?.accessor(a), column?.accessor(b));
        return state.sort?.direction === 'desc' ? result * -1 : result;
      })
    : filtered;

  const pageCount = Math.max(1, Math.ceil(sorted.length / state.pageSize));
  const page = Math.min(Math.max(1, state.page), pageCount);
  const start = (page - 1) * state.pageSize;
  return {
    rows: sorted.slice(start, start + state.pageSize),
    total: sorted.length,
    page,
    pageSize: state.pageSize,
    pageCount,
  };
}

/** Build facet counts from the full collection, suitable for filter menus. */
export function getDenseDataFacetOptions<T>(
  rows: readonly T[],
  column: DenseDataColumn<T>,
): DenseDataFacetOption[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const values = normalizedValue(column.accessor(row))
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export function isDenseColumnVisible(state: DenseDataState, column: DenseDataColumn<unknown>): boolean {
  return !state.hiddenColumns.includes(column.id);
}

export function getDefaultHiddenColumns<T>(columns: readonly DenseDataColumn<T>[]): string[] {
  return columns.filter((column) => column.defaultHidden).map((column) => column.id);
}

export function toggleDenseFilter(
  state: DenseDataState,
  id: string,
  value: string,
): DenseDataState {
  const current = state.filters[id] ?? [];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value].sort();
  return {
    ...state,
    page: 1,
    filters: { ...state.filters, [id]: next },
  };
}

export function setDenseSort(
  state: DenseDataState,
  id: string,
): DenseDataState {
  const current = state.sort;
  const sort: DenseDataSort | null =
    current?.id !== id
      ? { id, direction: 'asc' }
      : current.direction === 'asc'
        ? { id, direction: 'desc' }
        : null;
  return { ...state, page: 1, sort };
}

export function clearDenseDataFilters(state: DenseDataState): DenseDataState {
  return { ...state, search: '', filters: {}, page: 1 };
}

function key(prefix: string, name: string): string {
  return `${prefix}.${name}`;
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Decode only dense-view keys, preserving unrelated route query parameters. */
export function decodeDenseDataState(
  input: URLSearchParams | string,
  defaults: Partial<DenseDataState> = {},
  prefix = 'table',
): DenseDataState {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const base = { ...DEFAULT_DENSE_DATA_STATE, ...defaults };
  const filters: Record<string, string[]> = {};
  const filterPrefix = `${key(prefix, 'filter')}.`;
  params.forEach((value, param) => {
    if (param.startsWith(filterPrefix)) {
      const id = param.slice(filterPrefix.length);
      const values = value.split(',').map((item) => item.trim()).filter(Boolean);
      if (id && values.length) filters[id] = [...new Set(values)].sort();
    }
  });
  const sortId = params.get(key(prefix, 'sort'));
  const direction = params.get(key(prefix, 'dir'));
  return {
    ...base,
    search: params.get(key(prefix, 'q')) ?? base.search,
    sort: sortId
      ? { id: sortId, direction: direction === 'desc' ? 'desc' : 'asc' }
      : base.sort,
    filters,
    hiddenColumns: params.get(key(prefix, 'columns'))
      ? params.get(key(prefix, 'columns'))!.split(',').filter(Boolean).sort()
      : base.hiddenColumns,
    density: params.get(key(prefix, 'density')) === 'compact' ? 'compact' : base.density,
    page: parsePositiveInteger(params.get(key(prefix, 'page')), base.page),
    pageSize: params.get(key(prefix, 'pageSize')) === '100' ? 100 : base.pageSize,
    groupBy: params.get(key(prefix, 'group')) ?? base.groupBy,
  };
}

/** Encode dense-view keys into a fresh query object. */
export function encodeDenseDataState(
  state: DenseDataState,
  prefix = 'table',
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.search) params.set(key(prefix, 'q'), state.search);
  if (state.sort) {
    params.set(key(prefix, 'sort'), state.sort.id);
    if (state.sort.direction === 'desc') params.set(key(prefix, 'dir'), 'desc');
  }
  Object.entries(state.filters)
    .filter(([, values]) => values.length)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([id, values]) => params.set(key(prefix, `filter.${id}`), values.join(',')));
  if (state.hiddenColumns.length) params.set(key(prefix, 'columns'), [...state.hiddenColumns].sort().join(','));
  if (state.density !== 'comfortable') params.set(key(prefix, 'density'), state.density);
  if (state.page !== 1) params.set(key(prefix, 'page'), String(state.page));
  if (state.pageSize !== 50) params.set(key(prefix, 'pageSize'), String(state.pageSize));
  if (state.groupBy) params.set(key(prefix, 'group'), state.groupBy);
  return params;
}

/** Replace only this table's keys, retaining route and feature parameters. */
export function mergeDenseDataStateParams(
  existing: URLSearchParams | string,
  state: DenseDataState,
  prefix = 'table',
): URLSearchParams {
  const params = typeof existing === 'string' ? new URLSearchParams(existing) : new URLSearchParams(existing);
  [...params.keys()]
    .filter((param) => param === prefix || param.startsWith(`${prefix}.`))
    .forEach((param) => params.delete(param));
  encodeDenseDataState(state, prefix).forEach((value, param) => params.set(param, value));
  return params;
}

export interface DenseDataSavedView {
  id: string;
  name: string;
  state: DenseDataState;
  createdAt: string;
  updatedAt: string;
}

export interface DenseDataStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DenseDataViewStore {
  list(): DenseDataSavedView[];
  save(view: Pick<DenseDataSavedView, 'id' | 'name' | 'state'>): DenseDataSavedView;
  remove(id: string): void;
}

const memoryStorage = new Map<string, string>();
const fallbackStorage: DenseDataStorage = {
  getItem: (storageKey) => memoryStorage.get(storageKey) ?? null,
  setItem: (storageKey, value) => memoryStorage.set(storageKey, value),
  removeItem: (storageKey) => memoryStorage.delete(storageKey),
};

function browserStorage(): DenseDataStorage {
  if (typeof window === 'undefined' || !window.localStorage) return fallbackStorage;
  return window.localStorage;
}

export function denseDataViewStorageKey(userId: string, workspaceId: string, viewId: string): string {
  return `shuttleworks:dense-view:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}:${encodeURIComponent(viewId)}`;
}

/**
 * Per-user/workspace/view saved-view storage. The key contains all three
 * scopes so a view can never leak between operators or tournaments. Storage
 * failures are treated as unavailable persistence rather than breaking a
 * data surface (the in-memory instance still behaves predictably).
 */
export function createDenseDataViewStore(options: {
  userId: string;
  workspaceId: string;
  viewId: string;
  storage?: DenseDataStorage;
}): DenseDataViewStore {
  const storage = options.storage ?? browserStorage();
  const storageKey = denseDataViewStorageKey(options.userId, options.workspaceId, options.viewId);
  const read = (): DenseDataSavedView[] => {
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is DenseDataSavedView => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as Partial<DenseDataSavedView>;
        return typeof candidate.id === 'string' && typeof candidate.name === 'string' && !!candidate.state;
      });
    } catch {
      return [];
    }
  };
  const write = (views: DenseDataSavedView[]) => {
    try {
      storage.setItem(storageKey, JSON.stringify(views));
    } catch {
      // Quota/security errors should not take the operator away from the table.
    }
  };
  return {
    list: read,
    save: (input) => {
      const now = new Date().toISOString();
      const views = read();
      const previous = views.find((view) => view.id === input.id);
      const saved: DenseDataSavedView = {
        ...input,
        name: input.name.trim() || 'Saved view',
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      write([saved, ...views.filter((view) => view.id !== input.id)]);
      return saved;
    },
    remove: (id) => write(read().filter((view) => view.id !== id)),
  };
}
