/**
 * The Hub's top summary band — operational totals for a tournament control plane:
 * Workspaces, Needs attention, Active, Enabled modules. Attention + Active are
 * buttons that drive the matching filter. Collaboration (members / invites) is
 * not headlined here — it lives in the inspector + People surfaces.
 */
import { memo } from 'react';
import type { TournamentSummaryDTO } from '../../api/dto';
import { MetricStat } from '../../components/control-plane';
import { hubMetrics } from './hubMetrics';

type PickId = 'attention' | 'active';

// memo: HubPage re-renders on search/filter/selection state, but `list` is a
// stable reference between fetches — so skip recomputing hubMetrics (which calls
// modulesFromDto per workspace) when only unrelated Hub state changed.
export const HubSummaryBar = memo(function HubSummaryBar({
  list,
  onPickFilter,
}: {
  list: TournamentSummaryDTO[];
  onPickFilter: (id: PickId) => void;
}) {
  const m = hubMetrics(list);
  return (
    <div className="flex shrink-0 items-stretch gap-px border-b border-border bg-border">
      <div className="flex flex-1 items-center bg-background px-4 py-3">
        <MetricStat label="Workspaces" value={m.workspaces} testId="metric-workspaces" />
      </div>
      <button
        type="button"
        data-testid="metric-attention"
        onClick={() => onPickFilter('attention')}
        className="flex flex-1 items-center bg-background px-4 py-3 text-left hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <MetricStat label="Attention" value={m.attention} accent={m.attention > 0} />
      </button>
      <button
        type="button"
        data-testid="metric-active"
        onClick={() => onPickFilter('active')}
        className="flex flex-1 items-center bg-background px-4 py-3 text-left hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <MetricStat label="Active" value={m.active} />
      </button>
      <div className="flex flex-1 items-center bg-background px-4 py-3">
        <MetricStat label="Enabled modules" value={m.enabledModules} testId="metric-modules" />
      </div>
    </div>
  );
});
