import { describe, expect, it } from 'vitest';
import { formatDateTime } from '../formatDateTime';

const ISO = '2026-08-08T12:30:00Z'; // 14:30 SAST (UTC+2)
const ZONE = 'Africa/Johannesburg';

describe('formatDateTime', () => {
  it('renders clock without a zone', () => {
    expect(formatDateTime(ISO, 'clock', ZONE)).toBe('2:30 PM');
  });

  it('renders clock_with_zone with an explicit abbreviation', () => {
    expect(formatDateTime(ISO, 'clock_with_zone', ZONE)).toMatch(/2:30 PM .*(SAST|GMT\+2)/);
  });

  it('renders date without a year', () => {
    expect(formatDateTime(ISO, 'date', ZONE)).toBe('Sat, Aug 8');
  });

  it('renders date_with_year', () => {
    expect(formatDateTime(ISO, 'date_with_year', ZONE)).toBe('Sat, Aug 8, 2026');
  });

  it('renders datetime as date + clock, no zone', () => {
    expect(formatDateTime(ISO, 'datetime', ZONE)).toBe('Sat, Aug 8, 2:30 PM');
  });

  it('renders deadline as date_with_year + clock_with_zone', () => {
    const out = formatDateTime(ISO, 'deadline', ZONE);
    expect(out).toContain('2026');
    expect(out).toMatch(/2:30 PM/);
  });

  it('renders diagnostic as the raw ISO value', () => {
    expect(formatDateTime(ISO, 'diagnostic', ZONE)).toBe(ISO);
  });

  it('falls back to UTC and still labels the zone when timeZone is omitted', () => {
    expect(formatDateTime(ISO, 'clock_with_zone')).toMatch(/UTC|GMT/);
  });

  it('omits missing timestamps rather than inventing a placeholder', () => {
    expect(formatDateTime(null, 'datetime', ZONE)).toBeNull();
    expect(formatDateTime(undefined, 'clock', ZONE)).toBeNull();
  });

  it('omits unparseable timestamps', () => {
    expect(formatDateTime('not-a-date', 'datetime', ZONE)).toBeNull();
  });
});
