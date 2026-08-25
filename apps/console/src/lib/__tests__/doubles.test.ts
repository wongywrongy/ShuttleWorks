import { describe, expect, it } from 'vitest';
import { isDoublesCode } from '../doubles';
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

describe('isDoublesCode — the one console authority (F-DM-13)', () => {
  it('answers the same question for a bracket discipline and a meet rank', () => {
    expect(isDoublesCode('XD')).toBe(true);
    expect(isDoublesCode('XD2')).toBe(true);
    expect(isDoublesCode('MS')).toBe(false);
    expect(isDoublesCode('MS1')).toBe(false);
  });

  it('takes the D-suffix convention, which WIDENS the bracket surfaces', () => {
    /* Deliberate behavior change, SP-DM-3 P5 judgment call 6, flipping the
       Task 1 pin at 8ded73c5. The three bracket surfaces asked
       `['MD','WD','XD'].includes(discipline)`; a director-defined `BD` was
       singles there and doubles everywhere else. The D-suffix convention is
       what `MeetEventsSection.tsx:15` already documents as the product rule,
       and the two answers agree on every shipped code. */
    expect(isDoublesCode('BD')).toBe(true);
  });

  it('is not fooled by a D that is not the discipline suffix', () => {
    expect(isDoublesCode('')).toBe(false);
    expect(isDoublesCode('DS')).toBe(false);
  });

  it('is the rule the meet re-exports, not a second copy of it', () => {
    // The honest deletion gate. `rg isDoublesRank` still finds two files by
    // design — `helpers.ts` re-exports so ~15 meet call sites do not churn —
    // so the gate is that the two names resolve to ONE function, not that
    // one of the names is gone.
    expect(meetRule).toBe(isDoublesCode);
  });
});
