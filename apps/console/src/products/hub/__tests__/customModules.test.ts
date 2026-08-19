import { describe, it, expect } from 'vitest';
import { customSeed, kindForSeed, DEFAULT_CUSTOM } from '../customModules';

describe('customModules', () => {
  it('maps On/Off to a modules[] seed — everything not-On seeds as available', () => {
    const seed = customSeed({ meet: 'enabled', bracket: 'off', display: 'off' });
    expect(seed).toEqual([
      { moduleId: 'meet', status: 'enabled', config: null },
      { moduleId: 'bracket', status: 'available', config: null },
      { moduleId: 'display', status: 'available', config: null },
    ]);
  });
  it('derives kind: bracket when bracket is the enabled operator', () => {
    expect(kindForSeed({ meet: 'off', bracket: 'enabled', display: 'off' })).toBe('bracket');
    expect(kindForSeed(DEFAULT_CUSTOM)).toBe('meet');
  });
});
