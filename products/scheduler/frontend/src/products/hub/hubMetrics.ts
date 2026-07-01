import type { TournamentSummaryDTO } from '../../api/dto';
import { needsAttention, moduleCountsOf } from './hubSignals';
import { modulesFromDto } from '../../platform/domain/moduleModel';

/** The operational totals headlined in the Hub summary band. Collaboration
 *  (members / invites) is deliberately not included — it lives in the inspector
 *  and People surfaces, not the band. */
export interface HubMetrics {
  workspaces: number;
  attention: number;
  active: number;
  enabledModules: number;
}

/** Top-of-Hub summary totals, derived from each workspace's server `signals`
 *  (safe fallbacks when absent). Pure — recompute from the loaded list. */
export function hubMetrics(list: TournamentSummaryDTO[]): HubMetrics {
  let attention = 0, active = 0, enabledModules = 0;
  for (const t of list) {
    if (needsAttention(t)) attention += 1;
    if (t.status === 'active') active += 1;
    // Prefer the real modules[] (present on the list even when signals aren't),
    // falling back to the signals module counts.
    enabledModules += t.modules
      ? modulesFromDto(t.modules).filter((m) => m.status === 'enabled').length
      : (moduleCountsOf(t)?.enabled ?? 0);
  }
  return { workspaces: list.length, attention, active, enabledModules };
}
