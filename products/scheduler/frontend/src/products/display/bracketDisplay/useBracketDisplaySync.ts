/**
 * useBracketDisplaySync — read-only polling loop for the bracket public
 * display. Mirrors ../publicDisplay/useDisplaySync (meet), but reads the
 * relational bracket state via apiClient.getBracket and returns the data
 * directly (the bracket display has no Zustand store to hydrate).
 *
 * Writes are NEVER issued — the TV is a read-only mirror.
 *
 * Freshness derivation is shared with the meet board via
 * `../publicDisplay/freshness` (`deriveFreshness`) so both public boards
 * speak the same spectator-calm Live / Delayed / Out-of-date vocabulary
 * instead of drifting into separate Reconnecting/Offline language.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../../api/client';
import type { BracketTournamentDTO } from '../../../api/bracketDto';
import { deriveFreshness, type FreshnessState } from '../publicDisplay/freshness';

const POLL_MS = 10_000;

export interface UseBracketDisplaySyncResult {
  data: BracketTournamentDTO | null;
  freshness: FreshnessState;
  syncError: string | null;
}

export function useBracketDisplaySync(now: Date): UseBracketDisplaySyncResult {
  const [searchParams] = useSearchParams();
  const tid = searchParams.get('id');
  const [data, setData] = useState<BracketTournamentDTO | null>(null);
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
        const remote = await apiClient.getBracket(tid);
        if (cancelled) return;
        if (remote) setData(remote);
        setLastSyncMs(Date.now());
        setSyncError(null);
      } catch (err) {
        if (cancelled) return;
        setSyncError(err instanceof Error ? err.message : 'Connection lost');
      }
    };
    void pull();
    const t = window.setInterval(() => void pull(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [tid]);

  const freshness: FreshnessState = useMemo(() => {
    if (lastSyncMs === null) return syncError ? 'delayed' : 'live';
    const age = now.getTime() - lastSyncMs;
    return deriveFreshness(age, POLL_MS);
  }, [lastSyncMs, now, syncError]);

  return { data, freshness, syncError };
}
