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
import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTournamentStore } from '../store/tournamentStore';
import { useMatchStateStore } from '../store/matchStateStore';
import { useUiStore } from '../store/uiStore';
import { apiClient, MatchVersionMismatch } from '../api/client';
import type { MatchStateDTO } from '../api/dto';
import { transitionPath } from '../platform/domain/matchTransitions';
import { assertCanEdit } from './useCanEdit';
import { useTournamentIdOrNull } from './useTournamentId';
import { isPageHidden, subscribeVisibility } from '../lib/pageVisibility';
import { isTerminalPollError } from '../lib/pollPolicy';

// The transition table lives in `platform/domain/matchTransitions` — a mirror
// of the backend contract, unit-tested against it. It used to be defined here
// and had drifted into a superset of what the server accepts (audit finding A1).

/** Operator-facing label for a match id — the display code ("Match M12")
 *  when we know its `matchNumber`, else a short UUID prefix. Reads the store
 *  live so conflict toasts never surface a raw UUID (see debt-log). */
function matchLabelOf(matchId: string): string {
  const m = useTournamentStore.getState().matches.find((mm) => mm.id === matchId);
  return m?.matchNumber != null ? `Match M${m.matchNumber}` : `Match ${matchId.slice(0, 8)}…`;
}

export function useLiveTracking() {
  // Resolve the tournament id from the route when mounted under
  // /tournaments/:id, or from the ?id= query param on the public
  // /display route (which sits outside the tournament shell). The
  // standalone TV page used to crash here via the throwing
  // useTournamentId() variant. With no id at all (e.g. /display
  // opened without a query string) every server call below no-ops.
  const routeTid = useTournamentIdOrNull();
  const [searchParams] = useSearchParams();
  const tid = routeTid ?? searchParams.get('id') ?? '';
  // Public display capability link (SP-CLOUD-2): with no tournament id but a
  // ?token=, match-state READS come from the unauthenticated
  // /display/{token}/match-states projection and every mutator below is
  // inert — the spectator board never writes.
  const displayToken = !tid ? searchParams.get('token') : null;
  const tokenMode = !tid && !!displayToken;
  const schedule = useTournamentStore((state) => state.schedule);
  const config = useTournamentStore((state) => state.config);
  const matches = useTournamentStore((state) => state.matches);
  const matchStates = useMatchStateStore((state) => state.matchStates);
  const setMatchStates = useMatchStateStore((state) => state.setMatchStates);
  const setMatchState = useMatchStateStore((state) => state.setMatchState);
  const setLastSynced = useMatchStateStore((state) => state.setLastSynced);
  /**
   * The source (tid or display token) whose reads answered a TERMINAL status —
   * workspace deleted, access revoked, or an invalid capability token (shared
   * definition: lib/pollPolicy). Those never come good, so the 5s poll below
   * stops instead of re-firing the same 404 and console error every cycle
   * forever (an invalid display link did exactly that). Stored as the source
   * rather than a bare flag so pointing the hook at a different workspace /
   * token resumes polling by itself. Transient failures (5xx, offline) are
   * NOT terminal — a live desk must survive them.
   */
  const [terminalFor, setTerminalFor] = useState<string | null>(null);
  const pollSource = tid || displayToken || '';
  const pollTerminal = !!pollSource && terminalFor === pollSource;

  const loadMatchStates = useCallback(async () => {
    if (!tid && !tokenMode) return;
    try {
      const backendStates = tokenMode
        ? await apiClient.getDisplayMatchStates(displayToken as string)
        : await apiClient.getMatchStates(tid);
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
      if (isTerminalPollError(error)) setTerminalFor(pollSource);
      console.error('Failed to load match states:', error);
    }
  }, [setMatchStates, tid, tokenMode, displayToken, pollSource]);

  const syncMatchStates = useCallback(async () => {
    if (!tid && !tokenMode) return;
    try {
      const backendStates = tokenMode
        ? await apiClient.getDisplayMatchStates(displayToken as string)
        : await apiClient.getMatchStates(tid);
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
      if (isTerminalPollError(error)) setTerminalFor(pollSource);
      console.error('Failed to sync match states:', error);
    }
  }, [setMatchStates, setLastSynced, tid, tokenMode, displayToken, pollSource]);

  // Lifecycle wiring — declared AFTER `loadMatchStates` / `syncMatchStates`
  // so the useEffect callbacks don't hit the temporal dead zone on the
  // useCallback references. (Previously these effects sat at the top of
  // the hook body; the runtime worked because effects fire after the
  // function returns, but the lint rule flagged the order as fragile.)
  useEffect(() => {
    loadMatchStates();
  }, [loadMatchStates]);

  useEffect(() => {
    // Nothing to wait for: this source can never answer. Don't even arm the
    // interval or the visibility-regain sync.
    if (pollTerminal) return;
    const interval = setInterval(() => {
      // Skip the roundtrip while the tab is hidden — nobody can see the
      // live-tracking board update anyway.
      if (isPageHidden()) return;
      syncMatchStates();
    }, 5000);
    // Regain: fire an immediate sync instead of waiting out the interval.
    const unsubscribe = subscribeVisibility((hidden) => {
      if (!hidden) syncMatchStates();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [syncMatchStates, pollTerminal]);

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
    // Token-mode (public spectator board): the display never writes.
    if (tokenMode) return;
    // A viewer's press must never reach the wire (audit A2). Refusing here — at
    // the seam — means a control we failed to disable still no-ops client-side
    // instead of 403-ing and leaving the board diverged from the server.
    if (!assertCanEdit()) return;

    try {
      const startStatus =
        useMatchStateStore.getState().matchStates[matchId]?.status || 'scheduled';

      // The operator's intent may not be reachable in one hop — scoring a match
      // that was never explicitly started asks for `called → finished`, which
      // the server refuses. Walk the machine instead of firing a request that
      // can only 409. Directly-legal transitions yield a single step, so the
      // common path is unchanged.
      const path = transitionPath(startStatus, status);
      if (path === null) {
        console.warn(`Invalid state transition: ${startStatus} to ${status} for match ${matchId}`);
        throw new Error(`Invalid state transition: cannot go from '${startStatus}' to '${status}'`);
      }
      for (const intermediate of path.slice(0, -1)) {
        await updateMatchStatusRef.current(matchId, intermediate);
      }

      const freshMatchStates = useMatchStateStore.getState().matchStates;
      const currentState = freshMatchStates[matchId] || { matchId, status: 'scheduled' };
      const currentStatus = currentState.status || 'scheduled';

      // An intermediate step can fail (it surfaced its own toast and returned).
      // Don't follow it with a write the server is guaranteed to refuse.
      if (path.length > 1 && currentStatus !== path[path.length - 2]) return;

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
          // A 409 and a 412 mean different things and must not read the same.
          //   412 — our version was stale. Replaying with the fresh version
          //         succeeds, so Retry is real.
          //   409 — the server refused the TRANSITION: the match already moved
          //         on (another device called/started/finished it). Replaying
          //         re-sends the same illegal move and fails identically, so
          //         offering Retry is a lie. Say what happened instead; the
          //         refetch above already re-synced to the server's truth.
          // (Audit finding A1: every 409 used to read "version mismatch" and
          //  carry a Retry that could never succeed.)
          const isTransitionConflict = apiError.status === 409;
          try {
            useUiStore.getState().pushToast(
              isTransitionConflict
                ? {
                    level: 'warn',
                    message: `${matchLabelOf(matchId)} already moved on`,
                    detail: `${apiError.message} — the board has been re-synced to the server.`,
                  }
                : {
                    level: 'error',
                    message: `${matchLabelOf(matchId)} — version mismatch`,
                    detail: apiError.message,
                    actionLabel: 'Retry',
                    onAction: () => {
                      void updateMatchStatusRef.current(matchId, status, additionalData);
                    },
                  },
            );
          } catch { /* toast store unavailable */ }
          return;
        }

        // ── Anything else: keep the existing sticky-toast retry path
        const detail = apiError instanceof Error ? apiError.message : 'Network error';
        try {
          useUiStore.getState().pushToast({
            level: 'error',
            message: `${matchLabelOf(matchId)} did not save`,
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
  }, [setMatchState, tid, tokenMode]);

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
    if (tokenMode) return; // public display: never writes
    if (!assertCanEdit()) return;
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
  }, [setMatchState, tid, tokenMode]);

  /**
   * Confirm a player has arrived at the court for a called match
   */
  const confirmPlayer = useCallback(async (
    matchId: string,
    playerId: string,
    confirmed: boolean
  ) => {
    if (tokenMode) return; // public display: never writes
    if (!assertCanEdit()) return;
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
  }, [setMatchState, tid, tokenMode]);

  const exportStates = useCallback(async () => {
    if (tokenMode) return; // public display: no operator surfaces
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
  }, [tid, tokenMode]);

  const importStates = useCallback(async (file: File) => {
    if (tokenMode) {
      // public display: inert — the shape callers expect, without a write.
      return { message: 'Read-only display', matchCount: 0 };
    }
    try {
      const result = await apiClient.importMatchStates(tid, file);
      await loadMatchStates(); // Reload after import
      return result;
    } catch (error) {
      console.error('Failed to import match states:', error);
      throw error;
    }
  }, [loadMatchStates, tid, tokenMode]);

  const resetStates = useCallback(async () => {
    if (tokenMode) return; // public display: never writes
    try {
      await apiClient.resetMatchStates(tid);
      setMatchStates({});
    } catch (error) {
      console.error('Failed to reset match states:', error);
      throw error;
    }
  }, [setMatchStates, tid, tokenMode]);

  // Calculate progress stats. Both numerator and denominator are
  // restricted to the current schedule's assignments — earlier we
  // counted any matchState with status==='finished' regardless of
  // whether its match was still scheduled, which let the percentage
  // exceed 100 after a cancellation/court-closure removed a played
  // match from the plan.
  // Memoized so these filters recompute only when the schedule or match
  // states actually change, not on every render (perf pass 2 removed the
  // 1s wall-clock tick that used to force one every second).
  const scheduledAssignments = useMemo(() => schedule?.assignments ?? [], [schedule]);
  const progressStats = useMemo(() => {
    const finished = scheduledAssignments.filter((a) => matchStates[a.matchId]?.status === 'finished').length;
    const inProgress = scheduledAssignments.filter((a) => matchStates[a.matchId]?.status === 'started').length;
    const total = scheduledAssignments.length;
    return {
      total,
      finished,
      inProgress,
      get remaining() {
        return this.total - this.finished;
      },
      get percentage() {
        return this.total > 0 ? Math.round((this.finished / this.total) * 100) : 0;
      },
    };
  }, [scheduledAssignments, matchStates]);

  const matchesByStatus = useMemo(
    () => ({
      scheduled: scheduledAssignments.filter((a) => !matchStates[a.matchId] || matchStates[a.matchId].status === 'scheduled'),
      called: scheduledAssignments.filter((a) => matchStates[a.matchId]?.status === 'called'),
      started: scheduledAssignments.filter((a) => matchStates[a.matchId]?.status === 'started'),
      finished: scheduledAssignments.filter((a) => matchStates[a.matchId]?.status === 'finished'),
    }),
    [scheduledAssignments, matchStates],
  );

  return {
    schedule,
    config,
    matches,
    matchStates,
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
