import { describe, it, expect } from 'vitest';
import { resolveActivePane } from '../AppShell';
import type { WorkspaceModule } from '../../platform/product-shell/types';

const wm = (id: 'meet' | 'bracket' | 'display', status: string): WorkspaceModule =>
  ({ id, label: id[0].toUpperCase() + id.slice(1), status, note: undefined }) as never;

describe('resolveActivePane', () => {
  it('renders the outlet when the active module is enterable', () => {
    const r = resolveActivePane('meet', [
      wm('meet', 'enabled'),
      wm('bracket', 'coming-soon'),
      wm('display', 'available'),
    ]);
    expect(r.kind).toBe('outlet');
  });
  it('renders the panel when the active module is coming-soon', () => {
    const r = resolveActivePane('bracket', [
      wm('meet', 'enabled'),
      wm('bracket', 'coming-soon'),
      wm('display', 'available'),
    ]);
    expect(r.kind).toBe('panel');
    if (r.kind === 'panel') {
      expect(r.label).toBe('Bracket');
      expect(r.primary).toBe('meet');
      expect(r.canOpenSettings).toBe(false);
    }
  });
  it('panel offers settings only when the module is disabled', () => {
    const r = resolveActivePane('display', [wm('meet', 'enabled'), wm('display', 'disabled')]);
    expect(r.kind).toBe('panel');
    if (r.kind === 'panel') expect(r.canOpenSettings).toBe(true);
  });
  it('renders the outlet when status is unknown/loading (resilient)', () => {
    const r = resolveActivePane('meet', []);
    expect(r.kind).toBe('outlet');
  });
});
