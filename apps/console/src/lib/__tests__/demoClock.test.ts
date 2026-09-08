import { describe, expect, it } from 'vitest';
import { parseDemoNow } from '../demoClock';

describe('demo clock configuration', () => {
  it('accepts an offset-bearing ISO instant only in local mode', () => {
    expect(parseDemoNow('2026-07-31T05:15:00Z', 'local')).toBe(
      Date.parse('2026-07-31T05:15:00Z'),
    );
    expect(parseDemoNow('2026-07-31T13:15:00+08:00', 'LOCAL')).toBe(
      Date.parse('2026-07-31T05:15:00Z'),
    );
  });

  it('rejects invalid, naive, and non-local values', () => {
    expect(() => parseDemoNow('2026-07-31T05:15:00', 'local')).toThrow(/UTC offset/);
    expect(() => parseDemoNow('not-a-date', 'local')).toThrow(/UTC offset/);
    expect(() => parseDemoNow('2026-07-31T05:15:00Z', 'production')).toThrow(/local/);
  });
});
