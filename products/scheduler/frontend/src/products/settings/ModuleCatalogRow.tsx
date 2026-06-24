import { Button } from '@scheduler/design-system';
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
  onEnable: () => void;
  onDisable: () => void;
}) {
  const meta = catalogMeta(module.id);
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
                  : 'border border-dashed border-border text-muted-foreground/60',
            ].join(' ')}
          >
            {module.status.replace('-', ' ')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{meta?.capability ?? module.note}</p>
        {meta?.dependency ? (
          <p className="text-2xs text-muted-foreground/70">{meta.dependency}</p>
        ) : null}
      </div>
      <div className="shrink-0">
        {module.status === 'enabled' ? (
          <Button variant="ghost" onClick={onDisable} className="text-muted-foreground">
            Disable
          </Button>
        ) : isModuleEnableable(module.status) ? (
          <Button onClick={onEnable}>Enable</Button>
        ) : (
          <span className="text-2xs text-muted-foreground/60">Coming soon</span>
        )}
      </div>
    </li>
  );
}
