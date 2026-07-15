/**
 * Vitest tests for the shared bracket poll registry (perf pass 1).
 *
 * Root cause under test: `useBracket`'s module-level poll entry used to
 * hand every subscriber a FRESH `readSnapshot()` object on every notify,
 * so an unchanged poll tick re-rendered every bracket consumer twice
 * (fetch-start + fetch-end). These tests pin the fix:
 *   - an unchanged fetch result must not produce a new snapshot object
 *     (no re-render bait) and must not flip `loading`,
 *   - a changed fetch result must produce a new `data` reference and a
 *     genuinely new snapshot,
 *   - the interval must not fetch while the page is hidden, and must
 *     refetch immediately on visibility regain — except for entries that
 *     are semantically paused (no-draw / terminal error), which must NOT
 *     be woken by a visibility regain (that would resurrect the 404
 *     storm / the doomed poll on a deleted workspace).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { BracketApiProvider } from '../../api/bracketClient';
import { useBracket } from '../useBracket';
import type { BracketTournamentDTO } from '../../api/bracketDto';

vi.mock('../../api/client', () => ({
  apiClient: {
    getBracket: vi.fn(),
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
        <Route
          path="/tournaments/:id"
          element={<BracketApiProvider tournamentId={id}>{children}</BracketApiProvider>}
        />
      </Routes>
    </MemoryRouter>
  );

const dtoA = { courts: 2, results: [] } as unknown as BracketTournamentDTO;
const dtoB = { courts: 4, results: [] } as unknown as BracketTournamentDTO;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(apiClient.getBracket).mockReset();
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBracket — content-guarded shared poll', () => {
  it('keeps the same snapshot object (no re-render) when a poll tick is unchanged', async () => {
    vi.mocked(apiClient.getBracket).mockResolvedValue(dtoA);
    const { result, unmount } = renderHook(() => useBracket(), { wrapper: wrap('t1') });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.data).toEqual(dtoA);
    const dataRefAfterFirstLoad = result.current.data;

    // Same DTO content on the next tick.
    vi.mocked(apiClient.getBracket).mockResolvedValue({ ...dtoA });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    // Reference-identical: content-guard kept the old object.
    expect(result.current.data).toBe(dataRefAfterFirstLoad);
    expect(result.current.loading).toBe(false);

    unmount();
  });

  it('does not flip `loading` on a silent background refresh once data exists', async () => {
    vi.mocked(apiClient.getBracket).mockResolvedValue(dtoA);
    const { result, unmount } = renderHook(() => useBracket(), { wrapper: wrap('t1') });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.data).toEqual(dtoA);

    const loadingSamples: boolean[] = [];
    vi.mocked(apiClient.getBracket).mockImplementation(async () => {
      loadingSamples.push(result.current.loading);
      return dtoB;
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    // loading must have stayed false through the whole background refresh.
    expect(loadingSamples.every((v) => v === false)).toBe(true);
    expect(result.current.loading).toBe(false);
    // Data DID change, so a fresh reference + value is expected.
    expect(result.current.data).toEqual(dtoB);

    unmount();
  });

  it('produces a new data reference and notifies when the fetch result actually changes', async () => {
    vi.mocked(apiClient.getBracket).mockResolvedValue(dtoA);
    const { result, unmount } = renderHook(() => useBracket(), { wrapper: wrap('t1') });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const first = result.current.data;

    vi.mocked(apiClient.getBracket).mockResolvedValue(dtoB);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(result.current.data).not.toBe(first);
    expect(result.current.data).toEqual(dtoB);

    unmount();
  });

  it('does not fetch on the interval tick while the page is hidden, and refetches on regain', async () => {
    vi.mocked(apiClient.getBracket).mockResolvedValue(dtoA);
    const { unmount } = renderHook(() => useBracket(), { wrapper: wrap('t1') });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(apiClient.getBracket).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500 * 3);
    });
    // Hidden the whole time — no additional fetches.
    expect(apiClient.getBracket).toHaveBeenCalledTimes(1);

    await act(async () => {
      setHidden(false);
      await Promise.resolve();
      await Promise.resolve();
    });
    // Regain triggers an immediate refetch.
    expect(apiClient.getBracket).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('does NOT wake a paused (no-draw) entry on visibility regain', async () => {
    vi.mocked(apiClient.getBracket).mockResolvedValue(null);
    const { unmount } = renderHook(() => useBracket(), { wrapper: wrap('t2') });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Resolved null -> entry paused, no interval running.
    expect(apiClient.getBracket).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    await act(async () => {
      setHidden(false);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Still paused: a visibility regain must not re-issue the 404 poll.
    expect(apiClient.getBracket).toHaveBeenCalledTimes(1);

    unmount();
  });
});
