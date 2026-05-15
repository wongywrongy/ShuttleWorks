/**
 * Fetches the active tournament's ``kind`` (meet | bracket) from the
 * summary endpoint and caches it in the UI store so the AppShell +
 * TabBar can render different chrome per kind without prop-drilling.
 *
 * Why a separate hook: the existing ``useTournamentState`` loads the
 * full ``TournamentStateDTO`` blob, which doesn't carry the
 * (per-row) ``kind`` column — that lives on the tournaments table
 * directly, surfaced via ``TournamentSummaryDTO``. Calling
 * ``apiClient.getTournament`` once on mount is cheap (it's the same
 * summary the dashboard already lists) and the result rarely
 * changes during a session.
 */
import { useEffect } from 'react';
import { apiClient } from '../api/client';
import { useUiStore } from '../store/uiStore';

export function useTournamentKind(tournamentId: string | null): void {
  const setActiveTournamentKind = useUiStore(
    (s) => s.setActiveTournamentKind,
  );

  useEffect(() => {
    let cancelled = false;
    if (!tournamentId) {
      setActiveTournamentKind(null);
      return () => {
        cancelled = true;
      };
    }
    apiClient
      .getTournament(tournamentId)
      .then((row) => {
        if (cancelled) return;
        setActiveTournamentKind(row.kind);
      })
      .catch(() => {
        // 403 / 404 / network — leave kind null; the AppShell falls
        // back to its default chrome (meet tabs). A real error has
        // already been surfaced by the axios response interceptor.
        if (cancelled) return;
        setActiveTournamentKind(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId, setActiveTournamentKind]);
}
