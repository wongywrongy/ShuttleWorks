import { describe, it, expect } from 'vitest';
import { SETTINGS_TABS } from '../settingsTabs';

describe('SETTINGS_TABS', () => {
  it('leads with Overview, drops the dead Appearance tab', () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual([
      'overview',
      'general',
      'modules',
      'people',
      'sharing',
      'sync',
      'danger',
    ]);
    expect(SETTINGS_TABS.map((t) => t.id)).not.toContain('appearance');
  });
});
