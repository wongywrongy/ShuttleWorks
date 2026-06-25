import { useWorkspaceModules } from '../../platform/domain/useWorkspaceModules';
import { Eyebrow } from '../../components/control-plane';
import { ModuleCatalogRow } from './ModuleCatalogRow';

/** The module catalog: each module's capability, status, dependency, and the
 *  enable / disable action per the backend rules. Dependency / last-operational
 *  / has-data / coming_soon 409s surface as toasts — we never fake success. */
export function ModulesSettingsTab({ tid }: { tid: string }) {
  const { modules, enable, disable } = useWorkspaceModules(tid);

  return (
    <div className="max-w-2xl space-y-4 p-6">
      <div>
        <Eyebrow framed>MODULES</Eyebrow>
        <h2 className="mt-1 text-base font-semibold text-foreground">Module catalog</h2>
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
              onEnable={() => void enable(m.id)}
              onDisable={() => void disable(m.id)}
            />
          ))
        )}
      </ul>
    </div>
  );
}
