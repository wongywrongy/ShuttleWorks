/**
 * Confirming the unlock modal must arm ?clearSchedule=true on the next
 * PUT — that is what sanctions the edit server-side and clears the
 * bracket schedule (which the client cannot null out itself).
 *
 * Also pins the two properties that make the guard safe:
 *   - declining the confirm sends NOTHING (no PUT at all, no flag armed).
 *   - a DRAW_STARTED 409 (the absolute lock) is never met with an
 *     automatic clearSchedule retry — the UI has no override for it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { apiClient } from '../../api/client';
import { useTournamentStore } from '../../store/tournamentStore';
import { useUiStore } from '../../store/uiStore';
import { useLockGuard } from '../useLockGuard';
import {
  _resetSaveStateForTests,
  forceSaveNow,
} from '../useTournamentState';

vi.mock('../useCanEdit', () => ({ assertCanEdit: () => true }));

describe('lock guard → clearSchedule PUT', () => {
  beforeEach(() => {
    _resetSaveStateForTests();
    useTournamentStore.setState({
      schedule: { assignments: [] } as never,
      isScheduleLocked: true,
    });
    useUiStore.getState().setActiveTournamentId('tid-1');
  });

  it('confirmed unlock sends clearSchedule on the next PUT', async () => {
    const put = vi
      .spyOn(apiClient, 'putTournamentState')
      .mockResolvedValue({} as never);

    const { result } = renderHook(() => useLockGuard());
    let confirmed: Promise<boolean>;
    act(() => {
      confirmed = result.current.confirmUnlock('edit rest');
      // Simulate the operator clicking Confirm in UnlockModalHost.
      useUiStore.getState().unlockModalState?.resolve(true);
    });
    await confirmed!;

    await forceSaveNow();
    expect(put).toHaveBeenCalledWith(
      'tid-1',
      expect.anything(),
      { clearSchedule: true },
    );

    // One-shot: the following save is a plain PUT.
    await forceSaveNow();
    expect(put).toHaveBeenLastCalledWith('tid-1', expect.anything(), undefined);
  });

  it('declining the confirm sends nothing — the schedule survives', async () => {
    const put = vi
      .spyOn(apiClient, 'putTournamentState')
      .mockResolvedValue({} as never);

    const { result } = renderHook(() => useLockGuard());
    let confirmed: Promise<boolean>;
    act(() => {
      confirmed = result.current.confirmUnlock('edit rest');
      // Simulate the operator clicking Cancel in UnlockModalHost.
      useUiStore.getState().unlockModalState?.resolve(false);
    });
    expect(await confirmed!).toBe(false);

    // No PUT was ever issued by the decline itself, and the schedule
    // (and its lock) are untouched.
    expect(put).not.toHaveBeenCalled();
    expect(useTournamentStore.getState().isScheduleLocked).toBe(true);
    expect(useTournamentStore.getState().schedule).toEqual({ assignments: [] });

    // Even if something else triggers a save afterwards, it must NOT
    // carry the clearSchedule opt-in — declining never arms it.
    await forceSaveNow();
    expect(put).toHaveBeenCalledWith('tid-1', expect.anything(), undefined);
  });

  it('a DRAW_STARTED 409 is not met with an automatic clearSchedule retry', async () => {
    const drawStarted409 = {
      response: {
        status: 409,
        data: {
          code: 'DRAW_STARTED',
          message: 'Draws in play cannot have their schedule cleared: evt-1.',
          events: ['evt-1'],
        },
      },
      message: 'Request failed with status code 409',
    };
    const put = vi
      .spyOn(apiClient, 'putTournamentState')
      .mockRejectedValueOnce(drawStarted409 as never);
    vi.spyOn(apiClient, 'getTournamentState').mockResolvedValueOnce(null);

    await expect(forceSaveNow()).rejects.toBeTruthy();

    // The 409 handler re-syncs and toasts — it does NOT open the unlock
    // modal or retry with clearSchedule. That lock is absolute; there is
    // no override to present.
    expect(put).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().unlockModalState).toBeNull();
  });
});
