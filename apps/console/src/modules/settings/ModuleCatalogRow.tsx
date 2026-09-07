import { useCallback } from "react";
import { useAction } from "../../hooks/useAction";
import { isModuleEnableable } from "../../platform/domain/moduleModel";
import type { WorkspaceModule } from "../../platform/product-shell/types";
import { catalogMeta } from "./moduleCatalog";
import { Seg } from "../../platform/engine-config/SettingsControls";
import { TEXT_MUTED_XS } from '../../lib/utils'

/**
 * One row of the Modules catalog: **name + one line of description + one
 * switch**. When the switch cannot move, it is disabled and carries ONE short
 * reason ("Has draws or matches: can't turn off.").
 *
 * It used to carry, per module: a status word (ON / AVAILABLE / OFF), the
 * capability line, a dependency line, a blocked-reason line, a consequence
 * paragraph ("Turning Meet off hides it from this workspace's navigation…"),
 * a completion footer ("Enabled; finish setup"), a Configure button, and — for
 * a module with data — a "Review impact" button opening a modal that restated
 * the consequence paragraph and offered one button that did nothing. Nine
 * elements to express a two-state setting. The state is the switch; the reason
 * appears only when the switch is stuck.
 *
 * Nothing here relaxes a guard: the switch is disabled exactly where the
 * backend would refuse (last operational module, Display without an engine,
 * a module that owns data), and a server-side refusal still surfaces as a
 * toast through `useAction`.
 */
const ON_OFF = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

export function ModuleCatalogRow({
  module,
  onEnable,
  onDisable,
  hasData,
  blockedReason,
}: {
  module: WorkspaceModule;
  onEnable: () => void | Promise<unknown>;
  onDisable: () => void | Promise<unknown>;
  /** Server-computed signal that this module owns operational data. */
  hasData?: boolean;
  /** A server rule the CLIENT can evaluate (last operational module; Display
   *  needs an engine): the switch renders disabled with this reason. */
  blockedReason?: string;
}) {
  const meta = catalogMeta(module.id);
  const name = meta?.name ?? module.label;
  const enabled = module.status === "enabled";
  const ownsData = hasData ?? module.hasData ?? false;
  // The backend refuses to disable the last operational module, or one that
  // has data. `useAction` owns the failure (and the api client's `__handled`
  // marker keeps it from double-toasting what the interceptor surfaced), plus
  // it stops the double-fire the sweep saw on these buttons (audit C1).
  const toggle = useAction(
    useCallback(
      async (next: boolean) => (next ? onEnable() : onDisable()),
      [onEnable, onDisable],
    ),
  );
  // Data ownership is a *disable* rule only, and it is the one the operator
  // most often meets — say it in the same place, in the same shape, as the
  // other two.
  const reason = enabled && ownsData
    ? `Has draws or matches: can't turn off.`
    : blockedReason;
  const locked =
    reason !== undefined || (!enabled && !isModuleEnableable(module.status));

  return (
    <li
      data-testid={`settings-module-${module.id}`}
      className="flex items-start justify-between gap-4 p-3"
    >
      <div className="min-w-0 space-y-1">
        <span className="text-sm font-medium text-foreground">{name}</span>
        <p className={TEXT_MUTED_XS}>{meta?.capability ?? module.note}</p>
        {reason ? (
          <p data-testid={`module-reason-${module.id}`} className={TEXT_MUTED_XS}>
            {reason}
          </p>
        ) : null}
      </div>
      <div className="w-28 shrink-0">
        <Seg
          options={ON_OFF}
          value={enabled ? "on" : "off"}
          onChange={(next) => {
            const wanted = next === "on";
            if (wanted !== enabled) void toggle.run(wanted);
          }}
          ariaLabel={name}
          disabled={locked || toggle.pending}
        />
      </div>
    </li>
  );
}
