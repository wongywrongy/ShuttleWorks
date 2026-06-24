import { Button } from '@scheduler/design-system';
import { useWorkspaceModules } from '../../platform/domain/useWorkspaceModules';
import { isModuleEnableable } from '../../platform/domain/moduleModel';

/** The module-management surface: enable / disable modules per the backend
 *  rules. Dependency / last-operational / has-data / coming_soon 409s surface
 *  as toasts (via the axios interceptor) — we never fake success. */
export function ModulesSettingsTab({ tid }: { tid: string }) {
  const { modules, enable, disable } = useWorkspaceModules(tid);
  const list = modules ?? [];

  return (
    <div className="max-w-2xl space-y-4 p-6">
      <div>
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          MODULES
        </div>
        <h2 className="mt-1 text-base font-semibold text-foreground">
          Enabled capabilities
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Display needs an enabled Meet or Bracket. A workspace keeps at least one
          operational module enabled, and a module with data can&rsquo;t be disabled.
        </p>
      </div>
      <ul className="divide-y divide-border rounded border border-border">
        {list.map((m) => (
          <li
            key={m.id}
            data-testid={`settings-module-${m.id}`}
            className="flex items-center justify-between gap-4 p-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{m.label}</div>
              <div className="text-xs text-muted-foreground">
                <span className="capitalize">{m.status.replace('-', ' ')}</span>
                {m.note ? ` — ${m.note}` : ''}
              </div>
            </div>
            <div className="shrink-0">
              {m.status === 'enabled' ? (
                <Button
                  variant="ghost"
                  onClick={() => void disable(m.id)}
                  className="text-muted-foreground"
                >
                  Disable
                </Button>
              ) : isModuleEnableable(m.status) ? (
                <Button onClick={() => void enable(m.id)}>Enable</Button>
              ) : (
                <span className="text-2xs text-muted-foreground/60">Coming soon</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
