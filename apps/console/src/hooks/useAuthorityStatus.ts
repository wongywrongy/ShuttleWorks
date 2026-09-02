import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { AuthorityStatusDTO } from '../api/dto';
import { useTournamentIdOrNull } from './useTournamentId';

export function useAuthorityStatus() {
  const tournamentId = useTournamentIdOrNull();
  const [status, setStatus] = useState<AuthorityStatusDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Settings panels are also rendered by isolated component tests and may
    // briefly mount while the router is changing workspaces.  In either case
    // there is no authority resource to poll yet.
    if (!tournamentId) return;
    try {
      setStatus(await apiClient.getAuthorityStatus(tournamentId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authority status unavailable');
    }
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh, tournamentId]);

  return { status, error, refresh };
}
