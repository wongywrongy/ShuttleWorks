/**
 * The axios response interceptor's error handler — exercised DIRECTLY
 * here rather than through a mocked `apiClient` method. Every other test
 * that drives a 409 does `vi.spyOn(apiClient, 'putTournamentState')`,
 * which bypasses this interceptor entirely, so it can't prove anything
 * about what the interceptor itself does.
 *
 * That matters because the interceptor pushes its OWN generic error toast
 * for every rejected response — including the raw backend message, which
 * for CONFIG_LOCKED literally contains "Retry with ?clearSchedule=true".
 * `useTournamentState.forceSaveNow`'s reactive 409 handling (the unlock
 * modal / the DRAW_STARTED friendly toast) is pointless if this generic
 * handler ALSO fires a second, scarier toast with the raw query-param
 * string in it — so the interceptor must suppress its own toast for the
 * two lock codes and defer entirely to that dedicated handling.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { handleApiResponseError } from '../client';
import { useUiStore } from '../../store/uiStore';

function axiosLikeError(status: number, detail: unknown) {
  return {
    response: {
      status,
      headers: {},
      data: { detail },
    },
    message: `Request failed with status code ${status}`,
  };
}

beforeEach(() => {
  useUiStore.setState({ toasts: [] });
});

describe('handleApiResponseError — the real interceptor path', () => {
  it('CONFIG_LOCKED: does not push the generic raw-message toast', async () => {
    const err = axiosLikeError(409, {
      code: 'CONFIG_LOCKED',
      message:
        'Schedule locked: defaultRestMinutes cannot change while a committed schedule exists. Retry with ?clearSchedule=true to clear it and apply the edit.',
      fields: ['defaultRestMinutes'],
      schedules: ['bracket'],
    });

    await expect(async () => handleApiResponseError(err)).rejects.toBeTruthy();

    // No toast at all from this layer — `forceSaveNow`'s reactive 409
    // handler owns the UX (the unlock-confirm modal), not a toast.
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  it('DRAW_STARTED: does not push the generic raw-message toast', async () => {
    const err = axiosLikeError(409, {
      code: 'DRAW_STARTED',
      message: 'Draws in play cannot have their schedule cleared: evt-1.',
      events: ['evt-1'],
    });

    await expect(async () => handleApiResponseError(err)).rejects.toBeTruthy();

    // `forceSaveNow` pushes its own distinct "started draw" toast for this
    // code — this generic layer must stay silent so the operator doesn't
    // see it twice.
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  it('promotes code/status onto the rebuilt error for both lock codes', async () => {
    const err = axiosLikeError(409, {
      code: 'CONFIG_LOCKED',
      message: 'Schedule locked: defaultRestMinutes cannot change.',
    });

    await expect(async () => handleApiResponseError(err)).rejects.toMatchObject({
      code: 'CONFIG_LOCKED',
      status: 409,
    });
  });

  it('a plain STATE_CORRUPT 409 (unrelated code) still gets the generic toast — regression guard', async () => {
    const err = axiosLikeError(409, {
      code: 'STATE_CORRUPT',
      message: 'The saved state could not be read.',
    });

    await expect(async () => handleApiResponseError(err)).rejects.toBeTruthy();

    expect(useUiStore.getState().toasts).toHaveLength(1);
    expect(useUiStore.getState().toasts[0].message).toMatch(/could not be read/i);
  });

  it('a bare-string-detail 409 with no code still toasts (older-route fallback, unaffected)', async () => {
    const err = axiosLikeError(409, 'These players are placed in a generated draw: p1');

    await expect(async () => handleApiResponseError(err)).rejects.toBeTruthy();

    expect(useUiStore.getState().toasts).toHaveLength(1);
  });
});
