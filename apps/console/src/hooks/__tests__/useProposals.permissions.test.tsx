/**
 * The proposal write gate (audit A2-followup).
 *
 * `useProposals` calls apiClient directly, and the original A2 fix missed it —
 * so a viewer's "Commit repair" / "Commit move" left the browser, came back 403,
 * and offered a Retry that could never succeed.
 *
 * Like the bracket gate test, this runs the REAL hook and fakes only the
 * transport. Mocking the seam is how the seam went unguarded in the first place.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProposals } from '../useProposals';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';
import type { TournamentRole } from '../../api/dto';

vi.mock('../useTournamentId', () => ({ useTournamentId: () => 'tid-1' }));

vi.mock('../../api/client', () => ({
  apiClient: {
    createRepairProposal: vi.fn().mockResolvedValue({ id: 'p1' }),
    createManualEditProposal: vi.fn().mockResolvedValue({ id: 'p1' }),
    commitProposal: vi.fn().mockResolvedValue({ state: {} }),
  },
}));

const { apiClient } = await import('../../api/client');

const asRole = (role: TournamentRole | null) =>
  useUiStore.setState({ activeTournamentRole: role });

beforeEach(() => {
  vi.clearAllMocks();
  // The creators also require a config + schedule to exist; give them one so the
  // ONLY thing under test is the permission check.
  useTournamentStore.setState({
    config: { intervalMinutes: 30, courtCount: 2 } as never,
    schedule: { assignments: [], status: 'optimal' } as never,
    matches: [],
    players: [],
  });
});

describe('useProposals — the write gate', () => {
  it('lets an operator create and commit', async () => {
    asRole('operator');
    const { result } = renderHook(() => useProposals());

    await act(async () => {
      await result.current.createManualEdit('m1', 3, 1);
    });
    expect(apiClient.createManualEditProposal).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.commit('p1');
    });
    expect(apiClient.commitProposal).toHaveBeenCalledTimes(1);
  });

  it('refuses a viewer without touching the network', async () => {
    asRole('viewer');
    const { result } = renderHook(() => useProposals());

    await act(async () => {
      expect(await result.current.createRepair({ kind: 'overrun' } as never)).toBeNull();
      expect(await result.current.createManualEdit('m1', 3, 1)).toBeNull();
      // Commit guards itself: it is the call that actually rewrites the
      // schedule, so it doesn't merely trust that no proposal could exist.
      expect(await result.current.commit('p1')).toBeNull();
    });

    expect(apiClient.createRepairProposal).not.toHaveBeenCalled();
    expect(apiClient.createManualEditProposal).not.toHaveBeenCalled();
    expect(apiClient.commitProposal).not.toHaveBeenCalled();
  });

  it('fails closed on an unknown role', async () => {
    asRole(null);
    const { result } = renderHook(() => useProposals());
    await act(async () => {
      expect(await result.current.commit('p1')).toBeNull();
    });
    expect(apiClient.commitProposal).not.toHaveBeenCalled();
  });
});
