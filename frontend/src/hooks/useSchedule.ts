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
import { useAppStore } from '../store/appStore';
import { apiClient } from '../api/client';
import type { ScheduleView } from '../api/dto';

export function useSchedule() {
  const config = useAppStore((state) => state.config);
  const players = useAppStore((state) => state.players);
  const matches = useAppStore((state) => state.matches);
  const schedule = useAppStore((state) => state.schedule);
  const setSchedule = useAppStore((state) => state.setSchedule);
  const setScheduleStats = useAppStore((state) => state.setScheduleStats);

  // Use global generation state (persists across tab switches)
  const isGenerating = useAppStore((state) => state.isGenerating);
  const generationProgress = useAppStore((state) => state.generationProgress);
  const generationError = useAppStore((state) => state.generationError);
  const setIsGenerating = useAppStore((state) => state.setIsGenerating);
  const setGenerationProgress = useAppStore((state) => state.setGenerationProgress);
  const setGenerationError = useAppStore((state) => state.setGenerationError);
  const setSolverHud = useAppStore((state) => state.setSolverHud);
  const resetSolverHud = useAppStore((state) => state.resetSolverHud);

  const [view, setView] = useState<ScheduleView>('timeslot');

  // Track abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const generateSchedule = useCallback(async () => {
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

      // Call stateless API with progress tracking
      const result = await apiClient.generateScheduleWithProgress(
        {
          config,
          players,
          matches,
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
      const finalProgress = useAppStore.getState().generationProgress;
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
  }, [config, players, matches, setSchedule, setScheduleStats, setIsGenerating, setGenerationProgress, setGenerationError, setSolverHud, resetSolverHud]);

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

      // Call stateless API with previous assignments
      const result = await apiClient.generateSchedule({
        config,
        players,
        matches,
        previousAssignments: schedule.assignments,
      });

      setSchedule(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reoptimize schedule';
      setGenerationError(message);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, [config, players, matches, schedule, setSchedule, setIsGenerating, setGenerationError]);

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

      const store = useAppStore.getState();
      store.setPendingPin(pin);

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

        const result = await apiClient.generateScheduleWithProgress(
          {
            config,
            players,
            matches,
            previousAssignments,
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
    [config, schedule, players, matches, setSchedule, setIsGenerating, setGenerationError, setGenerationProgress, setSolverHud, resetSolverHud],
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
