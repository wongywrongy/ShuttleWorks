import { Button } from '@scheduler/design-system';

export interface ModuleUnavailablePanelProps {
  /** The unavailable module's display label, e.g. "Bracket". */
  label: string;
  /** Optional enablement note explaining why it's unavailable. */
  note?: string;
  /** Label of the module the "Go to" action routes to. */
  primaryLabel: string;
  onGoToPrimary: () => void;
  /** Provided only when the module is operator-disabled (offers re-enable). */
  onOpenSettings?: () => void;
  /** Stable reason vocabulary for guards reached from more than one route. */
  reason?: 'disabled' | 'not-enabled' | 'dependency' | 'permission' | 'unavailable';
  /** Permission required to resolve a permission-gated module. */
  requiredPermission?: string;
  /** Optional explicit resolution for permission-gated modules. */
  onRequestPermission?: () => void;
  /** Additional resolutions supplied by a module or tournament type guard. */
  actions?: readonly { label: string; onClick: () => void }[];
}

const REASON_COPY: Record<NonNullable<ModuleUnavailablePanelProps['reason']>, string> = {
  disabled: 'This module is turned off, but its data is preserved.',
  'not-enabled': 'Enable this module to add it to the tournament workflow.',
  dependency: 'Complete the required setup before using this module.',
  permission: 'Your role does not include access to this module.',
  unavailable: 'This module is not available for this tournament type.',
};

/** Shown in place of the module pane when the active module isn't enterable
 *  (disabled — the only non-enterable status emitted in practice) for this
 *  workspace — an explicit, actionable state instead of a silent misroute. */
export function ModuleUnavailablePanel({
  label,
  note,
  primaryLabel,
  onGoToPrimary,
  onOpenSettings,
  reason,
  requiredPermission,
  onRequestPermission,
  actions = [],
}: ModuleUnavailablePanelProps) {
  return (
    <div
      data-testid="module-unavailable"
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p className="text-base font-semibold text-foreground">
        {label} isn&rsquo;t available in this workspace
      </p>
      {note ? <p className="max-w-sm text-sm text-muted-foreground">{note}</p> : null}
      {reason ? (
        <p data-testid="module-unavailable-reason" className="max-w-sm text-sm text-muted-foreground">
          {REASON_COPY[reason]}
          {requiredPermission ? ` Required permission: ${requiredPermission}.` : ''}
        </p>
      ) : null}
      {/* SP-OPCON-1 SWP-9: the primary action agrees with the message. When
          the copy says "enable this module", the featured button goes where
          enabling happens (Administration · Modules) and says so — it does
          not say "Go to Bracket" while the text asks for an enable. Leaving
          the workspace stays available as the quiet secondary. */}
      <div className="mt-2 flex items-center gap-2">
        {onOpenSettings && (reason === 'disabled' || reason === 'not-enabled') ? (
          <>
            <Button onClick={onOpenSettings}>Enable in Administration · Modules</Button>
            <Button variant="ghost" onClick={onGoToPrimary}>
              Go to {primaryLabel}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onGoToPrimary}>Go to {primaryLabel}</Button>
            {onOpenSettings ? (
              <Button variant="ghost" onClick={onOpenSettings}>
                Open Settings
              </Button>
            ) : null}
          </>
        )}
        {onRequestPermission ? (
          <Button variant="ghost" onClick={onRequestPermission}>
            Request access
          </Button>
        ) : null}
        {actions.map((action) => (
          <Button key={action.label} variant="ghost" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
