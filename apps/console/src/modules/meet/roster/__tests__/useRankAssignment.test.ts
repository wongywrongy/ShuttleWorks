import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PlayerDTO, RosterGroupDTO } from '../../../../api/dto';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useRankAssignment } from '../positionGrid/useRankAssignment';

const mkPlayer = (id: string, groupId: string, ranks: string[] = []): PlayerDTO =>
  ({ id, name: id, groupId, ranks, availability: [] } as PlayerDTO);

function seed(players: PlayerDTO[]) {
  useTournamentStore.setState({
    groups: [
      { id: 'S1', name: 'School 1' },
      { id: 'S2', name: 'School 2' },
    ] as RosterGroupDTO[],
    players,
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
});
