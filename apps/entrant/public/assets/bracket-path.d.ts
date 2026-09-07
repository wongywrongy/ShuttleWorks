export function includesPerson(node: HTMLElement, personId: string): boolean;
export function applyPersonPath(root: HTMLElement, personId: string): void;
export function scrollPinnedPersonIntoView(root: HTMLElement, personId: string): void;
export function personPathHref(href: string, personId: string): string;
export function scrollRoundIntoView(
  scroller: HTMLElement | null,
  column: HTMLElement | null,
  behavior?: ScrollBehavior,
): void;
export function mountBracketPath(root: HTMLElement): void;
