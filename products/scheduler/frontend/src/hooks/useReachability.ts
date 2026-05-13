/**
 * Polls the backend ``/health`` endpoint every 5 seconds and surfaces
 * an online/offline state to consumers.
 *
 * Used by Step G's ``ConnectionIndicator`` (one of the two signals
 * the indicator derives its dot colour from). Transitions
 * ``offline → online`` also fire a flush of the IndexedDB command
 * queue — this lands the Step F3 reconnect hook that was deferred
 * (the queue exists, the trigger lives here).
 *
 * Polling interval is 5 s to match the SyncService worker cadence
 * from Step E. The endpoint is intentionally ``/health`` (shallow,
 * doesn't hit the database) rather than ``/health/deep`` so a
 * temporarily-degraded backup or solver doesn't flip the indicator
 * to "offline."
 */
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { flush, type SubmitFn } from '../lib/commandQueue';

export type Reachability = 'online' | 'offline';

const POLL_INTERVAL_MS = 5_000;

export function useReachability(): Reachability {
  const [state, setState] = useState<Reachability>('online');
  const prev = useRef<Reachability>('online');

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      const next: Reachability = (await apiClient.healthCheck()) ? 'online' : 'offline';
      if (cancelled) return;
      const before = prev.current;
      prev.current = next;
      setState(next);
      // Transition offline → online fires the reconnect flush.
      if (before === 'offline' && next === 'online') {
        const submitFn: SubmitFn = (cmd) =>
          apiClient.submitCommand(cmd.tournamentId, {
            id: cmd.id,
            match_id: cmd.matchId,
            action: cmd.action,
            payload: cmd.payload,
            seen_version: cmd.seenVersion,
          });
        flush(submitFn).catch(() => {
          // Best-effort — subsequent polls will continue triggering
          // flushes whenever a new offline→online transition happens.
        });
      }
    }

    void probe();
    const id = window.setInterval(() => {
      void probe();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return state;
}
