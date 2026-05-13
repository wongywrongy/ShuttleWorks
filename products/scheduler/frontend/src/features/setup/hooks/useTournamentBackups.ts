/**
 * Tournament backup actions — list / create / restore.
 *
 * Single seam for both `BackupPanel` (full management UI) and the
 * status-bar `AppStatusPopover` (one-click "Back up now"). Components
 * never call `apiClient.*Backup` directly.
 *
 * The composite hook (`useTournamentBackups`) owns the entry list and
 * busy state for the panel. The action-only hook (`useCreateBackup`)
 * is the lightweight variant used when only the create call matters.
 */
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '../../../api/client';
import type { BackupEntryDTO, TournamentStateDTO } from '../../../api/dto';
import { useTournamentStore } from '../../../store/tournamentStore';

/** Mirror a restored snapshot back into the live tournament store.
 *
 * Exported so the BackupPanel's XLSX-recover orchestrator can reuse
 * the same hydration shape (it owns its own apiClient.putTournamentState
 * call as a documented one-off orchestrator). */
export function applyStateToStore(state: TournamentStateDTO): void {
  useTournamentStore.setState({
    config: state.config ?? null,
    groups: state.groups ?? [],
    players: state.players ?? [],
    matches: state.matches ?? [],
    schedule: state.schedule ?? null,
    scheduleIsStale: state.scheduleIsStale ?? false,
  });
}

export interface TournamentBackups {
  entries: BackupEntryDTO[];
  loading: boolean;
  error: string | null;
  /** Filename of the entry currently being acted on (restore) or `'create'`. */
  busyAction: string | null;
  refresh: () => Promise<void>;
  createBackup: () => Promise<void>;
  restoreBackup: (filename: string) => Promise<void>;
}

export function useTournamentBackups(): TournamentBackups {
  const [entries, setEntries] = useState<BackupEntryDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listTournamentBackups();
      setEntries(res.backups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount. The lint rule flags `refresh()` because it
    // calls setState internally; that's the canonical
    // load-data-on-mount pattern here. Matches every other paginated
    // hook in this codebase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const createBackup = useCallback(async () => {
    setBusyAction('create');
    setError(null);
    try {
      await apiClient.createTournamentBackup();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBusyAction(null);
    }
  }, [refresh]);

  const restoreBackup = useCallback(
    async (filename: string) => {
      setBusyAction(filename);
      setError(null);
      try {
        const restored = await apiClient.restoreTournamentBackup(filename);
        applyStateToStore(restored);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Restore failed');
      } finally {
        setBusyAction(null);
      }
    },
    [refresh],
  );

  return { entries, loading, error, busyAction, refresh, createBackup, restoreBackup };
}

/**
 * Lightweight variant — wraps just the "create one backup" action.
 *
 * Returns `{ created, filename }` so callers can branch on whether the
 * server actually had a live file to snapshot. AppStatusPopover uses
 * this; BackupPanel uses the composite hook above.
 */
export function useCreateBackup(): {
  createBackup: () => Promise<{ created: boolean; filename: string | undefined }>;
  busy: boolean;
} {
  const [busy, setBusy] = useState(false);
  const createBackup = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiClient.createTournamentBackup();
      return { created: res.created, filename: res.filename ?? undefined };
    } finally {
      setBusy(false);
    }
  }, []);
  return { createBackup, busy };
}
