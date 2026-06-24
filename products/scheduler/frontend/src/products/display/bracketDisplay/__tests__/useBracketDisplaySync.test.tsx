import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useBracketDisplaySync } from '../useBracketDisplaySync';
import { apiClient } from '../../../../api/client';

vi.mock('../../../../api/client', () => ({ apiClient: { getBracket: vi.fn() } }));

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
  beforeEach(() => vi.mocked(apiClient.getBracket).mockReset());

  it('polls getBracket and exposes the data + live status', async () => {
    vi.mocked(apiClient.getBracket).mockResolvedValue(emptyBracket as never);
    const { result } = renderHook(() => useBracketDisplaySync(new Date(0)), {
      wrapper: wrap('t1'),
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(apiClient.getBracket).toHaveBeenCalledWith('t1');
    expect(result.current.syncError).toBeNull();
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
      expect(result.current.syncError).toMatch(/Missing \?id=/),
    );
    expect(apiClient.getBracket).not.toHaveBeenCalled();
  });
});
