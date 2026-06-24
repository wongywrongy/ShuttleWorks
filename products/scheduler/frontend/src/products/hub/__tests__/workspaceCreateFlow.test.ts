import { describe, it, expect } from 'vitest';
import { landingRoute } from '../workspaceCreateFlow';
import type { WorkspaceModuleDTO } from '../../../api/dto';

const mod = (
  moduleId: WorkspaceModuleDTO['moduleId'],
  status: WorkspaceModuleDTO['status'],
): WorkspaceModuleDTO => ({ moduleId, status, config: null });

describe('landingRoute', () => {
  it('opens the primary enabled module tab (meet → setup)', () => {
    expect(landingRoute({ id: 'w1', kind: 'meet', modules: [mod('meet', 'enabled'), mod('display', 'enabled')] }))
      .toBe('/tournaments/w1/setup');
  });
  it('opens bracket-setup when bracket is the enabled operator', () => {
    expect(landingRoute({ id: 'w2', kind: 'bracket', modules: [mod('bracket', 'enabled'), mod('meet', 'available')] }))
      .toBe('/tournaments/w2/bracket-setup');
  });
  it('lands on Modules setup when NOTHING is enabled (blank/custom)', () => {
    expect(landingRoute({ id: 'w3', kind: 'meet', modules: [mod('meet', 'available'), mod('bracket', 'available'), mod('display', 'disabled')] }))
      .toBe('/tournaments/w3/settings?tab=modules');
  });
  it('falls back to kind-derived modules when modules absent', () => {
    expect(landingRoute({ id: 'w4', kind: 'meet', modules: undefined }))
      .toBe('/tournaments/w4/setup');
  });
});
