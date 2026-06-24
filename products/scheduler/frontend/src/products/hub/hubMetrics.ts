import type { TournamentSummaryDTO } from '../../api/dto';
import { needsAttention, collaborationOf, moduleCountsOf } from './hubSignals';

export interface HubMetrics {
  workspaces: number;
  attention: number;
  active: number;
  shared: number;
  enabledModules: number;
  pendingInvites: number;
}

/** Top-of-Hub summary totals, derived from each workspace's server `signals`
 *  (safe fallbacks when absent). Pure — recompute from the loaded list. */
export function hubMetrics(list: TournamentSummaryDTO[]): HubMetrics {
  let attention = 0, active = 0, shared = 0, enabledModules = 0, pendingInvites = 0;
  for (const t of list) {
    if (needsAttention(t)) attention += 1;
    if (t.status === 'active') active += 1;
    if (t.role !== 'owner') shared += 1;
    enabledModules += moduleCountsOf(t)?.enabled ?? 0;
    pendingInvites += collaborationOf(t)?.activeInviteCount ?? 0;
  }
  return { workspaces: list.length, attention, active, shared, enabledModules, pendingInvites };
}
