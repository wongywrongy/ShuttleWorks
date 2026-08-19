import { describe, it, expect } from 'vitest';
import {
  setCountForFormat,
  emptySets,
  playedSets,
  winnerSideFromSets,
} from '../bracketScore';

describe('bracketScore helpers', () => {
  it('maps setsToWin to a best-of input count', () => {
    expect(setCountForFormat(1)).toBe(1);
    expect(setCountForFormat(2)).toBe(3);
    expect(setCountForFormat(3)).toBe(5);
  });

  it('emptySets returns the right number of blank rows', () => {
    expect(emptySets(2)).toHaveLength(3);
    expect(emptySets(2).every((s) => s.sideA === 0 && s.sideB === 0)).toBe(true);
  });

  it('playedSets drops unplayed (0-0) rows', () => {
    const sets = [
      { sideA: 21, sideB: 18 },
      { sideA: 0, sideB: 0 },
      { sideA: 0, sideB: 0 },
    ];
    expect(playedSets(sets)).toEqual([{ sideA: 21, sideB: 18 }]);
  });

  it('winnerSideFromSets picks the side that won more sets', () => {
    expect(
      winnerSideFromSets([
        { sideA: 21, sideB: 18 },
        { sideA: 19, sideB: 21 },
        { sideA: 21, sideB: 15 },
      ]),
    ).toBe('A');
    expect(
      winnerSideFromSets([
        { sideA: 15, sideB: 21 },
        { sideA: 21, sideB: 19 },
        { sideA: 12, sideB: 21 },
      ]),
    ).toBe('B');
  });

  it('returns null when undecided (no sets or a one-each split)', () => {
    expect(winnerSideFromSets([])).toBeNull();
    expect(winnerSideFromSets([{ sideA: 0, sideB: 0 }])).toBeNull();
    expect(
      winnerSideFromSets([
        { sideA: 21, sideB: 18 },
        { sideA: 18, sideB: 21 },
      ]),
    ).toBeNull();
  });
});
