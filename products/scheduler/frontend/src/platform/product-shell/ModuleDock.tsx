import { SquaresFour, SlidersHorizontal } from '@phosphor-icons/react';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { isModuleEnterable } from '../domain/moduleModel';
import type { ModuleId, ModuleStatus, WorkspaceModule } from './types';

interface ModuleDockProps {
  modules: WorkspaceModule[];
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
  /** Re-enable a disabled module (PATCH status=enabled). */
  onEnable?: (id: ModuleId) => void;
  /** Open the module catalog (Settings) to install / enable / configure. */
  onManage?: () => void;
}

/** Per-module status dot: filled accent = enabled, accent ring = available,
 *  muted fill = disabled, muted ring = coming-soon. Communicates installed
 *  capability at a glance (vs. a plain tab strip). */
function statusDotClass(status: ModuleStatus): string {
  switch (status) {
    case 'enabled':
      return 'bg-accent';
    case 'available':
      return 'border border-accent';
    case 'disabled':
      return 'bg-muted-foreground/50';
    default:
      return 'border border-muted-foreground/40'; // coming-soon
  }
}

/** The Module Dock — the workspace's module launcher. Each module reflects its
 *  real status (status dot + label): `enabled`/`available` enter on click;
 *  `disabled` shows an Enable affordance (`onEnable`); `coming-soon` is
 *  non-interactive with a roadmap note. The active module reads as the running
 *  module, not a selected tab. */
export function ModuleDock({ modules, active, onSelect, onEnable, onManage }: ModuleDockProps) {
  return (
    <div className="flex items-center gap-1">
      <SquaresFour aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      <div role="tablist" aria-label="Modules" className="flex items-center gap-0.5">
        {modules.map((m) => {
        const isActive = m.id === active;
        const enterable = isModuleEnterable(m.status);
        const canEnable = m.status === 'disabled' && !!onEnable;
        const interactive = enterable || canEnable;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            disabled={!interactive}
            aria-selected={isActive}
            aria-disabled={!interactive || undefined}
            title={canEnable ? `Enable ${m.label}` : !enterable ? m.note : undefined}
            data-testid={`module-${m.id}`}
            data-status={m.status}
            onClick={() => {
              if (enterable) {
                if (m.id !== active) onSelect(m.id);
              } else if (canEnable) {
                onEnable!(m.id);
              }
            }}
            className={[
              INTERACTIVE_BASE,
              'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium tracking-tight',
              !interactive
                ? 'cursor-not-allowed text-muted-foreground/40'
                : canEnable
                  ? 'italic text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  : isActive
                    ? 'bg-accent/10 font-semibold text-accent ring-1 ring-inset ring-accent/25'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            ].join(' ')}
          >
            <span
              aria-hidden
              className={[
                'h-1.5 w-1.5 shrink-0 rounded-full',
                statusDotClass(m.status),
                isActive && m.status === 'enabled' ? 'animate-pulse' : '',
              ].join(' ')}
            />
            <span>
              {m.label}
              {canEnable ? ' · enable' : ''}
            </span>
          </button>
        );
        })}
      </div>
      {onManage ? (
        <button
          type="button"
          data-testid="module-manage"
          aria-label="Manage modules"
          title="Manage modules"
          onClick={onManage}
          className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <SlidersHorizontal aria-hidden className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
