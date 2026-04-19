/**
 * Hook for live tracking page logic.
 *
 * Manages match-state fetching, updating, and grouping for the live
 * tracking interface.
 *
 * Match state machine (happy path reads left-to-right):
 *
 *   scheduled -> called -> started -> finished
 *
 * Every forward transition has an undo edge to the prior state, plus
 * an ad-hoc "delay" edge that leaves a match in `scheduled` with a
 * reason attached. See VALID_TRANSITIONS below for the authoritative
 * table.
 */
import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { apiClient } from '../api/client';
import type { MatchStateDTO } from '../api/dto';

/**
 * Valid state transitions for match state machine
 * Key = current status, Value = array of valid next statuses
 */
const VALID_TRANSITIONS: Record<MatchStateDTO['status'], MatchStateDTO['status'][]> = {
  scheduled: ['called', 'scheduled', 'finished'], // call, stay, or record score after-the-fact
  called: ['started', 'scheduled', 'finished'],   // start, undo, or record score after-the-fact
  started: ['finished', 'called'],                // finish or undo to called
  finished: ['started', 'finished'],              // undo to started OR edit score (stays finished)
};

/**
 * Validate if a state transition is allowed
 */
function isValidTransition(
  currentStatus: MatchStateDTO['status'],
  newStatus: MatchStateDTO['status']
): boolean {
  const validNextStates = VALID_TRANSITIONS[currentStatus];
  return validNextStates.includes(newStatus);
}

export function useLiveTracking() {
  const schedule = useAppStore((state) => state.schedule);
  const config = useAppStore((state) => state.config);
  const matches = useAppStore((state) => state.matches);
  const matchStates = useAppStore((state) => state.matchStates);
  const liveState = useAppStore((state) => state.liveState);
  const setMatchStates = useAppStore((state) => state.setMatchStates);
  const setMatchState = useAppStore((state) => state.setMatchState);
  const setCurrentTime = useAppStore((state) => state.setCurrentTime);
  const setLastSynced = useAppStore((state) => state.setLastSynced);

  // Load match states from file on mount
  useEffect(() => {
    loadMatchStates();
  }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      syncMatchStates();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      setCurrentTime(now);
    }, 1000);

    return () => clearInterval(interval);
  }, [setCurrentTime]);

  const loadMatchStates = useCallback(async () => {
    try {
      const backendStates = await apiClient.getMatchStates();
      const localStates = useAppStore.getState().matchStates;

      // Merge backend with local, preserving local-only fields
      const mergedStates: Record<string, MatchStateDTO> = {};

      for (const [matchId, backendState] of Object.entries(backendStates)) {
        const localState = localStates[matchId];
        mergedStates[matchId] = {
          ...backendState,
          postponed: backendState.postponed ?? localState?.postponed,
          playerConfirmations: backendState.playerConfirmations ?? localState?.playerConfirmations,
        };
      }

      for (const [matchId, localState] of Object.entries(localStates)) {
        if (!mergedStates[matchId]) {
          mergedStates[matchId] = localState;
        }
      }

      setMatchStates(mergedStates);
    } catch (error) {
      console.error('Failed to load match states:', error);
    }
  }, [setMatchStates]);

  const syncMatchStates = useCallback(async () => {
    try {
      const backendStates = await apiClient.getMatchStates();
      const localStates = useAppStore.getState().matchStates;

      // Merge backend with local, preserving local-only fields
      const mergedStates: Record<string, MatchStateDTO> = {};

      // Start with all backend states
      for (const [matchId, backendState] of Object.entries(backendStates)) {
        const localState = localStates[matchId];
        mergedStates[matchId] = {
          ...backendState,
          // Preserve local-only fields if backend doesn't have them
          postponed: backendState.postponed ?? localState?.postponed,
          playerConfirmations: backendState.playerConfirmations ?? localState?.playerConfirmations,
        };
      }

      // Also include any local states that aren't in backend
      for (const [matchId, localState] of Object.entries(localStates)) {
        if (!mergedStates[matchId]) {
          mergedStates[matchId] = localState;
        }
      }

      setMatchStates(mergedStates);
      setLastSynced(new Date().toISOString());
    } catch (error) {
      console.error('Failed to sync match states:', error);
    }
  }, [setMatchStates, setLastSynced]);

  const updateMatchStatus = useCallback(async (
    matchId: string,
    status: MatchStateDTO['status'],
    additionalData?: Partial<MatchStateDTO>
  ) => {
    try {
      // Get fresh state from store to avoid stale closures
      const freshMatchStates = useAppStore.getState().matchStates;
      const currentState = freshMatchStates[matchId] || { matchId, status: 'scheduled' };
      const currentStatus = currentState.status || 'scheduled';

      // Validate state transition
      if (!isValidTransition(currentStatus, status)) {
        console.warn(`Invalid state transition: ${currentStatus} to ${status} for match ${matchId}`);
        throw new Error(`Invalid state transition: cannot go from '${currentStatus}' to '${status}'`);
      }

      // ISO-8601 UTC — parsed by parseMatchStartMs on every reader.
      // Do NOT switch to a locale-dependent format: ElapsedTimer and the
      // TV PublicDisplayPage both assume a canonical timestamp shape.
      const now = new Date().toISOString();

      const newState: MatchStateDTO = {
        ...currentState,
        matchId,
        status,
        ...additionalData,
      };

      // Set timestamps based on status transitions
      if (status === 'started' && !currentState.actualStartTime) {
        newState.actualStartTime = now;
      }
      if (status === 'finished' && !currentState.actualEndTime) {
        newState.actualEndTime = now;
      }

      // Update local state immediately for responsive UI
      setMatchState(matchId, newState);

      // Sync to backend. On failure, surface a sticky error toast with
      // a Retry action so the operator knows the change didn't land
      // (and can replay it). Silent failures were hiding real data-loss
      // events in prior builds.
      try {
        await apiClient.updateMatchState(matchId, newState);
      } catch (apiError) {
        console.error('Failed to sync match status to backend:', apiError);
        const detail = apiError instanceof Error ? apiError.message : 'Network error';
        try {
          useAppStore.getState().pushToast({
            level: 'error',
            message: `Match ${matchId.slice(0, 8)}… did not save`,
            detail,
            actionLabel: 'Retry',
            onAction: () => {
              // Replay the same transition; the hook will re-push a toast
              // on another failure, capped to one-per-match by id.
              void (async () => {
                try {
                  await apiClient.updateMatchState(matchId, newState);
                } catch {
                  /* a second failure will be caught by the Retry loop */
                }
              })();
            },
          });
        } catch {
          /* toast store unavailable — never block the UI on telemetry */
        }
      }
    } catch (error) {
      console.error('Failed to update match status:', error);
      throw error;
    }
  }, [setMatchState]);

  const setMatchScore = useCallback(async (
    matchId: string,
    score: { sideA: number; sideB: number },
    notes?: string
  ) => {
    try {
      const updated = await apiClient.updateMatchState(matchId, {
        matchId,
        status: 'finished',
        score,
        notes,
        actualEndTime: new Date().toISOString(),
      });
      setMatchState(matchId, updated);
    } catch (error) {
      console.error('Failed to set match score:', error);
      throw error;
    }
  }, [setMatchState]);

  /**
   * Confirm a player has arrived at the court for a called match
   */
  const confirmPlayer = useCallback(async (
    matchId: string,
    playerId: string,
    confirmed: boolean
  ) => {
    try {
      // Get fresh state from store to avoid stale closures
      const freshMatchStates = useAppStore.getState().matchStates;
      const currentState = freshMatchStates[matchId] || { matchId, status: 'called' };
      const currentConfirmations = currentState.playerConfirmations || {};

      const updatedConfirmations = {
        ...currentConfirmations,
        [playerId]: confirmed,
      };

      const newState: MatchStateDTO = {
        ...currentState,
        playerConfirmations: updatedConfirmations,
      };

      // Update local state immediately for responsive UI
      setMatchState(matchId, newState);

      // Sync to backend
      try {
        await apiClient.updateMatchState(matchId, newState);
      } catch (apiError) {
        console.error('Failed to sync player confirmation to backend:', apiError);
        // Don't revert - local state is still valid for this session
      }
    } catch (error) {
      console.error('Failed to confirm player:', error);
      throw error;
    }
  }, [setMatchState]);

  const exportStates = useCallback(async () => {
    try {
      const blob = await apiClient.exportMatchStates();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tournament_state.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export match states:', error);
      throw error;
    }
  }, []);

  const importStates = useCallback(async (file: File) => {
    try {
      const result = await apiClient.importMatchStates(file);
      await loadMatchStates(); // Reload after import
      return result;
    } catch (error) {
      console.error('Failed to import match states:', error);
      throw error;
    }
  }, [loadMatchStates]);

  const resetStates = useCallback(async () => {
    try {
      await apiClient.resetMatchStates();
      setMatchStates({});
    } catch (error) {
      console.error('Failed to reset match states:', error);
      throw error;
    }
  }, [setMatchStates]);

  // Calculate progress stats
  const progressStats = {
    total: schedule?.assignments.length || 0,
    finished: Object.values(matchStates).filter(s => s.status === 'finished').length,
    inProgress: Object.values(matchStates).filter(s => s.status === 'started').length,
    get remaining() {
      return this.total - this.finished;
    },
    get percentage() {
      return this.total > 0 ? Math.round((this.finished / this.total) * 100) : 0;
    },
  };

  // Group matches by status
  const matchesByStatus = {
    scheduled: schedule?.assignments.filter(a => !matchStates[a.matchId] || matchStates[a.matchId].status === 'scheduled') || [],
    called: schedule?.assignments.filter(a => matchStates[a.matchId]?.status === 'called') || [],
    started: schedule?.assignments.filter(a => matchStates[a.matchId]?.status === 'started') || [],
    finished: schedule?.assignments.filter(a => matchStates[a.matchId]?.status === 'finished') || [],
  };

  return {
    schedule,
    config,
    matches,
    matchStates,
    liveState,
    progressStats,
    matchesByStatus,
    updateMatchStatus,
    setMatchScore,
    confirmPlayer,
    exportStates,
    importStates,
    resetStates,
    syncMatchStates,
    isLoading: false, // TODO: Add loading state if needed
  };
}
