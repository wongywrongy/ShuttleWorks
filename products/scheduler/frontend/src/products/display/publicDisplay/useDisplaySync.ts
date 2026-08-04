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
import { useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../../api/client';
import { isTerminalPollError } from '../../../lib/pollPolicy';
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
  const params = useParams<{ id: string }>();
  // Public capability link (SP-CLOUD-2): ?token=<display-token> reads the
  // unauthenticated /display/{token}/state projection.
  const token = searchParams.get('token');
  // Standalone /display route: ?id=<tid>. In-workspace Preview: the route
  // param. Without the fallback the preview had no tid, never synced, and
  // sat on a permanent "Delayed" pill inside a perfectly healthy workspace.
  const tid = searchParams.get('id') ?? params.id ?? null;
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!token && !tid) {
      setSyncError('Missing ?token=<display-token> (or ?id=) query parameter');
      return;
    }
    let cancelled = false;

    const pull = async () => {
      try {
        const remote = token
          ? await apiClient.getDisplayState(token)
          : await apiClient.getTournamentState(tid as string);
        if (cancelled) return;
        if (remote) {
          useTournamentStore.setState({
            config: remote.config ?? null,
            groups: remote.groups ?? [],
            players: remote.players ?? [],
            matches: remote.matches ?? [],
            schedule: remote.schedule ?? null,
            scheduleIsStale: remote.scheduleIsStale ?? false,
            // Task 9: server-computed Meet pool standings. Empty for
            // bracket-kind/Meet-disabled workspaces — see MeetStandingRowDTO's
            // doc comment in api/dto.ts.
            standings: remote.standings ?? [],
          });
        }
        setLastSyncMs(Date.now());
        setSyncError(null);
      } catch (err) {
        if (cancelled) return;
        if (isTerminalPollError(err)) {
          // Workspace deleted / access revoked — stop polling; the
          // freshness derivation ages the board to Delayed/Out of date
          // naturally, which is the right spectator-calm answer.
          cancelled = true;
          window.clearInterval(t);
        }
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
  }, [tid, token]);

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
