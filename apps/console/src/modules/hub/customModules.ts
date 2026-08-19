/**
 * Custom-build module state for the `/new` route's Custom template.
 *
 * A per-module ON/OFF choice maps to the create payload:
 *   enabled → 'enabled'   (on immediately)
 *   off     → 'available' (offered in the Modules catalog, not on yet)
 *
 * The form used to offer the catalog's full tri-state (On / Available / Off),
 * but "Available" and "Off" are the same answer at creation time — neither
 * module is on, and both are one click apart in Modules afterwards. Asking a
 * director to distinguish them before the workspace exists was a question
 * without a consequence, so `/new` asks On or Off and seeds everything
 * not-On as available (SP-CONSOLE-2 R-B). The catalog keeps all three.
 *
 * `kindForSeed` derives the legacy workspace `kind`: bracket-only → 'bracket',
 * everything else → 'meet'.
 */
import type { WorkspaceModuleDTO } from '../../api/dto';

export type ModuleState = 'enabled' | 'off';

export interface CustomState {
  meet: ModuleState;
  bracket: ModuleState;
  display: ModuleState;
}

export const DEFAULT_CUSTOM: CustomState = { meet: 'enabled', bracket: 'off', display: 'off' };

const toStatus = (s: ModuleState): WorkspaceModuleDTO['status'] =>
  s === 'off' ? 'available' : 'enabled';

/** A custom build's On/Off → the `modules[]` create seed (off → available).
 *
 *  Deliberately does NOT include `entries`, and this is not an oversight to
 *  fix: the entries row is seeded SERVER-side and only under `AUTH_MODE=cloud`
 *  (SP-E1-1 ruling D2). Offering it in the create form would let a local-mode
 *  director build a workspace around a module the backend then refuses. */
export function customSeed(s: CustomState): WorkspaceModuleDTO[] {
  return (['meet', 'bracket', 'display'] as const).map((moduleId) => ({
    moduleId,
    status: toStatus(s[moduleId]),
    config: null,
  }));
}

/** Legacy `kind` for a custom build: bracket when bracket is the enabled
 *  operator and meet is not, else meet. */
export function kindForSeed(s: CustomState): 'meet' | 'bracket' {
  return s.bracket === 'enabled' && s.meet !== 'enabled' ? 'bracket' : 'meet';
}
