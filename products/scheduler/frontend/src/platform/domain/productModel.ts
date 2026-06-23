import type {
  ProductId,
  ProductSwitcherItem,
  WorkspaceIdentity,
} from '../product-shell/types';

type Kind = WorkspaceIdentity['kind'];

const MEET_OPERATOR_TABS = new Set([
  'setup',
  'roster',
  'matches',
  'schedule',
  'live',
]);

/** Which product owns a given active tab. `tv` is the Display mode; any
 *  `bracket-` tab is Bracket; the meet operator tabs are Meet. Unknown tabs
 *  fall back to the workspace kind. Never throws on a null kind. */
export function productForTab(tab: string, kind: Kind): ProductId {
  if (tab === 'tv') return 'display';
  if (tab.startsWith('bracket-')) return 'bracket';
  if (MEET_OPERATOR_TABS.has(tab)) return 'meet';
  return kind === 'bracket' ? 'bracket' : 'meet';
}

/** The existing route segment to navigate to when a product is selected.
 *  On a bracket workspace only Bracket is real, so everything routes to the
 *  bracket home (defensive — disabled products are never clicked). */
export function defaultTabForProduct(product: ProductId, kind: Kind): string {
  if (kind === 'bracket') return 'bracket-setup';
  if (product === 'display') return 'tv';
  if (product === 'meet') return 'setup';
  return 'setup';
}

/** The switcher always lists all three products. A product that isn't enabled
 *  for this workspace yet is disabled with a forward-looking reason — the
 *  long-term model is one workspace holding multiple modes, so the copy implies
 *  "not enabled yet", not a permanent product boundary. */
export function productsForWorkspace(kind: Kind): ProductSwitcherItem[] {
  const isBracket = kind === 'bracket';
  return [
    {
      id: 'meet',
      label: 'Meet',
      available: !isBracket,
      disabledReason: isBracket
        ? "Meet isn't enabled for this workspace yet."
        : undefined,
    },
    {
      id: 'bracket',
      label: 'Bracket',
      available: isBracket,
      disabledReason: !isBracket
        ? "Bracket isn't enabled for this workspace yet."
        : undefined,
    },
    {
      id: 'display',
      label: 'Display',
      available: !isBracket,
      disabledReason: isBracket
        ? "Display isn't available for brackets yet."
        : undefined,
    },
  ];
}
