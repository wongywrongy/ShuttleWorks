import type { WorkspaceModuleDTO } from '../../api/dto';

export type ModuleState = 'enabled' | 'available' | 'off';

export interface CustomState {
  meet: ModuleState;
  bracket: ModuleState;
  display: ModuleState;
}

export const DEFAULT_CUSTOM: CustomState = { meet: 'enabled', bracket: 'off', display: 'off' };

const toStatus = (s: ModuleState): WorkspaceModuleDTO['status'] => (s === 'off' ? 'disabled' : s);

/** A custom build's tri-state → the `modules[]` create seed (off → disabled). */
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
