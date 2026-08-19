import { Button } from '@scheduler/design-system';

interface ModuleUnavailablePanelProps {
  /** The unavailable module's display label, e.g. "Bracket". */
  label: string;
  /** Optional enablement note explaining why it's unavailable. */
  note?: string;
  /** Label of the module the "Go to" action routes to. */
  primaryLabel: string;
  onGoToPrimary: () => void;
  /** Provided only when the module is operator-disabled (offers re-enable). */
  onOpenSettings?: () => void;
}

/** Shown in place of the module pane when the active module isn't enterable
 *  (disabled — the only non-enterable status emitted in practice) for this
 *  workspace — an explicit, actionable state instead of a silent misroute. */
export function ModuleUnavailablePanel({
  label,
  note,
  primaryLabel,
  onGoToPrimary,
  onOpenSettings,
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
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={onGoToPrimary}>Go to {primaryLabel}</Button>
        {onOpenSettings ? (
          <Button variant="ghost" onClick={onOpenSettings}>
            Open Settings
          </Button>
        ) : null}
      </div>
    </div>
  );
}
