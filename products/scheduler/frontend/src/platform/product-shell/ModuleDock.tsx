import { INTERACTIVE_BASE } from '../../lib/utils';
import { isModuleEnterable } from '../domain/moduleModel';
import type { ModuleId, WorkspaceModule } from './types';

interface ModuleDockProps {
  modules: WorkspaceModule[];
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
}

/** The Module Dock — a segmented control over the workspace's modules.
 *  Non-enterable modules (not-enabled / coming-soon) render disabled with
 *  their enablement note as a tooltip. */
export function ModuleDock({ modules, active, onSelect }: ModuleDockProps) {
  return (
    <div role="tablist" aria-label="Modules" className="flex items-center gap-0.5">
      {modules.map((m) => {
        const isActive = m.id === active;
        const enterable = isModuleEnterable(m.status);
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            disabled={!enterable}
            aria-selected={isActive}
            aria-disabled={!enterable || undefined}
            title={!enterable ? m.note : undefined}
            data-testid={`module-${m.id}`}
            onClick={() => {
              if (enterable && m.id !== active) onSelect(m.id);
            }}
            className={[
              INTERACTIVE_BASE,
              'rounded-sm px-3 py-1.5 text-sm font-medium tracking-tight',
              !enterable
                ? 'cursor-not-allowed text-muted-foreground/40'
                : isActive
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            ].join(' ')}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
