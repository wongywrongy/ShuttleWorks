import type { TournamentSummaryDTO } from '../../api/dto';
import { needsAttention } from './hubSignals';

export type HubFilterId = 'all' | 'active' | 'draft' | 'shared' | 'attention';

export interface HubFilter {
  id: HubFilterId;
  label: string;
  predicate: (t: TournamentSummaryDTO) => boolean;
}

/** The control-plane filter tabs. `attention` uses the server-computed
 *  `signals` (health / attention reasons) when present, falling back to the
 *  owned-and-draft heuristic for older payloads. */
export const HUB_FILTERS: HubFilter[] = [
  { id: 'all', label: 'All', predicate: () => true },
  { id: 'active', label: 'Active', predicate: (t) => t.status === 'active' },
  { id: 'draft', label: 'Draft', predicate: (t) => t.status === 'draft' },
  { id: 'shared', label: 'Shared with me', predicate: (t) => t.role !== 'owner' },
  { id: 'attention', label: 'Needs attention', predicate: needsAttention },
];

/** Apply a filter tab + a name search (case-insensitive substring). */
export function filterWorkspaces(
  list: TournamentSummaryDTO[],
  filterId: HubFilterId,
  query: string,
): TournamentSummaryDTO[] {
  const f = HUB_FILTERS.find((x) => x.id === filterId) ?? HUB_FILTERS[0];
  const q = query.trim().toLowerCase();
  return list.filter(
    (t) => f.predicate(t) && (q === '' || (t.name ?? '').toLowerCase().includes(q)),
  );
}

/** Per-tab counts over the full (unfiltered-by-search) list. */
export function filterCounts(
  list: TournamentSummaryDTO[],
): Record<HubFilterId, number> {
  const counts = { all: 0, active: 0, draft: 0, shared: 0, attention: 0 } as Record<
    HubFilterId,
    number
  >;
  for (const f of HUB_FILTERS) counts[f.id] = list.filter(f.predicate).length;
  return counts;
}
