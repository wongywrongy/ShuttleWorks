/**
 * Vitest tests pinning that useSuggestions / useAdvisories now source
 * their hidden-tab gating from the shared `pageVisibility` helper
 * (perf pass 1) rather than ad-hoc `document.hidden` checks. Behavior is
 * unchanged from before the refactor — both hooks already skipped the
 * fetch while hidden and refreshed immediately on regain; these tests
 * assert that contract still holds after routing through the shared
 * helper.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { useSuggestions } from '../useSuggestions';
import { useAdvisories } from '../useAdvisories';

vi.mock('../../api/client', () => ({
  apiClient: {
    getSuggestions: vi.fn(),
    getAdvisories: vi.fn(),
  },
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
  vi.mocked(apiClient.getSuggestions).mockReset();
  vi.mocked(apiClient.getSuggestions).mockResolvedValue([]);
  vi.mocked(apiClient.getAdvisories).mockReset();
  vi.mocked(apiClient.getAdvisories).mockResolvedValue([]);
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSuggestions — hidden-tab gate', () => {
  it('skips the interval poll while hidden and refreshes on regain', async () => {
    const { unmount } = renderHook(() => useSuggestions(), { wrapper: wrap('t1') });

    await act(async () => {
      await Promise.resolve();
    });
    expect(apiClient.getSuggestions).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000 * 2);
    });
    expect(apiClient.getSuggestions).toHaveBeenCalledTimes(1);

    await act(async () => {
      setHidden(false);
      await Promise.resolve();
    });
    expect(apiClient.getSuggestions).toHaveBeenCalledTimes(2);

    unmount();
  });
});

describe('useAdvisories — hidden-tab gate', () => {
  it('skips the interval poll while hidden and refreshes on regain', async () => {
    const { unmount } = renderHook(() => useAdvisories(), { wrapper: wrap('t1') });

    await act(async () => {
      await Promise.resolve();
    });
    expect(apiClient.getAdvisories).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000 * 2);
    });
    expect(apiClient.getAdvisories).toHaveBeenCalledTimes(1);

    await act(async () => {
      setHidden(false);
      await Promise.resolve();
    });
    expect(apiClient.getAdvisories).toHaveBeenCalledTimes(2);

    unmount();
  });
});
