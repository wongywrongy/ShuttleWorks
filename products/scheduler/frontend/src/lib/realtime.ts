/**
 * Supabase Realtime subscription primitive (Step E of the
 * architecture-adjustment arc).
 *
 * Provides ``subscribeToMatches`` — listens for changes on the
 * ``matches`` table filtered by ``tournament_id`` and invokes the
 * caller's ``onUpdate`` callback per change. Includes a 10-second
 * polling fallback so a temporarily-disconnected websocket doesn't
 * leave the operator staring at stale data.
 *
 * This is just the subscription primitive — the Zustand-store
 * integration (delta-apply rather than full re-fetch) lands with
 * Step F's command-queue work where the operator UX is wired
 * end-to-end. Callers in F supply an ``onUpdate`` that translates the
 * payload into ``operatorMatchStore.applyDelta(...)`` or equivalent.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Shape of a row coming off the ``matches`` table via Realtime.
 * Mirrors the backend ``Match`` ORM model — keep in sync if the
 * schema ever widens.
 */
export interface MatchRow {
  id: string;
  tournament_id: string;
  court_id: number | null;
  time_slot: number | null;
  status: 'scheduled' | 'called' | 'playing' | 'finished' | 'retired';
  version: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Subscribe to all changes on ``matches`` rows for the given
 * tournament. Returns an unsubscribe function that the caller should
 * invoke on unmount.
 *
 * If ``supabase`` is null (local-dev mode without ``VITE_SUPABASE_URL``),
 * the function returns a no-op unsubscribe immediately. Callers
 * can rely on this to short-circuit during local development without
 * branching at every call site.
 */
export function subscribeToMatches(
  tournamentId: string,
  onUpdate: (match: MatchRow) => void,
): () => void {
  if (supabase === null) {
    return () => {};
  }

  let lastMessage = Date.now();
  const client = supabase;

  const channel: RealtimeChannel = client
    .channel(`matches:${tournamentId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `tournament_id=eq.${tournamentId}`,
      },
      (payload) => {
        lastMessage = Date.now();
        // ``new`` is the post-change row for INSERT/UPDATE; for
        // DELETE we'd inspect ``old`` instead. The architecture-
        // adjustment arc only emits INSERT + UPDATE from the
        // outbox; schedule regeneration deletes happen on the
        // backend but aren't synced (matches removed from a
        // regenerated schedule are simply absent from the next
        // Realtime stream and the caller's full re-fetch will
        // reconcile if needed).
        // ``payload.new`` is the post-change row for INSERT/UPDATE.
        // For DELETE events Supabase's payload type makes ``new`` an
        // empty object — guard before casting so a delete event
        // doesn't yield a malformed MatchRow.
        const next = (payload as unknown as { new?: Partial<MatchRow> }).new;
        if (next && typeof next === 'object' && 'id' in next && 'tournament_id' in next) {
          onUpdate(next as MatchRow);
        }
      },
    )
    .subscribe();

  // Polling fallback. If the websocket goes 10 seconds without a
  // message we re-pull the full ``matches`` table for this
  // tournament. Once the websocket reconnects the polling becomes a
  // cheap no-op because the timestamp is bumped on every message.
  const POLL_INTERVAL_MS = 10_000;
  const poll = setInterval(async () => {
    if (Date.now() - lastMessage <= POLL_INTERVAL_MS) return;
    try {
      const { data } = await client
        .from('matches')
        .select('*')
        .eq('tournament_id', tournamentId);
      if (data) {
        for (const row of data as MatchRow[]) {
          onUpdate(row);
        }
        lastMessage = Date.now();
      }
    } catch {
      // Silent — the next interval will retry. The operator's
      // header connection indicator (added in Step G) is the
      // user-facing signal that something is wrong.
    }
  }, POLL_INTERVAL_MS);

  return () => {
    client.removeChannel(channel);
    clearInterval(poll);
  };
}
