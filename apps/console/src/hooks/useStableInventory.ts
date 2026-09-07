import { useState } from 'react';

/** Keep operator targets in place while polling updates their values. */
export function useStableInventory<T>(
  matching: readonly T[],
  allRows: readonly T[],
  rowId: (row: T) => string,
  scope: string,
) {
  const [snapshot, setSnapshot] = useState(() => ({ scope, ids: matching.map(rowId), initialized: allRows.length > 0 }));
  let current = snapshot;
  if (snapshot.scope !== scope || (!snapshot.initialized && allRows.length > 0)) {
    current = { scope, ids: matching.map(rowId), initialized: allRows.length > 0 };
    setSnapshot(current);
  }
  const byId = new Map(allRows.map((row) => [rowId(row), row]));
  const ids = current.ids.filter((id) => byId.has(id));
  const nextIds = matching.map(rowId);
  const pending = ids.length !== nextIds.length || ids.some((id, index) => id !== nextIds[index]);
  return {
    rows: ids.map((id) => byId.get(id)!),
    pending,
    refresh: () => setSnapshot({ scope, ids: nextIds, initialized: allRows.length > 0 }),
  };
}
