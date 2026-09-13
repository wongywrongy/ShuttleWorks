/** Types for the sibling module — imported by the vitest suite so the file
 * the browser runs is the file under test. */
export function activeFilterCount(form: HTMLFormElement): number;
export function filterSummaryLabel(count: number): string;
export function syncFilterDisclosure(form: HTMLFormElement, narrow: boolean): void;
export function bootScheduleFilters(
  form: HTMLFormElement | null,
  matchMedia?: (query: string) => { matches: boolean },
): void;
