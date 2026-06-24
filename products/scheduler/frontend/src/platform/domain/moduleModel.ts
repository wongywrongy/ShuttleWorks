import type {
  ModuleId,
  ModuleStatus,
  WorkspaceModule,
  WorkspaceIdentity,
} from '../product-shell/types';
import type { WorkspaceModuleDTO } from '../../api/dto';

type Kind = WorkspaceIdentity['kind'];

const MEET_OPERATOR_TABS = new Set([
  'setup',
  'roster',
  'matches',
  'schedule',
  'live',
]);

const MODULE_LABELS: Record<ModuleId, string> = {
  meet: 'Meet',
  bracket: 'Bracket',
  display: 'Display',
};

/** Fixed display order for the Module Dock / catalog. */
const MODULE_ORDER: ModuleId[] = ['meet', 'bracket', 'display'];

/** Which module owns a given active tab. `tv` is the Display module; any
 *  `bracket-` tab is Bracket; the meet operator tabs are Meet. Unknown tabs
 *  fall back to the workspace kind. Never throws on a null kind. */
export function moduleForTab(tab: string, kind: Kind): ModuleId {
  if (tab === 'tv') return 'display';
  if (tab.startsWith('bracket-')) return 'bracket';
  if (MEET_OPERATOR_TABS.has(tab)) return 'meet';
  return kind === 'bracket' ? 'bracket' : 'meet';
}

/** The existing route segment to navigate to when a module is entered.
 *  On a bracket workspace only Bracket is real, so everything routes to the
 *  bracket home (defensive — non-enterable modules are never clicked). */
export function defaultTabForModule(module: ModuleId, kind: Kind): string {
  if (kind === 'bracket') return 'bracket-setup';
  if (module === 'display') return 'tv';
  if (module === 'meet') return 'setup';
  return 'setup';
}

/** Enablement copy for a non-active module, by id + status. */
function moduleNote(id: ModuleId, status: ModuleStatus): string | undefined {
  if (status === 'coming-soon') {
    if (id === 'display') return 'Display for bracket workspaces is coming.';
    return `${MODULE_LABELS[id]} is not enabled for this workspace yet.`;
  }
  if (status === 'disabled') return `${MODULE_LABELS[id]} is turned off — re-enable to use it.`;
  return undefined;
}

/** The kind-derived module catalog — the FALLBACK used before/without real
 *  backend module state. Mirrors the backend's `derive_modules(kind)` exactly:
 *  meet → meet enabled, display available, bracket coming-soon; bracket →
 *  bracket enabled, display coming-soon, meet coming-soon. */
export function modulesForWorkspace(kind: Kind): WorkspaceModule[] {
  const isBracket = kind === 'bracket';
  const status = (id: ModuleId): ModuleStatus => {
    if (id === 'display') return isBracket ? 'coming-soon' : 'available';
    const isThisOperator = (id === 'bracket') === isBracket;
    return isThisOperator ? 'enabled' : 'coming-soon';
  };
  return MODULE_ORDER.map((id) => {
    const s = status(id);
    return { id, label: MODULE_LABELS[id], status: s, note: moduleNote(id, s) };
  });
}

/** Map the real backend module DTOs into the dock's WorkspaceModule shape.
 *  Normalizes the backend's `coming_soon` to the frontend `coming-soon`. */
export function modulesFromDto(dtos: WorkspaceModuleDTO[]): WorkspaceModule[] {
  const byId = new Map<ModuleId, ModuleStatus>();
  for (const d of dtos) {
    const status = (d.status === 'coming_soon' ? 'coming-soon' : d.status) as ModuleStatus;
    byId.set(d.moduleId as ModuleId, status);
  }
  return MODULE_ORDER.filter((id) => byId.has(id)).map((id) => {
    const s = byId.get(id)!;
    return { id, label: MODULE_LABELS[id], status: s, note: moduleNote(id, s) };
  });
}

/** A module is enterable (clickable to enter) when active or available. */
export function isModuleEnterable(status: ModuleStatus): boolean {
  return status === 'enabled' || status === 'available';
}

/** A module can be enabled (Enable affordance) when available or disabled. */
export function isModuleEnableable(status: ModuleStatus): boolean {
  return status === 'available' || status === 'disabled';
}
