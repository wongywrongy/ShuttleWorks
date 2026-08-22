import type { WorkspaceHealth } from '../../modules/hub/hubSignals';

/** Canonical workspace-health → token color. Used by HealthDot and (re-exported)
 *  by hubSignals as the single source for health color.
 *
 *  Three colors for four states, deliberately: `draft` and `archived` are both
 *  "not in play", and the row's lifecycle chip is what tells them apart. What
 *  they must NOT share is a tooltip — see `HEALTH_WORD`. */
export function healthColorClass(h: WorkspaceHealth): string {
  if (h === 'good') return 'bg-status-live';
  if (h === 'attention') return 'bg-status-warning';
  return 'bg-muted-foreground';
}

/**
 * SIG-7: what each dot MEANS, in words.
 *
 * The tooltip used to interpolate the raw enum — `Health: good`, `Health:
 * archived` — which is a field name and a database value shown to a director.
 * Worse, the grey dot covers two states that mean opposite things (not started
 * yet / retired) and the tooltip was the only thing that could separate them,
 * so it had to stop leaking and start explaining.
 */
export const HEALTH_WORD: Record<WorkspaceHealth, string> = {
  good: 'Running normally',
  attention: 'Needs attention',
  draft: 'Not started yet',
  archived: 'Archived',
};

/** The legend line for a list of dots — one row, stated once, near the dots
 *  it explains. Ordered worst-first, matching how the Hub facets read. */
export const HEALTH_LEGEND = 'Dot: amber needs attention · green running · grey not started or archived';

export function HealthDot({ health, title }: { health: WorkspaceHealth; title?: string }) {
  return (
    <span
      aria-hidden
      title={title ?? HEALTH_WORD[health]}
      className={`h-[7px] w-[7px] shrink-0 rounded-full ${healthColorClass(health)}`}
    />
  );
}
