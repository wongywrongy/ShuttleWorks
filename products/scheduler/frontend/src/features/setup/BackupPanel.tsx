/**
 * Backup management for the persisted tournament state.
 *
 * The backend rolls a backup into ``./data/backups/tournament-<iso>.json``
 * on every save (last 10 kept). This panel lists them, lets the user
 * snapshot on demand, and restores any backup with a confirmation step.
 */
import { useRef, useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { apiClient } from '../../api/client';
import type { ScheduleDTO } from '../../api/dto';
import { useTournamentStore } from '../../store/tournamentStore';
import { useUiStore } from '../../store/uiStore';
import { useTournamentId } from '../../hooks/useTournamentId';
import { parseScheduleXlsx, type ImportResult } from './importScheduleXlsx';
import { ScheduleImportModal } from './ScheduleImportModal';
import {
  applyStateToStore,
  useTournamentBackups,
} from './hooks/useTournamentBackups';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { Section } from '../settings/SettingsPrimitives';

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

export function BackupPanel() {
  const tid = useTournamentId();
  const { entries, loading, error, busyAction, refresh, createBackup, restoreBackup } =
    useTournamentBackups();
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const pushToast = useUiStore((s) => s.pushToast);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    const { matches, players, config } = useTournamentStore.getState();

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
        const current = useTournamentStore.getState().schedule;
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
        useTournamentStore.getState().setSchedule(next);
        pushToast({
          level: importResult.warnings.length > 0 ? 'warn' : 'success',
          message: `Schedule recovered — ${importResult.assignments.length} assignment${importResult.assignments.length === 1 ? '' : 's'} applied${importResult.warnings.length > 0 ? `, ${importResult.warnings.length} row${importResult.warnings.length === 1 ? '' : 's'} skipped` : ''}.`,
        });
      } else {
        // full-rebuild: overwrite the server state, then hydrate the store.
        // Direct apiClient call kept here intentionally — this panel is
        // the one-off orchestrator for the XLSX-recover workflow, and
        // the documented convention exception applies. The other backup
        // operations (list/create/restore) all go through
        // ``useTournamentBackups``.
        const { plan } = importResult;
        const schedule: ScheduleDTO = {
          assignments: plan.assignments,
          unscheduledMatches: [],
          softViolations: [],
          objectiveScore: null,
          infeasibleReasons: [],
          status: 'feasible',
        };
        const stamped = await apiClient.putTournamentState(tid, {
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

  const handleRestore = async (filename: string) => {
    await restoreBackup(filename);
    setConfirmRestore(null);
  };

  return (
    <>
      <Section
        title="Backups"
        description="The backend rolls a snapshot into ./data/backups/ on every save (last 10 kept). Snapshot now or restore any of the existing ones."
        trailing={
          <button
            type="button"
            onClick={() => void createBackup()}
            disabled={busyAction !== null}
            data-testid="backup-create"
            aria-busy={busyAction === 'create'}
            className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1 text-xs text-foreground hover:bg-muted/40`}
          >
            {busyAction === 'create' && (
              <CircleNotch aria-hidden="true" className="h-3 w-3 animate-spin" />
            )}
            {busyAction === 'create' ? 'Saving…' : 'Back up now'}
          </button>
        }
      >
        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading && entries.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No backups yet — one will appear the next time you save.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {entries.map((e) => (
              <li
                key={e.filename}
                className="flex items-center justify-between py-1.5 text-xs"
                data-testid={`backup-row-${e.filename}`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="truncate font-mono text-foreground">{e.filename}</div>
                  <div className="text-muted-foreground">
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
                        <CircleNotch aria-hidden="true" className="h-3 w-3 animate-spin" />
                      )}
                      {busyAction === e.filename ? 'Restoring…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRestore(null)}
                      disabled={busyAction !== null}
                      className={`${INTERACTIVE_BASE} rounded border border-border bg-card px-2 py-0.5 text-foreground hover:bg-muted/40`}
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
                    className={`${INTERACTIVE_BASE} rounded border border-border bg-card px-2 py-0.5 text-foreground hover:bg-muted/40`}
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Recover schedule"
        description="Rebuild schedule assignments from a Schedule XLSX export — useful when the in-memory schedule is lost but you still have the spreadsheet."
        trailing={
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busyAction !== null}
            data-testid="schedule-import-open"
            className={`${INTERACTIVE_BASE} rounded border border-border bg-card px-3 py-1 text-xs text-foreground hover:bg-muted/40`}
          >
            Recover from XLSX…
          </button>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          data-testid="schedule-import-file"
          onChange={handleFileSelected}
        />
      </Section>

      {importResult && (
        <ScheduleImportModal
          result={importResult}
          busy={importing}
          onApply={handleApplyImport}
          onCancel={() => setImportResult(null)}
        />
      )}
    </>
  );
}
