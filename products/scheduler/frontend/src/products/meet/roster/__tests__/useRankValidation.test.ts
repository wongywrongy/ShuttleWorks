/**
 * useRankValidation — the event-label seam (console-IA defect D1).
 *
 * The hook interpolated a hardcoded five-entry `RANK_LABELS = {MS,WS,MD,WD,XD}`
 * straight into a user-visible string, so a meet configured with an
 * operator-defined code — which Meet Setup explicitly validates and accepts —
 * rendered the literal text "BS1 - undefined 1". The fix is at the seam: the
 * shared, null-prototype-safe `DISCIPLINE_NAMES`, with the raw code as the
 * label when there is no full name for it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRankValidation } from '../hooks/useRankValidation';
import { useTournamentStore } from '../../../../store/tournamentStore';
import type { RosterGroupDTO, TournamentConfig } from '../../../../api/dto';

const S1 = [{ id: 'S1', name: 'School 1' }] as RosterGroupDTO[];

beforeEach(() => {
  useTournamentStore.setState({
    // A junior league runs BS (Boys' Singles) and U10 alongside a discipline.
    config: { rankCounts: { MS: 2, BS: 3, U10: 1 } } as unknown as TournamentConfig,
    groups: S1,
    players: [],
  });
});

const ranks = () => renderHook(() => useRankValidation('S1')).result.current.availableRanks;

describe('useRankValidation labels', () => {
  it('never writes the word "undefined" into a label', () => {
    const all = Object.values(ranks());
    const strings = [
      ...all.map((c) => c.label),
      ...all.flatMap((c) => c.ranks.map((r) => r.label)),
    ];
    expect(strings.length).toBeGreaterThan(0);
    expect(strings.filter((s) => s.includes('undefined'))).toEqual([]);
  });

  it('labels an operator-defined event with its own code', () => {
    expect(ranks().BS.label).toBe('BS');
    expect(ranks().BS.ranks.map((r) => r.label)).toEqual(['BS1', 'BS2', 'BS3']);
    expect(ranks().U10.ranks[0].label).toBe('U101');
  });

  it('still names the five known disciplines in full', () => {
    expect(ranks().MS.label).toBe("Men's Singles");
    expect(ranks().MS.ranks[0].label).toBe("MS1 - Men's Singles 1");
  });
});
