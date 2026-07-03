/**
 * useDisplaySync — read-only polling loop for the standalone /display route.
 *
 * The /display page is mounted outside AppShell, so the tournament-state
 * hydrator that normally runs there is absent. This hook hydrates the
 * Zustand store + refreshes it every TOURNAMENT_POLL_MS. Writes are
 * intentionally NEVER issued — the TV is a read-only mirror of whatever
 * the operator is authoring on another tab / device.
 *
 * Returns:
 *   - freshness: spectator-calm freshness derived from age of the last
 *                *successful* sync via `deriveFreshness` (live → delayed
 *                → stale). A single flaky request doesn't flip the board
 *                — see ./freshness.ts for the threshold rationale.
 *   - syncError: most-recent error message (null when healthy). Kept for
 *                callers that want it for their own debug purposes; the
 *                board itself never renders it (see LiveStatusPill).
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../../api/client';
import { useTournamentStore } from '../../../store/tournamentStore';
import { deriveFreshness, type FreshnessState } from './freshness';

// Poll cadence. 10 s keeps server load negligible but new matches /
// state changes land in under ~20 s worst case (one 10 s gap + the
// pre-existing 5 s match-state poll in useLiveTracking).
const TOURNAMENT_POLL_MS = 10_000;

export interface UseDisplaySyncResult {
  freshness: FreshnessState;
  syncError: string | null;
}

export function useDisplaySync(now: Date): UseDisplaySyncResult {
  const [searchParams] = useSearchParams();
  const tid = searchParams.get('id');
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!tid) {
      setSyncError('Missing ?id=<tournament-id> query parameter');
      return;
    }
    let cancelled = false;

    const pull = async () => {
      try {
        const remote = await apiClient.getTournamentState(tid);
        if (cancelled) return;
        if (remote) {
          useTournamentStore.setState({
            config: remote.config ?? null,
            groups: remote.groups ?? [],
            players: remote.players ?? [],
            matches: remote.matches ?? [],
            schedule: remote.schedule ?? null,
            scheduleIsStale: remote.scheduleIsStale ?? false,
          });
        }
        setLastSyncMs(Date.now());
        setSyncError(null);
      } catch (err) {
        if (cancelled) return;
        // Leave the last-known-good state on screen and let the
        // freshness derivation flip Delayed / Out of date based on
        // time since the last success. A single failed poll is not a
        // reason to clear the display.
        setSyncError(err instanceof Error ? err.message : 'Connection lost');
      }
    };

    void pull();
    const t = window.setInterval(() => void pull(), TOURNAMENT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [tid]);

  // Derive freshness from the last SUCCESSFUL sync (not the most-recent
  // attempt) — that way a single flaky request doesn't flash "Out of
  // date" on a healthy system.
  const freshness: FreshnessState = useMemo(() => {
    if (lastSyncMs === null) {
      // Pre-first-sync: be optimistic; a fail would have flipped this.
      return syncError ? 'delayed' : 'live';
    }
    const age = now.getTime() - lastSyncMs;
    return deriveFreshness(age, TOURNAMENT_POLL_MS);
  }, [lastSyncMs, now, syncError]);

  return { freshness, syncError };
}
