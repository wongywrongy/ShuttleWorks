/**
 * Facets for the Hub workspace dashboard: All / Setup / Ready / Live /
 * Complete / Shared / Needs attention / Archived.
 *
 * These are **facets, not a partition** — a workspace can match several at
 * once (a Live workspace that is also Shared and Needs attention), so the
 * counts overlap and only "All" is exhaustive. The strip narrows *which* rows
 * show; `sortBy` (hubSort) fixes their order.
 *
 * ## Why these filter on the derived phase (SP-UI-1 follow-up)
 *
 * The strip used to split on the operator-managed `status` column
 * (Active / Draft), which the director sets by hand in Settings → General.
 * That was defensible in isolation but produced a control plane that
 * contradicted itself: a 43%-played tournament filed under **Draft** while the
 * Overview stepper, the shell badge and the row action all said **Live**. On a
 * real database it degenerated further — nothing had ever been marked Active,
 * so the strip read `Active 0 / Draft 14` and one bucket held everything,
 * including the three events that were mid-play. A filter that cannot separate
 * a running tournament from an empty one is not narrowing anything.
 *
 * So the lifecycle facets now read `signals.phase`, the same server-computed
 * value every other surface keys on. `status` keeps the two jobs it is
 * genuinely good at: driving `health` (and therefore the row dot), and marking
 * a workspace **Archived**.
 *
 * ## Archived outranks the phase
 *
 * Match rows persist forever, so an archived tournament keeps
 * `phase: 'live' | 'complete'` for good. Without a precedence rule an archived
 * event would sit in **Live** alongside the ones actually being played. This
 * module applies the SAME order as `platform/domain/lifecycle.ts`
 * (archived > phase): an archived workspace matches `archived` and no
 * lifecycle facet.
 *
 * Pure + derived entirely from the summary DTO (`status`, `role`, `signals`).
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import type { WorkspacePhase } from '../../platform/domain/lifecycle';
import { resolvePhase } from '../../platform/domain/overviewPhase';
import { MODULE_LABELS } from '../../platform/product-shell/types';
import { needsAttention } from './hubSignals';

export type HubFacetId =
  | 'all'
  // E4: ONE facet for all three entries phases, not three.
  //
  // A director filtering the Hub is asking "which of my events are in the
  // entries stage" — announced vs open vs review is the state of one
  // workspace, which its own card already says, and three more chips on a
  // strip that already holds eight would cost more attention than the
  // distinction is worth from the outside. The phase model keeps all three;
  // this is a filter over it, not a mirror of it.
  | 'entries'
  | 'setup'
  | 'ready'
  | 'live'
  | 'complete'
  | 'shared'
  | 'attention'
  | 'archived';

export interface HubFacet {
  id: HubFacetId;
  label: string;
}

/** Fixed facet order for the filter strip: the lifecycle left-to-right in the
 *  order an event actually travels, then the cross-cutting facets. */
export const HUB_FACETS: HubFacet[] = [
  { id: 'all', label: 'All' },
  { id: 'entries', label: MODULE_LABELS.entries },
  { id: 'setup', label: 'Setup' },
  { id: 'ready', label: 'Ready' },
  { id: 'live', label: 'Live' },
  { id: 'complete', label: 'Complete' },
  { id: 'shared', label: 'Shared' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'archived', label: 'Archived' },
];

/** The facet ids that name a lifecycle phase, keyed by phase. */
const PHASE_FACET: Record<WorkspacePhase, HubFacetId> = {
  announced: 'entries',
  entries_open: 'entries',
  entries_review: 'entries',
  setup: 'setup',
  ready: 'ready',
  live: 'live',
  complete: 'complete',
};

/** Shared = collaborating: either I'm on someone else's workspace
 *  (role operator/viewer), or I own it but have added/invited others. */
export function isShared(t: TournamentSummaryDTO): boolean {
  if (t.role && t.role !== 'owner') return true;
  const c = t.signals?.collaboration;
  return !!c && (c.memberCount > 1 || c.activeInviteCount > 0);
}

/** The single lifecycle facet a workspace belongs to, or `archived`. Exported
 *  so callers can label a row without re-deriving the precedence. */
export function lifecycleFacetOf(t: TournamentSummaryDTO): HubFacetId {
  if (t.status === 'archived') return 'archived';
  return PHASE_FACET[resolvePhase(t)];
}

/** Whether a workspace matches a facet. `all` matches everything. */
export function matchesFacet(t: TournamentSummaryDTO, facet: HubFacetId): boolean {
  switch (facet) {
    case 'all':
      return true;
    case 'shared':
      return isShared(t);
    case 'attention':
      return needsAttention(t);
    default:
      // Lifecycle facets (incl. archived) are mutually exclusive.
      return lifecycleFacetOf(t) === facet;
  }
}

/** Per-facet counts over a list (the strip's badges). The lifecycle facets
 *  partition the list; `shared` / `attention` overlap them by design. */
export function facetCounts(list: TournamentSummaryDTO[]): Record<HubFacetId, number> {
  const counts = {
    all: 0,
    entries: 0,
    setup: 0,
    ready: 0,
    live: 0,
    complete: 0,
    shared: 0,
    attention: 0,
    archived: 0,
  } satisfies Record<HubFacetId, number>;
  for (const t of list) {
    for (const f of HUB_FACETS) {
      if (matchesFacet(t, f.id)) counts[f.id] += 1;
    }
  }
  return counts;
}
