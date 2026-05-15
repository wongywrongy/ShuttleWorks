/**
 * Vitest unit tests for the IndexedDB command queue (Step F4).
 *
 * Seven prompt-required cases:
 *   1. Enqueue writes to IndexedDB correctly.
 *   2. Flush sends commands in createdAt order.
 *   3. 200 response: command marked applied.
 *   4. 409 stale_version: command marked rejected.
 *   5. 409 conflict: command marked conflict, not retried.
 *   6. Network error: command stays pending, retry-able.
 *   7. Idempotency: same id enqueued twice → one entry, one request.
 *
 * Runs against ``fake-indexeddb`` (registered in src/setupTests.ts).
 * No network, no Zustand — pure queue contract.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _clearAllForTests,
  _resetDbHandleForTests,
  enqueue,
  flush,
  getById,
  getPending,
  type QueuedCommand,
  type SubmitFn,
  type SubmitResult,
} from '../commandQueue';

function baseCommand(
  overrides: Partial<QueuedCommand> = {},
): Omit<QueuedCommand, 'attempts' | 'status'> {
  return {
    id: overrides.id ?? 'cmd-1',
    tournamentId: overrides.tournamentId ?? 't1',
    matchId: overrides.matchId ?? 'm1',
    action: overrides.action ?? 'call_to_court',
    payload: overrides.payload ?? {},
    seenVersion: overrides.seenVersion ?? 1,
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

beforeEach(async () => {
  // Close any cached connection from a previous test FIRST — a stale
  // open connection blocks ``deleteDatabase``.
  await _resetDbHandleForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('scheduler-command-queue');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // best-effort
  });
});

// ---- 1. Enqueue writes to IndexedDB ----------------------------------

describe('enqueue', () => {
  it('persists a command and returns its id', async () => {
    const id = await enqueue(baseCommand());
    expect(id).toBe('cmd-1');
    const fetched = await getById('cmd-1');
    expect(fetched).toBeDefined();
    expect(fetched!.matchId).toBe('m1');
    expect(fetched!.status).toBe('pending');
    expect(fetched!.attempts).toBe(0);
  });

  it('is a no-op when the same id is enqueued twice', async () => {
    await enqueue(baseCommand({ matchId: 'm-original' }));
    await enqueue(baseCommand({ matchId: 'm-second-attempt' }));
    const fetched = await getById('cmd-1');
    expect(fetched!.matchId).toBe('m-original');
    const all = await getPending();
    expect(all).toHaveLength(1);
  });
});

// ---- 2. Flush ordering ----------------------------------------------

describe('flush ordering', () => {
  it('sends pending commands in createdAt ASC order', async () => {
    await enqueue(baseCommand({ id: 'b', createdAt: 200 }));
    await enqueue(baseCommand({ id: 'a', createdAt: 100 }));
    await enqueue(baseCommand({ id: 'c', createdAt: 300 }));

    const seenOrder: string[] = [];
    const submit: SubmitFn = async (cmd) => {
      seenOrder.push(cmd.id);
      return { kind: 'ok', matchStatus: 'called', matchVersion: 2, courtId: 1, timeSlot: 0 };
    };

    await flush(submit);
    expect(seenOrder).toEqual(['a', 'b', 'c']);
  });
});

// ---- 3. 200 → applied -----------------------------------------------

describe('200 outcome', () => {
  it('marks the command applied', async () => {
    await enqueue(baseCommand());
    const submit: SubmitFn = async () => ({
      kind: 'ok',
      matchStatus: 'called',
      matchVersion: 2,
      courtId: 1,
      timeSlot: 0,
    });

    await flush(submit);
    const row = await getById('cmd-1');
    expect(row!.status).toBe('applied');
    expect(row!.rejectionReason).toBeUndefined();
  });
});

// ---- 4. 409 stale_version → rejected --------------------------------

describe('409 stale_version', () => {
  it('marks the command rejected with the stale-version reason', async () => {
    await enqueue(baseCommand());
    const submit: SubmitFn = async () => ({
      kind: 'staleVersion',
      message: 'Match version is 5; If-Match sent 4',
    });

    await flush(submit);
    const row = await getById('cmd-1');
    expect(row!.status).toBe('rejected');
    expect(row!.rejectionReason).toContain('Match version is 5');
  });
});

// ---- 5. 409 conflict → conflict, no retry ---------------------------

describe('409 conflict', () => {
  it('marks the command conflict and does not retry on subsequent flush', async () => {
    await enqueue(baseCommand());
    const submit: SubmitFn = vi.fn(async () => ({
      kind: 'conflict' as const,
      message: 'Cannot transition from finished to called',
    }));

    await flush(submit);
    expect(submit).toHaveBeenCalledTimes(1);

    const row = await getById('cmd-1');
    expect(row!.status).toBe('conflict');
    expect(row!.rejectionReason).toContain('Cannot transition');

    // Re-flush: the conflicted command is in a terminal state and
    // must not be retried.
    await flush(submit);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

// ---- 6. Network error: still pending, retry-able --------------------

describe('network error', () => {
  it('leaves the command pending and increments attempts', async () => {
    await enqueue(baseCommand());
    const failing: SubmitFn = async () => ({
      kind: 'networkError',
      message: 'connection refused',
    });

    await flush(failing);
    let row = await getById('cmd-1');
    expect(row!.status).toBe('pending');
    expect(row!.attempts).toBe(1);

    // Subsequent flush retries.
    await flush(failing);
    row = await getById('cmd-1');
    expect(row!.status).toBe('pending');
    expect(row!.attempts).toBe(2);

    // Once the server is back up, the next flush applies it.
    const ok: SubmitFn = async () => ({
      kind: 'ok',
      matchStatus: 'called',
      matchVersion: 2,
      courtId: 1,
      timeSlot: 0,
    });
    await flush(ok);
    row = await getById('cmd-1');
    expect(row!.status).toBe('applied');
  });

  it('handles a thrown exception as a network error', async () => {
    await enqueue(baseCommand());
    const throwing: SubmitFn = async () => {
      throw new Error('socket hang up');
    };

    await flush(throwing);
    const row = await getById('cmd-1');
    expect(row!.status).toBe('pending');
    expect(row!.attempts).toBe(1);
  });
});

// ---- 7. Idempotency on enqueue --------------------------------------

describe('idempotency at the queue layer', () => {
  it('flushing twice with no new enqueues sends nothing the second time', async () => {
    await enqueue(baseCommand());
    const submit: SubmitFn = vi.fn(async () => ({
      kind: 'ok' as const,
      matchStatus: 'called',
      matchVersion: 2,
      courtId: 1,
      timeSlot: 0,
    }));

    await flush(submit);
    expect(submit).toHaveBeenCalledTimes(1);

    // The first flush moved the command to ``applied``; the second
    // flush sees no pending and is a complete no-op.
    await flush(submit);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('enqueueing the same id twice produces one queue entry', async () => {
    await enqueue(baseCommand({ id: 'dup', matchId: 'm-a' }));
    await enqueue(baseCommand({ id: 'dup', matchId: 'm-b' }));
    const all = await getPending();
    expect(all).toHaveLength(1);
    expect(all[0].matchId).toBe('m-a');
  });
});

// ---- Result outcomes returned by flush ------------------------------

describe('flush return value', () => {
  it('returns one outcome per pending command', async () => {
    await enqueue(baseCommand({ id: 'p1', createdAt: 100 }));
    await enqueue(baseCommand({ id: 'p2', createdAt: 200 }));

    const submit: SubmitFn = async (cmd): Promise<SubmitResult> =>
      cmd.id === 'p1'
        ? { kind: 'ok', matchStatus: 'called', matchVersion: 2, courtId: 1, timeSlot: 0 }
        : { kind: 'conflict', message: 'bad transition' };

    const outcomes = await flush(submit);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0].id).toBe('p1');
    expect(outcomes[0].result.kind).toBe('ok');
    expect(outcomes[1].id).toBe('p2');
    expect(outcomes[1].result.kind).toBe('conflict');
  });
});
