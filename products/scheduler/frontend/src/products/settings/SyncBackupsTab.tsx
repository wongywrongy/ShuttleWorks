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

/** Day header: "Today", else "Aug 12" ("Aug 12, 2025" outside the current year). */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** Time-of-day ("3:04 PM") — the day lives in the group header. */
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

  // Group by calendar day so a grown list scans by "Today / Aug 12", not by
  // filename. Entries arrive newest-first, so same-day rows are adjacent.
  const groups: { label: string; items: typeof entries }[] = [];
  for (const b of entries) {
    const label = dayLabel(b.modifiedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(b);
    else groups.push({ label, items: [b] });
  }

  const target = entries.find((e) => e.filename === restoreTarget);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
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
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.items[0].filename}>
              <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {g.label}
              </div>
              <ul className="divide-y divide-border rounded border border-border">
                {g.items.map((b) => (
                  <li
                    key={b.filename}
                    data-testid={`backup-${b.filename}`}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      {/* You restore FROM a moment, not from a filename: the
                          human timestamp + size lead; the filename is the mono
                          secondary for cross-referencing the directory. */}
                      <div className="text-sm tabular-nums text-foreground">
                        {fmtTime(b.modifiedAt)}
                        <span className="text-muted-foreground"> · {fmtBytes(b.sizeBytes)}</span>
                      </div>
                      <div className="break-words font-mono text-2xs text-muted-foreground">
                        {b.filename}
                      </div>
                    </div>
                    {/* An ACTION, not text. `variant="ghost"` at the default size put
                        ten "Restore" labels down the list in the same ink, weight and
                        box as the metadata line beside them, so the one control on
                        the row that replaces the entire workspace read as another
                        column of the table. Outline gives it an edge; the destructive
                        tint says which way it points.
                        The guard is the Modal below, deliberately, NOT the two-click
                        arm: `useConfirmClick`'s own contract reserves the arm for the
                        merely-irreversible and calls for a Modal that states what is
                        lost when the action is catastrophic. Restoring discards every
                        change since the snapshot.
                        The name is per-backup: ten controls all called "Restore" are
                        ten identical announcements to a screen reader. */}
                    <Button
                      variant="outline"
                      size="xs"
                      className="text-destructive"
                      aria-label={`Restore backup ${b.filename}`}
                      onClick={() => setRestoreTarget(b.filename)}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {restoreTarget && (
        <Modal onClose={() => !restoring && setRestoreTarget(null)} titleId="restore-backup-heading">
          <div className="p-6">
            <h2 id="restore-backup-heading" className="text-base font-semibold text-foreground">
              Restore the backup from{' '}
              {target ? `${dayLabel(target.modifiedAt)}, ${fmtTime(target.modifiedAt)}` : restoreTarget}?
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              This replaces the workspace&rsquo;s matches, results, and settings with
              the snapshot <span className="font-mono">{restoreTarget}</span>. Changes
              made since it are discarded. Consider creating a backup of the current
              state first.
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
