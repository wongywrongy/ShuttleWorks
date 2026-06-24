/**
 * The Hub's top summary band — six operational totals derived from the loaded
 * workspaces' server signals (via hubMetrics). The attention / active / shared
 * stats are buttons that drive the matching filter; the rest are read-only.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { MetricStat } from '../../components/control-plane';
import { hubMetrics } from './hubMetrics';

type PickId = 'attention' | 'active' | 'shared';

export function HubSummaryBar({
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
      <button
        type="button"
        data-testid="metric-shared"
        onClick={() => onPickFilter('shared')}
        className="flex flex-1 items-center bg-background px-4 py-3 text-left hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <MetricStat label="Shared" value={m.shared} />
      </button>
      <div className="flex flex-1 items-center bg-background px-4 py-3">
        <MetricStat label="Enabled modules" value={m.enabledModules} testId="metric-modules" />
      </div>
      <div className="flex flex-1 items-center bg-background px-4 py-3">
        <MetricStat label="Pending invites" value={m.pendingInvites} testId="metric-invites" />
      </div>
    </div>
  );
}
