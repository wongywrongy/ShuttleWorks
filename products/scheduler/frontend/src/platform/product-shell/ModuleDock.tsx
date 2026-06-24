import { INTERACTIVE_BASE } from '../../lib/utils';
import { isModuleEnterable } from '../domain/moduleModel';
import type { ModuleId, WorkspaceModule } from './types';

interface ModuleDockProps {
  modules: WorkspaceModule[];
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
  /** Re-enable a disabled module (PATCH status=enabled). */
  onEnable?: (id: ModuleId) => void;
}

/** The Module Dock — the workspace's module launcher. Each module reflects its
 *  real status: `enabled`/`available` enter on click; `disabled` shows an Enable
 *  affordance (`onEnable`); `coming-soon` is non-interactive with a roadmap note. */
export function ModuleDock({ modules, active, onSelect, onEnable }: ModuleDockProps) {
  return (
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
              'rounded-sm px-3 py-1.5 text-sm font-medium tracking-tight',
              !interactive
                ? 'cursor-not-allowed text-muted-foreground/40'
                : canEnable
                  ? 'italic text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  : isActive
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            ].join(' ')}
          >
            {m.label}
            {canEnable ? ' · enable' : ''}
          </button>
        );
      })}
    </div>
  );
}
