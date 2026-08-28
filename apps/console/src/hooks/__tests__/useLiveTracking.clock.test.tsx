/**
 * Perf pass 2 (render hotspots): useLiveTracking used to run a bare
 * `setInterval(1000)` that wrote a NEW aggregate object into `matchStateStore`
 * every second via a clock setter. Because the hook also subscribed to that
 * aggregate, EVERY component calling `useLiveTracking()` re-rendered once a
 * second forever, independent of any real data change.
 *
 * Investigation found that aggregate is dead output. The surviving
 * `matchStates` map must remain reference-stable when no poll data changed.
 *
 * This test proves the store is untouched on a 1s cadence: with fake timers,
 * advance 3s (short of the unrelated 5s sync interval) and assert the
 * surviving `matchStates` reference never changes.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { useLiveTracking } from '../useLiveTracking';
import { useMatchStateStore } from '../../store/matchStateStore';

vi.mock('../../api/client', () => ({
  apiClient: {
    getMatchStates: vi.fn(),
  },
  MatchVersionMismatch: class MatchVersionMismatch extends Error {},
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(apiClient.getMatchStates).mockReset();
  vi.mocked(apiClient.getMatchStates).mockResolvedValue({});
  useMatchStateStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLiveTracking — no 1s store-driven render storm', () => {
  it('does not write matchStateStore.matchStates on a 1s cadence', async () => {
    useMatchStateStore.getState().setMatchState('m1', { matchId: 'm1', status: 'scheduled' });

    const { unmount } = renderHook(() => useLiveTracking(), { wrapper: wrap('t1') });

    // Let the initial mount's load settle.
    await act(async () => {
      await Promise.resolve();
    });

    const matchStatesAfterMount = useMatchStateStore.getState().matchStates;

    // Advance 3s — well short of the unrelated 5s sync interval — so the
    // only thing that could fire on this window is the old 1s clock tick.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(useMatchStateStore.getState().matchStates).toBe(matchStatesAfterMount);

    unmount();
  });

});
