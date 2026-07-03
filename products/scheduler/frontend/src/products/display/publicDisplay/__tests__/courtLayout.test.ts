/**
 * Pure-helper tests for court layout: manual reordering, presentation-only
 * hide filtering, and the responsive column default. Written FIRST
 * (TDD RED) — courtLayout.ts does not exist yet when this file is created.
 *
 * See task-7-brief.md. Absolute rule under test for `visibleCourts`: hiding
 * is presentation-only — it never drops a court's underlying data, it only
 * filters which ids are handed to the renderer.
 */
import { describe, expect, it } from 'vitest';
import {
  orderCourts,
  visibleCourts,
  defaultColumns,
  courtsWithActiveMatch,
} from '../courtLayout';

describe('orderCourts', () => {
  it('puts manually-ordered courts first, in the given order', () => {
    expect(orderCourts([1, 2, 3, 4], [3, 1])).toEqual([3, 1, 2, 4]);
  });

  it('appends unlisted courts in ascending numeric order', () => {
    expect(orderCourts([1, 2, 3, 4, 5], [4])).toEqual([4, 1, 2, 3, 5]);
  });

  it('never drops a court: ignores manual-order entries not present in courtIds', () => {
    // 5 isn't a real court (e.g. courtCount shrank) — it must not appear,
    // and the real courts must still all be present.
    expect(orderCourts([1, 2, 3], [5, 2, 1])).toEqual([2, 1, 3]);
  });

  it('de-duplicates repeated ids in courtOrder', () => {
    expect(orderCourts([1, 2, 3], [2, 2, 1])).toEqual([2, 1, 3]);
  });

  it('falls back to ascending order when courtOrder is null', () => {
    expect(orderCourts([3, 1, 4, 2], null)).toEqual([1, 2, 3, 4]);
  });

  it('falls back to ascending order when courtOrder is undefined', () => {
    expect(orderCourts([3, 1, 4, 2], undefined)).toEqual([1, 2, 3, 4]);
  });

  it('falls back to ascending order when courtOrder is empty', () => {
    expect(orderCourts([3, 1, 4, 2], [])).toEqual([1, 2, 3, 4]);
  });
});

describe('visibleCourts', () => {
  it('filters out hidden court ids, presentation-only', () => {
    expect(visibleCourts([1, 2, 3], [2])).toEqual([1, 3]);
  });

  it('preserves the input order (does not resort)', () => {
    expect(visibleCourts([3, 1, 2], [1])).toEqual([3, 2]);
  });

  it('returns the input unchanged when hidden is null', () => {
    expect(visibleCourts([1, 2, 3], null)).toEqual([1, 2, 3]);
  });

  it('returns the input unchanged when hidden is undefined', () => {
    expect(visibleCourts([1, 2, 3], undefined)).toEqual([1, 2, 3]);
  });

  it('returns the input unchanged when hidden is empty', () => {
    expect(visibleCourts([1, 2, 3], [])).toEqual([1, 2, 3]);
  });

  it('can hide every court (empty result)', () => {
    expect(visibleCourts([1, 2], [1, 2])).toEqual([]);
  });
});

describe('defaultColumns', () => {
  it('override wins when set', () => {
    expect(defaultColumns(10, 2)).toBe(2);
  });

  it('derives 2 columns for small court counts (<=3)', () => {
    expect(defaultColumns(2, null)).toBe(2);
    expect(defaultColumns(1, null)).toBe(2);
    expect(defaultColumns(3, null)).toBe(2);
  });

  it('derives 3 columns for medium court counts (4-6)', () => {
    expect(defaultColumns(4, null)).toBe(3);
    expect(defaultColumns(6, null)).toBe(3);
  });

  it('derives 4 columns for large court counts (>=7)', () => {
    expect(defaultColumns(7, null)).toBe(4);
    expect(defaultColumns(10, null)).toBe(4);
  });

  it('treats undefined override the same as null', () => {
    expect(defaultColumns(10, undefined)).toBe(4);
  });

  it('clamps an out-of-range override into 1..4', () => {
    expect(defaultColumns(10, 9 as unknown as number)).toBe(4);
    expect(defaultColumns(10, 0 as unknown as number)).toBe(1);
  });
});

describe('courtsWithActiveMatch', () => {
  it('flags a court whose assignment is started', () => {
    const result = courtsWithActiveMatch(
      [{ courtId: 3, matchId: 'm1' }],
      { m1: { status: 'started' } },
    );
    expect(result.has(3)).toBe(true);
  });

  it('flags a court whose assignment is called', () => {
    const result = courtsWithActiveMatch(
      [{ courtId: 5, matchId: 'm1' }],
      { m1: { status: 'called' } },
    );
    expect(result.has(5)).toBe(true);
  });

  it('does not flag scheduled or finished matches', () => {
    const result = courtsWithActiveMatch(
      [
        { courtId: 1, matchId: 'm1' },
        { courtId: 2, matchId: 'm2' },
      ],
      { m1: { status: 'scheduled' }, m2: { status: 'finished' } },
    );
    expect(result.size).toBe(0);
  });

  it('honors actualCourtId when the match was moved off its scheduled court', () => {
    const result = courtsWithActiveMatch(
      [{ courtId: 1, matchId: 'm1' }],
      { m1: { status: 'started', actualCourtId: 9 } },
    );
    expect(result.has(9)).toBe(true);
    expect(result.has(1)).toBe(false);
  });

  it('returns an empty set for no assignments', () => {
    expect(courtsWithActiveMatch([], {}).size).toBe(0);
  });
});
