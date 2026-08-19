/**
 * Tests for the If-Match header round trip on match-state mutations.
 *
 * Audit finding: docs/audits/2026-05-15_user-audit_meet-vs-bracket.md §1.6
 *
 * The legacy match-state route (PUT /tournaments/{tid}/match-states/{id})
 * requires If-Match per `products/scheduler/backend/api/match_state.py:_enforce_if_match`.
 * `apiClient.updateMatchState` previously omitted the header — every
 * Call/Start/Post mutation 412'd.
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

  it('throws MatchVersionMismatch on 412 response', async () => {
    vi.spyOn(getPrivateClient(), 'put').mockRejectedValueOnce({
      response: { status: 412, data: { message: 'Match version is 7; If-Match sent 5' } },
      isAxiosError: true,
    });
    await expect(
      apiClient.updateMatchState('t1', 'm1', { matchId: 'm1', status: 'called' }, 5),
    ).rejects.toMatchObject({
      name: 'MatchVersionMismatch',
      message: expect.stringContaining('Match version'),
    });
  });

  it('throws MatchVersionMismatch on 409 response', async () => {
    vi.spyOn(getPrivateClient(), 'put').mockRejectedValueOnce({
      response: { status: 409, data: { message: 'state machine conflict' } },
      isAxiosError: true,
    });
    await expect(
      apiClient.updateMatchState('t1', 'm1', { matchId: 'm1', status: 'called' }, 5),
    ).rejects.toMatchObject({ name: 'MatchVersionMismatch' });
  });
});
