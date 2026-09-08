import { describe, expect, it } from 'vitest';
import { parseDemoNow } from '../app/lib/demoClock.server';

describe('public SSR demo clock configuration', () => {
  it('normalizes offsets to the same instant', () => {
    expect(parseDemoNow('2026-07-31T13:15:00+08:00', 'local')).toBe(
      Date.parse('2026-07-31T05:15:00Z'),
    );
  });

  it('fails closed for invalid, naive, and cloud values', () => {
    expect(() => parseDemoNow('2026-07-31T05:15:00', 'local')).toThrow(/UTC offset/);
    expect(() => parseDemoNow('nope', 'local')).toThrow(/UTC offset/);
    expect(() => parseDemoNow('2026-07-31T05:15:00Z', 'cloud')).toThrow(/local/);
  });
});
