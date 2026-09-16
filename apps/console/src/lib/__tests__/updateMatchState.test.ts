/**
 * Tests for the If-Match header round trip on match-state mutations.
 *
 * The legacy match-state route (PUT /tournaments/{tid}/match-states/{id})
 * requires If-Match per
 * `apps/api/src/operations/match_state_routes.py:_enforce_if_match`.
 * `apiClient.updateMatchState` previously omitted the header — every
 * Call/Start/Post mutation 412'd.
 *
 * Since ruling D6 (2026-09-15) the route speaks one conflict dialect: 412
 * only for a missing/malformed header, 409 + `currentState` for a stale
 * version. These tests pin the client's branch on `kind`, not on `status`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosInstance } from 'axios';
import { apiClient } from '../../api/client';

// Access the private axios instance for assertion. The test deliberately
// peeks at internals because there's no public seam.
function getPrivateClient(): AxiosInstance {
  return (apiClient as unknown as { client: AxiosInstance }).client;
}

describe('apiClient.updateMatchState', () => {
  beforeEach(() => {
    // Stub the axios put with a vi.fn so we can inspect headers + return.
    vi.spyOn(getPrivateClient(), 'put').mockResolvedValue({
      status: 200,
      data: { matchId: 'm1', status: 'called' },
      headers: { etag: '"6"' },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends If-Match: "<version>" when given version=5', async () => {
    await apiClient.updateMatchState('t1', 'm1', { matchId: 'm1', status: 'called' }, 5);
    const call = (getPrivateClient().put as ReturnType<typeof vi.fn>).mock.calls[0];
    const config = call[2];
    expect(config.headers['If-Match']).toBe('"5"');
  });

  it('returns the parsed version from the response ETag', async () => {
    const result = await apiClient.updateMatchState(
      't1',
      'm1',
      { matchId: 'm1', status: 'called' },
      5,
    );
    expect(result.version).toBe(6);
    expect(result.state.matchId).toBe('m1');
  });

  it('throws a precondition MatchVersionMismatch on 412 (header missing)', async () => {
    vi.spyOn(getPrivateClient(), 'put').mockRejectedValueOnce({
      response: {
        status: 412,
        data: { message: 'If-Match header required for match mutations' },
      },
      isAxiosError: true,
    });
    await expect(
      apiClient.updateMatchState('t1', 'm1', { matchId: 'm1', status: 'called' }, 5),
    ).rejects.toMatchObject({
      name: 'MatchVersionMismatch',
      kind: 'precondition',
      message: expect.stringContaining('If-Match'),
    });
  });

  it('reconciles a stale version from the 409 body (ruling D6)', async () => {
    // A stale version used to answer 412 with no body worth reading. It now
    // answers 409 STATE_VERSION_CONFLICT carrying the current state, the
    // same shape `PUT /tournaments/{id}/state` answers with.
    vi.spyOn(getPrivateClient(), 'put').mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          detail: {
            code: 'STATE_VERSION_CONFLICT',
            message: 'Match version is 7; If-Match sent 5.',
            seenVersion: 5,
            currentVersion: 7,
            currentState: { matchId: 'm1', status: 'started' },
          },
        },
      },
      isAxiosError: true,
    });
    await expect(
      apiClient.updateMatchState('t1', 'm1', { matchId: 'm1', status: 'called' }, 5),
    ).rejects.toMatchObject({
      name: 'MatchVersionMismatch',
      kind: 'stale_version',
      currentVersion: 7,
      currentState: { matchId: 'm1', status: 'started' },
    });
  });

  it('throws a transition-conflict MatchVersionMismatch on a flat 409', async () => {
    vi.spyOn(getPrivateClient(), 'put').mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: 'conflict', message: 'state machine conflict' },
      },
      isAxiosError: true,
    });
    await expect(
      apiClient.updateMatchState('t1', 'm1', { matchId: 'm1', status: 'called' }, 5),
    ).rejects.toMatchObject({ name: 'MatchVersionMismatch', kind: 'conflict' });
  });
});
