import type { WorkspaceHealth } from '../../products/hub/hubSignals';

/** Canonical workspace-health → token color. Used by HealthDot and (re-exported)
 *  by hubSignals as the single source for health color. */
export function healthColorClass(h: WorkspaceHealth): string {
  if (h === 'good') return 'bg-accent';
  if (h === 'attention') return 'bg-status-warning';
  return 'bg-muted-foreground/40';
}

export function HealthDot({ health, title }: { health: WorkspaceHealth; title?: string }) {
  return (
    <span
      aria-hidden
      title={title ?? `Health: ${health}`}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthColorClass(health)}`}
    />
  );
}
