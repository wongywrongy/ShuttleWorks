/** Compare JSON-shaped values using the same bounded serialization semantics. */
export function contentEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}
