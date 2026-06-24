import { describe, it, expect } from 'vitest';
import { customSeed, kindForSeed, DEFAULT_CUSTOM } from '../customModules';

describe('customModules', () => {
  it('maps tri-state to a modules[] seed (off → disabled)', () => {
    const seed = customSeed({ meet: 'enabled', bracket: 'available', display: 'off' });
    expect(seed).toEqual([
      { moduleId: 'meet', status: 'enabled', config: null },
      { moduleId: 'bracket', status: 'available', config: null },
      { moduleId: 'display', status: 'disabled', config: null },
    ]);
  });
  it('derives kind: bracket when bracket is the enabled operator', () => {
    expect(kindForSeed({ meet: 'available', bracket: 'enabled', display: 'off' })).toBe('bracket');
    expect(kindForSeed(DEFAULT_CUSTOM)).toBe('meet');
  });
});
