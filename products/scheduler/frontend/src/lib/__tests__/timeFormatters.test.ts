/**
 * Safety-net characterization tests for timeFormatters.ts.
 *
 * Covers every exported function:
 *   - formatIsoClock  — null/undefined/empty sentinel, valid ISO, TZ=America/Los_Angeles pin
 *   - formatDuration  — boundary math: 0m, sub-hour, exact-hour, multi-hour
 *   - formatElapsed   — null paths, sub-minute, sub-hour, ≥1h, ≥24h; uses fake timers
 *
 * TZ is already pinned to America/Los_Angeles by vitest.config.ts so date-formatting
 * assertions use that fixed offset rather than stubbing the env again here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatIsoClock, formatDuration, formatElapsed } from '../timeFormatters';

// ── formatIsoClock ────────────────────────────────────────────────────────────

describe('formatIsoClock', () => {
  it('returns em-dash sentinel for null', () => {
    expect(formatIsoClock(null)).toBe('—');
  });

  it('returns em-dash sentinel for undefined', () => {
    expect(formatIsoClock(undefined)).toBe('—');
  });

  it('returns em-dash sentinel for empty string', () => {
    expect(formatIsoClock('')).toBe('—');
  });

  it('returns em-dash sentinel for an unparseable string', () => {
    expect(formatIsoClock('not-a-date')).toBe('—');
  });

  it('returns em-dash sentinel for a plausible-but-invalid ISO string', () => {
    expect(formatIsoClock('2024-13-99T99:99:99Z')).toBe('—');
  });

  it('returns a non-sentinel string for a valid ISO timestamp', () => {
    const result = formatIsoClock('2024-06-15T18:00:00.000Z');
    expect(result).not.toBe('—');
    expect(result).not.toContain('Invalid');
    // toLocaleTimeString output always contains a colon between h and mm
    expect(result).toMatch(/:/);
  });

  it('renders local clock in LA timezone (not UTC) — timezone off-by-one guard', () => {
    // 2024-01-15T20:00:00Z is exactly 12:00 PM PST (UTC-8, January).
    // Under UTC the hour portion would be 20 (or 8 PM).
    // With TZ=America/Los_Angeles the output must contain "12:00".
    const result = formatIsoClock('2024-01-15T20:00:00.000Z');
    expect(result).not.toBe('—');
    expect(result).toMatch(/12[: ]00/); // "12:00" or "12 00" per locale narrow-space
  });

  it('correctly formats a PM hour in LA (UTC-7 during DST)', () => {
    // 2024-07-15T22:30:00Z = 3:30 PM PDT (UTC-7)
    const result = formatIsoClock('2024-07-15T22:30:00.000Z');
    expect(result).not.toBe('—');
    expect(result).toMatch(/3[: ]30|15[: ]30/); // either 12h or 24h locale
  });
});

// ── formatDuration ────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns 0m when both args are null', () => {
    expect(formatDuration(null, null)).toBe('0m');
  });

  it('returns 0m when both args are undefined', () => {
    expect(formatDuration(undefined, undefined)).toBe('0m');
  });

  it('returns 0m when the first arg is null', () => {
    expect(formatDuration(null, '2024-01-15T10:30:00.000Z')).toBe('0m');
  });

  it('returns 0m when the second arg is null', () => {
    expect(formatDuration('2024-01-15T10:00:00.000Z', null)).toBe('0m');
  });

  it('returns 0m when either arg is an unparseable string', () => {
    expect(formatDuration('garbage', '2024-01-15T10:30:00.000Z')).toBe('0m');
    expect(formatDuration('2024-01-15T10:00:00.000Z', 'garbage')).toBe('0m');
  });

  it('returns 0m for identical timestamps (zero gap)', () => {
    const ts = '2024-01-15T10:00:00.000Z';
    expect(formatDuration(ts, ts)).toBe('0m');
  });

  it('returns 0m when b is before a (negative gap clamped to 0)', () => {
    expect(
      formatDuration('2024-01-15T10:30:00.000Z', '2024-01-15T10:00:00.000Z'),
    ).toBe('0m');
  });

  it('returns 1m for a gap that rounds up to 1 minute (≥ 30 s)', () => {
    // exactly 30 s — Math.round(0.5) === 1 in JS
    expect(
      formatDuration('2024-01-15T10:00:00.000Z', '2024-01-15T10:00:30.000Z'),
    ).toBe('1m');
  });

  it('returns 0m for a gap that rounds down to 0 minutes (< 30 s)', () => {
    expect(
      formatDuration('2024-01-15T10:00:00.000Z', '2024-01-15T10:00:29.000Z'),
    ).toBe('0m');
  });

  it('returns 30m for a 30-minute gap', () => {
    expect(
      formatDuration('2024-01-15T10:00:00.000Z', '2024-01-15T10:30:00.000Z'),
    ).toBe('30m');
  });

  it('returns 59m for a 59-minute gap (still sub-hour)', () => {
    expect(
      formatDuration('2024-01-15T10:00:00.000Z', '2024-01-15T10:59:00.000Z'),
    ).toBe('59m');
  });

  it('returns 1h for exactly 60 minutes (no trailing "0m")', () => {
    expect(
      formatDuration('2024-01-15T10:00:00.000Z', '2024-01-15T11:00:00.000Z'),
    ).toBe('1h');
  });

  it('returns 1h 30m for 90 minutes', () => {
    expect(
      formatDuration('2024-01-15T10:00:00.000Z', '2024-01-15T11:30:00.000Z'),
    ).toBe('1h 30m');
  });

  it('returns 2h for exactly 120 minutes (no trailing "0m")', () => {
    expect(
      formatDuration('2024-01-15T10:00:00.000Z', '2024-01-15T12:00:00.000Z'),
    ).toBe('2h');
  });

  it('returns 2h 15m for 135 minutes', () => {
    expect(
      formatDuration('2024-01-15T10:00:00.000Z', '2024-01-15T12:15:00.000Z'),
    ).toBe('2h 15m');
  });

  it('handles a cross-day gap (overnight) correctly', () => {
    // 22:00 → 02:00 next day = 4 hours
    expect(
      formatDuration('2024-01-15T22:00:00.000Z', '2024-01-16T02:00:00.000Z'),
    ).toBe('4h');
  });
});

// ── formatElapsed ─────────────────────────────────────────────────────────────

describe('formatElapsed', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  // ---- null / sentinel paths ------------------------------------------------

  it('returns null for null', () => {
    expect(formatElapsed(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(formatElapsed(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(formatElapsed('')).toBeNull();
  });

  it('returns null for an unparseable string', () => {
    expect(formatElapsed('not-a-timestamp')).toBeNull();
  });

  // ---- clamping & zero edge ------------------------------------------------

  it('returns 0:00 when start is in the future (elapsed clamped to 0)', () => {
    vi.setSystemTime(new Date('2024-01-15T09:00:00.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('0:00');
  });

  it('returns 0:00 when start equals now (zero elapsed)', () => {
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('0:00');
  });

  // ---- M:SS format (< 1 hour) ----------------------------------------------

  it('returns M:SS for a sub-minute elapsed (0:SS)', () => {
    vi.setSystemTime(new Date('2024-01-15T10:00:45.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('0:45');
  });

  it('returns M:SS for 5m 30s elapsed', () => {
    vi.setSystemTime(new Date('2024-01-15T10:05:30.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('5:30');
  });

  it('returns M:SS with zero-padded seconds for whole-minute elapsed', () => {
    vi.setSystemTime(new Date('2024-01-15T10:15:00.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('15:00');
  });

  it('returns 59:59 for 3599 seconds (boundary just below 1 hour)', () => {
    vi.setSystemTime(new Date('2024-01-15T10:59:59.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('59:59');
  });

  // ---- H:MM:SS format (1 h ≤ elapsed < 24 h) ------------------------------

  it('returns H:MM:SS for exactly 1 hour elapsed', () => {
    vi.setSystemTime(new Date('2024-01-15T11:00:00.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('1:00:00');
  });

  it('returns H:MM:SS for 2h 34m 56s elapsed', () => {
    vi.setSystemTime(new Date('2024-01-15T12:34:56.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('2:34:56');
  });

  it('returns H:MM:SS with zero-padded minutes and seconds', () => {
    // 1h 1m 1s
    vi.setSystemTime(new Date('2024-01-15T11:01:01.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('1:01:01');
  });

  // ---- Xd Hh format (≥ 24 h) ----------------------------------------------

  it('returns Xd Hh for exactly 2 days elapsed', () => {
    vi.setSystemTime(new Date('2024-01-17T10:00:00.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('2d 0h');
  });

  it('returns Xd Hh with correct remaining hours for 1d 5h 30m', () => {
    // 1 day + 5.5 hours = 1d 5h (truncated, not rounded)
    vi.setSystemTime(new Date('2024-01-16T15:30:00.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('1d 5h');
  });

  it('returns 1d 0h at the exact 24-hour boundary', () => {
    vi.setSystemTime(new Date('2024-01-16T10:00:00.000Z'));
    expect(formatElapsed('2024-01-15T10:00:00.000Z')).toBe('1d 0h');
  });
});
