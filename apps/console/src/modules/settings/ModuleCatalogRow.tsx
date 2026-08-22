import { useCallback } from 'react';
import { Button } from '@scheduler/design-system';
import { useAction } from '../../hooks/useAction';
import { isModuleEnableable } from '../../platform/domain/moduleModel';
import type { WorkspaceModule } from '../../platform/product-shell/types';
import { catalogMeta } from './moduleCatalog';

/** The catalog chip speaks the glossary's tri-state, not the wire's. The chip
 *  used to print `module.status` straight through, so it read "enabled" and
 *  "disabled" while every other surface and `console-naming.md` said On and
 *  Off (WSMOD-1). */
const MODULE_STATUS_WORD: Record<string, string> = {
  enabled: 'On',
  available: 'Available',
  disabled: 'Off',
};

/** One row of the Modules catalog: name + status word, capability description,
 *  a dependency note when relevant, and the enable/disable action (per the
 *  backend rules — 409s surface as toasts). */
export function ModuleCatalogRow({
  module,
  onEnable,
  onDisable,
  blockedReason,
}: {
  module: WorkspaceModule;
  onEnable: () => void | Promise<unknown>;
  onDisable: () => void | Promise<unknown>;
  /** A server rule the CLIENT can evaluate (last operational module; Display
   *  needs an engine): the action renders visibly disabled with this reason.
   *  Rules needing server state (a module with data) stay 409→toast. */
  blockedReason?: string;
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
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{meta?.name ?? module.label}</span>
          {/* Text, not a container (X6): module state is configuration, not
              a time-sensitive signal — ink weight carries the tri-state.
              On = accent semibold; Available = muted semibold; Off = muted
              normal, one visible step quieter. */}
          <span
            className={[
              'text-2xs uppercase tracking-[0.08em]',
              module.status === 'enabled'
                ? 'font-semibold text-accent'
                : module.status === 'available'
                  ? 'font-semibold text-muted-foreground'
                  : 'text-muted-foreground',
            ].join(' ')}
          >
            {MODULE_STATUS_WORD[module.status] ?? module.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{meta?.capability ?? module.note}</p>
        {meta?.dependency ? (
          <p className="text-2xs text-muted-foreground">{meta.dependency}</p>
        ) : null}
        {/* Don't repeat the dependency line word-for-word as the reason. */}
        {blockedReason && blockedReason !== meta?.dependency ? (
          <p className="text-2xs text-muted-foreground">{blockedReason}</p>
        ) : null}
      </div>
      <div className="shrink-0">
        {module.status === 'enabled' ? (
          <Button
            variant="ghost"
            onClick={() => void toggle.run()}
            disabled={toggle.pending || blockedReason !== undefined}
            aria-busy={toggle.pending}
            title={blockedReason}
            className="text-muted-foreground"
          >
            Disable
          </Button>
        ) : isModuleEnableable(module.status) ? (
          // SIG-6: `outline`, not the accent-filled primary. Weight follows
          // operator need, and turning ON a module this workspace is not using
          // is not the page's most-wanted action — yet Enable was the largest,
          // bluest control on the surface (the primary glow button, one per
          // unused module) while every module actually in use carried a grey
          // ghost link. The catalog read as a shop. Same size, same position,
          // same action; secondary weight.
          <Button
            variant="outline"
            onClick={() => void toggle.run()}
            disabled={toggle.pending || blockedReason !== undefined}
            aria-busy={toggle.pending}
            title={blockedReason}
          >
            Enable
          </Button>
        ) : null}
      </div>
    </li>
  );
}
