/**
 * Sort orders for the Hub workspace list (the redesign's sort control). The
 * facet strip narrows *which* rows show; this fixes their order. Pure +
 * `today`-injected so it's unit-testable and never mutates its input.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { sortWorkspaces } from './hubGrouping';

export type HubSortId = 'recent' | 'date' | 'name';

export interface HubSort {
  id: HubSortId;
  label: string;
}

/** Fixed order for the sort dropdown. */
export const HUB_SORTS: HubSort[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'date', label: 'Event date' },
  { id: 'name', label: 'Name' },
];

/** Sort a workspace list by the chosen order. `date` reuses the operational
 *  time order (`sortWorkspaces`: upcoming → undated → past). */
export function sortBy(
  list: TournamentSummaryDTO[],
  sortId: HubSortId,
  todayKey: string,
): TournamentSummaryDTO[] {
  switch (sortId) {
    case 'recent':
      return [...list].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    case 'name':
      return [...list].sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
      );
    case 'date':
      return sortWorkspaces(list, todayKey);
  }
}
