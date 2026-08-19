import { describe, it, expect } from 'vitest';
import {
  allowedToBlocked,
  blockedToAllowed,
  formatWindowSummary,
  minutesToTime,
  normalizeWindows,
  timeToMinutes,
} from '../availabilityWindows';
import type { AvailabilityWindow } from '../../../api/dto';

const DAY_START = '09:00';
const DAY_END = '17:00';

const w = (start: string, end: string): AvailabilityWindow => ({ start, end });

describe('timeToMinutes / minutesToTime', () => {
  it('round-trip and zero-padding', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(timeToMinutes('23:59'))).toBe('23:59');
  });
});

describe('normalizeWindows', () => {
  it('sorts, merges overlapping windows and clamps to day bounds', () => {
    expect(
      normalizeWindows(
        [w('12:00', '13:00'), w('08:00', '10:00'), w('09:30', '11:00')],
        DAY_START,
        DAY_END,
      ),
    ).toEqual([w('09:00', '11:00'), w('12:00', '13:00')]);
  });

  it('merges back-to-back adjacent windows', () => {
    expect(
      normalizeWindows([w('10:00', '11:00'), w('11:00', '12:00')], DAY_START, DAY_END),
    ).toEqual([w('10:00', '12:00')]);
  });

  it('drops zero- and negative-length windows', () => {
    expect(
      normalizeWindows([w('10:00', '10:00'), w('12:00', '11:00')], DAY_START, DAY_END),
    ).toEqual([]);
  });

  it('drops windows entirely outside the day', () => {
    expect(
      normalizeWindows([w('06:00', '08:00'), w('18:00', '20:00')], DAY_START, DAY_END),
    ).toEqual([]);
  });
});

describe('blockedToAllowed', () => {
  it('[] blocked → [] allowed (all day, NOT a full-day window)', () => {
    expect(blockedToAllowed([], DAY_START, DAY_END)).toEqual([]);
  });

  it('blocked entirely outside the day → [] allowed (all day)', () => {
    expect(blockedToAllowed([w('06:00', '08:00')], DAY_START, DAY_END)).toEqual([]);
  });

  it('one mid-day blocked period → two allowed windows around it', () => {
    expect(blockedToAllowed([w('12:00', '13:00')], DAY_START, DAY_END)).toEqual([
      w('09:00', '12:00'),
      w('13:00', '17:00'),
    ]);
  });

  it('blocked at day start → single allowed tail', () => {
    expect(blockedToAllowed([w('09:00', '10:00')], DAY_START, DAY_END)).toEqual([
      w('10:00', '17:00'),
    ]);
  });

  it('overlapping blocked periods merge before inversion', () => {
    expect(
      blockedToAllowed(
        [w('10:00', '12:00'), w('11:00', '13:00')],
        DAY_START,
        DAY_END,
      ),
    ).toEqual([w('09:00', '10:00'), w('13:00', '17:00')]);
  });

  it('blocked spanning a day bound clamps to the day', () => {
    expect(blockedToAllowed([w('07:00', '10:00')], DAY_START, DAY_END)).toEqual([
      w('10:00', '17:00'),
    ]);
    expect(blockedToAllowed([w('16:00', '19:00')], DAY_START, DAY_END)).toEqual([
      w('09:00', '16:00'),
    ]);
  });

  it('blocked covering the whole day → the zero-width guard, never []', () => {
    expect(blockedToAllowed([w('08:00', '18:00')], DAY_START, DAY_END)).toEqual([
      w('09:00', '09:00'),
    ]);
    // Also when assembled from pieces.
    expect(
      blockedToAllowed([w('09:00', '13:00'), w('13:00', '17:00')], DAY_START, DAY_END),
    ).toEqual([w('09:00', '09:00')]);
  });
});

describe('allowedToBlocked', () => {
  it('[] allowed → [] blocked (all day available)', () => {
    expect(allowedToBlocked([], DAY_START, DAY_END)).toEqual([]);
  });

  it('allowed covering the whole day → [] blocked', () => {
    expect(allowedToBlocked([w('09:00', '17:00')], DAY_START, DAY_END)).toEqual([]);
    expect(allowedToBlocked([w('08:00', '18:00')], DAY_START, DAY_END)).toEqual([]);
  });

  it('partial allowed windows → the blocked complement', () => {
    expect(
      allowedToBlocked(
        [w('09:00', '12:00'), w('13:00', '17:00')],
        DAY_START,
        DAY_END,
      ),
    ).toEqual([w('12:00', '13:00')]);
  });

  it('the zero-width guard → whole day blocked', () => {
    expect(allowedToBlocked([w('09:00', '09:00')], DAY_START, DAY_END)).toEqual([
      w('09:00', '17:00'),
    ]);
  });

  it('non-empty allowed entirely outside the day → whole day blocked', () => {
    expect(allowedToBlocked([w('06:00', '07:00')], DAY_START, DAY_END)).toEqual([
      w('09:00', '17:00'),
    ]);
  });
});

describe('round-trip property: allowedToBlocked(blockedToAllowed(b)) === normalize(b)', () => {
  const cases: AvailabilityWindow[][] = [
    [],
    [w('12:00', '13:00')],
    [w('09:00', '10:00')],
    [w('16:00', '17:00')],
    [w('10:00', '12:00'), w('11:00', '13:00')], // overlap → merges
    [w('10:00', '11:00'), w('11:00', '12:00')], // adjacent → merges
    [w('07:00', '10:00'), w('16:00', '19:00')], // clamps at both bounds
    [w('08:00', '18:00')], // full-day-blocked (via the guard)
    [w('06:00', '08:00')], // entirely outside the day → normalizes to []
  ];
  it.each(cases.map((c, i) => [i, c] as const))('case %#', (_i, b) => {
    const roundTripped = allowedToBlocked(
      blockedToAllowed(b, DAY_START, DAY_END),
      DAY_START,
      DAY_END,
    );
    expect(roundTripped).toEqual(normalizeWindows(b, DAY_START, DAY_END));
  });
});

describe('formatWindowSummary', () => {
  it('[] reads "All day"', () => {
    expect(formatWindowSummary([])).toBe('All day');
  });
  it('joins windows with an en dash and commas', () => {
    expect(formatWindowSummary([w('09:00', '10:30'), w('12:00', '13:00')])).toBe(
      '09:00 – 10:30, 12:00 – 13:00',
    );
  });
});
