/**
 * Regression coverage for the sizing derivations extracted out of
 * MeetDisplayPage.tsx / DisplayPreview.tsx (task-7-brief.md item 4) —
 * pins the exact behaviour both call sites relied on before the
 * extraction so a future edit can't silently diverge them again.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveTvAccent,
  resolveCardHeightPx,
  resolveCardSizeClasses,
  resolveGridColsClass,
  resolveSignageNameSize,
  stepDownSignageNameSize,
  longestWordChars,
} from '../tvSizing';

describe('resolveTvAccent', () => {
  it('defaults to emerald when unset', () => {
    expect(resolveTvAccent(undefined)).toBe('#10b981');
    expect(resolveTvAccent(null)).toBe('#10b981');
    expect(resolveTvAccent('')).toBe('#10b981');
  });

  it('defaults to emerald for a malformed hex', () => {
    expect(resolveTvAccent('not-a-color')).toBe('#10b981');
    expect(resolveTvAccent('#fff')).toBe('#10b981');
  });

  it('passes through a valid hex with a leading #', () => {
    expect(resolveTvAccent('#336699')).toBe('#336699');
  });

  it('adds a leading # to a bare hex', () => {
    expect(resolveTvAccent('336699')).toBe('#336699');
  });
});

describe('resolveCardHeightPx', () => {
  it('maps explicit sizes regardless of fullscreen', () => {
    expect(resolveCardHeightPx('compact')).toBe(72);
    expect(resolveCardHeightPx('comfortable')).toBe(128);
    expect(resolveCardHeightPx('large')).toBe(176);
    expect(resolveCardHeightPx('compact', true)).toBe(72);
  });

  it('auto (unset) depends on fullscreen', () => {
    expect(resolveCardHeightPx('auto', false)).toBe(96);
    expect(resolveCardHeightPx('auto', true)).toBe(128);
    expect(resolveCardHeightPx(undefined)).toBe(96);
  });
});

describe('resolveCardSizeClasses', () => {
  it('picks the sm tier below 96px', () => {
    expect(resolveCardSizeClasses(72).courtNumSize).toContain('text-3xl');
  });

  it('picks the md tier at 96-119px', () => {
    expect(resolveCardSizeClasses(96).courtNumSize).toContain('text-5xl');
  });

  it('picks the lg tier at 120-159px', () => {
    expect(resolveCardSizeClasses(128).courtNumSize).toContain('text-6xl');
  });

  it('picks the xl tier at 160px+', () => {
    expect(resolveCardSizeClasses(176).courtNumSize).toContain('text-7xl');
  });
});

describe('resolveGridColsClass', () => {
  it('returns the matching Tailwind grid-cols class', () => {
    expect(resolveGridColsClass(1)).toBe('grid-cols-1');
    expect(resolveGridColsClass(2)).toContain('md:grid-cols-2');
    expect(resolveGridColsClass(3)).toContain('lg:grid-cols-3');
    expect(resolveGridColsClass(4)).toContain('xl:grid-cols-4');
  });
});

// ── OPR-0908-10 ───────────────────────────────────────────────────────────
describe('signage name wrapping', () => {
  it('measures the longest WORD, not the longest line', () => {
    expect(longestWordChars(['Koki Watanabe', 'Anders Christiansen'])).toBe(12);
    expect(longestWordChars([])).toBe(0);
  });

  it('keeps the tier for ordinary names', () => {
    expect(resolveSignageNameSize(176, ['Koki Watanabe'])).toBe('text-5xl');
    expect(resolveSignageNameSize(96, ['Kunlavut Vitidsarn'])).toBe('text-3xl');
  });

  it('steps down exactly one tier when a word is too long to fit', () => {
    expect(resolveSignageNameSize(176, ['Anders Christiansen'])).toBe('text-4xl');
    expect(stepDownSignageNameSize('text-4xl', ['Anders Christiansen'])).toBe('text-3xl');
  });

  it('never steps below the floor tier', () => {
    expect(stepDownSignageNameSize('text-2xl', ['Anders Christiansen'])).toBe('text-2xl');
  });
});
