/**
 * Backup management for the persisted tournament state.
 *
 * The backend rolls a backup into ``./data/backups/tournament-<iso>.json``
 * on every save (last 10 kept). This panel lists them, lets the user
 * snapshot on demand, and restores any backup with a confirmation step.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { BackupEntryDTO, ScheduleDTO, TournamentStateDTO } from '../../api/dto';
import { useAppStore } from '../../store/appStore';
import { parseScheduleXlsx, type ImportResult } from './importScheduleXlsx';
import { ScheduleImportModal } from './ScheduleImportModal';
import { INTERACTIVE_BASE } from '../../lib/utils';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function applyStateToStore(state: TournamentStateDTO): void {
  // Mirror the hydration path in useTournamentState so the in-memory
  // store matches the file we just restored — no page reload required.
  useAppStore.setState({
    config: state.config ?? null,
    groups: state.groups ?? [],
    players: state.players ?? [],
    matches: state.matches ?? [],
    schedule: state.schedule ?? null,
    scheduleStats: (state.scheduleStats as never) ?? null,
    scheduleIsStale: state.scheduleIsStale ?? false,
  });
}

export function BackupPanel() {
  const [entries, setEntries] = useState<BackupEntryDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const pushToast = useAppStore((s) => s.pushToast);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    const { matches, players, config } = useAppStore.getState();

    try {
      const result = await parseScheduleXlsx(file, matches, players, config);
      setImportResult(result);
    } catch (err) {
      // parseScheduleXlsx throws its own friendly header-mismatch message
      // ("…schedule export (column N header mismatch)"); anything else is
      // almost certainly an ExcelJS zip-decode error — surface a clean
      // fallback rather than leaking JSZip internals.
      const raw = err instanceof Error ? err.message : '';
      const friendly =
        raw.includes('schedule export') ||
        raw.includes('Roster sheet') ||
        raw.includes('dual meets') ||
        raw.includes('XLSX too large')
          ? raw
          : 'Could not read XLSX — file may be corrupted';
      pushToast({ level: 'error', message: friendly });
    }
  };

  const handleApplyImport = async () => {
    if (!importResult) return;
    setImporting(true);
    try {
      if (importResult.mode === 'schedule-only') {
        const current = useAppStore.getState().schedule;
        const next: ScheduleDTO = current
          ? { ...current, assignments: importResult.assignments }
          : {
              assignments: importResult.assignments,
              unscheduledMatches: [],
              softViolations: [],
              objectiveScore: null,
              infeasibleReasons: [],
              status: 'feasible',
            };
        useAppStore.getState().setSchedule(next);
        pushToast({
          level: importResult.warnings.length > 0 ? 'warn' : 'success',
          message: `Schedule recovered — ${importResult.assignments.length} assignment${importResult.assignments.length === 1 ? '' : 's'} applied${importResult.warnings.length > 0 ? `, ${importResult.warnings.length} row${importResult.warnings.length === 1 ? '' : 's'} skipped` : ''}.`,
        });
      } else {
        // full-rebuild: overwrite the server state, then hydrate the store.
        const { plan } = importResult;
        const schedule: ScheduleDTO = {
          assignments: plan.assignments,
          unscheduledMatches: [],
          softViolations: [],
          objectiveScore: null,
          infeasibleReasons: [],
          status: 'feasible',
        };
        const stamped = await apiClient.putTournamentState({
          version: 1,
          config: plan.config,
          groups: plan.groups,
          players: plan.players,
          matches: plan.matches,
          schedule,
          scheduleStats: null,
          scheduleIsStale: false,
        });
        applyStateToStore(stamped);
        pushToast({
          level: plan.warnings.length > 0 ? 'warn' : 'success',
          message: `Tournament rebuilt — ${plan.players.length} players, ${plan.matches.length} matches, ${plan.assignments.length} assignments${plan.warnings.length > 0 ? ` (${plan.warnings.length} rows skipped)` : ''}.`,
        });
        await refresh();
      }
      setImportResult(null);
    } finally {
      setImporting(false);
    }
  };

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
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
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
  };

  const handleRestore = async (filename: string) => {
    setBusyAction(filename);
    setError(null);
    try {
      const restored = await apiClient.restoreTournamentBackup(filename);
      applyStateToStore(restored);
      setConfirmRestore(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="rounded border border-gray-200 bg-white p-3"
      data-testid="backup-panel"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Backups</h3>
          <p className="text-xs text-gray-500">
            Auto-saved before every write. Last 10 kept.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={busyAction !== null}
          data-testid="backup-create"
          aria-busy={busyAction === 'create'}
          className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50`}
        >
          {busyAction === 'create' && (
            <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
          )}
          {busyAction === 'create' ? 'Saving…' : 'Back up now'}
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="mt-2">
        {loading && entries.length === 0 ? (
          <div className="py-4 text-center text-xs text-gray-400">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="py-4 text-center text-xs text-gray-400">
            No backups yet — one will appear the next time you save.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((e) => (
              <li
                key={e.filename}
                className="flex items-center justify-between py-1.5 text-xs"
                data-testid={`backup-row-${e.filename}`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="truncate font-mono text-gray-700">{e.filename}</div>
                  <div className="text-gray-400">
                    {formatWhen(e.modifiedAt)} · {formatBytes(e.sizeBytes)}
                  </div>
                </div>
                {confirmRestore === e.filename ? (
                  <div className="flex items-center gap-1">
                    <span className="text-orange-600">Replace current state?</span>
                    <button
                      type="button"
                      onClick={() => handleRestore(e.filename)}
                      disabled={busyAction !== null}
                      aria-busy={busyAction === e.filename}
                      className={`${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-white hover:bg-red-700`}
                    >
                      {busyAction === e.filename && (
                        <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                      )}
                      {busyAction === e.filename ? 'Restoring…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRestore(null)}
                      disabled={busyAction !== null}
                      className={`${INTERACTIVE_BASE} rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:bg-gray-50`}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRestore(e.filename)}
                    disabled={busyAction !== null}
                    data-testid={`backup-restore-${e.filename}`}
                    className={`${INTERACTIVE_BASE} rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:bg-gray-50`}
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-gray-700">Recover schedule</div>
            <p className="text-xs text-gray-500">
              Rebuild schedule assignments from a Schedule XLSX export.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busyAction !== null}
            data-testid="schedule-import-open"
            className={`${INTERACTIVE_BASE} rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50`}
          >
            Recover from XLSX…
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          data-testid="schedule-import-file"
          onChange={handleFileSelected}
        />
      </div>

      {importResult && (
        <ScheduleImportModal
          result={importResult}
          busy={importing}
          onApply={handleApplyImport}
          onCancel={() => setImportResult(null)}
        />
      )}
    </div>
  );
}
