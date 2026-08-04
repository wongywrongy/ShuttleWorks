/**
 * `deriveFreshness` is the pure decision function behind the spectator-calm
 * freshness states (Live / Delayed / Out of date). See ./freshness.ts for
 * the threshold rationale — this test pins the exact boundaries so a
 * future edit can't silently widen/narrow them.
 */
import { describe, expect, it } from 'vitest';
import { deriveFreshness, DELAYED_MULTIPLIER, STALE_MS, STALE_CAPTION } from '../freshness';

describe('deriveFreshness', () => {
  it('is live right after a successful sync', () => {
    expect(deriveFreshness(0, 10_000)).toBe('live');
  });

  it('stays live right up to the delayed threshold (2.5x pollMs)', () => {
    expect(deriveFreshness(24_999, 10_000)).toBe('live');
  });

  it('flips to delayed at/after 2.5x pollMs', () => {
    expect(deriveFreshness(26_000, 10_000)).toBe('delayed');
    expect(deriveFreshness(25_000, 10_000)).toBe('delayed');
  });

  it('stays delayed short of STALE_MS regardless of a short pollMs', () => {
    expect(deriveFreshness(239_999, 10_000)).toBe('delayed');
  });

  it('flips to stale at STALE_MS (~240s)', () => {
    expect(deriveFreshness(300_000, 10_000)).toBe('stale');
    expect(deriveFreshness(STALE_MS, 10_000)).toBe('stale');
  });

  it('exposes the thresholds as named constants', () => {
    expect(DELAYED_MULTIPLIER).toBe(2.5);
    expect(STALE_MS).toBe(240_000);
  });
});

describe('STALE_CAPTION', () => {
  it('never surfaces operator/technical connection language to spectators', () => {
    // The public boards must never render this vocabulary — a past
    // regression used "Results may be out of date — reconnecting".
    expect(STALE_CAPTION).not.toMatch(/reconnect|offline|server|backend/i);
  });

  it('is the exact calm, mechanism-free copy shared by both boards', () => {
    expect(STALE_CAPTION).toBe('Results may be a few minutes behind.');
  });
});
