/**
 * Schedule generation hook.
 *
 * Owns the round-trip with ``/schedule/stream`` (Server-Sent Events).
 * Reads the current tournament from ``appStore`` (config + players +
 * matches), opens an SSE stream, feeds each ``solver_progress`` /
 * ``solver_phase`` / ``solver_model_built`` event into the solver-HUD
 * slice, and writes the final ``ScheduleDTO`` into ``appStore.schedule``
 * when the stream completes.
 *
 * Generation flags (``isGenerating``, ``generationProgress``,
 * ``generationError``) live on the global store rather than local state
 * so they survive tab switches — a user can hop to Roster mid-solve and
 * back to Schedule without losing the run.
 *
 * An ``AbortController`` is held in a ref so a second ``generate()``
 * call (or an unmount) cleanly cancels the in-flight stream; the API
 * client treats ``ERR_CANCELED`` as silent (no toast).
 */
import { useCallback, useState, useRef } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { useUiStore } from '../store/uiStore';
import { apiClient } from '../api/client';
import type { ScheduleView } from '../api/dto';
import { useTournamentIdOrNull } from './useTournamentId';
import { bracketOccupiedWindows } from '../lib/bracketOccupancy';

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

  // Track abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const tournamentId = useTournamentIdOrNull();

  /**
   * Cross-engine coordination — EVERY meet solve must avoid the courts the
   * bracket already occupies (the bracket side coordinates server-side; see
   * `lib/bracketOccupancy.ts`). Callers that already hold a fresh bracket
   * snapshot pass their own windows; otherwise this fetches the snapshot at
   * solve time. Resolves `[]` on meet-only workspaces (404 → null) or any
   * fetch failure — a broken bracket poll must never block a meet solve.
   */
  const resolveClosedWindows = useCallback(
    async (provided?: number[][]): Promise<number[][]> => {
      if (provided) return provided;
      if (!tournamentId) return [];
      try {
        return bracketOccupiedWindows(await apiClient.getBracket(tournamentId));
      } catch {
        return [];
      }
    },
    [tournamentId],
  );

  const generateSchedule = useCallback(async (closedCourtWindows?: number[][]) => {
    if (!config) {
      throw new Error('No configuration set');
    }

    // Cancel any existing generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setIsGenerating(true);
      setGenerationError(null);
      setGenerationProgress(null);
      resetSolverHud();

      const windows = await resolveClosedWindows(closedCourtWindows);

      // Call stateless API with progress tracking
      const result = await apiClient.generateScheduleWithProgress(
        {
          config,
          players,
          matches,
          ...(windows.length > 0 ? { closedCourtWindows: windows } : {}),
        },
        {
          onProgress: (progress) => {
            setGenerationProgress(progress);
            setSolverHud({
              solutionCount: progress.solution_count ?? 0,
              objective: progress.current_objective,
              bestBound: progress.best_bound,
              gapPercent: progress.gap_percent ?? undefined,
              elapsedMs: progress.elapsed_ms,
            });
          },
          onModelBuilt: (m) => {
            setSolverHud({
              numMatches: m.numMatches,
              numIntervals: m.numIntervals,
              numNoOverlap: m.numNoOverlap,
              numVariables: m.numVariables,
            });
          },
          onPhase: ({ phase }) => {
            setSolverHud({ phase });
          },
        },
        abortController.signal
      );

      setSchedule(result);

      // Save final stats - use result.assignments (the actual final schedule),
      // not progress.current_assignments (which may be from an intermediate solution)
      const finalProgress = useUiStore.getState().generationProgress;
      setScheduleStats({
        elapsed: finalProgress?.elapsed_ms ?? 0,
        solutionCount: finalProgress?.solution_count,
        objectiveScore: result.objectiveScore ?? finalProgress?.current_objective,
        bestBound: finalProgress?.best_bound,
        assignments: result.assignments,  // Use the final schedule, not progress snapshot
      });
    } catch (err) {
      // Don't treat abort as error
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to generate schedule';
      setGenerationError(message);
      throw err;
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [config, players, matches, setSchedule, setScheduleStats, setIsGenerating, setGenerationProgress, setGenerationError, setSolverHud, resetSolverHud, resolveClosedWindows]);

  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const reoptimizeSchedule = useCallback(async () => {
    if (!config || !schedule) {
      throw new Error('No schedule to reoptimize');
    }

    try {
      setIsGenerating(true);
      setGenerationError(null);

      const windows = await resolveClosedWindows();

      // Call stateless API with previous assignments
      const result = await apiClient.generateSchedule({
        config,
        players,
        matches,
        previousAssignments: schedule.assignments,
        ...(windows.length > 0 ? { closedCourtWindows: windows } : {}),
      });

      setSchedule(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reoptimize schedule';
      setGenerationError(message);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, [config, players, matches, schedule, setSchedule, setIsGenerating, setGenerationError, resolveClosedWindows]);

  /**
   * Drag-drop pin-and-resolve.
   *
   * The dragged match is marked with `pinnedSlotId`/`pinnedCourtId` in the
   * previous-assignments payload and we re-solve with a tight 3 s time limit.
   * The optimistic pin is reflected in the store immediately so the UI can
   * animate before the solver returns.
   */
  const pinAndResolve = useCallback(
    async (pin: { matchId: string; slotId: number; courtId: number }) => {
      if (!config || !schedule) {
        throw new Error('No schedule to re-solve');
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

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

      try {
        setIsGenerating(true);
        setGenerationError(null);
        resetSolverHud();

        const windows = await resolveClosedWindows();

        const result = await apiClient.generateScheduleWithProgress(
          {
            config,
            players,
            matches,
            previousAssignments,
            ...(windows.length > 0 ? { closedCourtWindows: windows } : {}),
          },
          {
            onProgress: (progress) => {
              setGenerationProgress(progress);
              setSolverHud({
                solutionCount: progress.solution_count ?? 0,
                objective: progress.current_objective,
                bestBound: progress.best_bound,
                gapPercent: progress.gap_percent ?? undefined,
                elapsedMs: progress.elapsed_ms,
              });
            },
            onModelBuilt: (m) => {
              setSolverHud({
                numMatches: m.numMatches,
                numIntervals: m.numIntervals,
                numNoOverlap: m.numNoOverlap,
                numVariables: m.numVariables,
              });
            },
            onPhase: ({ phase }) => setSolverHud({ phase }),
          },
          abortController.signal,
        );

        setSchedule(result);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to re-solve with pin';
        setGenerationError(message);
        throw err;
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    },
    [config, schedule, players, matches, setSchedule, setIsGenerating, setGenerationError, setGenerationProgress, setSolverHud, resetSolverHud, resolveClosedWindows],
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
