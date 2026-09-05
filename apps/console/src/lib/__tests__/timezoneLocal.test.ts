import { describe, expect, it } from 'vitest';
import { localInputToUtc, zonedLocalInput } from '../timezoneLocal';

describe('timezone local conversion', () => {
  it('converts Taipei wall time independent of browser timezone', () => {
    expect(localInputToUtc('2026-01-15T09:30', 'Asia/Taipei')).toBe('2026-01-15T01:30:00.000Z');
    expect(zonedLocalInput('2026-01-15T01:30:00.000Z', 'Asia/Taipei')).toBe('2026-01-15T09:30');
  });
  it('rejects New York spring-forward gaps and chooses earlier fall-back instant', () => {
    expect(localInputToUtc('2026-03-08T02:30', 'America/New_York')).toBeNull();
    expect(localInputToUtc('2026-11-01T01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
  });
  it('handles Lord Howe half-hour transition', () => {
    expect(localInputToUtc('2026-10-04T02:15', 'Australia/Lord_Howe')).toBeNull();
    expect(localInputToUtc('2026-04-05T01:45', 'Australia/Lord_Howe')).toBe('2026-04-04T14:45:00.000Z');
  });
});
