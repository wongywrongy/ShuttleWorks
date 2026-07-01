import type { CustomState, ModuleState } from './customModules';
import { MODULE_LABELS } from './newWorkspaceTemplates';

const MODULES: (keyof CustomState)[] = ['meet', 'bracket', 'display'];
const STATES: { value: ModuleState; label: string }[] = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'available', label: 'Available' },
  { value: 'off', label: 'Off' },
];

/** Per-module tri-state builder for a Custom workspace. Each module can be
 *  Enabled (on now), Available (installable later), or Off. Emits the full
 *  CustomState on every change. A soft hint flags Display with no operator. */
export function CustomModulesBuilder({
  state,
  onChange,
}: {
  state: CustomState;
  onChange: (s: CustomState) => void;
}) {
  const displayOrphaned =
    state.display !== 'off' && state.meet !== 'enabled' && state.bracket !== 'enabled';
  return (
    <div className="space-y-2 rounded-md border border-border bg-card/30 p-3">
      {MODULES.map((moduleId) => (
        <div key={moduleId} className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">{MODULE_LABELS[moduleId]}</span>
          <div
            role="group"
            aria-label={MODULE_LABELS[moduleId]}
            className="inline-flex overflow-hidden rounded-sm border border-border"
          >
            {STATES.map((s) => {
              const active = state[moduleId] === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={active}
                  data-testid={`custom-${moduleId}-${s.value}`}
                  onClick={() => onChange({ ...state, [moduleId]: s.value })}
                  className={[
                    'px-2.5 py-1 text-2xs font-medium transition-colors',
                    active
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  ].join(' ')}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {displayOrphaned ? (
        <p data-testid="custom-display-hint" className="text-2xs text-status-warning">
          Display needs Meet or Bracket enabled to show anything.
        </p>
      ) : null}
    </div>
  );
}
