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

/**
 * Builds an error shaped exactly like the one the axios response
 * interceptor in `api/client.ts` throws: a plain `Error` with `.status`
 * and `.code` promoted to TOP-LEVEL properties (not nested under
 * `.response.data...`) plus the original `.response` passthrough. Tests
 * that mock `apiClient.putTournamentState` directly bypass the
 * interceptor, so the mock rejection must mimic its POST-interceptor
 * shape for `forceSaveNow`'s `err.code` / `err.status` reads to see it.
 */
function makeInterceptedError(
  status: number,
  code: string,
  message: string,
  schedules?: string[],
): Error & {
  status: number;
  code: string;
  schedules?: string[];
  response: { status: number };
} {
  const err = new Error(message) as Error & {
    status: number;
    code: string;
    schedules?: string[];
    response: { status: number };
  };
  err.status = status;
  err.code = code;
  if (schedules) err.schedules = schedules;
  err.response = { status };
  return err;
}

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

    // One-shot: the following save is a plain PUT — no opts argument at all,
    // so the sanctioned clear cannot leak into an ordinary save.
    await forceSaveNow();
    expect(put).toHaveBeenLastCalledWith('tid-1', expect.anything());
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
    // carry the clearSchedule opt-in — declining never arms it. A plain
    // two-argument call is exactly "no opt-in".
    await forceSaveNow();
    expect(put).toHaveBeenCalledWith('tid-1', expect.anything());
  });

  it('a DRAW_STARTED 409 is not met with an automatic clearSchedule retry', async () => {
    const drawStarted409 = makeInterceptedError(
      409,
      'DRAW_STARTED',
      'Draws in play cannot have their schedule cleared: evt-1.',
    );
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
    expect(useUiStore.getState().toasts.at(-1)?.message).toMatch(/started draw/i);
  });
});

describe('forceSaveNow — reactive 409 CONFIG_LOCKED backstop (cross-module lock)', () => {
  /**
   * The engine config is SHARED across meet and bracket and routes through
   * ONE backend lock endpoint that fires when EITHER module has a committed
   * schedule with assignments. The per-module proactive guards
   * (meet's `isScheduleLocked`, bracket's `bracketHasSchedule`) only see
   * their OWN module's schedule, so they miss the cross-module case: e.g.
   * a bracket draw is generated with assignments but the meet has no
   * committed schedule, so meet's guard sees `isScheduleLocked === false`
   * and lets the save proceed straight to the wire. These tests exercise
   * the REACTIVE backstop in `forceSaveNow`: it reacts to the backend's
   * 409 CONFIG_LOCKED regardless of which module's local guard missed it.
   */
  const configLocked409 = () =>
    makeInterceptedError(
      409,
      'CONFIG_LOCKED',
      'Schedule locked: defaultRestMinutes cannot change while a committed schedule exists. Retry with ?clearSchedule=true to clear it and apply the edit.',
    );

  beforeEach(() => {
    // Cross-module case: meet's OWN schedule is null (its proactive guard
    // would see isScheduleLocked === false and not prompt), but the
    // backend still 409s because the bracket has a committed schedule.
    useTournamentStore.setState({
      schedule: null,
      isScheduleLocked: false,
    });
  });

  it('meet-tab edit, only a bracket schedule present: 409 opens the confirm modal, and confirming retries with clearSchedule', async () => {
    const put = vi
      .spyOn(apiClient, 'putTournamentState')
      .mockRejectedValueOnce(configLocked409() as never)
      .mockResolvedValueOnce({} as never);

    const flush = forceSaveNow();

    await vi.waitFor(() =>
      expect(useUiStore.getState().unlockModalState?.open).toBe(true),
    );

    act(() => {
      useUiStore.getState().unlockModalState?.resolve(true);
    });

    await flush;

    expect(put).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenNthCalledWith(1, 'tid-1', expect.anything());
    expect(put).toHaveBeenNthCalledWith(
      2,
      'tid-1',
      expect.anything(),
      { clearSchedule: true },
    );
    expect(useUiStore.getState().unlockModalState).toBeNull();
    expect(useUiStore.getState().persistStatus).toBe('idle');
  });

  it('bracket-tab edit, only a meet schedule present: 409 opens the confirm modal too (same backstop, either direction)', async () => {
    const put = vi
      .spyOn(apiClient, 'putTournamentState')
      .mockRejectedValueOnce(
        makeInterceptedError(
          409,
          'CONFIG_LOCKED',
          'Schedule locked: solverTimeLimitSeconds cannot change.',
        ) as never,
      )
      .mockResolvedValueOnce({} as never);

    const flush = forceSaveNow();

    await vi.waitFor(() =>
      expect(useUiStore.getState().unlockModalState?.open).toBe(true),
    );

    act(() => {
      useUiStore.getState().unlockModalState?.resolve(true);
    });

    await flush;

    expect(put).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenNthCalledWith(
      2,
      'tid-1',
      expect.anything(),
      { clearSchedule: true },
    );
  });

  it('declining the reactive modal abandons the edit — no clearSchedule retry is sent', async () => {
    const put = vi
      .spyOn(apiClient, 'putTournamentState')
      .mockRejectedValueOnce(configLocked409() as never);
    vi.spyOn(apiClient, 'getTournamentState').mockResolvedValueOnce({
      config: { intervalMinutes: 30 } as never,
    } as never);

    const flush = forceSaveNow();

    await vi.waitFor(() =>
      expect(useUiStore.getState().unlockModalState?.open).toBe(true),
    );

    act(() => {
      useUiStore.getState().unlockModalState?.resolve(false);
    });

    await flush;

    // Only the original (rejected) PUT was sent — no clearSchedule retry.
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith('tid-1', expect.anything());
    expect(useUiStore.getState().unlockModalState).toBeNull();
    expect(useUiStore.getState().persistStatus).toBe('idle');
  });

  it('a CONFIG_LOCKED 409 naming both schedules discloses the bracket clear in the modal', async () => {
    const put = vi
      .spyOn(apiClient, 'putTournamentState')
      .mockRejectedValueOnce(
        makeInterceptedError(
          409,
          'CONFIG_LOCKED',
          'Schedule locked: defaultRestMinutes cannot change.',
          ['meet', 'bracket'],
        ) as never,
      )
      .mockResolvedValueOnce({} as never);

    const flush = forceSaveNow();

    await vi.waitFor(() =>
      expect(useUiStore.getState().unlockModalState?.open).toBe(true),
    );

    expect(useUiStore.getState().unlockModalState?.crossModuleNote).toMatch(
      /bracket/i,
    );

    act(() => {
      useUiStore.getState().unlockModalState?.resolve(true);
    });

    await flush;
    expect(put).toHaveBeenCalledTimes(2);
  });

  it('a CONFIG_LOCKED 409 naming only the meet schedule does NOT mention the bracket', async () => {
    vi.spyOn(apiClient, 'putTournamentState')
      .mockRejectedValueOnce(
        makeInterceptedError(
          409,
          'CONFIG_LOCKED',
          'Schedule locked: defaultRestMinutes cannot change.',
          ['meet'],
        ) as never,
      )
      .mockResolvedValueOnce({} as never);

    const flush = forceSaveNow();

    await vi.waitFor(() =>
      expect(useUiStore.getState().unlockModalState?.open).toBe(true),
    );

    expect(useUiStore.getState().unlockModalState?.crossModuleNote).toBeUndefined();

    act(() => {
      useUiStore.getState().unlockModalState?.resolve(true);
    });

    await flush;
  });

  it('a normal (unlocked) save with no committed schedule anywhere does not prompt at all', async () => {
    const put = vi
      .spyOn(apiClient, 'putTournamentState')
      .mockResolvedValue({} as never);

    await forceSaveNow();

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith('tid-1', expect.anything());
    expect(useUiStore.getState().unlockModalState).toBeNull();
  });
});
