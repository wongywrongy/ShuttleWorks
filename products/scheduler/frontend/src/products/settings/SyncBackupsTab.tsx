import { useCallback, useState } from 'react';
import { useAction } from '../../hooks/useAction';
import { Button, Modal } from '@scheduler/design-system';
import { EmptyState } from '../../components/control-plane';
import { useTournamentBackups } from '../../hooks/useTournamentBackups';

/** Human-readable file size: B / KB / MB. */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Locale date-time for a backup's modified timestamp (falls back to the raw ISO). */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Sync & Backups: list the workspace's state backups, create a new one, and
 *  restore from one (with confirm). Wired through the shared `useTournamentBackups`
 *  hook — the single seam for backup actions — so a restore re-hydrates the live
 *  tournament store (no stale data) exactly like the operator BackupPanel. */
export function SyncBackupsTab() {
  const { entries, loading, error, busyAction, createBackup, restoreBackup } = useTournamentBackups();
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const restoring = busyAction === restoreTarget;

  // `busyAction` alone did NOT stop a double-press: it's React state, so it
  // doesn't apply until the next render and a second click in the same tick
  // still fired a second `POST /state/backup` (audit C1). `useAction`'s lock is
  // a ref, so it takes effect immediately.
  const backupAction = useAction(createBackup, {
    errorMessage: 'Could not create the backup',
  });
  const restoreAction = useAction(
    useCallback(async () => {
      if (!restoreTarget) return;
      await restoreBackup(restoreTarget); // hook re-hydrates the store + refreshes
      setRestoreTarget(null);
    }, [restoreTarget, restoreBackup]),
    { errorMessage: 'Could not restore the backup' },
  );

  return (
    <div className="max-w-3xl space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Backups</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A backup is a full snapshot of this workspace. Restoring replaces the
            current state with the snapshot.
          </p>
        </div>
        <Button
          onClick={() => void backupAction.run()}
          disabled={backupAction.pending || busyAction === 'create'}
          aria-busy={backupAction.pending}
        >
          {backupAction.pending || busyAction === 'create' ? 'Creating…' : 'Create backup'}
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {loading && entries.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">Loading…</div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No backups yet"
          body="Create a backup to snapshot this workspace's current state."
        />
      ) : (
        <ul className="divide-y divide-border rounded border border-border">
          {entries.map((b) => (
            <li
              key={b.filename}
              data-testid={`backup-${b.filename}`}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                {/* A backup filename is a timestamp you restore FROM — the
                    end of it is the identifying part. `break-words` breaks
                    inside the token only when it cannot otherwise fit. */}
                <div className="break-words font-mono text-xs text-foreground">{b.filename}</div>
                <div className="text-2xs tabular-nums text-muted-foreground">
                  {fmtDate(b.modifiedAt)} · {fmtBytes(b.sizeBytes)}
                </div>
              </div>
              <Button variant="ghost" onClick={() => setRestoreTarget(b.filename)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}

      {restoreTarget && (
        <Modal onClose={() => !restoring && setRestoreTarget(null)} titleId="restore-backup-heading">
          <div className="p-6">
            <h2 id="restore-backup-heading" className="text-base font-semibold text-foreground">
              Restore this backup?
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              This replaces the workspace&rsquo;s current state with{' '}
              <span className="font-mono">{restoreTarget}</span>. Consider creating a
              backup of the current state first.
            </p>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setRestoreTarget(null)} disabled={restoring}>
                Cancel
              </Button>
              <Button
                onClick={() => void restoreAction.run()}
                disabled={restoring || restoreAction.pending}
                aria-busy={restoring || restoreAction.pending}
              >
                {restoring || restoreAction.pending ? 'Restoring…' : 'Restore workspace'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
