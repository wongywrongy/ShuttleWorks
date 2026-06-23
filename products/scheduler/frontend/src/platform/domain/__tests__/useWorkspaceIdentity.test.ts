import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceIdentity } from '../useWorkspaceIdentity';
import { useUiStore } from '../../../store/uiStore';
import { useTournamentStore } from '../../../store/tournamentStore';

describe('useWorkspaceIdentity', () => {
  beforeEach(() => {
    useUiStore.getState().setActiveTournamentKind(null);
    useUiStore.getState().setActiveTournamentStatus(null);
    useTournamentStore.setState({ config: null } as never);
  });

  it('composes identity from the tournament + ui stores', () => {
    useTournamentStore.setState({
      config: { tournamentName: 'Spring Finals', tournamentDate: '2026-04-01' },
    } as never);
    useUiStore.getState().setActiveTournamentKind('meet');
    useUiStore.getState().setActiveTournamentStatus('active');

    const { result } = renderHook(() => useWorkspaceIdentity());
    expect(result.current).toEqual({
      name: 'Spring Finals',
      date: '2026-04-01',
      status: 'active',
      kind: 'meet',
    });
  });

  it('returns nulls when nothing is loaded', () => {
    const { result } = renderHook(() => useWorkspaceIdentity());
    expect(result.current).toEqual({
      name: null,
      date: null,
      status: null,
      kind: null,
    });
  });
});
