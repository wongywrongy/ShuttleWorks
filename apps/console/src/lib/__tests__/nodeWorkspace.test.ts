import { afterEach, describe, expect, it, vi } from 'vitest';
import { homePath, rememberNodeWorkspace, rememberedNodeWorkspace } from '../nodeWorkspace';

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

describe('node workspace selector', () => {
  it('remembers only a workspace UUID', () => {
    rememberNodeWorkspace('not-a-workspace');
    expect(rememberedNodeWorkspace()).toBeUndefined();
    rememberNodeWorkspace(WORKSPACE);
    expect(rememberedNodeWorkspace()).toBe(WORKSPACE);
    window.localStorage.setItem('sw:node-workspace', '../../settings');
    expect(rememberedNodeWorkspace()).toBeUndefined();
  });

  it('treats blocked storage as no hint', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => rememberNodeWorkspace(WORKSPACE)).not.toThrow();
    expect(rememberedNodeWorkspace()).toBeUndefined();
  });

  it('computes home from the node scope', () => {
    expect(homePath(WORKSPACE)).toBe(`/tournaments/${WORKSPACE}`);
    expect(homePath(null)).toBe('/');
  });
});
