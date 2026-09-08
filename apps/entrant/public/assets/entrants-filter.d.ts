/** Types for the sibling module — imported by the vitest suite so the file
 * the browser runs is the file under test. `searchKey` is additionally
 * imported by `EntrantsList`, which writes the same normalised text into the
 * SSR document's `data-name`/`data-club`. */
export function searchKey(value: string | null | undefined): string;
export type MatchField = '' | 'name' | 'club' | 'both';
export function matchField(
  query: string | null | undefined,
  name: string | null | undefined,
  club: string | null | undefined,
): MatchField;
export function matches(
  query: string | null | undefined,
  name: string | null | undefined,
  club: string | null | undefined,
): boolean;
export function filterNoun(root: Element | null | undefined): 'player' | 'entrant';
export function apply(scope: ParentNode, query: string): number;
export function findLabel(noun: 'player' | 'entrant'): string;
export function boot(root: Element): void;
