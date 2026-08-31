/** URL-backed state for dense operator views. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  decodeDenseDataState,
  mergeDenseDataStateParams,
  setDenseSort,
  toggleDenseFilter,
  type DenseDataState,
  type DenseDataSort,
  type DenseDataDensity,
  type DenseDataPageSize,
} from '../components/control-plane/denseData';

export interface DenseDataStateActions {
  setState: (next: DenseDataState | ((previous: DenseDataState) => DenseDataState)) => void;
  setSearch: (search: string) => void;
  setSort: (sort: DenseDataSort | null) => void;
  toggleSort: (columnId: string) => void;
  toggleFilter: (columnId: string, value: string) => void;
  clearFilters: () => void;
  setHiddenColumns: (columnIds: string[]) => void;
  setDensity: (density: DenseDataDensity) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: DenseDataPageSize) => void;
  setGroupBy: (columnId: string | null) => void;
}

export function useDenseDataState(
  defaults: Partial<DenseDataState> = {},
  prefix = 'table',
): [DenseDataState, DenseDataStateActions] {
  const [state, setLocalState] = useState<DenseDataState>(() =>
    decodeDenseDataState(typeof window === 'undefined' ? '' : window.location.search, defaults, prefix),
  );
  const defaultsKey = JSON.stringify(defaults);
  const defaultsSnapshot = useMemo(() => ({ ...defaults }), [defaultsKey]);

  useEffect(() => {
    const onPopState = () => setLocalState(decodeDenseDataState(window.location.search, defaultsSnapshot, prefix));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [defaultsSnapshot, prefix]);

  const setState = useCallback(
    (next: DenseDataState | ((previous: DenseDataState) => DenseDataState)) => {
      const resolved = typeof next === 'function' ? next(state) : next;
      const currentParams = typeof window === 'undefined' ? '' : window.location.search;
      const merged = mergeDenseDataStateParams(currentParams, resolved, prefix);
      if (typeof window !== 'undefined') {
        const query = merged.toString();
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      }
      setLocalState(resolved);
    },
    [prefix, state],
  );

  const setSearch = useCallback((search: string) => setState((previous) => ({ ...previous, search, page: 1 })), [setState]);
  const setSort = useCallback((sort: DenseDataSort | null) => setState((previous) => ({ ...previous, sort, page: 1 })), [setState]);
  const toggleSort = useCallback((columnId: string) => setState((previous) => setDenseSort(previous, columnId)), [setState]);
  const toggleFilter = useCallback((columnId: string, value: string) => setState((previous) => toggleDenseFilter(previous, columnId, value)), [setState]);
  const clearFilters = useCallback(() => setState((previous) => ({ ...previous, search: '', filters: {}, page: 1 })), [setState]);
  const setHiddenColumns = useCallback((columnIds: string[]) => setState((previous) => ({ ...previous, hiddenColumns: [...new Set(columnIds)].sort() })), [setState]);
  const setDensity = useCallback((density: DenseDataDensity) => setState((previous) => ({ ...previous, density })), [setState]);
  const setPage = useCallback((page: number) => setState((previous) => ({ ...previous, page: Math.max(1, Math.floor(page)) })), [setState]);
  const setPageSize = useCallback((pageSize: DenseDataPageSize) => setState((previous) => ({ ...previous, pageSize, page: 1 })), [setState]);
  const setGroupBy = useCallback((groupBy: string | null) => setState((previous) => ({ ...previous, groupBy })), [setState]);

  return [state, {
    setState,
    setSearch,
    setSort,
    toggleSort,
    toggleFilter,
    clearFilters,
    setHiddenColumns,
    setDensity,
    setPage,
    setPageSize,
    setGroupBy,
  }];
}
