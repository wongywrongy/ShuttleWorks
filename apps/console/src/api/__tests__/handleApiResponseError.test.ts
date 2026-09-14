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
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { decodeBlobError, handleApiResponseError } from '../client';
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
  it.each([
    ['AUTH_MFA_INVALID', '/auth/mfa/verify', 0, 0],
    ['AUTH_INVALID_CREDENTIALS', '/auth/login', 0, 0],
    ['AUTH_NOT_SIGNED_IN', '/auth/mfa/verify', 1, 0],
    ['AUTH_REAUTH_REQUIRED', '/tournaments/example', 0, 1],
    ['AUTH_MFA_REQUIRED', '/tournaments/example', 1, 0],
    // A background activity ping on a dead ceremony must end the session too.
    ['AUTH_MFA_REQUIRED', '/auth/activity', 1, 0],
  ])('routes %s to its authentication ceremony without duplicate toasts', async (code, url, expiryCount, reauthCount) => {
    const expired = vi.fn();
    const reauth = vi.fn();
    window.addEventListener('sw:session-expired', expired);
    window.addEventListener('sw:reauth-required', reauth);
    try {
      const error = { ...axiosLikeError(401, { code, message: 'Authentication required' }), config: { url } };
      await expect(async () => handleApiResponseError(error)).rejects.toMatchObject({ code, status: 401 });
      expect(expired).toHaveBeenCalledTimes(expiryCount);
      expect(reauth).toHaveBeenCalledTimes(reauthCount);
      if (url.startsWith('/auth/') || reauthCount) expect(useUiStore.getState().toasts).toHaveLength(0);
    } finally {
      window.removeEventListener('sw:session-expired', expired);
      window.removeEventListener('sw:reauth-required', reauth);
    }
  });

  it('a failed freshness probe tells the operator their export did not start', async () => {
    const error = { ...axiosLikeError(503, { code: 'AUTH_MFA_UNAVAILABLE', message: 'Authenticator service is unavailable' }), config: { url: '/auth/reauth-check' } };
    await expect(async () => handleApiResponseError(error)).rejects.toMatchObject({ code: 'AUTH_MFA_UNAVAILABLE' });
    expect(useUiStore.getState().toasts.map((toast) => toast.message)).toEqual(['Authenticator service is unavailable']);
  });

  it('decodes a JSON error carried by a blob download so fresh proof is recognised', async () => {
    const body = JSON.stringify({ detail: { code: 'AUTH_REAUTH_REQUIRED', message: 'Verify again' } });
    const error = { response: { status: 401, headers: {}, data: new Blob([body], { type: 'application/json' }) }, config: { url: '/tournaments/t1/bracket/export.csv' } };
    await decodeBlobError(error);
    const reauth = vi.fn();
    window.addEventListener('sw:reauth-required', reauth);
    try {
      await expect(async () => handleApiResponseError(error)).rejects.toMatchObject({ code: 'AUTH_REAUTH_REQUIRED' });
      expect(reauth).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('sw:reauth-required', reauth);
    }
  });

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
