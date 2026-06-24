/** The three suite modules that can be enabled inside an open workspace. */
export type ModuleId = 'meet' | 'bracket' | 'display';

/** A module's enablement status within a workspace (derived from `kind` for
 *  now — `kind` is a temporary compatibility bridge to a future `modules[]`).
 *  - `enabled`: the workspace's active operator module.
 *  - `available`: usable/configurable now (e.g. Display on a meet).
 *  - `not-enabled`: a module not enabled for this workspace yet.
 *  - `coming-soon`: a module not yet built for this workspace's shape. */
export type ModuleStatus = 'enabled' | 'available' | 'not-enabled' | 'coming-soon';

/** One module entry in the Module Dock / catalog. Non-active statuses carry a
 *  `note` (shown as a tooltip) using enablement language. */
export interface WorkspaceModule {
  id: ModuleId;
  label: string;
  status: ModuleStatus;
  note?: string;
}

/** Identity of the open workspace, as the shell displays it. Fields are
 *  nullable because they hydrate asynchronously. */
export interface WorkspaceIdentity {
  name: string | null;
  date: string | null; // ISO date string
  status: 'draft' | 'active' | 'archived' | null;
  kind: 'meet' | 'bracket' | null;
}
