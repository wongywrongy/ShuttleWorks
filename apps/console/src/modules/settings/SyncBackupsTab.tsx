import { useCallback, useState } from 'react';
import { useAction } from '../../hooks/useAction';
import { Button, Modal } from '@scheduler/design-system';
import { EmptyState, OverflowMenu, PAGE_BODY_WIDTH } from '../../components/control-plane';
import { useTournamentBackups } from '../../hooks/useTournamentBackups';
import { TEXT_TITLE } from '../../lib/utils'
import { DialogFooter } from '../../components/DialogFooter';
import { useAuthorityStatus } from '../../hooks/useAuthorityStatus';
import { SyncReconciliationPanel } from './SyncReconciliationPanel';

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

/** The list is grouped by day, but every recovery point still needs its
 * exact moment for incident review and operator confidence. */
function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      });
}

/** Sync & Backups: list the workspace's state backups, create a new one, and
 *  restore from one (with confirm). Wired through the shared `useTournamentBackups`
 *  hook — the single seam for backup actions — so a restore re-hydrates the live
 *  tournament store (no stale data) exactly like the operator BackupPanel. */
export function SyncBackupsTab() {
  const authority = useAuthorityStatus();
  const {
    entries,
    loading,
    error,
    busyAction,
    createBackup,
    restoreBackup,
    deleteBackup,
    downloadUrl,
  } = useTournamentBackups();
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [retryKind, setRetryKind] = useState<'create' | 'restore' | 'delete' | null>(null);
  const restoring = busyAction === restoreTarget;
  const deleting = busyAction === deleteTarget;

  const createFlow = useCallback(async () => {
    await createBackup();
    setFeedback({ kind: 'success', message: 'Recovery point created.' });
    setRetryKind(null);
  }, [createBackup]);

  // `busyAction` alone did NOT stop a double-press: it's React state, so it
  // doesn't apply until the next render and a second click in the same tick
  // still fired a second `POST /state/backup` (audit C1). `useAction`'s lock is
  // a ref, so it takes effect immediately.
  const backupAction = useAction(createFlow, {
    errorMessage: 'Could not create the backup',
    onError: (err) => {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'Backup failed.' });
      setRetryKind('create');
    },
  });
  const restoreFlow = useCallback(async () => {
    if (!restoreTarget) return;
    // A restore is destructive. Snapshot the current state first and abort
    // if that recovery point cannot be created.
    await createBackup();
    await restoreBackup(restoreTarget);
    setRestoreTarget(null);
    setFeedback({ kind: 'success', message: 'Workspace restored. A recovery point was saved first.' });
    setRetryKind(null);
  }, [createBackup, restoreBackup, restoreTarget]);
  const restoreAction = useAction(
    restoreFlow,
    {
      errorMessage: 'Could not restore the backup',
      onError: (err) => {
        setFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'Restore failed.' });
        setRetryKind('restore');
      },
    },
  );
  const deleteFlow = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteBackup(deleteTarget);
    setDeleteTarget(null);
    setFeedback({ kind: 'success', message: 'Backup deleted.' });
    setRetryKind(null);
  }, [deleteBackup, deleteTarget]);
  const deleteAction = useAction(
    deleteFlow,
    {
      errorMessage: 'Could not delete the backup',
      onError: (err) => {
        setFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'Delete failed.' });
        setRetryKind('delete');
      },
    },
  );

  const retry = () => {
    if (retryKind === 'create') void backupAction.run();
    else if (retryKind === 'restore') void restoreAction.run();
    else if (retryKind === 'delete') void deleteAction.run();
  };

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
    <div className="space-y-4">
      {authority.status ? (
        <section
          aria-label="Event authority and synchronization"
          className="rounded border border-border bg-card p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">
                {authority.status.state === 'active'
                  ? 'Live from this event node'
                  : `Event authority: ${authority.status.state}`}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Epoch {authority.status.authority_epoch} · Node{' '}
                {authority.status.node_id.slice(0, 8)}
              </div>
            </div>
            <div className="text-right text-xs">
              {authority.status.pending_operations === 0 ? (
                <span className="text-status-success-fg">Cloud copy up to date</span>
              ) : (
                <span className="text-status-warning">
                  {authority.status.pending_operations} committed locally · awaiting cloud
                </span>
              )}
            </div>
          </div>
        </section>
      ) : authority.error ? (
        <div className="rounded border border-status-warning/30 bg-status-warning-bg p-3 text-xs text-status-warning">
          Local operations remain available. Synchronization status could not be refreshed.
        </div>
      ) : null}
      <SyncReconciliationPanel authority={authority.status} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Backups</h2>
          <p className={`mt-1 text-xs text-muted-foreground ${PAGE_BODY_WIDTH.prose}`}>
            A backup is a full snapshot of this workspace. Restoring replaces the
            current state with the snapshot.
          </p>
        </div>
        <Button
          onClick={() => {
            setFeedback(null);
            void backupAction.run();
          }}
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

      {feedback ? (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-center justify-between gap-3 rounded border p-3 text-sm ${
            feedback.kind === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-status-live/30 bg-status-live/10 text-status-live'
          }`}
        >
          <span>{feedback.message}</span>
          {feedback.kind === 'error' ? (
            <Button variant="outline" size="xs" onClick={retry}>
              Retry
            </Button>
          ) : null}
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
                      {/* You restore FROM a moment, not from a filename. The
                          lead says what KIND of moment: Manual never rotates
                          out, Auto ages on its own schedule — a row the
                          operator cannot lose reads differently from one that
                          will (WSB-3/4). The filename moved behind the row's
                          overflow menu; it was scaffold on every row for a
                          cross-reference that almost never happens. */}
                      <div className="text-sm tabular-nums text-foreground">
                        <span
                          className={
                            b.origin === 'manual' ? 'font-semibold' : 'text-muted-foreground'
                          }
                        >
                          {b.origin === 'manual' ? 'Manual' : 'Auto'}
                        </span>
                        <span className="text-muted-foreground"> · </span>
                        <time dateTime={b.modifiedAt} title={fmtTimestamp(b.modifiedAt)}>
                          {fmtTimestamp(b.modifiedAt)}
                        </time>
                        <span className="text-muted-foreground"> · {fmtBytes(b.sizeBytes)}</span>
                      </div>
                      <div className="mt-1 text-2xs text-muted-foreground">
                        <span data-testid={`backup-eligibility-${b.filename}`}>Eligible to restore</span>
                        <span aria-hidden="true"> · </span>
                        {b.origin === 'manual' ? 'Retained until deleted' : 'Automatic retention'}
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
                    <span className="flex shrink-0 items-center gap-1.5">
                      {/* Neutral, not red (WSB-2): the red belonged to the
                          consequence, and the consequence lives in the confirm
                          below, which states it in full. Ten red buttons down
                          a list read as ten standing alarms. */}
                      <Button
                        variant="outline"
                        size="xs"
                        aria-label={`Restore backup ${b.filename}`}
                        onClick={() => setRestoreTarget(b.filename)}
                      >
                        Restore
                      </Button>
                      <OverflowMenu
                        label={`Backup ${b.filename}`}
                        items={[
                          {
                            key: 'download',
                            label: 'Download',
                            testId: `backup-download-${b.filename}`,
                            // Content-Disposition: attachment — the browser
                            // downloads without leaving the page.
                            onSelect: () => window.location.assign(downloadUrl(b.filename)),
                          },
                          {
                            key: 'delete',
                            label: 'Delete',
                            destructive: true,
                            separator: true,
                            testId: `backup-delete-${b.filename}`,
                            onSelect: () => setDeleteTarget(b.filename),
                          },
                        ]}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <Modal onClose={() => !deleting && setDeleteTarget(null)} titleId="delete-backup-heading">
          <div className="p-6">
            <h2 id="delete-backup-heading" className={TEXT_TITLE}>
              Delete the backup from{' '}
              {(() => {
                const d = entries.find((e) => e.filename === deleteTarget);
                return d ? `${dayLabel(d.modifiedAt)}, ${fmtTime(d.modifiedAt)}` : deleteTarget;
              })()}
              ?
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The snapshot <span className="font-mono">{deleteTarget}</span> is
              removed permanently. The workspace itself is not touched.
            </p>
            <DialogFooter align="between">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void deleteAction.run()}
                disabled={deleting || deleteAction.pending}
                aria-busy={deleting || deleteAction.pending}
              >
                {deleting || deleteAction.pending ? 'Deleting…' : 'Delete backup'}
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      )}

      {restoreTarget && (
        <Modal onClose={() => !restoring && setRestoreTarget(null)} titleId="restore-backup-heading">
          <div className="p-6">
            <h2 id="restore-backup-heading" className={TEXT_TITLE}>
              Restore the backup from{' '}
              {target ? `${dayLabel(target.modifiedAt)}, ${fmtTime(target.modifiedAt)}` : restoreTarget}?
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              A recovery point of the current workspace will be created before this
              restore. If that safety snapshot cannot be saved, the restore will not
              run. Then this replaces the workspace&rsquo;s matches, results, and settings
              with <span className="font-mono">{restoreTarget}</span>; changes made
              since it are discarded.
            </p>
            <DialogFooter align="between">
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
            </DialogFooter>
          </div>
        </Modal>
      )}
    </div>
  );
}
