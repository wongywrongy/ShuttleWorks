import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PlayerDTO, RosterGroupDTO, TournamentConfig } from '../../../../api/dto';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useRankAssignment } from '../positionGrid/useRankAssignment';

const mkPlayer = (
  id: string,
  groupId: string,
  ranks: string[] = [],
  partnerPlayerIds?: Record<string, string>,
): PlayerDTO =>
  ({ id, name: id, groupId, ranks, availability: [], partnerPlayerIds } as PlayerDTO);

function seed(players: PlayerDTO[], config: Partial<TournamentConfig> = {}) {
  useTournamentStore.setState({
    groups: [
      { id: 'S1', name: 'School 1' },
      { id: 'S2', name: 'School 2' },
    ] as RosterGroupDTO[],
    players,
    config: {
      intervalMinutes: 15,
      dayStart: '09:00',
      dayEnd: '17:00',
      breaks: [],
      courtCount: 2,
      defaultRestMinutes: 30,
      freezeHorizonSlots: 0,
      rankCounts: {},
      ...config,
    } as TournamentConfig,
  });
}

const ranksOf = (id: string) =>
  useTournamentStore.getState().players.find((p) => p.id === id)?.ranks ?? null;

describe('useRankAssignment', () => {
  beforeEach(() => {
    useTournamentStore.setState({ groups: [] as RosterGroupDTO[], players: [] });
  });

  it('singles: assigning displaces the prior holder in the same school', () => {
    seed([mkPlayer('a', 'S1', ['MS1']), mkPlayer('b', 'S1', [])]);
    const { result } = renderHook(() => useRankAssignment());
    act(() => result.current.assignRank('S1', 'b', 'MS1'));
    expect(ranksOf('a')).toEqual([]);
    expect(ranksOf('b')).toEqual(['MS1']);
  });

  it('singles: does NOT displace a holder in a different school', () => {
    seed([mkPlayer('a', 'S1', ['MS1']), mkPlayer('b', 'S2', [])]);
    const { result } = renderHook(() => useRankAssignment());
    act(() => result.current.assignRank('S2', 'b', 'MS1'));
    expect(ranksOf('a')).toEqual(['MS1']); // untouched — different school
    expect(ranksOf('b')).toEqual(['MS1']);
  });

  it('doubles: assigning does NOT displace the existing partner', () => {
    seed([mkPlayer('a', 'S1', ['MD1']), mkPlayer('b', 'S1', [])]);
    const { result } = renderHook(() => useRankAssignment());
    act(() => result.current.assignRank('S1', 'b', 'MD1'));
    expect(ranksOf('a')).toEqual(['MD1']); // partner kept
    expect(ranksOf('b')).toEqual(['MD1']);
  });

  it('assigning a rank the player already holds is a no-op', () => {
    seed([mkPlayer('a', 'S1', ['MS1'])]);
    const { result } = renderHook(() => useRankAssignment());
    act(() => result.current.assignRank('S1', 'a', 'MS1'));
    expect(ranksOf('a')).toEqual(['MS1']);
  });

  it('unassignRank removes only the given rank', () => {
    seed([mkPlayer('a', 'S1', ['MS1', 'MD2'])]);
    const { result } = renderHook(() => useRankAssignment());
    act(() => result.current.unassignRank('a', 'MS1'));
    expect(ranksOf('a')).toEqual(['MD2']);
  });

  it('moveRank moves a player and does NOT re-add the source rank', () => {
    seed([mkPlayer('a', 'S1', ['MS1', 'MD1'])]);
    const { result } = renderHook(() => useRankAssignment());
    act(() => result.current.moveRank('S1', 'a', 'MS1', 'MS2'));
    expect(ranksOf('a')).toEqual(['MD1', 'MS2']); // MS1 gone, MS2 added
  });

  it('moveRank into an occupied singles slot displaces the prior holder', () => {
    seed([mkPlayer('a', 'S1', ['MS2']), mkPlayer('b', 'S1', ['MS1'])]);
    const { result } = renderHook(() => useRankAssignment());
    act(() => result.current.moveRank('S1', 'b', 'MS1', 'MS2'));
    expect(ranksOf('a')).toEqual([]); // displaced
    expect(ranksOf('b')).toEqual(['MS2']);
  });

  it('moveRank with fromRank === toRank is a no-op', () => {
    seed([mkPlayer('a', 'S1', ['MS1'])]);
    const { result } = renderHook(() => useRankAssignment());
    act(() => result.current.moveRank('S1', 'a', 'MS1', 'MS1'));
    expect(ranksOf('a')).toEqual(['MS1']);
  });

  it('seats a division-only entrant into the first free slot of that division', () => {
    seed(
      [mkPlayer('p1', 'S1', ['MS1']), mkPlayer('p2', 'S1', ['MS'])],
      { rankCounts: { MS: 2 } },
    );
    const { result } = renderHook(() => useRankAssignment());

    let seated = -1;
    act(() => {
      seated = result.current.seatUnslotted('S1');
    });

    expect(seated).toBe(1);
    expect(ranksOf('p2')).toEqual(['MS2']);
  });

  it('finds the first free slot without walking a huge configured count', () => {
    seed(
      [mkPlayer('p1', 'S1', ['MS1']), mkPlayer('p2', 'S1', ['MS'])],
      { rankCounts: { MS: 2_000_000_000 } },
    );
    const { result } = renderHook(() => useRankAssignment());

    let seated = -1;
    act(() => {
      seated = result.current.seatUnslotted('S1');
    });

    expect(seated).toBe(1);
    expect(ranksOf('p2')).toEqual(['MS2']);
  });

  it('seats both halves of a confirmed pair into the same doubles slot', () => {
    seed(
      [
        mkPlayer('p1', 'S1', ['XD'], { XD: 'p2' }),
        mkPlayer('p2', 'S1', ['XD'], { XD: 'p1' }),
      ],
      { rankCounts: { XD: 2 } },
    );
    const { result } = renderHook(() => useRankAssignment());

    act(() => {
      result.current.seatUnslotted('S1');
    });

    expect(ranksOf('p1')).toEqual(['XD1']);
    expect(ranksOf('p2')).toEqual(['XD1']);
  });

  it('keeps a mutual division-keyed pair together when a partial doubles slot exists', () => {
    seed(
      [
        mkPlayer('existing', 'S1', ['XD1']),
        mkPlayer('p1', 'S1', ['XD'], { XD: 'p2' }),
        mkPlayer('p2', 'S1', ['XD'], { XD: 'p1' }),
      ],
      { rankCounts: { XD: 2 } },
    );
    const { result } = renderHook(() => useRankAssignment());

    act(() => {
      result.current.seatUnslotted('S1');
    });

    expect(ranksOf('p1')).toEqual(['XD2']);
    expect(ranksOf('p2')).toEqual(['XD2']);
  });

  it('leaves a division-only entrant when the division is full', () => {
    seed(
      [mkPlayer('p1', 'S1', ['MS1']), mkPlayer('p2', 'S1', ['MS'])],
      { rankCounts: { MS: 1 } },
    );
    const { result } = renderHook(() => useRankAssignment());

    let seated = -1;
    act(() => {
      seated = result.current.seatUnslotted('S1');
    });

    expect(seated).toBe(0);
    expect(ranksOf('p2')).toEqual(['MS']);
  });

  it('does not touch another school', () => {
    seed(
      [mkPlayer('p1', 'S1', ['MS']), mkPlayer('p2', 'S2', ['MS'])],
      { rankCounts: { MS: 2 } },
    );
    const { result } = renderHook(() => useRankAssignment());

    act(() => {
      result.current.seatUnslotted('S1');
    });

    expect(ranksOf('p1')).toEqual(['MS1']);
    expect(ranksOf('p2')).toEqual(['MS']);
  });

  it('seats a cross-school confirmed pair as independent singletons', () => {
    seed(
      [
        mkPlayer('p1', 'S1', ['XD'], { XD: 'p2' }),
        mkPlayer('p2', 'S2', ['XD'], { XD: 'p1' }),
      ],
      { rankCounts: { XD: 1 } },
    );
    const { result } = renderHook(() => useRankAssignment());

    act(() => {
      result.current.seatUnslotted('S1');
    });

    expect(ranksOf('p1')).toEqual(['XD1']);
    expect(ranksOf('p2')).toEqual(['XD']);
  });

  it('updates each seated player exactly once from one plan', () => {
    const updates = vi.spyOn(useTournamentStore.getState(), 'updatePlayer');
    seed(
      [
        mkPlayer('p1', 'S1', ['XD'], { XD: 'p2' }),
        mkPlayer('p2', 'S1', ['XD'], { XD: 'p1' }),
        mkPlayer('p3', 'S1', ['MS']),
      ],
      { rankCounts: { XD: 1, MS: 1 } },
    );
    const { result } = renderHook(() => useRankAssignment());

    act(() => {
      result.current.seatUnslotted('S1');
    });

    expect(updates).toHaveBeenCalledTimes(3);
    expect(updates.mock.calls.map(([id]) => id)).toEqual(['p1', 'p2', 'p3']);
    updates.mockRestore();
  });
});
