/**
 * The bracket write gate (audit A2-followup).
 *
 * The bracket product had NO permission check: a viewer could press Record
 * result / Generate draw / Reset bracket and the request went out, came back
 * 403, and offered a retry that could never succeed.
 *
 * Note what this test does NOT do: mock `useBracketApi`. Every other bracket
 * suite does, which is precisely why a fully green unit suite coexisted with an
 * ungated write path for the whole product — mock the seam and you can never
 * test the seam. Here the REAL provider runs and only `apiClient` is faked, so
 * "did a write leave the browser" is an assertion we can actually make.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { BracketApiProvider, useBracketApi } from '../bracketClient';
import { useUiStore } from '../../store/uiStore';
import type { TournamentRole } from '../dto';

vi.mock('../client', () => ({
  apiClient: {
    getBracket: vi.fn().mockResolvedValue({ id: 'b1' }),
    deleteBracket: vi.fn().mockResolvedValue(undefined),
    recordBracketResult: vi.fn().mockResolvedValue({ ok: true }),
    bracketEventGenerate: vi.fn().mockResolvedValue({ ok: true }),
    scheduleNextBracketRound: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

// Imported after the mock so we get the mocked object.
const { apiClient } = await import('../client');

const TID = '11111111-2222-3333-4444-555555555555';
const wrapper = ({ children }: { children: ReactNode }) => (
  <BracketApiProvider tournamentId={TID}>{children}</BracketApiProvider>
);
const api = () => renderHook(() => useBracketApi(), { wrapper }).result.current;
const asRole = (role: TournamentRole | null) =>
  useUiStore.setState({ activeTournamentRole: role });

describe('bracket API — the write gate', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('as an owner', () => {
    beforeEach(() => asRole('owner'));

    it('lets a mutation through', async () => {
      await api().recordResult({ playUnitId: 'pu1', winnerSide: 'A' } as never);
      expect(apiClient.recordBracketResult).toHaveBeenCalledTimes(1);
    });

    it('lets a draw be generated', async () => {
      await api().eventGenerate('e1', { wipe: false } as never);
      expect(apiClient.bracketEventGenerate).toHaveBeenCalledTimes(1);
    });
  });

  describe('as a viewer', () => {
    beforeEach(() => asRole('viewer'));

    it.each([
      ['recordResult', (a: ReturnType<typeof api>) => a.recordResult({} as never)],
      ['eventGenerate', (a: ReturnType<typeof api>) => a.eventGenerate('e1', {} as never)],
      ['remove', (a: ReturnType<typeof api>) => a.remove()],
      ['scheduleNext', (a: ReturnType<typeof api>) => a.scheduleNext()],
    ])('refuses %s without touching the network', async (_name, call) => {
      await expect(call(api())).rejects.toThrow(/view-only/i);

      expect(apiClient.recordBracketResult).not.toHaveBeenCalled();
      expect(apiClient.bracketEventGenerate).not.toHaveBeenCalled();
      expect(apiClient.deleteBracket).not.toHaveBeenCalled();
      expect(apiClient.scheduleNextBracketRound).not.toHaveBeenCalled();
    });

    it('refuses in the shape of the 403 the server would have sent', async () => {
      // Call sites already cope with a `__handled` 403 rejection — that is why
      // gating here changes what crosses the network, not how the UI behaves.
      await api()
        .remove()
        .catch((err: { status?: number; __handled?: boolean }) => {
          expect(err.status).toBe(403);
          expect(err.__handled).toBe(true);
        });
      expect.assertions(2);
    });

    it('still allows reads — a viewer must be able to see the draw', async () => {
      await expect(api().get()).resolves.toEqual({ id: 'b1' });
      expect(apiClient.getBracket).toHaveBeenCalledTimes(1);
    });
  });

  it('fails closed on an unknown role', async () => {
    asRole(null);
    await expect(api().remove()).rejects.toThrow(/view-only/i);
    expect(apiClient.deleteBracket).not.toHaveBeenCalled();
  });
});
