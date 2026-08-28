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
import { useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../../api/client';
import type { BracketTournamentDTO } from '../../../api/bracketDto';
import { isTerminalPollError } from '../../../lib/pollPolicy';
import { contentEqual } from '../../../lib/contentEqual';
import { deriveFreshness, type FreshnessState } from '../publicDisplay/freshness';

const POLL_MS = 10_000;

export interface UseBracketDisplaySyncResult {
  data: BracketTournamentDTO | null;
  freshness: FreshnessState;
  syncError: string | null;
}

export function useBracketDisplaySync(now: Date): UseBracketDisplaySyncResult {
  const [searchParams] = useSearchParams();
  const params = useParams<{ id: string }>();
  // Public capability link (SP-CLOUD-2): ?token= reads the unauthenticated
  // /display/{token}/bracket projection; ?id= keeps the viewer-gated path.
  // The `:id` route param is the in-shell Preview tab (/tournaments/:id/tv),
  // which has no query string — same fallback `useDisplaySync` carries.
  const token = searchParams.get('token');
  const tid = searchParams.get('id') ?? params.id ?? null;
  const [data, setData] = useState<BracketTournamentDTO | null>(null);
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!token && !tid) {
      setSyncError('Missing ?token=<display-token> (or ?id=) query parameter');
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    const stop = () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
    const pull = async () => {
      try {
        const remote = token
          ? await apiClient.getDisplayBracket(token)
          : await apiClient.getBracket(tid as string);
        if (cancelled) return;
        if (remote) {
          setData((previous) => (contentEqual(remote, previous) ? previous : remote));
        }
        setLastSyncMs(Date.now());
        setSyncError(null);
      } catch (err) {
        if (cancelled) return;
        setSyncError(err instanceof Error ? err.message : 'Connection lost');
        // Revoked token / deleted workspace / expired session: retrying can
        // never succeed, so stop instead of storming the same failure every
        // 10s at a TV nobody is watching. Same `lib/pollPolicy` contract every
        // other polling hook in the app honours.
        if (isTerminalPollError(err)) stop();
      }
    };
    void pull();
    timer = window.setInterval(() => void pull(), POLL_MS);
    return stop;
  }, [tid, token]);

  const freshness: FreshnessState = useMemo(() => {
    if (lastSyncMs === null) return syncError ? 'delayed' : 'live';
    const age = now.getTime() - lastSyncMs;
    return deriveFreshness(age, POLL_MS);
  }, [lastSyncMs, now, syncError]);

  return { data, freshness, syncError };
}
