/**
 * Unit tests for the bracket slot-to-time helper used by
 * BracketMatchesTable's "By Time" view and BracketScheduleSidebar.
 *
 * `start_time` is the wall clock at slot 0; `interval_minutes` is the
 * duration of one slot. The helper formats `slot_id + start_time +
 * interval * slot_id` minutes as `HH:MM`. When `start_time` is null
 * the helper returns the absolute-slot fallback `"Slot {n}"`.
 */
import { describe, expect, it } from 'vitest';
import { formatBracketSlot } from '../../features/bracket/formatBracketSlot';

describe('formatBracketSlot', () => {
  it('formats slot 0 against a 09:00 start in 30-min intervals', () => {
    expect(formatBracketSlot(0, { start_time: '09:00', interval_minutes: 30 })).toBe('09:00');
  });

  it('formats slot 4 against a 09:00 start in 30-min intervals', () => {
    expect(formatBracketSlot(4, { start_time: '09:00', interval_minutes: 30 })).toBe('11:00');
  });

  it('rolls minutes correctly across the hour', () => {
    expect(formatBracketSlot(3, { start_time: '09:00', interval_minutes: 25 })).toBe('10:15');
  });

  it('falls back to "Slot N" when start_time is null', () => {
    expect(formatBracketSlot(5, { start_time: null, interval_minutes: 30 })).toBe('Slot 5');
  });

  it('falls back to "Slot N" when start_time is an empty string', () => {
    expect(formatBracketSlot(2, { start_time: '', interval_minutes: 30 })).toBe('Slot 2');
  });

  it('handles a non-HH:MM start_time by falling back', () => {
    expect(formatBracketSlot(1, { start_time: 'noon', interval_minutes: 30 })).toBe('Slot 1');
  });

  it('zero-pads single-digit hours', () => {
    expect(formatBracketSlot(0, { start_time: '09:00', interval_minutes: 30 })).toBe('09:00');
    expect(formatBracketSlot(2, { start_time: '08:00', interval_minutes: 30 })).toBe('09:00');
  });
});
