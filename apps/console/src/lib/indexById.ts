/**
 * Build a stable id-keyed map for an array of rows. Returns the *same*
 * Map instance the next time the same array reference is passed in —
 * the WeakMap cache keys on the input array, so two callers that read
 * the same Zustand-stable array pay the O(n) build cost once.
 *
 * Pure helper, no React. Lives here (not in store/) so cross-feature
 * consumers in utils/, lib/, and feature folders can import it without
 * crossing the store boundary.
 */
const cache = new WeakMap<object, Map<string, unknown>>();

export function indexById<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  const cached = cache.get(rows as unknown as object);
  if (cached) return cached as Map<string, T>;
  const m = new Map<string, T>();
  for (const r of rows) m.set(r.id, r);
  cache.set(rows as unknown as object, m as Map<string, unknown>);
  return m;
}
