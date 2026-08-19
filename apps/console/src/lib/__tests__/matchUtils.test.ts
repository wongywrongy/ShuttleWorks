import { describe, it, expect } from 'vitest';
import { getMatchLabel, getMatchPlayerIds } from '../matchUtils';
import type { MatchDTO } from '../../api/dto';

/** Minimal valid MatchDTO — callers spread overrides on top. */
const match = (o: Partial<MatchDTO> & { id: string }): MatchDTO => ({
  sideA: [],
  sideB: [],
  durationSlots: 1,
  ...o,
});

describe('getMatchLabel', () => {
  // ── undefined match ────────────────────────────────────────────────────────

  it('returns "?" when match is undefined and no fallbackId given', () => {
    expect(getMatchLabel(undefined)).toBe('?');
  });

  it('returns full fallbackId when it is shorter than 6 chars', () => {
    expect(getMatchLabel(undefined, 'abc')).toBe('abc');
  });

  it('truncates fallbackId to first 6 chars when it is longer', () => {
    expect(getMatchLabel(undefined, 'abcdefghij')).toBe('abcdef');
  });

  it('returns "?" when match is undefined and fallbackId is empty string', () => {
    // ''.slice(0, 6) === '' which is falsy, so falls through to '?'
    expect(getMatchLabel(undefined, '')).toBe('?');
  });

  // ── eventRank present ──────────────────────────────────────────────────────

  it('returns eventRank when present (typical case: MS1, WD2, …)', () => {
    expect(getMatchLabel(match({ id: 'abc123def', eventRank: 'MS1' }))).toBe('MS1');
  });

  it('eventRank takes priority over matchNumber', () => {
    expect(getMatchLabel(match({ id: 'abc123def', eventRank: 'WD2', matchNumber: 5 }))).toBe('WD2');
  });

  // ── eventRank absent / null → fall through to matchNumber ─────────────────

  it('uses matchNumber (M{n}) when eventRank is absent', () => {
    expect(getMatchLabel(match({ id: 'abc123def', matchNumber: 3 }))).toBe('M3');
  });

  it('uses matchNumber when eventRank is null (null is falsy)', () => {
    expect(getMatchLabel(match({ id: 'abc123def', eventRank: null, matchNumber: 7 }))).toBe('M7');
  });

  it('uses matchNumber 1 (boundary — not zero)', () => {
    expect(getMatchLabel(match({ id: 'abc123def', matchNumber: 1 }))).toBe('M1');
  });

  // ── fallback to truncated id ───────────────────────────────────────────────

  it('returns first 6 chars of id when neither eventRank nor matchNumber is set', () => {
    expect(getMatchLabel(match({ id: 'deadbeef1234' }))).toBe('deadbe');
  });

  it('returns the full id when it is shorter than 6 chars', () => {
    expect(getMatchLabel(match({ id: 'xy' }))).toBe('xy');
  });

  it('returns exactly 6 chars when id is exactly 6 chars long', () => {
    expect(getMatchLabel(match({ id: 'abcdef' }))).toBe('abcdef');
  });
});

describe('getMatchPlayerIds', () => {
  it('concatenates sideA and sideB player IDs', () => {
    const m = match({ id: 'x', sideA: ['p1', 'p2'], sideB: ['p3', 'p4'] });
    expect(getMatchPlayerIds(m)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('includes sideC players when present (tri-meet)', () => {
    const m = match({ id: 'x', sideA: ['a'], sideB: ['b'], sideC: ['c'] });
    expect(getMatchPlayerIds(m)).toEqual(['a', 'b', 'c']);
  });

  it('returns only sideB when sideA is empty', () => {
    const m = match({ id: 'x', sideA: [], sideB: ['p1'] });
    expect(getMatchPlayerIds(m)).toEqual(['p1']);
  });

  it('returns empty array when all sides are empty', () => {
    const m = match({ id: 'x', sideA: [], sideB: [] });
    expect(getMatchPlayerIds(m)).toEqual([]);
  });

  it('preserves order: sideA first, then sideB, then sideC', () => {
    const m = match({ id: 'x', sideA: ['a1', 'a2'], sideB: ['b1'], sideC: ['c1', 'c2'] });
    expect(getMatchPlayerIds(m)).toEqual(['a1', 'a2', 'b1', 'c1', 'c2']);
  });

  it('handles singles matches (one player per side)', () => {
    const m = match({ id: 'x', sideA: ['alice'], sideB: ['bob'] });
    expect(getMatchPlayerIds(m)).toEqual(['alice', 'bob']);
  });
});
