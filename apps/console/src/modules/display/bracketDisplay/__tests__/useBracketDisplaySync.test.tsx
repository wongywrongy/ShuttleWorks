import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useBracketDisplaySync } from '../useBracketDisplaySync';
import { apiClient } from '../../../../api/client';

vi.mock('../../../../api/client', () => ({
  apiClient: { getBracket: vi.fn(), getDisplayBracket: vi.fn() },
}));

const wrap =
  (id: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[`/display?id=${id}`]}>{children}</MemoryRouter>
  );

const emptyBracket = {
  events: [],
  play_units: [],
  assignments: [],
  results: [],
  participants: [],
  courts: 4,
  total_slots: 0,
  rest_between_rounds: 0,
  interval_minutes: 30,
  start_time: null,
};

describe('useBracketDisplaySync', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getBracket).mockReset();
    vi.mocked(apiClient.getDisplayBracket).mockReset();
  });

  it('polls getBracket and exposes the data + live status', async () => {
    vi.mocked(apiClient.getBracket).mockResolvedValue(emptyBracket as never);
    const { result } = renderHook(() => useBracketDisplaySync(new Date(0)), {
      wrapper: wrap('t1'),
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(apiClient.getBracket).toHaveBeenCalledWith('t1');
    expect(result.current.syncError).toBeNull();
  });

  it('keeps the prior DTO reference when a successful poll is unchanged', async () => {
    vi.useFakeTimers();
    try {
      const first = { ...emptyBracket };
      const unchanged = { ...emptyBracket };
      vi.mocked(apiClient.getBracket)
        .mockResolvedValueOnce(first as never)
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValueOnce(unchanged as never);
      let now = new Date(0);
      const { result, rerender } = renderHook(() => useBracketDisplaySync(now), {
        wrapper: wrap('t-unchanged'),
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const prior = result.current.data;
      expect(prior).toBe(first);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      now = new Date(10_000);
      rerender();
      expect(result.current.syncError).toBe('Connection lost');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      now = new Date(20_000);
      rerender();
      expect(result.current.data).toBe(prior);
      expect(result.current.freshness).toBe('live');
      expect(result.current.syncError).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces the missing-id error and does not poll', async () => {
    const wrapNoId =
      ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={['/display']}>{children}</MemoryRouter>
      );
    const { result } = renderHook(() => useBracketDisplaySync(new Date(0)), {
      wrapper: wrapNoId,
    });
    await waitFor(() =>
      expect(result.current.syncError).toMatch(/Missing \?token=/),
    );
    expect(apiClient.getBracket).not.toHaveBeenCalled();
  });

  it('stops polling on a terminal error instead of storming forever', async () => {
    // A revoked token / deleted workspace answers 403. Retrying can never
    // succeed, so the loop must stop — the same `lib/pollPolicy` contract
    // every other polling hook in the app already honours.
    vi.useFakeTimers();
    try {
      vi.mocked(apiClient.getDisplayBracket).mockRejectedValue(
        Object.assign(new Error('Forbidden'), { status: 403 }),
      );
      const wrapToken = ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={['/display?token=revoked']}>{children}</MemoryRouter>
      );
      renderHook(() => useBracketDisplaySync(new Date(0)), { wrapper: wrapToken });
      await vi.advanceTimersByTimeAsync(0);
      expect(apiClient.getDisplayBracket).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(35_000);
      expect(apiClient.getDisplayBracket).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('token mode reads the public projection via getDisplayBracket', async () => {
    vi.mocked(apiClient.getDisplayBracket).mockResolvedValue(emptyBracket as never);
    const wrapToken = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={['/display?token=tok-abc']}>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useBracketDisplaySync(new Date(0)), {
      wrapper: wrapToken,
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(apiClient.getDisplayBracket).toHaveBeenCalledWith('tok-abc');
    expect(apiClient.getBracket).not.toHaveBeenCalled();
  });
});
