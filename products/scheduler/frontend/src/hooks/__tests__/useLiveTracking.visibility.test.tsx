/**
 * Vitest test for useLiveTracking's 5s match-state sync visibility gate
 * (perf pass 1). Only the 5s `syncMatchStates` interval is in scope here —
 * the 1s clock tick (`setCurrentTime`) is deliberately untouched (pass 2).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { apiClient } from '../../api/client';
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
  vi.useRealTimers();
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
