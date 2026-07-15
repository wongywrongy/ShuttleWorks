/**
 * Vitest tests for useMatchStateSync's visibility pause (perf pass 1).
 *
 * The 5s poll used to keep fetching while the tab was hidden. It now
 * skips the interval fetch while `document.hidden` and fires an
 * immediate sync on visibility regain.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { apiClient } from '../../api/client';
import { useMatchStateSync } from '../useMatchStateSync';

vi.mock('../../api/client', () => ({
  apiClient: {
    getMatchStates: vi.fn(),
  },
}));

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(apiClient.getMatchStates).mockReset();
  vi.mocked(apiClient.getMatchStates).mockResolvedValue({});
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMatchStateSync — pauses while hidden', () => {
  it('does not poll on the interval while hidden, and syncs immediately on regain', async () => {
    const { unmount } = renderHook(() => useMatchStateSync('t1'));

    // Initial mount fires one sync immediately.
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiClient.getMatchStates).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000 * 3);
    });
    // Hidden the whole time — no additional polls.
    expect(apiClient.getMatchStates).toHaveBeenCalledTimes(1);

    await act(async () => {
      setHidden(false);
      await Promise.resolve();
    });
    // Regain triggers an immediate sync.
    expect(apiClient.getMatchStates).toHaveBeenCalledTimes(2);

    unmount();
  });
});
