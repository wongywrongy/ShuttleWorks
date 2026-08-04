/**
 * Solve-job flow (SP-CLOUD-1): the submit-and-poll state machine in
 * `apiClient.runSolveJob` / `pollSolveJob`. HTTP methods are stubbed —
 * this covers the terminal-status mapping, idempotency-key generation,
 * abort → server-side cancel, and poll-failure tolerance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import type { ScheduleDTO, SolveJobDTO } from '../dto';

const SCHEDULE: ScheduleDTO = {
  assignments: [],
  unscheduledMatches: [],
  softViolations: [],
  objectiveScore: 10,
  infeasibleReasons: [],
  status: 'optimal',
  solverSeed: 42,
  candidates: [],
  activeCandidateIndex: null,
} as unknown as ScheduleDTO;

function job(partial: Partial<SolveJobDTO>): SolveJobDTO {
  return {
    id: 'job-1',
    tournamentId: 't-1',
    type: 'meet_schedule_solve',
    status: 'queued',
    attempts: 0,
    maxAttempts: 2,
    params: {},
    createdAt: '2026-08-03T00:00:00Z',
    ...partial,
  };
}

const REQUEST = { config: {}, players: [], matches: [] } as never;
const FAST = { basePollMs: 1 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runSolveJob', () => {
  it('submits with a generated idempotency key and resolves on succeeded', async () => {
    const submit = vi
      .spyOn(apiClient, 'submitSolveJob')
      .mockResolvedValue(job({ status: 'queued' }));
    vi.spyOn(apiClient, 'getSolveJob')
      .mockResolvedValueOnce(job({ status: 'running' }))
      .mockResolvedValueOnce(job({ status: 'succeeded', result: SCHEDULE }));

    const seen: string[] = [];
    const result = await apiClient.runSolveJob('t-1', REQUEST, {
      ...FAST,
      onJob: (j) => seen.push(j.status),
    });

    expect(result).toEqual(SCHEDULE);
    expect(seen).toEqual(['queued', 'running', 'succeeded']);
    const key = submit.mock.calls[0][2];
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('resolves with the infeasible ScheduleDTO — a domain outcome, not an error', async () => {
    vi.spyOn(apiClient, 'submitSolveJob').mockResolvedValue(job({ status: 'running' }));
    const infeasible = {
      ...SCHEDULE,
      status: 'infeasible',
      infeasibleReasons: ['not enough courts'],
    } as unknown as ScheduleDTO;
    vi.spyOn(apiClient, 'getSolveJob').mockResolvedValue(
      job({ status: 'infeasible', result: infeasible }),
    );

    const result = await apiClient.runSolveJob('t-1', REQUEST, FAST);
    expect(result.status).toBe('infeasible');
    expect(result.infeasibleReasons).toEqual(['not enough courts']);
  });

  it('rejects with the structured error message on failed', async () => {
    vi.spyOn(apiClient, 'submitSolveJob').mockResolvedValue(job({ status: 'running' }));
    vi.spyOn(apiClient, 'getSolveJob').mockResolvedValue(
      job({
        status: 'failed',
        error: { code: 'child_died', message: 'solve child exited 137 without output' },
      }),
    );

    await expect(apiClient.runSolveJob('t-1', REQUEST, FAST)).rejects.toThrow(
      'solve child exited 137 without output',
    );
  });

  it('aborting requests a server-side cancel and rejects with AbortError', async () => {
    vi.spyOn(apiClient, 'submitSolveJob').mockResolvedValue(job({ status: 'running' }));
    vi.spyOn(apiClient, 'getSolveJob').mockResolvedValue(job({ status: 'running' }));
    const cancel = vi
      .spyOn(apiClient, 'cancelSolveJob')
      .mockResolvedValue(job({ status: 'cancelled' }));

    const controller = new AbortController();
    const run = apiClient.runSolveJob('t-1', REQUEST, {
      ...FAST,
      signal: controller.signal,
      onJob: () => controller.abort(),
    });

    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledWith('t-1', 'job-1');
  });

  it('a server-side cancellation also surfaces as AbortError (silent)', async () => {
    vi.spyOn(apiClient, 'submitSolveJob').mockResolvedValue(job({ status: 'running' }));
    vi.spyOn(apiClient, 'getSolveJob').mockResolvedValue(job({ status: 'cancelled' }));

    await expect(apiClient.runSolveJob('t-1', REQUEST, FAST)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('tolerates transient poll failures while the job keeps solving', async () => {
    vi.spyOn(apiClient, 'submitSolveJob').mockResolvedValue(job({ status: 'running' }));
    vi.spyOn(apiClient, 'getSolveJob')
      .mockRejectedValueOnce(new Error('network blip'))
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce(job({ status: 'succeeded', result: SCHEDULE }));

    const result = await apiClient.runSolveJob('t-1', REQUEST, FAST);
    expect(result).toEqual(SCHEDULE);
  });

  it('gives up after five consecutive dead polls', async () => {
    vi.spyOn(apiClient, 'submitSolveJob').mockResolvedValue(job({ status: 'running' }));
    const get = vi
      .spyOn(apiClient, 'getSolveJob')
      .mockRejectedValue(new Error('backend gone'));

    await expect(apiClient.runSolveJob('t-1', REQUEST, FAST)).rejects.toThrow(
      'backend gone',
    );
    expect(get).toHaveBeenCalledTimes(5);
  });
});
