/**
 * Vitest tests for useLiveTracking's 5s match-state sync interval: the
 * visibility gate (perf pass 1) and the terminal-error stop. Only that
 * interval is in scope here.
 *
 * Perf pass 2 removed the 1s wall-clock tick entirely —
 * see `useLiveTracking.clock.test.tsx` for the regression test proving it's
 * gone.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { useTournamentStore } from '../../store/tournamentStore';
import { useLiveTracking } from '../useLiveTracking';

vi.mock('../../api/client', () => ({
  apiClient: {
    getMatchStates: vi.fn(),
  },
  MatchVersionMismatch: class MatchVersionMismatch extends Error {},
}));

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

const wrap =
  (id: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[`/tournaments/${id}`]}>
      <Routes>
        <Route path="/tournaments/:id" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(apiClient.getMatchStates).mockReset();
  vi.mocked(apiClient.getMatchStates).mockResolvedValue({});
  setHidden(false);
});

afterEach(() => {
  useTournamentStore.setState({ matches: [] });
  vi.useRealTimers();
});

describe('useLiveTracking — Plan read budget', () => {
  it('hydrates 160 Plan matches with one batched match-state request', async () => {
    useTournamentStore.setState({
      matches: Array.from({ length: 160 }, (_, index) => ({
        id: `match-${index + 1}`,
      })) as never,
    });

    const { unmount } = renderHook(() => useLiveTracking(), { wrapper: wrap('plan-large') });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiClient.getMatchStates).toHaveBeenCalledTimes(1);
    expect(apiClient.getMatchStates).toHaveBeenCalledWith('plan-large');
    unmount();
  });
});

describe('useLiveTracking — 5s sync pauses while hidden', () => {
  it('does not poll on the 5s interval while hidden, and syncs immediately on regain', async () => {
    const { unmount } = renderHook(() => useLiveTracking(), { wrapper: wrap('t1') });

    // Initial mount fires one load immediately.
    await act(async () => {
      await Promise.resolve();
    });
    const callsAfterMount = vi.mocked(apiClient.getMatchStates).mock.calls.length;

    act(() => setHidden(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000 * 3);
    });
    // Hidden the whole time — no additional polls beyond the initial load.
    expect(apiClient.getMatchStates).toHaveBeenCalledTimes(callsAfterMount);

    await act(async () => {
      setHidden(false);
      await Promise.resolve();
    });
    // Regain triggers an immediate sync.
    expect(apiClient.getMatchStates).toHaveBeenCalledTimes(callsAfterMount + 1);

    unmount();
  });
});

describe('useLiveTracking — 5s sync stops on a terminal error', () => {
  it('a 404 (workspace gone / bad display token) ends the poll', async () => {
    vi.mocked(apiClient.getMatchStates).mockRejectedValue(
      Object.assign(new Error('Tournament not found'), { status: 404 }),
    );
    const { unmount } = renderHook(() => useLiveTracking(), { wrapper: wrap('t1') });
    await act(async () => {
      await Promise.resolve();
    });
    const callsAfterMount = vi.mocked(apiClient.getMatchStates).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000 * 6);
    });
    // A 404 can never come good — retrying every 5s just storms the console
    // forever (an invalid display link did exactly that).
    expect(apiClient.getMatchStates).toHaveBeenCalledTimes(callsAfterMount);
    unmount();
  });

  it('keeps polling through a transient failure (5xx / network blip)', async () => {
    vi.mocked(apiClient.getMatchStates).mockRejectedValue(
      Object.assign(new Error('Bad gateway'), { status: 502 }),
    );
    const { unmount } = renderHook(() => useLiveTracking(), { wrapper: wrap('t1') });
    await act(async () => {
      await Promise.resolve();
    });
    const callsAfterMount = vi.mocked(apiClient.getMatchStates).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000 * 3);
    });
    expect(
      vi.mocked(apiClient.getMatchStates).mock.calls.length,
    ).toBeGreaterThan(callsAfterMount);
    unmount();
  });
});
