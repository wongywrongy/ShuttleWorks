/** The three suite modules that can be enabled inside an open workspace. */
export type ModuleId = 'meet' | 'bracket' | 'display';

/** A module's enablement status within a workspace. Real state comes from the
 *  backend `workspace_modules` table; when absent it is derived from `kind`
 *  (a temporary compatibility bridge).
 *  - `enabled`: active — enter the module.
 *  - `available`: not enabled but enableable/configurable now (e.g. Display on a meet).
 *  - `disabled`: turned off (data preserved) — can be re-enabled.
 *  - `coming-soon`: DEFENSIVE only — all modules are fully built, so this is never
 *    emitted. `modulesFromDto` maps any legacy backend `coming_soon` to `available`;
 *    the variant is retained so guards/exhaustive switches stay total. */
export type ModuleStatus = 'enabled' | 'available' | 'disabled' | 'coming-soon';

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
