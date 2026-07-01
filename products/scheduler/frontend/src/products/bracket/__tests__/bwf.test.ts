import { describe, it, expect } from 'vitest';
import { bwfPositions, seedForPosition } from '../bwf';

// These must match the backend's `_bwf_positions`
// (services/bracket/formats/single_elimination.py). If the backend seeding
// changes, both sides update together — a mismatch silently mis-places
// players, so pin the values here.
describe('bwfPositions', () => {
  it('matches the backend BWF placement for small sizes', () => {
    expect(bwfPositions(2)).toEqual([1, 2]);
    expect(bwfPositions(4)).toEqual([1, 4, 3, 2]);
    expect(bwfPositions(8)).toEqual([1, 6, 5, 4, 3, 8, 7, 2]);
  });

  it('is a full permutation of 1..size', () => {
    for (const size of [2, 4, 8, 16, 32, 64]) {
      const sorted = [...bwfPositions(size)].sort((a, b) => a - b);
      expect(sorted).toEqual(Array.from({ length: size }, (_, i) => i + 1));
    }
  });

  it('places seed 1 at the top and seed 2 at the bottom', () => {
    for (const size of [2, 4, 8, 16, 64]) {
      const pos = bwfPositions(size);
      expect(pos[0]).toBe(1);
      expect(pos[size - 1]).toBe(2);
    }
  });

  it('seedForPosition reads the map', () => {
    expect(seedForPosition(8, 0)).toBe(1);
    expect(seedForPosition(8, 7)).toBe(2);
  });

  it('rejects non-power-of-two sizes', () => {
    expect(() => bwfPositions(6)).toThrow();
    expect(() => bwfPositions(0)).toThrow();
  });
});
