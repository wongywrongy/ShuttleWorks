/**
 * Apply / Dismiss actions for a Suggestion row.
 *
 * Each suggestion sits in `useUiStore.suggestions`. Applying it commits
 * the underlying proposal, hydrates the new schedule into
 * `useTournamentStore`, and drops the row. Dismissing only drops the row
 * (best-effort dismiss on the server).
 *
 * The full state shuffle lives here so `SuggestionsRail` reads as a
 * pure view: it owns expansion + which row is currently applying, but
 * never touches the apiClient or cross-store update plumbing.
 */
import { useCallback, useState } from 'react';

import { apiClient } from '../../../api/client';
import type { Suggestion } from '../../../api/dto';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useUiStore } from '../../../store/uiStore';
import { useTournamentId } from '../../../hooks/useTournamentId';

export interface SuggestionActions {
  /** Which suggestion id is currently being committed, or null. */
  applyingId: string | null;
  apply: (s: Suggestion) => Promise<void>;
  dismiss: (s: Suggestion) => Promise<void>;
}

export function useSuggestionActions(): SuggestionActions {
  const tid = useTournamentId();
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const apply = useCallback(async (s: Suggestion) => {
    setApplyingId(s.id);
    const ts = useTournamentStore.getState();
    const ui = useUiStore.getState();
    try {
      const r = await apiClient.applySuggestion(tid, s.id);
      ts.setSchedule(r.state.schedule ?? null);
      ts.setScheduleVersion(r.state.scheduleVersion ?? 0);
      ts.setScheduleHistory(r.state.scheduleHistory ?? []);
      if (r.state.config) ts.setConfig(r.state.config);
      // setConfig flags the schedule as stale whenever scheduling-relevant
      // fields change (e.g., closedCourts). The schedule we just committed
      // already accounts for those changes, so override the flag back to
      // false. Mirrors useProposals.commit.
      ts.setScheduleStale(false);
      // Drop now-stale advisories — the committed schedule may have
      // resolved the conditions that triggered them. The next poll
      // repopulates from a clean slate. Mirrors useProposals.commit.
      ui.setAdvisories([]);
      // Functional updates avoid stale-closure races: a parallel
      // dismiss/apply on a different row could otherwise resurrect a
      // just-removed suggestion based on a stale snapshot.
      ui.setSuggestions(
        useUiStore.getState().suggestions.filter((x) => x.id !== s.id),
      );
      ui.pushToast({
        level: 'success',
        message: r.historyEntry.summary || 'Applied',
        durationMs: 3000,
      });
    } catch (err: unknown) {
      // 409 (stale version) and 410 (suggestion expired before commit)
      // both mean "no longer applicable" — drop locally and surface as
      // an info-level refresh nudge. The next poll will reconcile.
      const code = (err as { response?: { status?: number } })?.response?.status;
      const benign = code === 409 || code === 410;
      ui.setSuggestions(
        useUiStore.getState().suggestions.filter((x) => x.id !== s.id),
      );
      ui.pushToast({
        level: benign ? 'info' : 'error',
        message: benign
          ? 'Suggestion was stale, refreshing'
          : err instanceof Error
            ? err.message
            : 'Apply failed',
        durationMs: 4000,
      });
    } finally {
      setApplyingId(null);
    }
  }, [tid]);

  const dismiss = useCallback(async (s: Suggestion) => {
    // Drop the row first; reading fresh state at call time so a parallel
    // apply/dismiss on a different row doesn't get its drop reverted.
    useUiStore.getState().setSuggestions(
      useUiStore.getState().suggestions.filter((x) => x.id !== s.id),
    );
    try {
      await apiClient.dismissSuggestion(tid, s.id);
    } catch {
      // best-effort; the next poll will reconcile
    }
  }, [tid]);

  return { applyingId, apply, dismiss };
}
