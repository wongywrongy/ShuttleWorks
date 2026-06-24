import { useCallback, useEffect, useState } from 'react';
import { Button, Modal } from '@scheduler/design-system';
import { EmptyState } from '../../components/control-plane';
import { apiClient } from '../../api/client';
import type { BackupEntryDTO } from '../../api/dto';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Sync & Backups: list the workspace's state backups, create a new one, and
 *  restore from one (with confirm). Wired to the per-tournament backup
 *  endpoints — the local store is the source of truth. */
export function SyncBackupsTab({ tid }: { tid: string }) {
  const [backups, setBackups] = useState<BackupEntryDTO[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const refresh = useCallback(() => {
    apiClient
      .listBackups(tid)
      .then((r) => setBackups(r.backups))
      .catch(() => setBackups([]));
  }, [tid]);

  useEffect(() => refresh(), [refresh]);

  async function create() {
    setBusy(true);
    try {
      await apiClient.createBackup(tid);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await apiClient.restoreBackup(tid, restoreTarget);
      setRestoreTarget(null);
      refresh();
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            SYNC &amp; BACKUPS
          </div>
          <h2 className="mt-1 text-base font-semibold text-foreground">Backups</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A backup is a full snapshot of this workspace. Restoring replaces the
            current state with the snapshot.
          </p>
        </div>
        <Button onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create backup'}
        </Button>
      </div>

      {backups === null ? (
        <div className="p-3 text-sm text-muted-foreground">Loading…</div>
      ) : backups.length === 0 ? (
        <EmptyState
          title="No backups yet"
          body="Create a backup to snapshot this workspace's current state."
        />
      ) : (
        <ul className="divide-y divide-border rounded border border-border">
          {backups.map((b) => (
            <li
              key={b.filename}
              data-testid={`backup-${b.filename}`}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-foreground">{b.filename}</div>
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
              <Button onClick={confirmRestore} disabled={restoring}>
                {restoring ? 'Restoring…' : 'Restore workspace'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
