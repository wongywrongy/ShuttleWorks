import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_LocationContext } from 'react-router-dom';
import { useDenseDataState } from './useDenseDataState';
import { useStableInventory } from './useStableInventory';
import { OPERATOR_INVENTORY_PAGE_SIZE } from '../components/control-plane/denseData';

/** Pagination for existing non-table inventory layouts. Input is already filtered and ordered. */
export function useInventoryPage<T>(
  rows: readonly T[],
  allRows: readonly T[],
  rowId: (row: T) => string,
  prefix: string,
  scope: string,
  ready = true,
) {
  const [state, actions] = useDenseDataState(
    { pageSize: OPERATOR_INVENTORY_PAGE_SIZE },
    prefix,
  );
  const previousScope = useRef(scope);
  const route = useContext(UNSAFE_LocationContext);
  // Scope tracking is local to the mounted list; URL page is respected on entry.
  const stable = useStableInventory(rows, allRows, rowId, `${scope}:${state.page}:${state.pageSize}`);
  const loadingInventory = !ready;
  const pageCount = loadingInventory
    ? Math.max(1, state.page)
    : Math.max(1, Math.ceil(stable.rows.length / state.pageSize));
  const page = loadingInventory ? state.page : Math.min(state.page, pageCount);
  useEffect(() => {
    if (previousScope.current !== scope) {
      previousScope.current = scope;
      if (route?.navigationType !== 'POP') actions.setPage(1);
    // An async inventory starts empty while its URL may already specify page
    // 2+. Do not clamp that deep link until the first complete local dataset
    // has arrived; once loaded, an actually invalid page is canonicalized.
    } else if (!loadingInventory && state.page !== page) actions.setPage(page);
  }, [loadingInventory, state.page, page, actions, scope, route?.navigationType]);
  return { state, actions, pending: stable.pending, refresh: stable.refresh, page: {
    rows: stable.rows.slice((page - 1) * state.pageSize, page * state.pageSize),
    total: stable.rows.length, page, pageSize: state.pageSize, pageCount,
  } };
}
