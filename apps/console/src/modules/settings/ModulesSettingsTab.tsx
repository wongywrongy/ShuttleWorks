import { PAGE_BODY_WIDTH } from '../../components/control-plane';
import { useWorkspaceModules } from '../../platform/domain/useWorkspaceModules';
import { ModuleCatalogRow } from './ModuleCatalogRow';

/** The module catalog: each module's capability, status, dependency, and the
 *  enable / disable action per the backend rules. Dependency / last-operational
 *  / has-data / coming_soon 409s surface as toasts — we never fake success. */
/** Mirrors backend OPERATIONAL_MODULES (database/models.py). */
const OPERATIONAL_IDS = new Set(['meet', 'bracket']);

export function ModulesSettingsTab({ tid }: { tid: string }) {
  const { modules, enable, disable } = useWorkspaceModules(tid);

  // Every disable rule now surfaces BEFORE the click. Two were always
  // client-evaluable from the list; has-data used to be server-only — the
  // operator learned it from a 409 toast — and now rides the DTO (WSMOD-2).
  const enabledOps = (modules ?? []).filter(
    (m) => OPERATIONAL_IDS.has(m.id) && m.status === 'enabled',
  ).length;
  const blockedReason = (m: {
    id: string;
    status: string;
    hasData?: boolean;
  }): string | undefined => {
    if (m.status === 'enabled' && m.hasData) {
      return 'This module has matches or draws. Clear its data before disabling it.';
    }
    if (m.status === 'enabled' && OPERATIONAL_IDS.has(m.id) && enabledOps <= 1) {
      return 'A workspace keeps at least one operational module enabled.';
    }
    if (m.id === 'display' && m.status !== 'enabled' && enabledOps === 0) {
      return 'Needs Meet or Bracket enabled.';
    }
    return undefined;
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Module catalog</h2>
        {/* COPY-3: the rules used to be listed here AND stated per row by
            `blockedReason` — which is the version that says them at the
            moment they bite, about the module they bite. A header that
            recites every rule in advance asks the operator to hold three
            conditions in their head to read a list that will tell them
            anyway. Kept: what a module IS, which no row says. */}
        <p className={`mt-1 text-xs text-muted-foreground ${PAGE_BODY_WIDTH.prose}`}>
          Each module is a product system inside this workspace.
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
