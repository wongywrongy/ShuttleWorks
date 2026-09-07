import { useState } from 'react';

/**
 * Keep operator targets in place while polling updates their values.
 *
 * The freeze is deliberately narrow: it holds ORDER against incoming changes
 * that would move a row the operator is aiming at, and it never hides work the
 * operator just did. So:
 *   - ids that appear in the inventory are adopted immediately, appended in
 *     inventory order (a locally added player must render without a refresh);
 *   - a wholesale id replacement — zero overlap between the held snapshot and
 *     the live rows, e.g. "Regenerate from roster" — re-seeds rather than
 *     rendering an empty list;
 *   - a pure reordering of the same ids stays frozen and surfaces `pending`,
 *     which is what "Refresh results" is for.
 */
export function useStableInventory<T>(
  matching: readonly T[],
  allRows: readonly T[],
  rowId: (row: T) => string,
  scope: string,
) {
  const [snapshot, setSnapshot] = useState(() => ({ scope, ids: matching.map(rowId), initialized: allRows.length > 0 }));
  const byId = new Map(allRows.map((row) => [rowId(row), row]));
  const replaced = snapshot.ids.length > 0 && allRows.length > 0 && !snapshot.ids.some((id) => byId.has(id));
  let current = snapshot;
  if (snapshot.scope !== scope || (!snapshot.initialized && allRows.length > 0) || replaced) {
    current = { scope, ids: matching.map(rowId), initialized: allRows.length > 0 };
    setSnapshot(current);
  }
  // Deletion is judged against the live rows; resolution falls back to the
  // matching collection so an adopted row always has something to render.
  const source = new Map(matching.map((row) => [rowId(row), row]));
  byId.forEach((row, id) => source.set(id, row));
  const held = new Set(current.ids);
  const nextIds = matching.map(rowId);
  const ids = [
    ...current.ids.filter((id) => byId.has(id)),
    ...nextIds.filter((id) => !held.has(id)),
  ];
  const pending = ids.length !== nextIds.length || ids.some((id, index) => id !== nextIds[index]);
  return {
    rows: ids.map((id) => source.get(id)!),
    pending,
    refresh: () => setSnapshot({ scope, ids: nextIds, initialized: allRows.length > 0 }),
  };
}
