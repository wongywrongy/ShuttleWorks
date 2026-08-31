import { useCallback, useState } from "react";
import { Button, Modal } from "@scheduler/design-system";
import { useAction } from "../../hooks/useAction";
import { isModuleEnableable } from "../../platform/domain/moduleModel";
import type { WorkspaceModule } from "../../platform/product-shell/types";
import { catalogMeta } from "./moduleCatalog";
import {
  SELECTABLE_ROW_FOCUS,
  selectableRowProps,
} from "../../lib/selectableRow";
import { TEXT_MUTED_2XS, TEXT_MUTED_XS, TEXT_TITLE } from '../../lib/utils'

/** The catalog chip speaks the glossary's tri-state, not the wire's. The chip
 *  used to print `module.status` straight through, so it read "enabled" and
 *  "disabled" while every other surface and `console-naming.md` said On and
 *  Off (WSMOD-1). */
const MODULE_STATUS_WORD: Record<string, string> = {
  enabled: "On",
  available: "Available",
  disabled: "Off",
};

/** One row of the Modules catalog: name + status word, capability description,
 *  a dependency note when relevant, and the enable/disable action (per the
 *  backend rules — 409s surface as toasts). */
export function ModuleCatalogRow({
  module,
  onEnable,
  onDisable,
  onConfigure,
  hasData,
  blockedReason,
}: {
  module: WorkspaceModule;
  onEnable: () => void | Promise<unknown>;
  onDisable: () => void | Promise<unknown>;
  /** Opens the canonical configuration surface for this module. */
  onConfigure?: () => void;
  /** Server-computed signal that this module owns operational data. */
  hasData?: boolean;
  /** A server rule the CLIENT can evaluate (last operational module; Display
   *  needs an engine): the action renders visibly disabled with this reason.
   *  Rules needing server state (a module with data) stay 409→toast. */
  blockedReason?: string;
}) {
  const meta = catalogMeta(module.id);
  const enabled = module.status === "enabled";
  const ownsData = hasData ?? module.hasData ?? false;
  const [impactOpen, setImpactOpen] = useState(false);
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
  const row = onConfigure ? selectableRowProps(onConfigure) : null;
  return (
    <li
      data-testid={`settings-module-${module.id}`}
      {...(row ?? {})}
      className={[
        "flex items-start justify-between gap-4 p-3",
        row ? `cursor-pointer hover:bg-muted/30 ${SELECTABLE_ROW_FOCUS}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">
            {meta?.name ?? module.label}
          </span>
          {/* Text, not a container (X6): module state is configuration, not
              a time-sensitive signal — ink weight carries the tri-state.
              On = accent semibold; Available = muted semibold; Off = muted
              normal, one visible step quieter. */}
          <span
            className={[
              "text-2xs uppercase tracking-[0.08em]",
              module.status === "enabled"
                ? "font-semibold text-accent"
                : module.status === "available"
                  ? "font-semibold text-muted-foreground"
                  : "text-muted-foreground",
            ].join(" ")}
          >
            {MODULE_STATUS_WORD[module.status] ?? module.status}
          </span>
        </div>
        <p className={TEXT_MUTED_XS}>
          {meta?.capability ?? module.note}
        </p>
        {meta?.dependency ? (
          <p className={TEXT_MUTED_2XS}>{meta.dependency}</p>
        ) : null}
        {/* Don't repeat the dependency line word-for-word as the reason. */}
        {blockedReason && blockedReason !== meta?.dependency ? (
          <p className={TEXT_MUTED_2XS}>{blockedReason}</p>
        ) : null}
        <p
          data-testid={`module-impact-${module.id}`}
          className={TEXT_MUTED_2XS}
        >
          {ownsData
            ? "Data impact: owns operational data; it is preserved and must be reviewed before any disable action."
            : module.id === "display"
              ? "Data impact: read-only output; it does not own match data."
              : "Data impact: no operational records yet."}
        </p>
        <p
          data-testid={`module-completion-${module.id}`}
          className={TEXT_MUTED_2XS}
        >
          {module.status === "enabled"
            ? ownsData
              ? "Configuration: active with data"
              : "Configuration: enabled; finish setup"
            : module.status === "disabled"
              ? "Configuration: off; data preserved"
              : "Configuration: available to enable"}
        </p>
      </div>
      <div className="shrink-0">
        <div className="flex items-center gap-1.5">
          {onConfigure ? (
            <Button variant="ghost" onClick={onConfigure}>
              Configure
            </Button>
          ) : null}
          {module.status === "enabled" && ownsData ? (
            <Button
              variant="outline"
              onClick={() => setImpactOpen(true)}
              title="Review the data this module owns before disabling"
            >
              Review impact
            </Button>
          ) : module.status === "enabled" ? (
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
      </div>
      {impactOpen ? (
        <Modal
          onClose={() => setImpactOpen(false)}
          titleId={`module-impact-heading-${module.id}`}
        >
          <div className="p-6">
            <h2
              id={`module-impact-heading-${module.id}`}
              className={TEXT_TITLE}
            >
              Review {meta?.name ?? module.label} data impact
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This module owns operational data in this workspace. Disabling it
              could hide or invalidate those records, so the server keeps it
              enabled until the data is cleared through its normal workflow. No
              data will be removed here.
            </p>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => setImpactOpen(false)}>
                Keep module enabled
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </li>
  );
}
