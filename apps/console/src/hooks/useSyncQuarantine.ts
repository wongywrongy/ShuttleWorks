import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type {
  SyncCorrectionCandidate,
  SyncQuarantineRecord,
  SyncQuarantineResolutionRequest,
} from '../api/dto';
import { useTournamentIdOrNull } from './useTournamentId';

/** Polls durable sync dead-letter evidence for the selected workspace. */
export function useSyncQuarantine(authorityEpoch: number | null) {
  const tournamentId = useTournamentIdOrNull();
  const [items, setItems] = useState<SyncQuarantineRecord[]>([]);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [candidateLoadingId, setCandidateLoadingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Record<string, SyncCorrectionCandidate[]>>({});

  const refresh = useCallback(async () => {
    if (!tournamentId || !authorityEpoch) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      setItems(await apiClient.listSyncQuarantine(
        tournamentId,
        includeResolved,
      ));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reconciliation evidence unavailable');
    } finally {
      setLoading(false);
    }
  }, [authorityEpoch, includeResolved, tournamentId]);

  useEffect(() => {
    void refresh();
    if (!tournamentId || !authorityEpoch) return undefined;
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [authorityEpoch, refresh, tournamentId]);

  const resolve = useCallback(async (
    quarantineId: string,
    body: SyncQuarantineResolutionRequest,
  ) => {
    if (!tournamentId) return;
    setBusyId(quarantineId);
    try {
      await apiClient.resolveSyncQuarantine(tournamentId, quarantineId, body);
      await refresh();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Correction could not be recorded');
      throw cause;
    } finally {
      setBusyId(null);
    }
  }, [refresh, tournamentId]);

  const loadCandidates = useCallback(async (quarantineId: string) => {
    if (!tournamentId) return;
    setCandidateLoadingId(quarantineId);
    try {
      const items = await apiClient.listSyncCorrectionCandidates(
        tournamentId,
        quarantineId,
      );
      setCandidates((current) => ({ ...current, [quarantineId]: items }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Correction operations unavailable');
    } finally {
      setCandidateLoadingId(null);
    }
  }, [tournamentId]);

  return {
    items,
    includeResolved,
    setIncludeResolved,
    loading,
    error,
    busyId,
    candidateLoadingId,
    candidates,
    refresh,
    loadCandidates,
    resolve,
  };
}
