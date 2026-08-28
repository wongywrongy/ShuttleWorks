import { describe, expect, it } from 'vitest';
import type { MatchStateDTO } from '../../api/dto';
import { mergeMatchStates } from '../mergeMatchStates';

const state = (matchId: string, status: MatchStateDTO['status'], extra: Partial<MatchStateDTO> = {}) => ({
  matchId,
  status,
  ...extra,
});

describe('mergeMatchStates', () => {
  it('lets backend values win while preserving local-only fields', () => {
    const merged = mergeMatchStates(
      {
        m1: state('m1', 'started', { score: { sideA: 2, sideB: 1 } }),
      },
      {
        m1: state('m1', 'called', { postponed: true, playerConfirmations: { p1: true } }),
      },
    );

    expect(merged).toEqual({
      m1: state('m1', 'started', {
        score: { sideA: 2, sideB: 1 },
        postponed: true,
        playerConfirmations: { p1: true },
      }),
    });
  });

  it('retains local-only rows that are absent from the backend response', () => {
    const localOnly = state('local-only', 'called', { postponed: true });

    expect(mergeMatchStates({ m1: state('m1', 'scheduled') }, { 'local-only': localOnly })).toEqual({
      m1: state('m1', 'scheduled'),
      'local-only': localOnly,
    });
  });
});
