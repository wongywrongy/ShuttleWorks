/**
 * Vitest unit tests for the IndexedDB bracket result queue (SP-F3).
 *
 * Mirrors the meet command-queue contract, adapted to the bracket result
 * shape (a winner side + optional set score + ``seenVersion``, and an
 * ``ok`` outcome that carries the full tournament DTO):
 *   1. Enqueue writes to IndexedDB correctly.
 *   2. Idempotency: same UUID enqueued twice → one entry, one request.
 *   3. Flush sends commands in createdAt order.
 *   4. 200 ok → command applied.
 *   5. 409 stale_version → command rejected (recoverable).
 *   6. 409 conflict → command conflict, not retried.
 *   7. Network error → command stays pending, retry-able.
 *
 * Runs against ``fake-indexeddb`` (registered in src/setupTests.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import {
  _resetDbHandleForTests,
  enqueue,
  flush,
  getById,
  getPending,
  type BracketResultCommand,
  type BracketSubmitFn,
} from '../bracketCommandQueue';

const fakeDto = { courts: 2 } as unknown as BracketTournamentDTO;

function baseCommand(
  overrides: Partial<BracketResultCommand> = {},
): Omit<BracketResultCommand, 'attempts' | 'status'> {
  return {
    id: overrides.id ?? 'cmd-1',
    kind: 'bracket_result',
    tournamentId: overrides.tournamentId ?? 't1',
    matchId: overrides.matchId ?? 'MS-r0m0',
    winnerSide: overrides.winnerSide ?? 'A',
    finishedAtSlot: overrides.finishedAtSlot ?? 0,
    walkover: overrides.walkover ?? false,
    score: overrides.score ?? null,
    seenVersion: overrides.seenVersion ?? 1,
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

beforeEach(async () => {
  await _resetDbHandleForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('scheduler-bracket-result-queue');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

describe('enqueue', () => {
  it('persists a bracket result command and returns its id', async () => {
    const id = await enqueue(baseCommand());
    expect(id).toBe('cmd-1');
    const fetched = await getById('cmd-1');
    expect(fetched).toBeDefined();
    expect(fetched!.kind).toBe('bracket_result');
    expect(fetched!.matchId).toBe('MS-r0m0');
    expect(fetched!.winnerSide).toBe('A');
    expect(fetched!.seenVersion).toBe(1);
    expect(fetched!.status).toBe('pending');
    expect(fetched!.attempts).toBe(0);
  });

  it('is a no-op when the same UUID is enqueued twice', async () => {
    await enqueue(baseCommand({ winnerSide: 'A' }));
    await enqueue(baseCommand({ winnerSide: 'B' }));
    const fetched = await getById('cmd-1');
    expect(fetched!.winnerSide).toBe('A'); // first write wins
    const all = await getPending();
    expect(all).toHaveLength(1);
  });
});

describe('flush ordering', () => {
  it('sends pending commands in createdAt ASC order', async () => {
    await enqueue(baseCommand({ id: 'b', createdAt: 200 }));
    await enqueue(baseCommand({ id: 'a', createdAt: 100 }));
    await enqueue(baseCommand({ id: 'c', createdAt: 300 }));

    const seenOrder: string[] = [];
    const submit: BracketSubmitFn = async (cmd) => {
      seenOrder.push(cmd.id);
      return { kind: 'ok', dto: fakeDto };
    };

    await flush(submit);
    expect(seenOrder).toEqual(['a', 'b', 'c']);
  });
});

describe('200 outcome', () => {
  it('marks the command applied', async () => {
    await enqueue(baseCommand());
    const submit: BracketSubmitFn = async () => ({ kind: 'ok', dto: fakeDto });
    await flush(submit);
    const row = await getById('cmd-1');
    expect(row!.status).toBe('applied');
    expect(row!.rejectionReason).toBeUndefined();
  });
});

describe('409 stale_version', () => {
  it('marks the command rejected with the stale-version reason', async () => {
    await enqueue(baseCommand());
    const submit: BracketSubmitFn = async () => ({
      kind: 'staleVersion',
      message: 'current version 2, you sent 1',
    });
    await flush(submit);
    const row = await getById('cmd-1');
    expect(row!.status).toBe('rejected');
    expect(row!.rejectionReason).toContain('current version 2');
  });
});

describe('409 conflict', () => {
  it('marks the command conflict and does not retry on subsequent flush', async () => {
    await enqueue(baseCommand());
    const submit = vi.fn<BracketSubmitFn>(async () => ({
      kind: 'conflict' as const,
      message: 'Result already recorded for this match',
    }));

    await flush(submit);
    expect(submit).toHaveBeenCalledTimes(1);
    const row = await getById('cmd-1');
    expect(row!.status).toBe('conflict');
    expect(row!.rejectionReason).toContain('already recorded');

    // Re-flush: a conflicted command is terminal — not retried.
    await flush(submit);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('network error', () => {
  it('leaves the command pending and increments attempts', async () => {
    await enqueue(baseCommand());
    const failing: BracketSubmitFn = async () => ({
      kind: 'networkError',
      message: 'connection refused',
    });

    await flush(failing);
    let row = await getById('cmd-1');
    expect(row!.status).toBe('pending');
    expect(row!.attempts).toBe(1);

    await flush(failing);
    row = await getById('cmd-1');
    expect(row!.status).toBe('pending');
    expect(row!.attempts).toBe(2);

    const ok: BracketSubmitFn = async () => ({ kind: 'ok', dto: fakeDto });
    await flush(ok);
    row = await getById('cmd-1');
    expect(row!.status).toBe('applied');
  });

  it('treats a thrown exception as a network error', async () => {
    await enqueue(baseCommand());
    const throwing: BracketSubmitFn = async () => {
      throw new Error('socket hang up');
    };
    await flush(throwing);
    const row = await getById('cmd-1');
    expect(row!.status).toBe('pending');
    expect(row!.attempts).toBe(1);
  });
});

describe('flush return value', () => {
  it('returns one outcome per pending command', async () => {
    await enqueue(baseCommand({ id: 'p1', createdAt: 100 }));
    await enqueue(baseCommand({ id: 'p2', createdAt: 200 }));

    const submit: BracketSubmitFn = async (cmd) =>
      cmd.id === 'p1'
        ? { kind: 'ok', dto: fakeDto }
        : { kind: 'staleVersion', message: 'stale' };

    const outcomes = await flush(submit);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0].id).toBe('p1');
    expect(outcomes[0].result.kind).toBe('ok');
    expect(outcomes[1].id).toBe('p2');
    expect(outcomes[1].result.kind).toBe('staleVersion');
  });
});
