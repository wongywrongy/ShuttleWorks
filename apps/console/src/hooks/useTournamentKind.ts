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
 *
 * It is also the FIRST request the workspace route makes, which makes it the
 * place that recognises the uniform 404: a workspace owned by another
 * organisation answers ``404 TOURNAMENT_NOT_FOUND``, deliberately identical
 * to one that does not exist (the tenancy seam — ``require_tournament_access``).
 * Swallowing it let the SPA fall through to client defaults and render an
 * "Untitled" workspace with a module sidebar and a Configuration form carrying
 * a Save button (2026-08-10 full-scale browser pass). Nothing leaked — every
 * field was a default — but offering to save a workspace the account cannot
 * reach makes the product's strongest guarantee look like a bug. Hence the
 * return value.
 */
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useUiStore } from '../store/uiStore';

/** True once the workspace has answered 404 — it does not exist, or it is not
 *  ours, and the two are indistinguishable on purpose. ONLY 404: a 500 or a
 *  dropped connection means "ask again", and evicting an operator from their
 *  own workspace because the wifi blinked would be its own defect. */
export function useTournamentKind(tournamentId: string | null): boolean {
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
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNotFound(false);
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
          setNotFound(false);
          setActiveTournamentKind(row.kind);
          setActiveTournamentStatus(row.status ?? null);
          setActiveTournamentPhase(row.signals?.phase ?? null);
          // The caller's role rides along on the same summary row — no extra
          // request. It gates every write (audit A2); see permissions.canEdit.
          setActiveTournamentRole(row.role ?? null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // The api client's interceptor promotes the HTTP status onto the
          // thrown error; the raw axios shape is the fallback for errors that
          // bypassed it (mirrors lib/pollPolicy).
          const status =
            (err as { status?: number }).status ??
            (err as { response?: { status?: number } }).response?.status;
          if (status === 404) {
            setNotFound(true);
            return;
          }
          if (isRefresh) return; // keep last-known values on a failed refresh
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

  return notFound;
}
