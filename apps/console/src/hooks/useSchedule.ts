/**
 * Schedule generation hook — the async solve-job flow (SP-CLOUD-1).
 *
 * Every meet solve (generate / pin-and-resolve / reoptimize) submits a
 * job via ``POST /tournaments/{id}/solve-jobs`` and polls it to a
 * terminal status (`apiClient.runSolveJob`); no CP-SAT ever runs inside
 * an HTTP request. The final ``ScheduleDTO`` lands in
 * ``tournamentStore.schedule`` exactly as before — including the
 * ``infeasible`` status the SchedulePage banner keys on — and the
 * debounced state autosave persists it.
 *
 * Generation flags (``isGenerating``, ``generationError``) live on the
 * global store rather than local state so they survive tab switches.
 * The solver HUD shows job status (queued → searching), elapsed time,
 * and any coarse heartbeat progress — the per-solution SSE stream
 * retired with the synchronous endpoints.
 *
 * An ``AbortController`` is held in a ref so a second ``generate()``
 * call (or the HUD's Cancel) aborts the poll AND requests a
 * server-side cancel (the worker kills the solve subprocess); the API
 * client rejects with ``AbortError`` which stays silent.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { useUiStore } from '../store/uiStore';
import { apiClient } from '../api/client';
import {
  SOLVE_JOB_TERMINAL_STATUSES,
  type ScheduleView,
  type SolveJobDTO,
} from '../api/dto';
import { useTournamentIdOrNull } from './useTournamentId';
import { bracketOccupiedWindows } from '../lib/bracketOccupancy';

// Resume guard — useSchedule mounts in several components (SchedulePage,
// SolverHud, Operations); only ONE consumer may adopt a given orphaned
// job, and a tournament need only be checked once per mount burst.
const adoptedJobIds = new Set<string>();
const lastResumeCheck = new Map<string, number>();
const RESUME_CHECK_TTL_MS = 15_000;

// Module-scoped so the HUD's Cancel (its own useSchedule instance) can
// abort a solve started from SchedulePage or the resume path — a
// per-instance ref only ever saw its own instance's solves.
let activeSolveController: AbortController | null = null;

export function useSchedule() {
  const config = useTournamentStore((state) => state.config);
  const players = useTournamentStore((state) => state.players);
  const matches = useTournamentStore((state) => state.matches);
  const schedule = useTournamentStore((state) => state.schedule);
  const setSchedule = useTournamentStore((state) => state.setSchedule);
  const setScheduleStats = useUiStore((state) => state.setScheduleStats);

  // Use global generation state (persists across tab switches)
  const isGenerating = useUiStore((state) => state.isGenerating);
  const generationProgress = useUiStore((state) => state.generationProgress);
  const generationError = useUiStore((state) => state.generationError);
  const setIsGenerating = useUiStore((state) => state.setIsGenerating);
  const setGenerationProgress = useUiStore((state) => state.setGenerationProgress);
  const setGenerationError = useUiStore((state) => state.setGenerationError);
  const setSolverHud = useUiStore((state) => state.setSolverHud);
  const resetSolverHud = useUiStore((state) => state.resetSolverHud);

  const [view, setView] = useState<ScheduleView>('timeslot');

  const tournamentId = useTournamentIdOrNull();

  /**
   * Cross-engine coordination — EVERY meet solve must avoid the courts the
   * bracket already occupies (the bracket side coordinates server-side; see
   * `lib/bracketOccupancy.ts`). Callers that already hold a fresh bracket
   * snapshot pass their own windows; otherwise this fetches the snapshot at
   * solve time.
   *
   * Unknown is NOT none (debt D1, ruled 2026-08-19). The legitimate
   * no-bracket case never reaches the catch — `getBracket` maps 404 to null,
   * and null-safe `bracketOccupiedWindows` turns that into `[]`: no bracket
   * really is no occupancy. Every OTHER failure (timeout, 500, expired
   * session) means occupancy is UNKNOWN, and `[]` is not "unknown" — it is
   * the positive claim "the bracket is using no courts at no time", which
   * the solver would happily double-book on. Returns `null` for unknown
   * (with the operator banner already set); callers must stop the solve.
   */
  const resolveClosedWindows = useCallback(
    async (provided?: number[][]): Promise<number[][] | null> => {
      if (provided) return provided;
      if (!tournamentId) return [];
      try {
        return bracketOccupiedWindows(await apiClient.getBracket(tournamentId));
      } catch {
        setGenerationError(
          'Could not verify bracket court usage, so the solve was not started. Retry when the connection recovers.',
        );
        return null;
      }
    },
    [tournamentId, setGenerationError],
  );

  /**
   * Shared submit-and-poll driver for all three solve entry points.
   * Maps job snapshots onto the HUD: queued shows as its own phase,
   * anything claimed/running shows as searching, elapsed ticks off the
   * client clock (poll cadence ~0.5–2 s — honest, coarse, no fake bars).
   */
  const runSolve = useCallback(
    async (body: {
      config: NonNullable<typeof config>;
      players: typeof players;
      matches: typeof matches;
      previousAssignments?: unknown[];
      closedCourtWindows?: number[][];
    }) => {
      if (!tournamentId) {
        throw new Error('No workspace selected');
      }

      // Cancel any existing generation
      activeSolveController?.abort();
      const abortController = new AbortController();
      activeSolveController = abortController;

      const startedAt = Date.now();
      try {
        setIsGenerating(true);
        setGenerationError(null);
        setGenerationProgress(null);
        resetSolverHud();
        setSolverHud({ phase: 'queued' });

        const result = await apiClient.runSolveJob(tournamentId, body, {
          signal: abortController.signal,
          onJob: (job: SolveJobDTO) => {
            const progress = (job.progress ?? {}) as {
              solutionCount?: number;
              objective?: number;
            };
            setSolverHud({
              phase: job.status === 'queued' ? 'queued' : 'search',
              elapsedMs: Date.now() - startedAt,
              ...(progress.solutionCount !== undefined
                ? { solutionCount: progress.solutionCount }
                : {}),
              ...(progress.objective !== undefined
                ? { objective: progress.objective }
                : {}),
            });
          },
        });

        setSchedule(result);
        setScheduleStats({
          elapsed: Date.now() - startedAt,
          objectiveScore: result.objectiveScore ?? undefined,
          assignments: result.assignments,
        });
        return result;
      } catch (err) {
        // Don't treat abort (user cancel) as error
        if (err instanceof Error && err.name === 'AbortError') {
          return null;
        }
        const message = err instanceof Error ? err.message : 'Failed to generate schedule';
        setGenerationError(message);
        throw err;
      } finally {
        setIsGenerating(false);
        if (activeSolveController === abortController) {
          activeSolveController = null;
        }
      }
    },
    [tournamentId, setIsGenerating, setGenerationError, setGenerationProgress, setSolverHud, resetSolverHud, setSchedule, setScheduleStats],
  );

  /**
   * Resume-on-mount: with async jobs, a solve survives a page reload —
   * if this tournament has an active job nobody in this tab is
   * watching, adopt it (Generate stays disabled, HUD shows the run,
   * the result lands in the store when it finishes). Server-side the
   * partial unique index already blocks a second submit; this mirrors
   * that state in the UI instead of showing an idle Generate button
   * that would 409.
   */
  useEffect(() => {
    if (!tournamentId) return;
    const now = Date.now();
    const lastCheck = lastResumeCheck.get(tournamentId) ?? 0;
    if (now - lastCheck < RESUME_CHECK_TTL_MS) return;
    lastResumeCheck.set(tournamentId, now);

    let unmounted = false;
    void (async () => {
      if (useUiStore.getState().isGenerating) return;
      let active: SolveJobDTO | undefined;
      try {
        const jobs = await apiClient.listSolveJobs(tournamentId);
        active = jobs.find((j) => !SOLVE_JOB_TERMINAL_STATUSES.has(j.status));
      } catch {
        return; // resume is best-effort; a failed list never blocks the page
      }
      if (!active || unmounted || adoptedJobIds.has(active.id)) return;
      adoptedJobIds.add(active.id);

      const abortController = new AbortController();
      activeSolveController = abortController;
      const startedAt = active.startedAt ? Date.parse(active.startedAt) : Date.now();
      setIsGenerating(true);
      setGenerationError(null);
      setSolverHud({ phase: active.status === 'queued' ? 'queued' : 'search' });
      try {
        const result = await apiClient.pollSolveJob(tournamentId, active, {
          signal: abortController.signal,
          onJob: (job) =>
            setSolverHud({
              phase: job.status === 'queued' ? 'queued' : 'search',
              elapsedMs: Date.now() - startedAt,
            }),
        });
        setSchedule(result);
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          setGenerationError(
            err instanceof Error ? err.message : 'Failed to generate schedule',
          );
        }
      } finally {
        setIsGenerating(false);
        if (activeSolveController === abortController) {
          activeSolveController = null;
        }
      }
    })();
    return () => {
      unmounted = true;
    };
  }, [tournamentId, setIsGenerating, setGenerationError, setSolverHud, setSchedule]);

  const generateSchedule = useCallback(async (closedCourtWindows?: number[][]) => {
    if (!config) {
      throw new Error('No configuration set');
    }
    const windows = await resolveClosedWindows(closedCourtWindows);
    if (windows === null) return; // occupancy unknown: banner already set (D1)
    await runSolve({
      config,
      players,
      matches,
      ...(windows.length > 0 ? { closedCourtWindows: windows } : {}),
    });
  }, [config, players, matches, resolveClosedWindows, runSolve]);

  const cancelGeneration = useCallback(() => {
    activeSolveController?.abort();
    activeSolveController = null;
  }, []);

  const reoptimizeSchedule = useCallback(async () => {
    if (!config || !schedule) {
      throw new Error('No schedule to reoptimize');
    }
    const windows = await resolveClosedWindows();
    if (windows === null) return; // occupancy unknown: banner already set (D1)
    await runSolve({
      config,
      players,
      matches,
      previousAssignments: schedule.assignments,
      ...(windows.length > 0 ? { closedCourtWindows: windows } : {}),
    });
  }, [config, players, matches, schedule, resolveClosedWindows, runSolve]);

  /**
   * Drag-drop pin-and-resolve.
   *
   * The dragged match is marked with `pinnedSlotId`/`pinnedCourtId` in the
   * previous-assignments payload and we re-solve around the pin. The
   * optimistic pin is reflected in the store immediately so the UI can
   * animate before the solver returns.
   */
  const pinAndResolve = useCallback(
    async (pin: { matchId: string; slotId: number; courtId: number }) => {
      if (!config || !schedule) {
        throw new Error('No schedule to re-solve');
      }

      useUiStore.getState().setPendingPin(pin);

      const previousAssignments = schedule.assignments.map((a) =>
        a.matchId === pin.matchId
          ? {
              matchId: a.matchId,
              slotId: pin.slotId,
              courtId: pin.courtId,
              durationSlots: a.durationSlots,
              pinnedSlotId: pin.slotId,
              pinnedCourtId: pin.courtId,
            }
          : {
              matchId: a.matchId,
              slotId: a.slotId,
              courtId: a.courtId,
              durationSlots: a.durationSlots,
            },
      );

      const windows = await resolveClosedWindows();
      if (windows === null) {
        // Occupancy unknown — banner already set (D1). Roll back the
        // optimistic pin so the chip snaps home instead of lying in place.
        useUiStore.getState().setPendingPin(null);
        return;
      }
      await runSolve({
        config,
        players,
        matches,
        previousAssignments,
        ...(windows.length > 0 ? { closedCourtWindows: windows } : {}),
      });
    },
    [config, schedule, players, matches, resolveClosedWindows, runSolve],
  );

  return {
    schedule,
    loading: isGenerating,
    error: generationError,
    view,
    setView,
    generateSchedule,
    reoptimizeSchedule,
    cancelGeneration,
    pinAndResolve,
    loadSchedule: () => {}, // No-op for stateless (schedule is already in store)
    generationProgress,
  };
}
