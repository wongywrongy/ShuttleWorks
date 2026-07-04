/**
 * Pure-helper tests for standings placement. Written FIRST (TDD RED) —
 * standingsLayout.ts does not exist yet when this file is created.
 *
 * See task-9-brief.md. `standingsPlacement` decides whether the public
 * board's standings render as a persistent SIDE panel (small venues,
 * few courts — there's room), a timed ROTATION (large venues, many
 * courts — no room for a permanent panel without crowding the grid),
 * or not at all (`off`, director's explicit choice).
 */
import { describe, expect, it } from 'vitest';
import { standingsPlacement } from '../standingsLayout';

describe('standingsPlacement', () => {
  it('mode "off" always resolves to off, regardless of court count', () => {
    expect(standingsPlacement(2, 'off')).toBe('off');
    expect(standingsPlacement(10, 'off')).toBe('off');
  });

  it('honors an explicit "side" mode even at a large court count', () => {
    expect(standingsPlacement(10, 'side')).toBe('side');
  });

  it('honors an explicit "rotate" mode even at a small court count', () => {
    expect(standingsPlacement(2, 'rotate')).toBe('rotate');
  });

  it('defaults to "side" when mode is undefined and courtCount <= 6', () => {
    expect(standingsPlacement(4, undefined)).toBe('side');
    expect(standingsPlacement(6, undefined)).toBe('side');
  });

  it('defaults to "rotate" when mode is undefined and courtCount > 6', () => {
    expect(standingsPlacement(7, undefined)).toBe('rotate');
    expect(standingsPlacement(10, undefined)).toBe('rotate');
  });

  it('defaults to "side"/"rotate" the same way when mode is null (config not yet set)', () => {
    expect(standingsPlacement(4, null)).toBe('side');
    expect(standingsPlacement(10, null)).toBe('rotate');
  });
});
