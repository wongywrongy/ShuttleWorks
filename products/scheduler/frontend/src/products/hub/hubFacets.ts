/**
 * Status-based facets for the Hub workspace dashboard — the handoff
 * prototype's filter grammar (All / Active / Draft / Shared / Needs
 * attention). These are **facets, not a partition**: a workspace can match
 * several at once (e.g. an Active workspace that's also Shared and Needs
 * attention), so the counts overlap and only "All" is exhaustive. The strip
 * narrows *which* rows show; `sortWorkspaces` (hubGrouping) fixes their order.
 *
 * Pure + derived entirely from the summary DTO (`status`, `role`, `signals`),
 * so it's unit-testable and needs no new backend field.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { needsAttention } from './hubSignals';

export type HubFacetId = 'all' | 'active' | 'draft' | 'shared' | 'attention';

export interface HubFacet {
  id: HubFacetId;
  label: string;
}

/** Fixed facet order for the filter strip (matches the prototype). */
export const HUB_FACETS: HubFacet[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'draft', label: 'Draft' },
  { id: 'shared', label: 'Shared' },
  { id: 'attention', label: 'Needs attention' },
];

/** Shared = collaborating: either I'm on someone else's workspace
 *  (role operator/viewer), or I own it but have added/invited others. */
export function isShared(t: TournamentSummaryDTO): boolean {
  if (t.role && t.role !== 'owner') return true;
  const c = t.signals?.collaboration;
  return !!c && (c.memberCount > 1 || c.activeInviteCount > 0);
}

/** Whether a workspace matches a facet. `all` matches everything.
 *
 *  `active`/`draft` read the workspace's explicit lifecycle `status` — the
 *  director's own choice, set in **Settings → General → Workspace status**
 *  (draft → active → archived; `updateTournament`). It is NOT inferred from
 *  scheduling: a dated-but-still-draft workspace stays Draft on purpose, and a
 *  brand-new workspace stays Draft until the director marks it Active. So a
 *  fresh/QA database where nothing was ever activated correctly shows
 *  `Active 0` — that is the honest state, not a dead facet. */
export function matchesFacet(t: TournamentSummaryDTO, facet: HubFacetId): boolean {
  switch (facet) {
    case 'all':
      return true;
    case 'active':
      return t.status === 'active';
    case 'draft':
      return t.status === 'draft';
    case 'shared':
      return isShared(t);
    case 'attention':
      return needsAttention(t);
  }
}

/** Per-facet counts over a list (the strip's badges). Counts overlap by
 *  design — a row is tallied under every facet it matches. */
export function facetCounts(list: TournamentSummaryDTO[]): Record<HubFacetId, number> {
  const counts: Record<HubFacetId, number> = {
    all: 0,
    active: 0,
    draft: 0,
    shared: 0,
    attention: 0,
  };
  for (const t of list) {
    for (const f of HUB_FACETS) {
      if (matchesFacet(t, f.id)) counts[f.id] += 1;
    }
  }
  return counts;
}
