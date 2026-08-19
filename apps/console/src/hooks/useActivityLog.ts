/**
 * useActivityLog — turns match-state transitions into the Alerts & Activity
 * panel's info trail (SPEC_AMENDMENT_alerts_activity_panel.md §6).
 *
 * Subscribes to the match-state map and diffs it against the previous
 * snapshot; on each *actual* status change it appends one activity entry.
 * Diffing centrally (one subscription) rather than instrumenting every
 * call site captures transitions from every source — operator actions,
 * the command queue, and the 5s sync from another operator's tab — with no
 * per-render or per-poll churn (only appends on a real change).
 *
 * Mount once on the Run surface. The first observed snapshot seeds the
 * baseline silently (no burst of entries for the already-in-progress
 * board on mount).
 */
import { useEffect, useRef } from 'react';
import { useMatchStateStore } from '../store/matchStateStore';
import { useTournamentStore } from '../store/tournamentStore';
import { useAlertStore } from '../store/alertStore';
import type { MatchStateDTO } from '../api/dto';
import type { AlertEntry } from '../platform/domain/alertModel';

function matchLabel(matchId: string): string {
  const m = useTournamentStore.getState().matches.find((mm) => mm.id === matchId);
  return m?.matchNumber != null ? `Match M${m.matchNumber}` : `Match ${matchId.slice(0, 6)}`;
}

/** Human sentence for a transition into `status`. Returns null for
 *  transitions we don't surface. */
function transitionMessage(status: MatchStateDTO['status'], hasScore: boolean): string | null {
  switch (status) {
    case 'called':
      return 'called to court';
    case 'started':
      return 'match started';
    case 'finished':
      return hasScore ? 'score recorded' : 'marked finished';
    case 'scheduled':
      return 'returned to the queue';
    default:
      return null;
  }
}

export function useActivityLog(): void {
  const seededRef = useRef(false);
  const prevRef = useRef<Record<string, string>>({});
  const lastStatesRef = useRef<Record<string, MatchStateDTO> | null>(null);

  useEffect(() => {
    const handle = (states: Record<string, MatchStateDTO>) => {
      const prev = prevRef.current;
      const next: Record<string, string> = {};
      const fresh: AlertEntry[] = [];

      for (const [matchId, st] of Object.entries(states)) {
        const status = st.status ?? 'scheduled';
        next[matchId] = status;
        if (!seededRef.current) continue; // seed baseline silently on first snapshot
        if (prev[matchId] === status) continue;
        const msg = transitionMessage(status, st.score != null);
        if (!msg) continue;
        fresh.push({
          id: `activity:${matchId}:${status}:${new Date().toISOString()}`,
          severity: 'info',
          ts: new Date().toISOString(),
          title: matchLabel(matchId),
          message: msg,
          source: 'activity',
        });
      }

      prevRef.current = next;
      if (!seededRef.current) {
        seededRef.current = true;
        return;
      }
      for (const entry of fresh) useAlertStore.getState().logActivity(entry);
    };

    // Prime the baseline from the current store value, then subscribe.
    const initial = useMatchStateStore.getState().matchStates;
    lastStatesRef.current = initial;
    handle(initial);

    // The store fires on every change including the 1s clock tick; only
    // re-diff when the matchStates reference actually changes (FIX F keeps
    // it referentially stable when content is unchanged).
    return useMatchStateStore.subscribe((s) => {
      if (s.matchStates === lastStatesRef.current) return;
      lastStatesRef.current = s.matchStates;
      handle(s.matchStates);
    });
  }, []);
}
