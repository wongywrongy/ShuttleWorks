import { useWorkspaceModules } from '../../platform/domain/useWorkspaceModules';
import { ModuleCatalogRow } from './ModuleCatalogRow';

/** The module catalog: each module's capability, status, dependency, and the
 *  enable / disable action per the backend rules. Dependency / last-operational
 *  / has-data / coming_soon 409s surface as toasts — we never fake success. */
/** Mirrors backend OPERATIONAL_MODULES (database/models.py). */
const OPERATIONAL_IDS = new Set(['meet', 'bracket']);

export function ModulesSettingsTab({ tid }: { tid: string }) {
  const { modules, enable, disable } = useWorkspaceModules(tid);

  // The two server rules the client can evaluate from the list it already
  // holds — the action disables visibly instead of 409-toasting on click.
  const enabledOps = (modules ?? []).filter(
    (m) => OPERATIONAL_IDS.has(m.id) && m.status === 'enabled',
  ).length;
  const blockedReason = (m: { id: string; status: string }): string | undefined => {
    if (m.status === 'enabled' && OPERATIONAL_IDS.has(m.id) && enabledOps <= 1) {
      return 'A workspace keeps at least one operational module enabled.';
    }
    if (m.id === 'display' && m.status !== 'enabled' && enabledOps === 0) {
      return 'Needs Meet or Bracket enabled.';
    }
    return undefined;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Module catalog</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Each module is a product system inside this workspace. Display needs an
          enabled Meet or Bracket; a workspace keeps at least one operational module
          enabled, and a module with data can&rsquo;t be disabled.
        </p>
      </div>
      <ul className="divide-y divide-border rounded border border-border">
        {modules === null ? (
          <li className="p-3 text-sm text-muted-foreground">Loading…</li>
        ) : (
          modules.map((m) => (
            <ModuleCatalogRow
              key={m.id}
              module={m}
              onEnable={() => enable(m.id)}
              onDisable={() => disable(m.id)}
              blockedReason={blockedReason(m)}
            />
          ))
        )}
      </ul>
    </div>
  );
}
