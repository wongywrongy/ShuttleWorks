/** Types for the sibling module — imported by the vitest suite so the file
 * the browser runs is the file under test. */
export function matches(
  query: string | null | undefined,
  name: string | null | undefined,
  club: string | null | undefined,
): boolean;
export function apply(scope: ParentNode, query: string): number;
