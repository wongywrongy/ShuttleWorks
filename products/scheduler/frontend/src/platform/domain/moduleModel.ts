import type {
  ModuleId,
  WorkspaceModule,
  WorkspaceIdentity,
} from '../product-shell/types';

type Kind = WorkspaceIdentity['kind'];

const MEET_OPERATOR_TABS = new Set([
  'setup',
  'roster',
  'matches',
  'schedule',
  'live',
]);

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

/** The module catalog for a workspace, derived from `kind` (a temporary
 *  compatibility bridge to a future persisted `modules[]`). The Module Dock
 *  always lists all three; non-active modules carry enablement copy. */
export function modulesForWorkspace(kind: Kind): WorkspaceModule[] {
  const isBracket = kind === 'bracket';
  return [
    {
      id: 'meet',
      label: 'Meet',
      status: isBracket ? 'not-enabled' : 'enabled',
      note: isBracket ? 'Meet is not enabled for this workspace.' : undefined,
    },
    {
      id: 'bracket',
      label: 'Bracket',
      status: isBracket ? 'enabled' : 'not-enabled',
      note: isBracket ? undefined : 'Bracket is not enabled for this workspace.',
    },
    {
      id: 'display',
      label: 'Display',
      status: isBracket ? 'coming-soon' : 'available',
      note: isBracket ? 'Display for bracket workspaces is coming.' : undefined,
    },
  ];
}

/** A module is enterable (clickable in the Module Dock) when it is the active
 *  operator module or an available module. */
export function isModuleEnterable(status: WorkspaceModule['status']): boolean {
  return status === 'enabled' || status === 'available';
}
