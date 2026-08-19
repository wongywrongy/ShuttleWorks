/**
 * D1 — unknown is not none.
 *
 * A dropped bracket-occupancy fetch used to tell the meet solver the bracket
 * occupies NO courts (`catch { return [] }`), and the schedule it returned
 * could double-book them. Ruled 2026-08-19: 404 = genuinely no bracket = no
 * occupancy (getBracket maps it to null before the catch); every other
 * failure blocks the solve and tells the operator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../useTournamentId', () => ({
  useTournamentIdOrNull: () => 't1',
  useTournamentId: () => 't1',
}));
vi.mock('../../api/client', () => ({
  apiClient: {
    getBracket: vi.fn(),
    runSolveJob: vi.fn(async () => ({ status: 'optimal', assignments: [] })),
    listSolveJobs: vi.fn(async () => []),
  },
}));

import { useSchedule } from '../useSchedule';
import { apiClient } from '../../api/client';
import { useTournamentStore } from '../../store/tournamentStore';
import { useUiStore } from '../../store/uiStore';

const CONFIG = {
  dayStart: '08:00', dayEnd: '20:00', intervalMinutes: 30,
  breaks: [], courtCount: 4, defaultRestMinutes: 0, freezeHorizonSlots: 0,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  useTournamentStore.setState({ config: CONFIG, players: [], matches: [] });
  useUiStore.setState({ generationError: null, isGenerating: false });
});

describe('resolveClosedWindows — D1', () => {
  it('a failed occupancy fetch BLOCKS the solve and tells the operator', async () => {
    vi.mocked(apiClient.getBracket).mockRejectedValue(new Error('timeout'));
    const { result } = renderHook(() => useSchedule());

    await act(async () => {
      await result.current.generateSchedule();
    });

    expect(apiClient.runSolveJob).not.toHaveBeenCalled();
    expect(useUiStore.getState().generationError).toMatch(/bracket court usage/i);
  });

  it('NEGATIVE CONTROL: no bracket (404 → null) really is no occupancy — solve proceeds', async () => {
    // Proves the block above is caused by the FAILURE, not by the fetch
    // existing: the meet-only workspace must keep its zero-friction solve.
    vi.mocked(apiClient.getBracket).mockResolvedValue(null);
    const { result } = renderHook(() => useSchedule());

    await act(async () => {
      await result.current.generateSchedule();
    });

    expect(apiClient.runSolveJob).toHaveBeenCalledTimes(1);
    // and it did not smuggle a closedCourtWindows claim into the body
    const body = vi.mocked(apiClient.runSolveJob).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(body.closedCourtWindows).toBeUndefined();
    expect(useUiStore.getState().generationError).toBeNull();
  });

  it('caller-provided windows short-circuit the fetch (lockstep with the board)', async () => {
    const { result } = renderHook(() => useSchedule());

    await act(async () => {
      await result.current.generateSchedule([[1, 0, 3]]);
    });

    expect(apiClient.getBracket).not.toHaveBeenCalled();
    const body = vi.mocked(apiClient.runSolveJob).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(body.closedCourtWindows).toEqual([[1, 0, 3]]);
  });
});
