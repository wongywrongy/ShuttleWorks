import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceIdentity } from '../useWorkspaceIdentity';
import { useUiStore } from '../../../store/uiStore';
import { useTournamentStore } from '../../../store/tournamentStore';

describe('useWorkspaceIdentity', () => {
  beforeEach(() => {
    useUiStore.getState().setActiveTournamentKind(null);
    useUiStore.getState().setActiveTournamentStatus(null);
    useUiStore.getState().setActiveTournamentPhase(null);
    useUiStore.getState().setActiveTournamentName(null);
    useTournamentStore.setState({ config: null } as never);
  });

  it('composes identity from the tournament + ui stores', () => {
    useTournamentStore.setState({
      config: { tournamentName: 'Spring Finals', tournamentDate: '2026-04-01' },
    } as never);
    useUiStore.getState().setActiveTournamentKind('meet');
    useUiStore.getState().setActiveTournamentStatus('active');
    useUiStore.getState().setActiveTournamentPhase('live');

    const { result } = renderHook(() => useWorkspaceIdentity());
    expect(result.current).toEqual({
      name: 'Spring Finals',
      date: '2026-04-01',
      status: 'active',
      phase: 'live',
      kind: 'meet',
    });
  });

  // P8: the shell header rendered the SCHEDULING CONFIG's copy of the title,
  // which a checked-out workspace can no longer amend (CONFIG_LOCKED), so a
  // renamed workspace kept its old name in the header while the Hub, the
  // public tier and the venue board all showed the new one.
  it('prefers the workspace row name over the scheduling config copy', () => {
    useTournamentStore.setState({
      config: { tournamentName: 'Taipei Open (2026)', tournamentDate: '2026-07-28' },
    } as never);
    useUiStore.getState().setActiveTournamentName('Taipei Open');

    const { result } = renderHook(() => useWorkspaceIdentity());
    expect(result.current.name).toBe('Taipei Open');
    expect(result.current.date).toBe('2026-07-28');
  });

  it('falls back to the config copy until the summary row lands', () => {
    useTournamentStore.setState({
      config: { tournamentName: 'Spring Finals', tournamentDate: '2026-04-01' },
    } as never);

    const { result } = renderHook(() => useWorkspaceIdentity());
    expect(result.current.name).toBe('Spring Finals');
  });

  it('returns nulls when nothing is loaded', () => {
    const { result } = renderHook(() => useWorkspaceIdentity());
    expect(result.current).toEqual({
      name: null,
      date: null,
      status: null,
      phase: null,
      kind: null,
    });
  });
});
