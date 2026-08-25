import { describe, expect, it } from 'vitest';
import { isDoublesRank as meetRule } from '../../modules/meet/roster/positionGrid/helpers';

/** Characterization, SP-DM-3 P5 Task 1. F-DM-13 says "is this event
 *  doubles?" has four independent answers; the tree has SIX (the plan's
 *  stale-card §2). The two RULES behind them are the D-suffix rule and a
 *  closed `['MD','WD','XD']` list. They agree on every shipped code and
 *  disagree off it — which is exactly the behavior Task 2 widens, so it
 *  is recorded before it moves. */
const CLOSED_LIST = ['MD', 'WD', 'XD'];

describe('the doubles rules as they stand before P5', () => {
  it('agrees on every discipline the product ships', () => {
    for (const code of ['MS', 'WS', 'MD', 'WD', 'XD']) {
      expect(meetRule(code)).toBe(CLOSED_LIST.includes(code));
    }
  });

  it('DISAGREES on a director-defined code, and Task 2 takes the suffix rule', () => {
    expect(meetRule('BD')).toBe(true);
    expect(CLOSED_LIST.includes('BD')).toBe(false);
  });

  it('the meet rule strips the position digits and the closed list cannot', () => {
    expect(meetRule('XD2')).toBe(true);
    expect(CLOSED_LIST.includes('XD2')).toBe(false);
  });
});
