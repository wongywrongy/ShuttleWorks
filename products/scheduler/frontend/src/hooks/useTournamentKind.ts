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
  const setActiveTournamentStatus = useUiStore(
    (s) => s.setActiveTournamentStatus,
  );
  const setActiveTournamentPhase = useUiStore(
    (s) => s.setActiveTournamentPhase,
  );
  const setActiveTournamentRole = useUiStore((s) => s.setActiveTournamentRole);

  useEffect(() => {
    let cancelled = false;
    if (!tournamentId) {
      setActiveTournamentKind(null);
      setActiveTournamentStatus(null);
      setActiveTournamentPhase(null);
      setActiveTournamentRole(null);
      return () => {
        cancelled = true;
      };
    }
    const load = (isRefresh: boolean) => {
      apiClient
        .getTournament(tournamentId)
        .then((row) => {
          if (cancelled) return;
          setActiveTournamentKind(row.kind);
          setActiveTournamentStatus(row.status ?? null);
          setActiveTournamentPhase(row.signals?.phase ?? null);
          // The caller's role rides along on the same summary row — no extra
          // request. It gates every write (audit A2); see permissions.canEdit.
          setActiveTournamentRole(row.role ?? null);
        })
        .catch(() => {
          if (cancelled || isRefresh) return; // keep last-known values on a failed refresh
          setActiveTournamentKind(null);
          setActiveTournamentStatus(null);
          setActiveTournamentPhase(null);
          setActiveTournamentRole(null);
        });
    };
    load(false);
    // The lifecycle phase (signals.phase) changes DURING a session — the
    // day goes live with the first call, complete with the last result.
    // A one-shot fetch left the shell badge frozen at open-time state
    // (review finding); a modest re-poll keeps it honest. `kind` and
    // `status` ride along for free (same summary row).
    const interval = window.setInterval(() => load(true), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    tournamentId,
    setActiveTournamentKind,
    setActiveTournamentStatus,
    setActiveTournamentPhase,
    setActiveTournamentRole,
  ]);
}
