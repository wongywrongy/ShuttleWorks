/**
 * React-side wrapper around the IndexedDB command queue (Step F).
 *
 * Translates the prompt's optimistic-UI flow into a single `submit`
 * function callable from operator surfaces. The flow per the
 * prompt's spec:
 *
 *   1. Generate a UUID as the idempotency key.
 *   2. Apply optimistic status via `applyOptimisticStatus`.
 *   3. Mark the match as pending via `setPendingCommand`.
 *   4. Enqueue the command in IndexedDB.
 *   5. Flush immediately (best-effort).
 *
 * Result handling:
 *   - **200 ok** — clear pending, write authoritative server state.
 *   - **409 stale_version** — clear pending, refetch from server.
 *   - **409 conflict** — clear pending, surface rejection_reason to UI.
 *   - **Network error** — leave pending in place; next `flush` retries.
 *
 * The hook does not own the reconnect-flush timer (Step F3 of the
 * prompt). That'll attach via a separate `useReachability` hook in
 * a future iteration.
 */
import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { apiClient } from '../api/client';
import {
  enqueue,
  flush,
  type MatchAction,
  type QueuedCommand,
  type SubmitFn,
  type SubmitResult,
} from '../lib/commandQueue';
import { useMatchStateStore } from '../store/matchStateStore';
import { useTournamentId } from './useTournamentId';

const ACTION_TO_LEGACY_STATUS: Record<
  MatchAction,
  'scheduled' | 'called' | 'started' | 'finished'
> = {
  call_to_court: 'called',
  start_match: 'started',
  finish_match: 'finished',
  retire_match: 'finished',
  uncall: 'scheduled',
};

const CANONICAL_TO_LEGACY_STATUS: Record<
  string,
  'scheduled' | 'called' | 'started' | 'finished'
> = {
  scheduled: 'scheduled',
  called: 'called',
  playing: 'started',
  finished: 'finished',
  retired: 'finished',
};

export interface SubmitOutcome {
  commandId: string;
  result: SubmitResult;
}

/**
 * Hook exposing a single `submit(action, matchId, payload?)` action.
 * Consumers (operator surfaces — call-to-court buttons, etc.) call
 * `submit` and receive a discriminated-union result so they can
 * branch on the outcome (e.g. show a conflict toast).
 */
export function useCommandQueue() {
  const tid = useTournamentId();
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const setMatchState = useMatchStateStore((s) => s.setMatchState);
  const applyOptimisticStatus = useMatchStateStore((s) => s.applyOptimisticStatus);
  const setPendingCommand = useMatchStateStore((s) => s.setPendingCommand);
  const clearPendingCommand = useMatchStateStore((s) => s.clearPendingCommand);
  const recordConflict = useMatchStateStore((s) => s.recordConflict);

  const submit = useCallback(
    async (
      action: MatchAction,
      matchId: string,
      payload: Record<string, unknown> = {},
    ): Promise<SubmitOutcome> => {
      const commandId = uuidv4();
      const optimisticStatus = ACTION_TO_LEGACY_STATUS[action];
      // ``seen_version`` is sourced from the canonical matches table
      // via the ETag flow added in Step D. For Step F's primitive we
      // use ``0`` as a safe default — the server's stale_version
      // path is the source of truth and will reject any stale write.
      // Future hooks will read the canonical version from a richer
      // selector once the Realtime → store wiring lands.
      const seenVersion = 0;

      // 1-3: optimistic apply + pending bookkeeping.
      applyOptimisticStatus(matchId, optimisticStatus);
      setPendingCommand(matchId, commandId);

      const command: Omit<QueuedCommand, 'attempts' | 'status'> = {
        id: commandId,
        tournamentId: tid,
        matchId,
        action,
        payload,
        seenVersion,
        createdAt: Date.now(),
      };
      await enqueue(command);

      // 5: flush. The flush returns outcomes for every pending
      // command — we only care about this one (others get their own
      // outcomes via the same `flush` calls). Pull the result for
      // our id.
      const submitFn: SubmitFn = (cmd) =>
        apiClient.submitCommand(tid, {
          id: cmd.id,
          match_id: cmd.matchId,
          action: cmd.action,
          payload: cmd.payload,
          seen_version: cmd.seenVersion,
        });

      const outcomes = await flush(submitFn);
      const own = outcomes.find((o) => o.id === commandId);
      const result = own?.result ?? {
        kind: 'networkError' as const,
        message: 'no outcome — possibly absorbed by a concurrent flush',
      };

      // Result handling per the prompt's matrix.
      switch (result.kind) {
        case 'ok': {
          clearPendingCommand(matchId);
          // Authoritative server state — translate canonical status
          // ('playing') back to the legacy enum the store speaks
          // ('started') so existing UI stays consistent.
          const legacy =
            CANONICAL_TO_LEGACY_STATUS[result.matchStatus] ?? 'scheduled';
          const previous = matchStates[matchId] ?? { matchId, status: 'scheduled' as const };
          setMatchState(matchId, { ...previous, matchId, status: legacy });
          break;
        }
        case 'staleVersion': {
          clearPendingCommand(matchId);
          // Step G: record the conflict so the inline banner can render.
          // Auto-dismiss is the banner component's responsibility.
          recordConflict(matchId, 'stale_version', result.message);
          // Refetch from server — caller's component will re-render
          // off the refreshed `matchStates`.
          try {
            const fresh = await apiClient.getMatchState(tid, matchId);
            setMatchState(matchId, fresh);
          } catch {
            // Best-effort: if the refetch fails, leave the optimistic
            // state where it is; the next Realtime push or polling
            // sweep will reconcile.
          }
          break;
        }
        case 'conflict': {
          clearPendingCommand(matchId);
          // Step G: record the conflict so the inline banner can render.
          // Persists until the operator dismisses (× button).
          recordConflict(matchId, 'conflict', result.message);
          // Permanent rejection — refetch so the optimistic update
          // doesn't linger.
          try {
            const fresh = await apiClient.getMatchState(tid, matchId);
            setMatchState(matchId, fresh);
          } catch {
            // ignore
          }
          break;
        }
        case 'networkError': {
          // Leave the pending indicator in place. Next flush
          // retries; Step G's connection indicator surfaces the
          // offline state.
          break;
        }
      }

      return { commandId, result };
    },
    [
      tid,
      matchStates,
      setMatchState,
      applyOptimisticStatus,
      setPendingCommand,
      clearPendingCommand,
      recordConflict,
    ],
  );

  return { submit };
}
