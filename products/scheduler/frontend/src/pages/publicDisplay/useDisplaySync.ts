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
 *   - liveStatus: derived from age of last-successful sync ('live' →
 *                'reconnecting' → 'offline'). Single flaky request
 *                doesn't flash "Offline".
 *   - syncError:  most-recent error message (null when healthy).
 */
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../api/client';
import { useTournamentStore } from '../../store/tournamentStore';

export type LiveStatus = 'live' | 'reconnecting' | 'offline';

// Poll cadence. 10 s keeps server load negligible but new matches /
// state changes land in under ~20 s worst case (one 10 s gap + the
// pre-existing 5 s match-state poll in useLiveTracking).
const TOURNAMENT_POLL_MS = 10_000;
// How long we'll tolerate no successful fetch before flipping to
// "Reconnecting". Gives the 10 s poll plus one retry room.
const RECONNECTING_AFTER_MS = 25_000;
// After this long with no success we admit we're offline.
const OFFLINE_AFTER_MS = 60_000;

export interface UseDisplaySyncResult {
  liveStatus: LiveStatus;
  syncError: string | null;
}

export function useDisplaySync(now: Date): UseDisplaySyncResult {
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const pull = async () => {
      try {
        const remote = await apiClient.getTournamentState();
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
        // status pill flip to Reconnecting / Offline based on time
        // since the last success. A single failed poll is not a
        // reason to clear the display.
        setSyncError(err instanceof Error ? err.message : 'Connection lost');
      }
    };

    // Kick off immediately so a fresh /display tab doesn't stare at
    // an empty screen for 10 s waiting for the first interval tick.
    void pull();
    const t = window.setInterval(() => void pull(), TOURNAMENT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // Derive liveness from the last SUCCESSFUL sync (not the most-recent
  // attempt) — that way a single flaky request doesn't flash "Offline"
  // on a healthy system.
  const liveStatus: LiveStatus = useMemo(() => {
    if (lastSyncMs === null) {
      // Pre-first-sync: be optimistic; a fail would have flipped this.
      return syncError ? 'reconnecting' : 'live';
    }
    const age = now.getTime() - lastSyncMs;
    if (age >= OFFLINE_AFTER_MS) return 'offline';
    if (age >= RECONNECTING_AFTER_MS) return 'reconnecting';
    return 'live';
  }, [lastSyncMs, now, syncError]);

  return { liveStatus, syncError };
}
