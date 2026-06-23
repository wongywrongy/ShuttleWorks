import { describe, it, expect } from 'vitest';
import { bracketCurrentSlot } from '../bracketTime';

describe('bracketCurrentSlot', () => {
  it('returns 0 when no start_time is pinned (so nothing is ever "late")', () => {
    expect(bracketCurrentSlot(null, 30, new Date('2026-05-15T11:00:00'))).toBe(0);
  });

  it('returns 0 for an unparseable start_time', () => {
    expect(bracketCurrentSlot('not-a-date', 30, new Date('2026-05-15T11:00:00'))).toBe(0);
  });

  it('returns 0 for a non-positive interval', () => {
    expect(bracketCurrentSlot('2026-05-15T09:00:00', 0, new Date('2026-05-15T11:00:00'))).toBe(0);
  });

  it('computes the slot from time-of-day past the start hour', () => {
    // 09:00 start, 30-min slots, now 11:00 → 120 min / 30 = slot 4.
    expect(bracketCurrentSlot('2026-05-15T09:00:00', 30, new Date('2026-05-15T11:00:00'))).toBe(4);
  });

  it('ignores the calendar date (one-day cockpit convention)', () => {
    // Same time-of-day on a different date → same slot, not a huge number.
    expect(bracketCurrentSlot('2026-05-15T09:00:00', 30, new Date('2026-06-16T10:00:00'))).toBe(2);
  });

  it('clamps to 0 before the start hour', () => {
    expect(bracketCurrentSlot('2026-05-15T09:00:00', 30, new Date('2026-05-15T08:00:00'))).toBe(0);
  });
});
