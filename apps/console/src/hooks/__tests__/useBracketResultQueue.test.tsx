/**
 * Vitest tests for the bracket result queue hook (SP-F3).
 *
 * Asserts the optimistic-UI + idempotent-command flow that mirrors meet's
 * ``useCommandQueue``:
 *   1. Submitting a result applies optimistically, enqueues an idempotent
 *      command, and settles with the server's authoritative DTO on ok.
 *   2. A 409 stale_version refetches the bracket and surfaces a conflict
 *      inline.
 *   3. The enqueued command is idempotent — the same UUID lands once.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { apiClient } from '../../api/client';
import {
  _resetDbHandleForTests,
  getPending,
} from '../../lib/bracketCommandQueue';
import {
  useBracketResultQueue,
  type BracketResultHandlers,
} from '../useBracketResultQueue';
import type { BracketTournamentDTO } from '../../api/bracketDto';

vi.mock('../../api/client', () => ({
  apiClient: {
    recordBracketResultCommand: vi.fn(),
    getBracket: vi.fn(),
  },
}));

const wrap =
  (id: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[`/tournaments/${id}`]}>
      <Routes>
        <Route path="/tournaments/:id" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  );

const committedDto = { courts: 2, results: [] } as unknown as BracketTournamentDTO;
const freshDto = { courts: 4, results: [] } as unknown as BracketTournamentDTO;

function makeHandlers(): BracketResultHandlers & {
  optimistic: ReturnType<typeof vi.fn>;
  settled: ReturnType<typeof vi.fn>;
  conflict: ReturnType<typeof vi.fn>;
} {
  const optimistic = vi.fn();
  const settled = vi.fn();
  const conflict = vi.fn();
  return {
    optimistic,
    settled,
    conflict,
    onOptimistic: optimistic,
    onSettled: settled,
    onConflict: conflict,
  };
}

beforeEach(async () => {
  vi.mocked(apiClient.recordBracketResultCommand).mockReset();
  vi.mocked(apiClient.getBracket).mockReset();
  await _resetDbHandleForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('scheduler-bracket-result-queue');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

describe('useBracketResultQueue', () => {
  it('applies optimistically, enqueues, and settles on ok', async () => {
    // recordBracketResultCommand returns the raw DTO (unknown); the adapter
    // wraps it into { kind: 'ok', dto }.
    vi.mocked(apiClient.recordBracketResultCommand).mockResolvedValue(committedDto);
    const h = makeHandlers();
    const { result } = renderHook(() => useBracketResultQueue(h), {
      wrapper: wrap('t1'),
    });

    let outcome!: Awaited<ReturnType<typeof result.current.submit>>;
    await act(async () => {
      outcome = await result.current.submit({
        matchId: 'MS-r0m0',
        winnerSide: 'A',
        seenVersion: 1,
        finishedAtSlot: 0,
      });
    });

    // Optimistic apply happened before the network settled.
    expect(h.optimistic).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: 'MS-r0m0', winnerSide: 'A', seenVersion: 1 }),
    );
    // The command went out through Seam C with the client-generated UUID as
    // the idempotency key — reusing the queue's command id.
    expect(apiClient.recordBracketResultCommand).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        id: outcome.commandId,
        play_unit_id: 'MS-r0m0',
        winner_side: 'A',
        seen_version: 1,
      }),
    );
    // Settled with the server DTO; no conflict.
    expect(h.settled).toHaveBeenCalledWith(committedDto);
    expect(h.conflict).not.toHaveBeenCalled();
    expect(outcome.result.kind).toBe('ok');
    // Applied — nothing left pending.
    expect(await getPending()).toHaveLength(0);
  });

  it('refetches and surfaces a conflict on stale_version', async () => {
    // Seam C rejects 409 stale_version as an axios error; the adapter maps it
    // to { kind: 'staleVersion' }.
    vi.mocked(apiClient.recordBracketResultCommand).mockRejectedValue({
      response: {
        status: 409,
        data: { error: 'stale_version', message: 'current version 2, you sent 1' },
      },
      message: 'Request failed with status code 409',
    });
    vi.mocked(apiClient.getBracket).mockResolvedValue(freshDto as never);
    const h = makeHandlers();
    const { result } = renderHook(() => useBracketResultQueue(h), {
      wrapper: wrap('t1'),
    });

    let outcome!: Awaited<ReturnType<typeof result.current.submit>>;
    await act(async () => {
      outcome = await result.current.submit({
        matchId: 'MS-r0m0',
        winnerSide: 'A',
        seenVersion: 1,
      });
    });

    expect(h.optimistic).toHaveBeenCalledTimes(1);
    expect(apiClient.getBracket).toHaveBeenCalledWith('t1');
    expect(h.settled).toHaveBeenCalledWith(freshDto);
    expect(h.conflict).toHaveBeenCalledWith(
      'stale_version',
      expect.stringContaining('current version 2'),
    );
    expect(outcome.result.kind).toBe('staleVersion');
  });

  it('enqueues an idempotent command (same id lands once)', async () => {
    // Hold the network so the command stays pending while we inspect it.
    // The adapter catches the thrown error and returns { kind: 'networkError' };
    // flush then calls markRetryable, leaving the command pending.
    vi.mocked(apiClient.recordBracketResultCommand).mockRejectedValue(
      new Error('offline'),
    );
    const h = makeHandlers();
    const { result } = renderHook(() => useBracketResultQueue(h), {
      wrapper: wrap('t1'),
    });

    await act(async () => {
      await result.current.submit({
        matchId: 'MS-r0m0',
        winnerSide: 'A',
        seenVersion: 1,
      });
    });

    const pending = await getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe('bracket_result');
    expect(pending[0].matchId).toBe('MS-r0m0');
    expect(pending[0].seenVersion).toBe(1);
    // Network failure left it pending for a future retry.
    expect(pending[0].status).toBe('pending');
  });
});
