import { describe, it, expect } from 'vitest';
import { SETTINGS_TABS } from '../settingsTabs';

describe('SETTINGS_TABS', () => {
  it('lists the seven settings tabs in order', () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual([
      'general',
      'modules',
      'people',
      'sharing',
      'sync',
      'appearance',
      'danger',
    ]);
  });
});
