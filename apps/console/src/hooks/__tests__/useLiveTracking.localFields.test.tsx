/**
 * Local-only match-state fields must survive a successful write.
 *
 * The backend match-state DTO carries neither `playerConfirmations` nor
 * `postponed` — they are client-local. Both POLL paths always preserved
 * them on merge, but the WRITE success paths applied the server echo
 * verbatim, so checking a player in (or postponing) silently reverted the
 * moment the write round-tripped. Found live by the SP-CONSOLE-4 C4
 * meet-day smoke; fixed by giving the success paths the same merge the
 * polls use.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { useLiveTracking } from '../useLiveTracking';
import { useMatchStateStore } from '../../store/matchStateStore';
import type { MatchStateDTO } from '../../api/dto';

vi.mock('../../api/client', () => ({
  apiClient: {
    getMatchStates: vi.fn(),
    getMatchVersion: vi.fn(),
    updateMatchState: vi.fn(),
  },
  MatchVersionMismatch: class MatchVersionMismatch extends Error {},
}));

// The write gate is not under test — allow the writes.
vi.mock('../useCanEdit', () => ({
  assertCanEdit: () => true,
  useCanEdit: () => true,
}));

const wrap =
  (id: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[`/tournaments/${id}`]}>
      <Routes>
        <Route path="/tournaments/:id" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  );

/** Server echo: the DTO shape the backend actually returns — status +
 *  stamps, NO playerConfirmations / postponed keys. */
const serverEcho = (matchId: string, status: MatchStateDTO['status']) => ({
  state: { matchId, status } as MatchStateDTO,
  version: 2,
});

beforeEach(() => {
  vi.mocked(apiClient.getMatchStates).mockReset().mockResolvedValue({});
  vi.mocked(apiClient.getMatchVersion).mockReset().mockResolvedValue(1);
  vi.mocked(apiClient.updateMatchState).mockReset();
  useMatchStateStore.getState().reset();
});

describe('useLiveTracking — local-only fields survive the write echo', () => {
  it('confirmPlayer: the confirmation outlives the server echo', async () => {
    vi.mocked(apiClient.updateMatchState).mockResolvedValue(serverEcho('m1', 'called'));
    useMatchStateStore.getState().setMatchState('m1', { matchId: 'm1', status: 'called' });

    const { result } = renderHook(() => useLiveTracking(), { wrapper: wrap('t1') });
    await act(async () => {
      await result.current.confirmPlayer('m1', 'p1', true);
    });

    expect(useMatchStateStore.getState().matchStates['m1'].playerConfirmations).toEqual({
      p1: true,
    });
  });

  it('updateMatchStatus: the postponed flag outlives the server echo', async () => {
    vi.mocked(apiClient.updateMatchState).mockResolvedValue(serverEcho('m1', 'scheduled'));
    useMatchStateStore.getState().setMatchState('m1', { matchId: 'm1', status: 'scheduled' });

    const { result } = renderHook(() => useLiveTracking(), { wrapper: wrap('t1') });
    await act(async () => {
      await result.current.updateMatchStatus('m1', 'scheduled', { postponed: true });
    });

    expect(useMatchStateStore.getState().matchStates['m1'].postponed).toBe(true);
  });
});
