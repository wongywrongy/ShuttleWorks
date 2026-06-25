import { SlidersHorizontal } from '@phosphor-icons/react';
import { IconShuttle, IconBracket, IconCourt } from '@scheduler/design-system';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { isModuleEnterable } from '../domain/moduleModel';
import type { ModuleId, WorkspaceModule } from './types';

interface ModuleDockProps {
  modules: WorkspaceModule[];
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
  /** Re-enable a disabled module (PATCH status=enabled). */
  onEnable?: (id: ModuleId) => void;
  /** Open the module catalog (Settings) to install / enable / configure. */
  onManage?: () => void;
}

/** Each module carries its own domain glyph (brand personality, per the
 *  design-system icon set) instead of a generic dot. Identity comes from the
 *  glyph; status comes from the button's color state (active = accent pill,
 *  available = dimmed, disabled = faint + Enable affordance). */
const MODULE_GLYPH: Record<ModuleId, typeof IconShuttle> = {
  meet: IconShuttle,
  bracket: IconBracket,
  display: IconCourt,
};

/** The Module Dock — the workspace's module launcher. Each module reflects its
 *  real status via its color state (domain glyph + label): `enabled`/`available`
 *  enter on click; `disabled` shows an Enable affordance (`onEnable`). A trailing
 *  Manage affordance (`onManage`) opens the module catalog. The active module
 *  reads as the running module (aria-selected + a pulsing glyph), not a selected
 *  tab. */
export function ModuleDock({ modules, active, onSelect, onEnable, onManage }: ModuleDockProps) {
  return (
    <div className="flex items-center gap-1">
      <div role="tablist" aria-label="Modules" className="flex items-center gap-0.5">
        {modules.map((m) => {
        const isActive = m.id === active;
        const enterable = isModuleEnterable(m.status);
        const canEnable = m.status === 'disabled' && !!onEnable;
        const interactive = enterable || canEnable;
        const Glyph = MODULE_GLYPH[m.id];
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
                    : m.status === 'available'
                      ? 'text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            ].join(' ')}
          >
            <Glyph
              aria-hidden
              className={[
                'h-3.5 w-3.5 shrink-0',
                isActive && m.status === 'enabled' ? 'animate-pulse' : '',
                m.status === 'available' ? 'opacity-70' : '',
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
