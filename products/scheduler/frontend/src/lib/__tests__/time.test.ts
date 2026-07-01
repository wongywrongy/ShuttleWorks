/**
 * Safety-net characterization tests for src/lib/time.ts.
 *
 * Covers every exported function. Goal: lock in current behavior so the
 * module can be refactored safely. The Vitest env pins TZ=America/Los_Angeles
 * (see vitest.config.ts), exploited in local-time formatting tests.
 *
 * Two helpers that ARE intentionally private (isOvernightSchedule,
 * getAdjustedEndMinutes) are exercised indirectly through calculateTotalSlots,
 * timeToSlot, and msToSlot.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  timeToMinutes,
  minutesToTime,
  isValidTime,
  getCurrentTime,
  calculateTotalSlots,
  slotToTime,
  formatSlotTime,
  formatSlotRange,
  timeToSlot,
  getCurrentSlot,
  isMatchInProgress,
  getUpcomingMatches,
  getRecentlyFinished,
  parseMatchStartMs,
  msToSlot,
  getRenderSlot,
  getStatusColor,
} from '../time';
import type { TournamentConfig, ScheduleAssignment, MatchStateDTO } from '../../api/dto';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Standard daytime schedule: 08:00-18:00, 15-min slots. */
function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    intervalMinutes: 15,
    dayStart: '08:00',
    dayEnd: '18:00',
    breaks: [],
    courtCount: 2,
    defaultRestMinutes: 15,
    freezeHorizonSlots: 2,
    ...overrides,
  };
}

/** Overnight schedule: 22:00-06:00, 30-min slots. */
const overnightConfig = makeConfig({
  intervalMinutes: 30,
  dayStart: '22:00',
  dayEnd: '06:00',
});

function makeAssignment(overrides: Partial<ScheduleAssignment> = {}): ScheduleAssignment {
  return {
    matchId: 'm1',
    slotId: 0,
    courtId: 1,
    durationSlots: 1,
    ...overrides,
  };
}

function makeState(overrides: Partial<MatchStateDTO> = {}): MatchStateDTO {
  return {
    matchId: 'm1',
    status: 'scheduled',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// timeToMinutes
// ---------------------------------------------------------------------------

describe('timeToMinutes', () => {
  it('converts midnight to 0', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });
  it('converts a standard time', () => {
    expect(timeToMinutes('08:00')).toBe(480);
  });
  it('converts a time with non-zero minutes', () => {
    expect(timeToMinutes('12:30')).toBe(750);
  });
  it('converts the last minute of the day', () => {
    expect(timeToMinutes('23:59')).toBe(1439);
  });
  it('handles times past noon', () => {
    expect(timeToMinutes('22:00')).toBe(1320);
  });
});

// ---------------------------------------------------------------------------
// minutesToTime
// ---------------------------------------------------------------------------

describe('minutesToTime', () => {
  it('converts 0 to midnight', () => {
    expect(minutesToTime(0)).toBe('00:00');
  });
  it('converts 480 to 08:00', () => {
    expect(minutesToTime(480)).toBe('08:00');
  });
  it('converts 750 to 12:30', () => {
    expect(minutesToTime(750)).toBe('12:30');
  });
  it('converts the last minute of the day', () => {
    expect(minutesToTime(1439)).toBe('23:59');
  });
  it('wraps one full day (1440) back to midnight', () => {
    expect(minutesToTime(1440)).toBe('00:00');
  });
  it('wraps values beyond one day', () => {
    expect(minutesToTime(1441)).toBe('00:01');
  });
  it('handles overflow values produced by overnight slot math (e.g. 1560 → 02:00)', () => {
    // 1560 = 1440 + 120 → 02:00
    expect(minutesToTime(1560)).toBe('02:00');
  });
  it('handles negative minutes via double-modulo (−1 → 23:59)', () => {
    expect(minutesToTime(-1)).toBe('23:59');
  });
  it('pads single-digit hours and minutes with zeros', () => {
    expect(minutesToTime(5)).toBe('00:05');
    expect(minutesToTime(60 + 1)).toBe('01:01');
  });
});

// ---------------------------------------------------------------------------
// isValidTime
// ---------------------------------------------------------------------------

describe('isValidTime', () => {
  it('accepts valid times throughout the day', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('08:00')).toBe(true);
    expect(isValidTime('12:30')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('20:45')).toBe(true);
  });
  it('rejects 24:00 (out of range)', () => {
    expect(isValidTime('24:00')).toBe(false);
  });
  it('rejects hours above 23', () => {
    expect(isValidTime('25:00')).toBe(false);
  });
  it('rejects single-digit hours missing leading zero', () => {
    expect(isValidTime('8:00')).toBe(false);
  });
  it('rejects 60 in the minutes field', () => {
    expect(isValidTime('08:60')).toBe(false);
  });
  it('rejects the empty string', () => {
    expect(isValidTime('')).toBe(false);
  });
  it('rejects non-time strings', () => {
    expect(isValidTime('abc')).toBe(false);
    expect(isValidTime('noon')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCurrentTime  (depends on system clock → fake timers)
// ---------------------------------------------------------------------------

describe('getCurrentTime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns a string matching the pinned TZ local time (09:05 LA)', () => {
    // new Date(year, monthIndex, day, h, m) constructs in LOCAL time.
    vi.setSystemTime(new Date(2026, 5, 30, 9, 5)); // June 30, 2026, 09:05 LA
    expect(getCurrentTime()).toBe('09:05');
  });

  it('returns a string that passes isValidTime', () => {
    vi.setSystemTime(new Date(2026, 5, 30, 14, 37));
    expect(isValidTime(getCurrentTime())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateTotalSlots  (exercises getAdjustedEndMinutes internally)
// ---------------------------------------------------------------------------

describe('calculateTotalSlots', () => {
  it('computes slots for a normal daytime schedule (08:00-18:00, 15 min)', () => {
    // (1080 - 480) / 15 = 40
    expect(calculateTotalSlots(makeConfig())).toBe(40);
  });

  it('computes slots when the interval divides evenly', () => {
    // 08:00-09:00, 15 min → 4 slots
    expect(calculateTotalSlots(makeConfig({ dayEnd: '09:00' }))).toBe(4);
  });

  it('rounds up via Math.ceil when duration is not a whole multiple', () => {
    // 08:00-09:10 = 70 min, 15 min → ceil(70/15) = ceil(4.67) = 5
    expect(calculateTotalSlots(makeConfig({ dayEnd: '09:10' }))).toBe(5);
  });

  it('handles overnight schedules (22:00-06:00 crosses midnight)', () => {
    // start=1320, end=360 → adjusted end=1800, duration=480 min → 480/30=16
    expect(calculateTotalSlots(overnightConfig)).toBe(16);
  });

  it('midnight boundary (22:00-00:00) counts correctly', () => {
    // 22:00 = 1320, 00:00 = 0 → adjusted 0+1440=1440, (1440-1320)/30=4
    const cfg = makeConfig({ dayStart: '22:00', dayEnd: '00:00', intervalMinutes: 30 });
    expect(calculateTotalSlots(cfg)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// slotToTime / formatSlotTime (alias)
// ---------------------------------------------------------------------------

describe('slotToTime', () => {
  it('slot 0 returns the dayStart time', () => {
    expect(slotToTime(0, makeConfig())).toBe('08:00');
  });

  it('advances by intervalMinutes per slot', () => {
    expect(slotToTime(1, makeConfig())).toBe('08:15');
    expect(slotToTime(4, makeConfig())).toBe('09:00');
  });

  it('slot at total-slots boundary equals dayEnd', () => {
    // 40 slots × 15 min = 600 min; 480 + 600 = 1080 → 18:00
    expect(slotToTime(40, makeConfig())).toBe('18:00');
  });

  it('overnight: slot 0 returns dayStart (22:00)', () => {
    expect(slotToTime(0, overnightConfig)).toBe('22:00');
  });

  it('overnight: slot 1 is 22:30', () => {
    expect(slotToTime(1, overnightConfig)).toBe('22:30');
  });

  it('overnight: slot 8 wraps past midnight to 02:00', () => {
    // 1320 + 8×30 = 1320 + 240 = 1560 → minutesToTime(1560) = 02:00
    expect(slotToTime(8, overnightConfig)).toBe('02:00');
  });

  it('overnight: last slot (16) equals dayEnd (06:00)', () => {
    // 1320 + 16×30 = 1800 → minutesToTime(1800) = minutesToTime(360) = 06:00
    expect(slotToTime(16, overnightConfig)).toBe('06:00');
  });
});

describe('formatSlotTime (alias)', () => {
  it('is identical to slotToTime', () => {
    expect(formatSlotTime(3, makeConfig())).toBe(slotToTime(3, makeConfig()));
  });
});

// ---------------------------------------------------------------------------
// formatSlotRange
// ---------------------------------------------------------------------------

describe('formatSlotRange', () => {
  it('formats a 1-slot range as "start - start+1slot"', () => {
    // slot 0, duration 1 → "08:00 - 08:15"
    expect(formatSlotRange(0, 1, makeConfig())).toBe('08:00 - 08:15');
  });

  it('formats a multi-slot range', () => {
    // slot 0, duration 4 → "08:00 - 09:00"
    expect(formatSlotRange(0, 4, makeConfig())).toBe('08:00 - 09:00');
  });

  it('works for overnight range that wraps midnight', () => {
    // slot 7 = 22:00 + 7×30min = 22:00 + 3h30m = 01:30 (next day)
    // slot 9 = 22:00 + 9×30min = 22:00 + 4h30m = 02:30
    expect(formatSlotRange(7, 2, overnightConfig)).toBe('01:30 - 02:30');
  });
});

// ---------------------------------------------------------------------------
// timeToSlot  (exercises isOvernightSchedule branch internally)
// ---------------------------------------------------------------------------

describe('timeToSlot', () => {
  it('converts dayStart itself to slot 0', () => {
    expect(timeToSlot('08:00', makeConfig())).toBe(0);
  });

  it('converts a mid-day time to the correct slot', () => {
    // 09:00 = 540 min; (540-480)/15 = 4
    expect(timeToSlot('09:00', makeConfig())).toBe(4);
  });

  it('converts dayEnd to the total-slots index', () => {
    expect(timeToSlot('18:00', makeConfig())).toBe(40);
  });

  it('overnight: dayStart maps to slot 0', () => {
    expect(timeToSlot('22:00', overnightConfig)).toBe(0);
  });

  it('overnight: 22:30 maps to slot 1', () => {
    expect(timeToSlot('22:30', overnightConfig)).toBe(1);
  });

  it('overnight: time after midnight (02:00) maps to slot 8', () => {
    // t=120, end(360) <= start(1320) && 120 < 1320 → t+=1440=1560
    // (1560-1320)/30 = 8
    expect(timeToSlot('02:00', overnightConfig)).toBe(8);
  });

  it('overnight: dayEnd (06:00) maps to total slots (16)', () => {
    // t=360 → t+=1440=1800; (1800-1320)/30 = 16
    expect(timeToSlot('06:00', overnightConfig)).toBe(16);
  });

  it('round-trips: slotToTime → timeToSlot returns the original slot', () => {
    const cfg = makeConfig();
    for (const slot of [0, 1, 10, 39]) {
      expect(timeToSlot(slotToTime(slot, cfg), cfg)).toBe(slot);
    }
  });

  it('overnight round-trips: slotToTime → timeToSlot', () => {
    for (const slot of [0, 1, 7, 8, 15, 16]) {
      expect(timeToSlot(slotToTime(slot, overnightConfig), overnightConfig)).toBe(slot);
    }
  });
});

// ---------------------------------------------------------------------------
// getCurrentSlot  (depends on system clock → fake timers)
// ---------------------------------------------------------------------------

describe('getCurrentSlot', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns 0 for null config', () => {
    expect(getCurrentSlot(null)).toBe(0);
  });

  it('returns correct slot for a mid-day time in a normal schedule', () => {
    // 09:30 LA → mins=570; (570-480)/15 = 6
    vi.setSystemTime(new Date(2026, 5, 30, 9, 30));
    expect(getCurrentSlot(makeConfig())).toBe(6);
  });

  it('clamps to 0 when local time is before dayStart', () => {
    // 07:00 LA → mins=420; (420-480)/15 = -4 → clamped to 0
    vi.setSystemTime(new Date(2026, 5, 30, 7, 0));
    expect(getCurrentSlot(makeConfig())).toBe(0);
  });

  it('overnight: post-midnight local time gets day-offset applied', () => {
    // 02:00 LA → mins=120; overnight: 120 < 1320 → mins+=1440=1560; (1560-1320)/30=8
    vi.setSystemTime(new Date(2026, 5, 30, 2, 0));
    expect(getCurrentSlot(overnightConfig)).toBe(8);
  });

  it('overnight: evening time before midnight stays in same-day slots', () => {
    // 22:30 LA → mins=1350; 1350 >= 1320 (dayStart), no offset; (1350-1320)/30=1
    vi.setSystemTime(new Date(2026, 5, 30, 22, 30));
    expect(getCurrentSlot(overnightConfig)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// isMatchInProgress
// ---------------------------------------------------------------------------

describe('isMatchInProgress', () => {
  // assignment: slotId=2, durationSlots=2 → occupies slots [2, 3]
  const a = makeAssignment({ slotId: 2, durationSlots: 2 });

  it('"started" status always returns true regardless of current slot', () => {
    expect(isMatchInProgress(a, makeState({ status: 'started' }), 0)).toBe(true);
    expect(isMatchInProgress(a, makeState({ status: 'started' }), 99)).toBe(true);
  });

  it('"finished" status always returns false', () => {
    expect(isMatchInProgress(a, makeState({ status: 'finished' }), 2)).toBe(false);
  });

  it('"called" status always returns false', () => {
    expect(isMatchInProgress(a, makeState({ status: 'called' }), 2)).toBe(false);
  });

  it('"scheduled": true when currentSlot is within [slotId, slotId+duration)', () => {
    expect(isMatchInProgress(a, makeState({ status: 'scheduled' }), 2)).toBe(true);
    expect(isMatchInProgress(a, makeState({ status: 'scheduled' }), 3)).toBe(true);
  });

  it('"scheduled": false when currentSlot is before slotId', () => {
    expect(isMatchInProgress(a, makeState({ status: 'scheduled' }), 1)).toBe(false);
  });

  it('"scheduled": false when currentSlot equals slotId + durationSlots (past end)', () => {
    expect(isMatchInProgress(a, makeState({ status: 'scheduled' }), 4)).toBe(false);
  });

  it('undefined matchState falls through to slot-range comparison', () => {
    expect(isMatchInProgress(a, undefined, 2)).toBe(true);
    expect(isMatchInProgress(a, undefined, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getUpcomingMatches
// ---------------------------------------------------------------------------

describe('getUpcomingMatches', () => {
  const a0 = makeAssignment({ matchId: 'm0', slotId: 0 });
  const a5 = makeAssignment({ matchId: 'm5', slotId: 5 });
  const a10 = makeAssignment({ matchId: 'm10', slotId: 10 });
  const schedule = { assignments: [a0, a5, a10] };

  it('returns [] for null schedule', () => {
    expect(getUpcomingMatches(null, 0)).toEqual([]);
  });

  it('includes all assignments with slotId >= currentSlot, sorted asc', () => {
    const result = getUpcomingMatches(schedule, 5);
    expect(result.map((r) => r.matchId)).toEqual(['m5', 'm10']);
  });

  it('excludes assignments with slotId before currentSlot', () => {
    const result = getUpcomingMatches(schedule, 6);
    expect(result.map((r) => r.matchId)).toEqual(['m10']);
  });

  it('defaults to limit 5 and respects a custom limit', () => {
    const many = {
      assignments: Array.from({ length: 10 }, (_, i) =>
        makeAssignment({ matchId: `m${i}`, slotId: i }),
      ),
    };
    expect(getUpcomingMatches(many, 0)).toHaveLength(5);
    expect(getUpcomingMatches(many, 0, 3)).toHaveLength(3);
  });

  it('returns all assignments when currentSlot is 0', () => {
    expect(getUpcomingMatches(schedule, 0)).toHaveLength(3);
  });

  it('returns [] when all assignments are before currentSlot', () => {
    expect(getUpcomingMatches(schedule, 11)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getRecentlyFinished
// ---------------------------------------------------------------------------

describe('getRecentlyFinished', () => {
  it('returns [] for empty matchStates', () => {
    expect(getRecentlyFinished({})).toEqual([]);
  });

  it('filters out non-finished matches', () => {
    const states: Record<string, MatchStateDTO> = {
      s: makeState({ matchId: 's', status: 'scheduled' }),
      f: makeState({ matchId: 'f', status: 'finished', updatedAt: '2026-01-01T10:00:00Z' }),
    };
    const result = getRecentlyFinished(states);
    expect(result).toHaveLength(1);
    expect(result[0].matchId).toBe('f');
  });

  it('sorts finished matches by updatedAt descending (most recent first)', () => {
    const states: Record<string, MatchStateDTO> = {
      early: makeState({ matchId: 'early', status: 'finished', updatedAt: '2026-01-01T09:00:00Z' }),
      late: makeState({ matchId: 'late', status: 'finished', updatedAt: '2026-01-01T11:00:00Z' }),
      mid: makeState({ matchId: 'mid', status: 'finished', updatedAt: '2026-01-01T10:00:00Z' }),
    };
    const result = getRecentlyFinished(states);
    expect(result.map((r) => r.matchId)).toEqual(['late', 'mid', 'early']);
  });

  it('respects the limit parameter', () => {
    const states: Record<string, MatchStateDTO> = {};
    for (let i = 0; i < 7; i++) {
      states[`m${i}`] = makeState({
        matchId: `m${i}`,
        status: 'finished',
        updatedAt: `2026-01-0${i + 1}T00:00:00Z`,
      });
    }
    expect(getRecentlyFinished(states, 3)).toHaveLength(3);
  });

  it('treats missing updatedAt as epoch 0 (sorts last among finished)', () => {
    const states: Record<string, MatchStateDTO> = {
      timestamped: makeState({ matchId: 'ts', status: 'finished', updatedAt: '2026-01-01T10:00:00Z' }),
      noTimestamp: makeState({ matchId: 'nt', status: 'finished' }), // no updatedAt
    };
    const result = getRecentlyFinished(states);
    expect(result[0].matchId).toBe('ts');
    expect(result[1].matchId).toBe('nt');
  });
});

// ---------------------------------------------------------------------------
// parseMatchStartMs
// ---------------------------------------------------------------------------

describe('parseMatchStartMs', () => {
  it('returns null for null input', () => {
    expect(parseMatchStartMs(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseMatchStartMs(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseMatchStartMs('')).toBeNull();
  });

  it('parses a valid ISO-8601 UTC string and returns epoch ms', () => {
    const ms = parseMatchStartMs('2026-06-30T15:00:00Z');
    expect(ms).not.toBeNull();
    expect(ms).toBe(Date.parse('2026-06-30T15:00:00Z'));
  });

  it('parses a valid ISO-8601 string with sub-second precision', () => {
    const ms = parseMatchStartMs('2026-06-30T15:00:00.000Z');
    expect(ms).not.toBeNull();
    expect(typeof ms).toBe('number');
  });

  it('returns null for a completely invalid string', () => {
    expect(parseMatchStartMs('not-a-time')).toBeNull();
  });

  it('tolerates legacy HH:MM format: returns a finite ms and emits console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ms = parseMatchStartMs('14:30');
      expect(ms).not.toBeNull();
      expect(Number.isFinite(ms!)).toBe(true);
      // console.warn is called as: warn(message, value) — 2 args
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[parseMatchStartMs]'),
        '14:30',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('legacy HH:MM out of range (e.g. "25:00") returns null', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(parseMatchStartMs('25:00')).toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// msToSlot
// ---------------------------------------------------------------------------

describe('msToSlot', () => {
  it('returns slot 0 for the dayStart instant in local time', () => {
    // Construct 08:00 LA local time using Date's local constructor
    const ms = new Date(2026, 5, 30, 8, 0).getTime();
    expect(msToSlot(ms, makeConfig())).toBe(0);
  });

  it('returns the correct slot for a mid-day time', () => {
    // 09:15 LA → minutesOfDay=555; (555-480)/15=5
    const ms = new Date(2026, 5, 30, 9, 15).getTime();
    expect(msToSlot(ms, makeConfig())).toBe(5);
  });

  it('clamps to 0 when the timestamp is before dayStart', () => {
    // 07:00 LA → minutesOfDay=420; (420-480)/15=-4 → clamped to 0
    const ms = new Date(2026, 5, 30, 7, 0).getTime();
    expect(msToSlot(ms, makeConfig())).toBe(0);
  });

  it('overnight: timestamp before midnight after dayStart → no offset applied', () => {
    // 22:30 LA → minutesOfDay=1350; 1350>=1320 → no +1440; (1350-1320)/30=1
    const ms = new Date(2026, 5, 30, 22, 30).getTime();
    expect(msToSlot(ms, overnightConfig)).toBe(1);
  });

  it('overnight: timestamp after midnight → adjusted via +MIN_PER_DAY', () => {
    // 02:00 LA → minutesOfDay=120; 120 < 1320 → +1440=1560; (1560-1320)/30=8
    const ms = new Date(2026, 5, 30, 2, 0).getTime();
    expect(msToSlot(ms, overnightConfig)).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// getRenderSlot
// ---------------------------------------------------------------------------

describe('getRenderSlot', () => {
  // Normal config: 08:00-18:00, 15-min slots; TZ = America/Los_Angeles (PDT = UTC-7)
  // "2026-06-30T15:00:00Z" = 08:00 PDT → slot 0
  // "2026-06-30T16:00:00Z" = 09:00 PDT → slot 4
  const cfg = makeConfig();

  it('null matchState → returns assignment unchanged', () => {
    const a = makeAssignment({ slotId: 3, durationSlots: 2 });
    expect(getRenderSlot(a, null, cfg)).toEqual({ slotId: 3, durationSlots: 2 });
  });

  it('undefined matchState → returns assignment unchanged', () => {
    const a = makeAssignment({ slotId: 3, durationSlots: 2 });
    expect(getRenderSlot(a, undefined, cfg)).toEqual({ slotId: 3, durationSlots: 2 });
  });

  it('status "scheduled" → returns assignment unchanged', () => {
    const a = makeAssignment({ slotId: 3, durationSlots: 2 });
    expect(getRenderSlot(a, makeState({ status: 'scheduled' }), cfg)).toEqual({
      slotId: 3,
      durationSlots: 2,
    });
  });

  it('status "finished" with valid ISO timestamps → uses actual start/end for slot + duration', () => {
    // start = 15:00Z = 08:00 PDT → slot 0; end = 16:00Z = 09:00 PDT → slot 4
    // duration = (endMs - startMs) / 60000 = 60 min; Math.round(60/15) = 4 slots
    const a = makeAssignment({ slotId: 10, durationSlots: 2 });
    const state = makeState({
      status: 'finished',
      actualStartTime: '2026-06-30T15:00:00Z',
      actualEndTime: '2026-06-30T16:00:00Z',
    });
    expect(getRenderSlot(a, state, cfg)).toEqual({ slotId: 0, durationSlots: 4 });
  });

  it('status "finished" with sub-slot duration → min 1 slot', () => {
    // start = end → 0 duration; Math.max(1, 0) = 1
    const a = makeAssignment({ slotId: 10, durationSlots: 2 });
    const state = makeState({
      status: 'finished',
      actualStartTime: '2026-06-30T15:00:00Z',
      actualEndTime: '2026-06-30T15:00:00Z',
    });
    const result = getRenderSlot(a, state, cfg);
    expect(result.durationSlots).toBeGreaterThanOrEqual(1);
  });

  it('status "finished" but endTime before startTime → falls back to assignment', () => {
    const a = makeAssignment({ slotId: 5, durationSlots: 3 });
    const state = makeState({
      status: 'finished',
      actualStartTime: '2026-06-30T16:00:00Z',
      actualEndTime: '2026-06-30T15:00:00Z', // end before start
    });
    expect(getRenderSlot(a, state, cfg)).toEqual({ slotId: 5, durationSlots: 3 });
  });

  it('status "finished" but missing timestamps → falls back to assignment', () => {
    const a = makeAssignment({ slotId: 5, durationSlots: 3 });
    expect(getRenderSlot(a, makeState({ status: 'finished' }), cfg)).toEqual({
      slotId: 5,
      durationSlots: 3,
    });
  });

  it('status "started" with actualStartTime → uses actual start slot, keeps planned duration', () => {
    // 15:30Z = 08:30 PDT → minutesOfDay=510; (510-480)/15=2 → slot 2
    const a = makeAssignment({ slotId: 0, durationSlots: 3 });
    const state = makeState({
      status: 'started',
      actualStartTime: '2026-06-30T15:30:00Z',
    });
    expect(getRenderSlot(a, state, cfg)).toEqual({ slotId: 2, durationSlots: 3 });
  });

  it('status "started" without actualStartTime → falls back to assignment', () => {
    const a = makeAssignment({ slotId: 5, durationSlots: 2 });
    expect(getRenderSlot(a, makeState({ status: 'started' }), cfg)).toEqual({
      slotId: 5,
      durationSlots: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// getStatusColor
// ---------------------------------------------------------------------------

describe('getStatusColor', () => {
  it('returns muted classes for "scheduled"', () => {
    expect(getStatusColor('scheduled')).toBe('bg-muted text-foreground');
  });

  it('returns blue classes for "called"', () => {
    const color = getStatusColor('called');
    expect(color).toContain('blue');
  });

  it('returns green classes for "started"', () => {
    const color = getStatusColor('started');
    expect(color).toContain('green');
  });

  it('returns purple classes for "finished"', () => {
    const color = getStatusColor('finished');
    expect(color).toContain('purple');
  });

  it('falls back to muted classes for an unknown status value', () => {
    // The ?? fallback in getStatusColor handles runtime unknowns
    expect(getStatusColor('unknown' as MatchStateDTO['status'])).toBe('bg-muted text-foreground');
  });
});
