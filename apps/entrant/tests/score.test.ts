/**
 * The public tier's one score speller (operator/public remediation P1).
 *
 * The wire's public score projection is POSITIONAL — index 0 of every game
 * belongs to `sides[0]`. These pin the three states rule 7 requires to stay
 * distinct (zero, missing, not started) and the ordering rule 1 forbids
 * anyone to infer.
 */
import { describe, expect, it } from 'vitest';
import { gameScore, pairedScoreLine } from '../app/lib/score';

describe('gameScore — zero, missing and not-started are three facts', () => {
  it('returns 0 for a real zero, not null', () => {
    expect(gameScore([[0, 21]], 0, 0)).toBe(0);
    expect(gameScore([[0, 21]], 0, 1)).toBe(21);
  });

  it('returns null for a number the wire does not carry', () => {
    expect(gameScore([[21]], 0, 1)).toBeNull();
    expect(gameScore([[21, 18]], 1, 0)).toBeNull();
    expect(gameScore(null, 0, 0)).toBeNull();
    expect(gameScore([], 0, 0)).toBeNull();
  });

  it('reads ownership from POSITION only — never from which number is larger', () => {
    // The loser of the match won game 2; index 0 is still side A's.
    const score = [[21, 15], [18, 21], [21, 19]];
    expect([0, 1, 2].map((g) => gameScore(score, g, 0))).toEqual([21, 18, 21]);
    expect([0, 1, 2].map((g) => gameScore(score, g, 1))).toEqual([15, 21, 19]);
  });
});

describe('pairedScoreLine — the row layout and the accessible summary', () => {
  it('spells two games, first number always the first-listed side', () => {
    expect(pairedScoreLine([[21, 18], [21, 15]])).toBe('21–18, 21–15');
  });

  it('spells three games', () => {
    expect(pairedScoreLine([[18, 21], [21, 15], [21, 13]])).toBe('18–21, 21–15, 21–13');
  });

  it('prints a real zero and leaves a missing number blank', () => {
    expect(pairedScoreLine([[0, 21]])).toBe('0–21');
    expect(pairedScoreLine([[21]])).toBe('21–');
  });

  it('a walkover / not-started match has no line at all — never 0–0', () => {
    expect(pairedScoreLine(null)).toBeNull();
    expect(pairedScoreLine([])).toBeNull();
  });
});
