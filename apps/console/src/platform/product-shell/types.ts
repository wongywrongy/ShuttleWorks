import type { WorkspacePhase } from '../domain/lifecycle';
/** The suite modules that can be enabled inside an open workspace.
 *
 *  `entries` is CLOUD-ONLY (SP-E1-1 ruling D2): the backend seeds and returns
 *  its `workspace_modules` row only under `AUTH_MODE=cloud`, so a local-mode
 *  workspace never sees it and ADR 0005 ("every module a workspace shows is
 *  actionable") stays true. This union is the vocabulary, not the policy —
 *  presence in the real catalog is what drives the nav. */
export type ModuleId = 'meet' | 'bracket' | 'display' | 'entries';

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
  /** Server-computed: this module owns operational data, so disabling it
   *  would 409. The catalog disables the action and says why BEFORE the
   *  click (WSMOD-2) instead of after. */
  hasData?: boolean;
}

/** Identity of the open workspace, as the shell displays it. Fields are
 *  nullable because they hydrate asynchronously. */
export interface WorkspaceIdentity {
  name: string | null;
  date: string | null; // ISO date string
  status: 'draft' | 'active' | 'archived' | null;
  /** Derived lifecycle phase (signals.phase) — real play state. When it says
   *  live/complete the shell badge prefers it over the operator-managed
   *  `status`, so a mid-day tournament never reads "draft". */
  phase?: WorkspacePhase | null;
  kind: 'meet' | 'bracket' | null;
}
