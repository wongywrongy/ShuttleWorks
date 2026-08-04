import { describe, expect, it } from 'vitest';
import type { MatchStateDTO } from '../../../../api/dto';
import { meetMatchStatus } from '../meetMatchStatus';

const state = (status: MatchStateDTO['status']): Record<string, MatchStateDTO> => ({
  m1: { matchId: 'm1', status },
});

describe('meetMatchStatus — same 4-state vocabulary as bracket', () => {
  it('is pending with no assignment and no state', () => {
    expect(meetMatchStatus('m1', new Set(), {})).toBe('pending');
  });
  it('is ready when scheduled (assignment exists)', () => {
    expect(meetMatchStatus('m1', new Set(['m1']), {})).toBe('ready');
  });
  it('stays ready while the match state is only scheduled', () => {
    expect(meetMatchStatus('m1', new Set(['m1']), state('scheduled'))).toBe('ready');
  });
  it('is live once Operations calls or starts it', () => {
    expect(meetMatchStatus('m1', new Set(['m1']), state('called'))).toBe('live');
    expect(meetMatchStatus('m1', new Set(['m1']), state('started'))).toBe('live');
  });
  it('is done when finished — even if the assignment is gone', () => {
    expect(meetMatchStatus('m1', new Set(['m1']), state('finished'))).toBe('done');
    expect(meetMatchStatus('m1', new Set(), state('finished'))).toBe('done');
  });
});
