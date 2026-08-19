import type { WorkspaceHealth } from '../../products/hub/hubSignals';

/** Canonical workspace-health → token color. Used by HealthDot and (re-exported)
 *  by hubSignals as the single source for health color. */
export function healthColorClass(h: WorkspaceHealth): string {
  if (h === 'good') return 'bg-status-live';
  if (h === 'attention') return 'bg-status-warning';
  return 'bg-muted-foreground';
}

export function HealthDot({ health, title }: { health: WorkspaceHealth; title?: string }) {
  return (
    <span
      aria-hidden
      title={title ?? `Health: ${health}`}
      className={`h-[7px] w-[7px] shrink-0 rounded-full ${healthColorClass(health)}`}
    />
  );
}
