/**
 * CMP-1 route/state matrix (SP-CONSOLE-4 B2) — the full phase × workspace-class
 * table, asserted cell by cell so a matrix edit cannot silently reroute a
 * lifecycle. Negative control (CODE_HEALTH 3b): flip any cell (e.g. make
 * `opsPlanMode('complete')` return 'plan') and the corresponding assertion
 * fails.
 */
import { describe, it, expect } from 'vitest';
import {
  defaultOperationsSegment,
  opsPlanMode,
  showPlanReadinessChips,
} from '../lifecycleMatrix';

describe('defaultOperationsSegment — LIVE leads with the Floor, all else Plan', () => {
  it.each([
    ['setup', false, 'schedule'],
    ['ready', false, 'schedule'],
    ['live', false, 'live'],
    ['complete', false, 'schedule'],
    ['setup', true, 'bracket-schedule'],
    ['ready', true, 'bracket-schedule'],
    ['live', true, 'bracket-live'],
    ['complete', true, 'bracket-schedule'],
  ] as const)('%s (opsBracket=%s) → %s', (phase, opsBracket, segment) => {
    expect(defaultOperationsSegment(phase, opsBracket)).toBe(segment);
  });

  it('unknown/absent phase behaves as setup (resolvePhase convention)', () => {
    expect(defaultOperationsSegment(null, false)).toBe('schedule');
    expect(defaultOperationsSegment(undefined, true)).toBe('bracket-schedule');
  });
});

describe('opsPlanMode — COMPLETE is review, everything else plans', () => {
  it.each([
    ['setup', 'plan'],
    ['ready', 'plan'],
    ['live', 'plan'],
    ['complete', 'plan-review'],
  ] as const)('%s → %s', (phase, mode) => {
    expect(opsPlanMode(phase)).toBe(mode);
  });

  it('unknown/absent phase keeps the planning surface', () => {
    expect(opsPlanMode(null)).toBe('plan');
    expect(opsPlanMode(undefined)).toBe('plan');
  });
});

describe('showPlanReadinessChips — no readiness nag on a finished day (SP-OPCON-1 SWP-1)', () => {
  // Negative control (CODE_HEALTH 3b): make it `return true` unconditionally
  // (re-enabling the "Plan not finalized · Open Plan" chip on COMPLETE) and
  // the 'complete → false' case fails. Verified red 2026-08-30, restored.
  it.each([
    ['setup', true],
    ['ready', true],
    ['live', true],
    ['complete', false],
  ] as const)('%s → %s', (phase, shown) => {
    expect(showPlanReadinessChips(phase)).toBe(shown);
  });

  it('unknown/absent phase keeps the chips (the handoff indicator is the default)', () => {
    expect(showPlanReadinessChips(null)).toBe(true);
    expect(showPlanReadinessChips(undefined)).toBe(true);
  });
});
