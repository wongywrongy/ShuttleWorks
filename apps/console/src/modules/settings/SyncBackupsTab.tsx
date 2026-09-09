import { useCallback, useMemo, useState } from 'react';
import { useAction } from '../../hooks/useAction';
import { Button, Modal } from '@scheduler/design-system';
import { EmptyState, OverflowMenu, PAGE_BODY_WIDTH } from '../../components/control-plane';
import { useTournamentBackups } from '../../hooks/useTournamentBackups';
import { TEXT_TITLE } from '../../lib/utils'
import { DialogFooter } from '../../components/DialogFooter';
import { useAuthorityStatus } from '../../hooks/useAuthorityStatus';
import { SyncReconciliationPanel } from './SyncReconciliationPanel';
import type { BackupSnapshotDTO } from '../../api/dto';
// Package 19 / V3-OC27.2: timestamps redirect to the contract §7.3 console
// authority (V3-19-2 — the authority did not exist yet when this tab's
// timestamp handling was written; it now lives in `lib/formatDateTime.ts`).
import { minuteKey, dayLabel, fmtTime, fmtTimestamp } from '../../lib/formatDateTime';

/** Human-readable file size: B / KB / MB. Detail-affordance only (V3-OC27.2)
 *  — never rendered in the default row. */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** "1 match, 2 entrants" — omits a count that is zero AND the other is
 * zero too (an empty snapshot says so via its change summary instead). */
function countsText(matchCount: number, entryCount: number): string | null {
  const parts: string[] = [];
  if (matchCount > 0) parts.push(`${matchCount} match${matchCount === 1 ? '' : 'es'}`);
  if (entryCount > 0) parts.push(`${entryCount} entrant${entryCount === 1 ? '' : 's'}`);
  return parts.length ? parts.join(', ') : null;
}

/** Sync & Backups: list the workspace's state backups, create a new one, and
 *  restore from one (with confirm). Wired through the shared `useTournamentBackups`
 *  hook — the single seam for backup actions — so a restore re-hydrates the live
 *  tournament store (no stale data) exactly like the operator BackupPanel. */
export function SyncBackupsTab({ timeZone: timeZoneProp }: { timeZone?: string } = {}) {
  // Contract §7.2: an unknown timezone falls back to UTC and says so — every
  // formatter above renders the zone abbreviation explicitly, so "UTC" here
  // is never a silent local-time assumption.
  const timeZone = timeZoneProp || 'UTC';
  const authority = useAuthorityStatus();
  const {
    entries,
    loading,
    error,
    busyAction,
    createBackup,
    restoreBackup,
    inspectBackup,
    deleteBackup,
    downloadUrl,
  } = useTournamentBackups();
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [retryKind, setRetryKind] = useState<'create' | 'restore' | 'delete' | null>(null);
  const [inspectTarget, setInspectTarget] = useState<string | null>(null);
  const [inspectState, setInspectState] = useState<BackupSnapshotDTO | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
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
    const label = dayLabel(b.modifiedAt, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(b);
    else groups.push({ label, items: [b] });
  }

  // V3-OC27.2: two backups that land in the same minute are otherwise
  // indistinguishable by the default timestamp alone — add seconds only to
  // the rows that actually collide.
  const minuteCollisions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of entries) {
      const key = minuteKey(b.modifiedAt, timeZone);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [entries, timeZone]);
  const collides = (iso: string) => (minuteCollisions.get(minuteKey(iso, timeZone)) ?? 0) > 1;

  const target = entries.find((e) => e.filename === restoreTarget);

  const inspect = async (filename: string) => {
    setInspectTarget(filename);
    setInspectState(null);
    setInspectError(null);
    setInspectLoading(true);
    try { setInspectState(await inspectBackup(filename)); }
    catch (err) { setInspectError(err instanceof Error ? err.message : 'Could not inspect backup'); }
    finally { setInspectLoading(false); }
  };

  return (
    <div className="space-y-4">
      {authority.status ? (
        <section
          aria-label="Event authority and synchronization"
          className="rounded border border-border bg-card p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Saved on this device.</div>
            </div>
            {/* A cloud row only ever appears when the outbox carries actual
               evidence of a sync pipeline (pending, blocked, or previously
               acknowledged operations) — console edits never reach that
               outbox on their own, so "Sync is active" cannot be derived
               from the authority epoch state alone (ruling R3). */}
            {authority.status.blocked_operations > 0 ? (
              <div className="text-right text-xs">
                <span className="text-status-warning-fg">Needs attention</span>
              </div>
            ) : authority.status.pending_operations > 0 ? (
              <div className="text-right text-xs">
                <span className="text-status-warning">
                  {authority.status.pending_operations} change
                  {authority.status.pending_operations === 1 ? '' : 's'} saved on
                  this device, waiting to sync
                </span>
              </div>
            ) : authority.status.acknowledged_operations > 0 ? (
              <div className="text-right text-xs">
                <span className="text-status-success-fg">Synced</span>
              </div>
            ) : null}
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
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {g.label}
              </div>
              <ul className="divide-y divide-border rounded border border-border">
                {g.items.map((b, index) => (
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
                        {(() => {
                          const withSeconds = collides(b.modifiedAt);
                          const label = fmtTimestamp(b.modifiedAt, timeZone, withSeconds);
                          return (
                            <time dateTime={b.modifiedAt} title={label}>
                              {label}
                            </time>
                          );
                        })()}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        <span>{index === 0 && g === groups[0] ? 'Latest recovery point' : 'Earlier recovery point'}</span>
                        <span aria-hidden="true"> · </span>
                        {/* Change summary + meaningful counts (V3-OC27.2)
                            replace byte-delta prose and the filename here —
                            those move to "Inspect backup" in the overflow
                            menu, which already shows the full snapshot
                            breakdown and now the filename + exact size too. */}
                        <span data-testid={`backup-summary-${b.filename}`}>
                          {b.changeSummary ?? 'Snapshot details in Inspect backup'}
                        </span>
                        {countsText(b.matchCount ?? 0, b.entryCount ?? 0) ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span>{countsText(b.matchCount ?? 0, b.entryCount ?? 0)}</span>
                          </>
                        ) : null}
                        <span aria-hidden="true"> · </span>
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
                            key: 'inspect',
                            label: 'Inspect backup',
                            testId: `backup-inspect-${b.filename}`,
                            onSelect: () => void inspect(b.filename),
                          },
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
                return d
                  ? `${dayLabel(d.modifiedAt, timeZone)}, ${fmtTime(d.modifiedAt, timeZone, collides(d.modifiedAt))}`
                  : deleteTarget;
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
              {target
                ? `${dayLabel(target.modifiedAt, timeZone)}, ${fmtTime(target.modifiedAt, timeZone, collides(target.modifiedAt))}`
                : restoreTarget}
              ?
            </h2>
            {/* Names the chosen snapshot by its content, not its filename
                (V3-OC27.2) — the same summary/counts shown in the list row. */}
            {target ? (
              <p className="mt-1 text-xs font-medium text-foreground">
                {target.changeSummary ?? 'Snapshot details in Inspect backup'}
                {countsText(target.matchCount ?? 0, target.entryCount ?? 0)
                  ? ` · ${countsText(target.matchCount ?? 0, target.entryCount ?? 0)}`
                  : ''}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Restoring replaces the current workspace with this snapshot. A
              recovery point of the current state is saved first; if that
              safety snapshot cannot be saved, the restore will not run.
              Matches, results, and settings all change to match the
              snapshot. Everything recorded since it is discarded.
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
      {inspectTarget && (
        <Modal onClose={() => setInspectTarget(null)} titleId="inspect-backup-heading">
          <div className="p-6">
            <h2 id="inspect-backup-heading" className={TEXT_TITLE}>Inspect recovery point</h2>
            {/* Exact filename + size — the detail affordance V3-OC27.2 asks
                for; the default list row shows the change summary instead. */}
            <p className="mt-1 text-xs text-muted-foreground font-mono">{inspectTarget}</p>
            {(() => {
              const found = entries.find((e) => e.filename === inspectTarget);
              return found ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{fmtBytes(found.sizeBytes)}</p>
              ) : null;
            })()}
            {inspectLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading snapshot contents…</p> : inspectError ? <p role="alert" className="mt-4 text-sm text-destructive">{inspectError}</p> : inspectState ? (
              <>
              <p className="mt-4 text-xs text-muted-foreground">
                Counts are shown by module. A module with no saved data shows zero.
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Tournament</dt><dd>{inspectState.config?.tournamentName || 'Unnamed tournament'}</dd>
                <dt className="text-muted-foreground">Meet roster players</dt><dd>{inspectState.players?.length ?? 0}</dd>
                <dt className="text-muted-foreground">Meet schools / groups</dt><dd>{inspectState.groups?.length ?? 0}</dd>
                <dt className="text-muted-foreground">Meet matches</dt><dd>{inspectState.matches?.length ?? 0}</dd>
                <dt className="text-muted-foreground">Meet scheduled items</dt><dd>{inspectState.schedule?.assignments?.length ?? 0}</dd>
                <dt className="text-muted-foreground">Bracket entrants</dt><dd>{inspectState.bracketPlayers?.length ?? 0}</dd>
                <dt className="text-muted-foreground">Bracket scheduled items</dt><dd>{inspectState.bracket_session?.assignments?.length ?? 0}</dd>
              </dl>
              </>
            ) : null}
            <DialogFooter align="between">
              <Button variant="ghost" onClick={() => setInspectTarget(null)}>Close</Button>
              {inspectState ? <Button onClick={() => { setInspectTarget(null); setRestoreTarget(inspectTarget); }}>Review restore</Button> : null}
            </DialogFooter>
          </div>
        </Modal>
      )}
    </div>
  );
}
