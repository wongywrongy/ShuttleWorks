import { useCallback } from 'react';
import { Button } from '@scheduler/design-system';
import { useAction } from '../../hooks/useAction';
import { isModuleEnableable } from '../../platform/domain/moduleModel';
import type { WorkspaceModule } from '../../platform/product-shell/types';
import { catalogMeta } from './moduleCatalog';

/** One row of the Modules catalog: name + status chip, capability description,
 *  a dependency note when relevant, and the enable/disable action (per the
 *  backend rules — 409s surface as toasts). */
export function ModuleCatalogRow({
  module,
  onEnable,
  onDisable,
}: {
  module: WorkspaceModule;
  onEnable: () => void | Promise<unknown>;
  onDisable: () => void | Promise<unknown>;
}) {
  const meta = catalogMeta(module.id);
  const enabled = module.status === 'enabled';
  // The backend refuses to disable the last operational module, or one that has
  // data. Those rejections had NO failure path here — `void disable(id)` turned
  // them into genuine `unhandledrejection` events (audit B1). `useAction` owns
  // the failure (and the api client's `__handled` marker keeps it from
  // double-toasting what the interceptor already surfaced), plus it stops the
  // double-fire the sweep saw on these same buttons (audit C1).
  const toggle = useAction(
    useCallback(
      async () => (enabled ? onDisable() : onEnable()),
      [enabled, onEnable, onDisable],
    ),
  );
  return (
    <li
      data-testid={`settings-module-${module.id}`}
      className="flex items-start justify-between gap-4 p-3"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{meta?.name ?? module.label}</span>
          <span
            className={[
              'rounded-sm px-1.5 py-0.5 text-2xs font-medium capitalize',
              module.status === 'enabled'
                ? 'bg-accent/10 text-accent'
                : module.status === 'available'
                  ? 'border border-border text-muted-foreground'
                  : 'border border-dashed border-border text-muted-foreground',
            ].join(' ')}
          >
            {module.status.replaceAll('-', ' ')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{meta?.capability ?? module.note}</p>
        {meta?.dependency ? (
          <p className="text-2xs text-muted-foreground">{meta.dependency}</p>
        ) : null}
      </div>
      <div className="shrink-0">
        {module.status === 'enabled' ? (
          <Button
            variant="ghost"
            onClick={() => void toggle.run()}
            disabled={toggle.pending}
            aria-busy={toggle.pending}
            className="text-muted-foreground"
          >
            Disable
          </Button>
        ) : isModuleEnableable(module.status) ? (
          <Button
            onClick={() => void toggle.run()}
            disabled={toggle.pending}
            aria-busy={toggle.pending}
          >
            Enable
          </Button>
        ) : null}
      </div>
    </li>
  );
}
