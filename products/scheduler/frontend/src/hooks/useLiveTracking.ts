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
import { useEffect, useCallback, useRef } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { useMatchStateStore } from '../store/matchStateStore';
import { useUiStore } from '../store/uiStore';
import { apiClient, MatchVersionMismatch } from '../api/client';
import type { MatchStateDTO } from '../api/dto';
import { useTournamentId } from './useTournamentId';

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
  const tid = useTournamentId();
  const schedule = useTournamentStore((state) => state.schedule);
  const config = useTournamentStore((state) => state.config);
  const matches = useTournamentStore((state) => state.matches);
  const matchStates = useMatchStateStore((state) => state.matchStates);
  const liveState = useMatchStateStore((state) => state.liveState);
  const setMatchStates = useMatchStateStore((state) => state.setMatchStates);
  const setMatchState = useMatchStateStore((state) => state.setMatchState);
  const setCurrentTime = useMatchStateStore((state) => state.setCurrentTime);
  const setLastSynced = useMatchStateStore((state) => state.setLastSynced);

  const loadMatchStates = useCallback(async () => {
    try {
      const backendStates = await apiClient.getMatchStates(tid);
      const localStates = useMatchStateStore.getState().matchStates;

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
      const backendStates = await apiClient.getMatchStates(tid);
      const localStates = useMatchStateStore.getState().matchStates;

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

  // Lifecycle wiring — declared AFTER `loadMatchStates` / `syncMatchStates`
  // so the useEffect callbacks don't hit the temporal dead zone on the
  // useCallback references. (Previously these effects sat at the top of
  // the hook body; the runtime worked because effects fire after the
  // function returns, but the lint rule flagged the order as fragile.)
  useEffect(() => {
    loadMatchStates();
  }, [loadMatchStates]);

  useEffect(() => {
    const interval = setInterval(() => {
      syncMatchStates();
    }, 5000);
    return () => clearInterval(interval);
  }, [syncMatchStates]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      setCurrentTime(now);
    }, 1000);
    return () => clearInterval(interval);
  }, [setCurrentTime]);

  // Self-ref so the toast `onAction` retry can invoke the latest
  // `updateMatchStatus` without tripping React's temporal-dead-zone
  // lint rule (`react-hooks/immutability`). The ref is wired up by
  // the assignment after the useCallback definition.
  const updateMatchStatusRef = useRef<
    (matchId: string, status: MatchStateDTO['status'], additionalData?: Partial<MatchStateDTO>) => Promise<void>
  >(async () => {});

  const updateMatchStatus = useCallback(async (
    matchId: string,
    status: MatchStateDTO['status'],
    additionalData?: Partial<MatchStateDTO>
  ) => {
    try {
      const freshMatchStates = useMatchStateStore.getState().matchStates;
      const currentState = freshMatchStates[matchId] || { matchId, status: 'scheduled' };
      const currentStatus = currentState.status || 'scheduled';

      if (!isValidTransition(currentStatus, status)) {
        console.warn(`Invalid state transition: ${currentStatus} to ${status} for match ${matchId}`);
        throw new Error(`Invalid state transition: cannot go from '${currentStatus}' to '${status}'`);
      }

      const now = new Date().toISOString();
      const newState: MatchStateDTO = {
        ...currentState,
        matchId,
        status,
        ...additionalData,
      };
      if (status === 'called' && !currentState.calledAt) newState.calledAt = now;
      if (status === 'started' && !currentState.actualStartTime) newState.actualStartTime = now;
      if (status === 'finished' && !currentState.actualEndTime) newState.actualEndTime = now;

      // ─── Resolve the canonical match version ───────────────────────
      // Read from the Zustand cache first; cold-fetch via the legacy
      // GET (which carries ETag) on miss. If even the cold-fetch fails
      // (offline / 5xx), fall back to 0 — the server will 412 and we
      // recover via the catch block below. Mirrors the commandQueue
      // submit path (useCommandQueue.ts:99-110).
      const store = useMatchStateStore.getState();
      let version = store.canonicalVersionsByMatchId[matchId];
      if (version === undefined) {
        try {
          version = await apiClient.getMatchVersion(tid, matchId);
        } catch {
          version = 0;
        }
        store.setMatchVersion(matchId, version);
      }

      // Capture previous status BEFORE the optimistic apply so we can
      // roll back precisely on a 412 if the refetch fails.
      const previousStatus = currentStatus;

      // Optimistic local apply (unchanged behaviour).
      setMatchState(matchId, newState);

      try {
        const { state: serverState, version: newVersion } =
          await apiClient.updateMatchState(tid, matchId, newState, version);
        // Authoritative server state — overwrite the optimistic apply
        // so timestamps the server stamped (e.g. actualStartTime) win.
        setMatchState(matchId, serverState);
        // Cache the new canonical version so the next mutation skips
        // the cold-read roundtrip.
        useMatchStateStore.getState().setMatchVersion(matchId, newVersion);
      } catch (apiError) {
        console.error('Failed to sync match status to backend:', apiError);

        // ── 412 / 409: refetch + rollback ─────────────────────────
        if (apiError instanceof MatchVersionMismatch) {
          try {
            const fresh = await apiClient.getMatchState(tid, matchId);
            setMatchState(matchId, fresh);
            try {
              const v = await apiClient.getMatchVersion(tid, matchId);
              useMatchStateStore.getState().setMatchVersion(matchId, v);
            } catch { /* best-effort */ }
          } catch {
            // Refetch failed (transient). Roll back the optimistic
            // apply explicitly so the operator UX doesn't show a
            // status the server will never confirm.
            useMatchStateStore.getState().applyOptimisticStatus(matchId, previousStatus);
          }
          // Surface a sticky toast so the operator knows the change
          // didn't land. Retry replays with the fresh version.
          try {
            useUiStore.getState().pushToast({
              level: 'error',
              message: `Match ${matchId.slice(0, 8)}… version mismatch`,
              detail: apiError.message,
              actionLabel: 'Retry',
              onAction: () => {
                void updateMatchStatusRef.current(matchId, status, additionalData);
              },
            });
          } catch { /* toast store unavailable */ }
          return;
        }

        // ── Anything else: keep the existing sticky-toast retry path
        const detail = apiError instanceof Error ? apiError.message : 'Network error';
        try {
          useUiStore.getState().pushToast({
            level: 'error',
            message: `Match ${matchId.slice(0, 8)}… did not save`,
            detail,
            actionLabel: 'Retry',
            onAction: () => {
              void updateMatchStatusRef.current(matchId, status, additionalData);
            },
          });
        } catch { /* toast store unavailable */ }
      }
    } catch (error) {
      console.error('Failed to update match status:', error);
      throw error;
    }
  }, [setMatchState, tid]);

  // Keep the ref pointed at the latest closure so retry callbacks
  // invoke the freshest version. Assignment lives in an effect so
  // we don't write a ref during render (react-hooks/refs).
  useEffect(() => {
    updateMatchStatusRef.current = updateMatchStatus;
  }, [updateMatchStatus]);

  const setMatchScore = useCallback(async (
    matchId: string,
    score: { sideA: number; sideB: number },
    notes?: string
  ) => {
    try {
      const store = useMatchStateStore.getState();
      let version = store.canonicalVersionsByMatchId[matchId];
      if (version === undefined) {
        try {
          version = await apiClient.getMatchVersion(tid, matchId);
        } catch {
          version = 0;
        }
        store.setMatchVersion(matchId, version);
      }
      const { state: updated, version: newVersion } = await apiClient.updateMatchState(
        tid,
        matchId,
        {
          matchId,
          status: 'finished',
          score,
          notes,
          actualEndTime: new Date().toISOString(),
        },
        version,
      );
      setMatchState(matchId, updated);
      useMatchStateStore.getState().setMatchVersion(matchId, newVersion);
    } catch (error) {
      console.error('Failed to set match score:', error);
      throw error;
    }
  }, [setMatchState, tid]);

  /**
   * Confirm a player has arrived at the court for a called match
   */
  const confirmPlayer = useCallback(async (
    matchId: string,
    playerId: string,
    confirmed: boolean
  ) => {
    try {
      const freshMatchStates = useMatchStateStore.getState().matchStates;
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

      setMatchState(matchId, newState);

      // Resolve canonical version (same cold-fetch fallback as updateMatchStatus)
      const store = useMatchStateStore.getState();
      let version = store.canonicalVersionsByMatchId[matchId];
      if (version === undefined) {
        try {
          version = await apiClient.getMatchVersion(tid, matchId);
        } catch {
          version = 0;
        }
        store.setMatchVersion(matchId, version);
      }

      try {
        const { state: serverState, version: newVersion } =
          await apiClient.updateMatchState(tid, matchId, newState, version);
        setMatchState(matchId, serverState);
        useMatchStateStore.getState().setMatchVersion(matchId, newVersion);
      } catch (apiError) {
        console.error('Failed to sync player confirmation to backend:', apiError);
        // Existing UX: don't revert local state — operator's confirmation
        // stays in the UI for the session. If it was a version mismatch,
        // a subsequent updateMatchStatus call will refetch and overwrite.
      }
    } catch (error) {
      console.error('Failed to confirm player:', error);
      throw error;
    }
  }, [setMatchState, tid]);

  const exportStates = useCallback(async () => {
    try {
      const blob = await apiClient.exportMatchStates(tid);
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
      const result = await apiClient.importMatchStates(tid, file);
      await loadMatchStates(); // Reload after import
      return result;
    } catch (error) {
      console.error('Failed to import match states:', error);
      throw error;
    }
  }, [loadMatchStates]);

  const resetStates = useCallback(async () => {
    try {
      await apiClient.resetMatchStates(tid);
      setMatchStates({});
    } catch (error) {
      console.error('Failed to reset match states:', error);
      throw error;
    }
  }, [setMatchStates]);

  // Calculate progress stats. Both numerator and denominator are
  // restricted to the current schedule's assignments — earlier we
  // counted any matchState with status==='finished' regardless of
  // whether its match was still scheduled, which let the percentage
  // exceed 100 after a cancellation/court-closure removed a played
  // match from the plan.
  const scheduledAssignments = schedule?.assignments ?? [];
  const finishedScheduled = scheduledAssignments.filter(
    (a) => matchStates[a.matchId]?.status === 'finished',
  ).length;
  const startedScheduled = scheduledAssignments.filter(
    (a) => matchStates[a.matchId]?.status === 'started',
  ).length;
  const totalScheduled = scheduledAssignments.length;
  const progressStats = {
    total: totalScheduled,
    finished: finishedScheduled,
    inProgress: startedScheduled,
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
  };
}
