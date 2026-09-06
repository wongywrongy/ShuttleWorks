/**
 * Contract §10 "Operational truth" row: a court-dispute resolution
 * (`resolve_court`, contract §4.2) queued while offline must replay exactly
 * once on reconnect, and a 409 on that replay must surface as `attention`
 * (the queue's terminal `conflict` status — the same signal every other
 * command's 409 surfaces, never silently dropped or silently retried
 * forever). Twin of the offline-conflict cases in `commandQueue.test.ts`,
 * scoped to the new action.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetDbHandleForTests,
  enqueue,
  flush,
  getById,
  getPending,
  type QueuedCommand,
  type SubmitFn,
} from '../commandQueue';

function resolveCourtCommand(
  overrides: Partial<QueuedCommand> = {},
): Omit<QueuedCommand, 'attempts' | 'status'> {
  return {
    id: overrides.id ?? 'resolve-1',
    tournamentId: overrides.tournamentId ?? 't1',
    matchId: overrides.matchId ?? 'chosen',
    action: 'resolve_court',
    payload: overrides.payload ?? {
      chosenMatchKey: 'chosen',
      displacedMatchKeys: ['displaced'],
      action: 'keep_and_move',
      note: null,
    },
    seenVersion: overrides.seenVersion ?? 1,
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

beforeEach(async () => {
  await _resetDbHandleForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('scheduler-command-queue');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

describe('resolve_court queued offline', () => {
  it('stays pending through a network error, then replays exactly once on reconnect', async () => {
    await enqueue(resolveCourtCommand());

    // "Offline": the first flush attempt (e.g. a reconnect-timer tick while
    // the backend is unreachable) never reaches the server.
    const offlineSubmit: SubmitFn = vi.fn().mockResolvedValue({
      kind: 'networkError',
      message: 'fetch failed',
    });
    await flush(offlineSubmit);
    expect(offlineSubmit).toHaveBeenCalledTimes(1);
    let row = await getById('resolve-1');
    expect(row!.status).toBe('pending');

    // "Reconnect": the next flush (online event / next interactive submit)
    // reaches the server and the resolution applies.
    const onlineSubmit: SubmitFn = vi.fn().mockResolvedValue({
      kind: 'ok',
      matchStatus: 'started',
      matchVersion: 2,
      courtId: 1,
      timeSlot: 0,
    });
    const outcomes = await flush(onlineSubmit);
    expect(onlineSubmit).toHaveBeenCalledTimes(1);
    expect(outcomes[0].result.kind).toBe('ok');
    row = await getById('resolve-1');
    expect(row!.status).toBe('applied');

    // A third flush (nothing left pending) must not resubmit — replay is
    // exactly once, not "every flush forever".
    const thirdSubmit: SubmitFn = vi.fn();
    await flush(thirdSubmit);
    expect(thirdSubmit).not.toHaveBeenCalled();
  });

  it('surfaces attention (terminal `conflict` status) when the reconnect replay gets a 409, and never retries it again', async () => {
    await enqueue(resolveCourtCommand({ id: 'resolve-2' }));

    // Reconnect replay lands on a court that changed underneath the queued
    // resolution (someone else already resolved it, or moved a match).
    const conflictSubmit: SubmitFn = vi.fn().mockResolvedValue({
      kind: 'conflict',
      message: 'Match displaced no longer exists; the schedule may have been regenerated.',
    });
    await flush(conflictSubmit);
    const row = await getById('resolve-2');
    expect(row!.status).toBe('conflict');
    expect(row!.rejectionReason).toMatch(/no longer exists/);

    // A conflict is terminal — it must not be in the pending set (so a
    // silent forever-retry can't happen), and re-flushing does not resubmit.
    expect(await getPending()).toHaveLength(0);
    const again: SubmitFn = vi.fn();
    await flush(again);
    expect(again).not.toHaveBeenCalled();
  });
});
