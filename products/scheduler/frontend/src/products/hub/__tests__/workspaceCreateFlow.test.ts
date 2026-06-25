import { describe, it, expect } from 'vitest';
import { landingRoute } from '../workspaceCreateFlow';
import type { WorkspaceModuleDTO } from '../../../api/dto';

const mod = (
  moduleId: WorkspaceModuleDTO['moduleId'],
  status: WorkspaceModuleDTO['status'],
): WorkspaceModuleDTO => ({ moduleId, status, config: null });

describe('landingRoute', () => {
  it('opens the in-workspace Overview when a module is enabled (meet)', () => {
    expect(landingRoute({ id: 'w1', kind: 'meet', modules: [mod('meet', 'enabled'), mod('display', 'enabled')] }))
      .toBe('/tournaments/w1/overview');
  });
  it('opens Overview for a bracket workspace too', () => {
    expect(landingRoute({ id: 'w2', kind: 'bracket', modules: [mod('bracket', 'enabled'), mod('meet', 'available')] }))
      .toBe('/tournaments/w2/overview');
  });
  it('lands on the Modules admin when NOTHING is enabled (blank/custom)', () => {
    expect(landingRoute({ id: 'w3', kind: 'meet', modules: [mod('meet', 'available'), mod('bracket', 'available'), mod('display', 'disabled')] }))
      .toBe('/tournaments/w3/ws-modules');
  });
  it('falls back to kind-derived modules when modules absent → Overview', () => {
    expect(landingRoute({ id: 'w4', kind: 'meet', modules: undefined }))
      .toBe('/tournaments/w4/overview');
  });
});
