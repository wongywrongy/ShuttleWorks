/**
 * useDisplaySync — token mode (SP-CLOUD-2 public capability link).
 * With ?token= the hook polls the unauthenticated /display/{token}/state
 * projection instead of the viewer-gated /tournaments/{tid}/state, and
 * hydrates the same 7 store fields.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useDisplaySync } from '../useDisplaySync';
import { apiClient } from '../../../../api/client';
import { useTournamentStore } from '../../../../store/tournamentStore';

const wrap =
  (entry: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
  );

const remoteState = {
  config: { courtCount: 4 },
  groups: [{ id: 'g1' }],
  players: [{ id: 'p1', name: 'A' }],
  matches: [{ id: 'm1' }],
  schedule: { assignments: [] },
  scheduleIsStale: true,
  standings: [{ school: 'X' }],
};

describe('useDisplaySync — token mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useTournamentStore.setState({
      config: null,
      groups: [],
      players: [],
      matches: [],
      schedule: null,
      scheduleIsStale: false,
      standings: [],
    });
  });

  it('?token= polls getDisplayState and hydrates the store', async () => {
    const displaySpy = vi
      .spyOn(apiClient, 'getDisplayState')
      .mockResolvedValue(remoteState as never);
    const stateSpy = vi
      .spyOn(apiClient, 'getTournamentState')
      .mockResolvedValue(null as never);

    const { result } = renderHook(() => useDisplaySync(new Date()), {
      wrapper: wrap('/display?token=tok-abc'),
    });

    await waitFor(() => expect(displaySpy).toHaveBeenCalledWith('tok-abc'));
    expect(stateSpy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(useTournamentStore.getState().players).toEqual(remoteState.players),
    );
    const s = useTournamentStore.getState();
    expect(s.config).toEqual(remoteState.config);
    expect(s.groups).toEqual(remoteState.groups);
    expect(s.matches).toEqual(remoteState.matches);
    expect(s.schedule).toEqual(remoteState.schedule);
    expect(s.scheduleIsStale).toBe(true);
    expect(s.standings).toEqual(remoteState.standings);
    expect(result.current.syncError).toBeNull();
  });

  it('?id= keeps the authenticated getTournamentState path', async () => {
    const displaySpy = vi
      .spyOn(apiClient, 'getDisplayState')
      .mockResolvedValue(null as never);
    const stateSpy = vi
      .spyOn(apiClient, 'getTournamentState')
      .mockResolvedValue(remoteState as never);

    renderHook(() => useDisplaySync(new Date()), {
      wrapper: wrap('/display?id=t1'),
    });

    await waitFor(() => expect(stateSpy).toHaveBeenCalledWith('t1'));
    expect(displaySpy).not.toHaveBeenCalled();
  });

  it('a 404 on the token is TERMINAL: stops polling and says so', async () => {
    const displaySpy = vi
      .spyOn(apiClient, 'getDisplayState')
      .mockRejectedValue(Object.assign(new Error('Tournament not found'), { status: 404 }));

    const { result } = renderHook(() => useDisplaySync(new Date()), {
      wrapper: wrap('/display?token=bad-token'),
    });

    // An invalid capability token never becomes valid — the board must stop
    // polling AND say so, instead of sitting on "Waiting to connect…" forever.
    await waitFor(() => expect(result.current.terminal).toBe(true));
    expect(displaySpy).toHaveBeenCalledTimes(1);
  });

  it('a transient failure is NOT terminal — a live board survives blips', async () => {
    vi.spyOn(apiClient, 'getDisplayState').mockRejectedValue(
      Object.assign(new Error('Bad gateway'), { status: 502 }),
    );
    const { result } = renderHook(() => useDisplaySync(new Date()), {
      wrapper: wrap('/display?token=tok-abc'),
    });
    await waitFor(() => expect(result.current.syncError).toBe('Bad gateway'));
    expect(result.current.terminal).toBe(false);
  });

  it('neither token nor id: surfaces the missing-param error, no calls', async () => {
    const displaySpy = vi.spyOn(apiClient, 'getDisplayState');
    const stateSpy = vi.spyOn(apiClient, 'getTournamentState');
    const { result } = renderHook(() => useDisplaySync(new Date()), {
      wrapper: wrap('/display'),
    });
    await waitFor(() =>
      expect(result.current.syncError).toMatch(/Missing \?token=/),
    );
    expect(displaySpy).not.toHaveBeenCalled();
    expect(stateSpy).not.toHaveBeenCalled();
  });
});
