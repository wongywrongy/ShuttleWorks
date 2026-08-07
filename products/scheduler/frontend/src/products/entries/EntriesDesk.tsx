/**
 * The Entries desk — the operator's half of the E1 walking skeleton.
 *
 * Deliberately small. It does three things: show what the public form
 * produced, let an operator confirm a pending entry (ruling D1 — the ONLY
 * lifecycle transition E1 ships), and run Seam A, reporting per-entry what
 * happened. Reject / promote / withdraw are E2 and are absent on purpose; a
 * colocated test asserts their absence so the scope line stays visible.
 *
 * Two choices worth stating:
 *
 * - **The commit result is rendered, not toasted.** Spec §5 makes partial
 *   success the expected shape: some entries commit, some are skipped with a
 *   reason the operator must go and fix. A toast that disappears in six
 *   seconds is the wrong container for a to-do list, so the summary persists
 *   until the next commit.
 * - **Full contact data is shown.** The *public* entrant list is a strict
 *   projection (names + events only, opt-outs excluded). This surface is its
 *   opposite number: the operator is the person who has to write back about a
 *   clash, and the entrant's own free-text `remarks` sit here precisely so
 *   the sentence reaches the person building the schedule (spec §4).
 * - **Rows are banded by the act they arrived on** (ruling R13, SP-E1-2).
 *   One form covering two children and four events is one agreement, one
 *   total and one person to write to; before the submission level existed,
 *   an operator had to infer that from a repeated email address — which is
 *   ambiguous exactly when it matters, because one parent account is
 *   *expected* to submit many times. The address and the act's fee total sit
 *   on the band, once, rather than on every row.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { StatusPill } from '../../components/StatusPill';
import {
  ActionsBar,
  BandedTable,
  EmptyState,
  colClass,
  type BandedTableColumn,
} from '../../components/control-plane';
import { apiClient } from '../../api/client';
import type { EntryCommitResultDTO, EntryDTO } from '../../api/dto';
import { useAction } from '../../hooks/useAction';
import { useCanEdit } from '../../hooks/useCanEdit';
import {
  ENTRY_STATE_LABEL,
  ENTRY_STATE_TONE,
  formatCents,
  groupBySubmission,
  hasAttention,
  reasonLabel,
  skipReasonLabel,
} from './entryDisplay';

/** Ruling D1: `pending` is the only state a confirm may start from. Mirrors
 *  `_CONFIRMABLE_FROM` in `api/entries.py`, which answers 409 otherwise. */
const CONFIRMABLE_FROM = 'pending';

const COLUMNS: BandedTableColumn[] = [
  { label: 'Entrant', className: 'min-w-0 flex-[2]' },
  { label: 'Event', className: 'w-16' },
  { label: 'State', className: 'w-28' },
  { label: 'Attention', className: 'w-32', priority: 2 },
  { label: 'Remarks', className: 'min-w-0 flex-[2]', priority: 3 },
  { label: '', className: 'w-20 text-right' },
];

export function EntriesDesk({ tid }: { tid: string }) {
  const canEdit = useCanEdit();
  const [entries, setEntries] = useState<EntryDTO[] | null>(null);
  const [result, setResult] = useState<EntryCommitResultDTO | null>(null);

  const load = useCallback(async () => {
    const rows = await apiClient.listEntries(tid);
    setEntries(rows);
  }, [tid]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listEntries(tid)
      .then((rows) => !cancelled && setEntries(rows))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [tid]);

  // Re-read after a confirm rather than patching the row in place: the
  // server's row is the authoritative one, and it can change more than the
  // state field.
  const confirm = useAction(
    useCallback(
      async (id: string) => {
        await apiClient.confirmEntry(tid, id);
        await load();
      },
      [tid, load],
    ),
    { errorMessage: 'Could not confirm that entry' },
  );

  // Safe to press twice — Seam A is idempotent by design (spec §5), which is
  // why this is a plain button and not a confirm-first destructive action.
  const commit = useAction(
    useCallback(async () => {
      const r = await apiClient.commitEntries(tid);
      setResult(r);
      await load();
    }, [tid, load]),
    { errorMessage: 'Could not commit entries to the roster' },
  );

  const nameById = new Map((entries ?? []).map((e) => [e.id, e.playerName]));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ActionsBar
        title="Entries"
        status={
          entries ? (
            <span className="text-xs text-muted-foreground">
              {entries.length} submitted
            </span>
          ) : null
        }
      >
        {canEdit ? (
          <Button size="xs" onClick={() => void commit.run()} disabled={commit.pending}>
            {commit.pending ? 'Committing…' : 'Commit to roster'}
          </Button>
        ) : null}
      </ActionsBar>

      <div className="@container/table min-h-0 flex-1 overflow-auto">
        {result ? (
          <CommitSummary result={result} nameById={nameById} />
        ) : null}

        {entries === null ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <EmptyState
            title="No entries yet"
            body="Entries submitted through this workspace's public entry page land here for review."
          />
        ) : (
          <BandedTable
            columns={COLUMNS}
            // One band per act. The label is the eyebrow word and the
            // address is data next to it — an email rendered in the
            // eyebrow's caps reads as shouting and is not even reliably
            // the same string.
            groups={groupBySubmission(entries).map((g) => ({
              key: g.key,
              label: 'Entered by',
              detail: [g.accountEmail ?? 'unknown', formatCents(g.feeTotalCents)]
                .filter(Boolean)
                .join(' · '),
              items: g.entries,
              testId: `entry-act-${g.key}`,
            }))}
            rowId={(e) => e.id}
            rowTestId={(e) => `entry-row-${e.id}`}
            renderRow={(e) => (
              <>
                <span className={`${colClass(COLUMNS[0])} min-w-0`}>
                  <span className="block truncate text-xs text-foreground">
                    {e.playerName}
                  </span>
                </span>
                <span className={`${colClass(COLUMNS[1])} text-xs text-muted-foreground`}>
                  {e.eventCode ?? '—'}
                </span>
                <span className={colClass(COLUMNS[2])}>
                  <StatusPill tone={ENTRY_STATE_TONE[e.state]} dot>
                    {ENTRY_STATE_LABEL[e.state]}
                  </StatusPill>
                </span>
                <span className={`${colClass(COLUMNS[3])} flex flex-wrap gap-1`}>
                  {e.pendingReasons.map((code) => (
                    <span
                      key={code}
                      className={[
                        'rounded-sm border px-1.5 py-0.5 text-2xs font-medium',
                        hasAttention([code])
                          ? 'border-status-warning/40 bg-status-warning-bg text-status-warning'
                          : 'border-border text-muted-foreground',
                      ].join(' ')}
                    >
                      {reasonLabel(code)}
                    </span>
                  ))}
                </span>
                <span
                  className={`${colClass(COLUMNS[4])} min-w-0 truncate text-2xs text-muted-foreground`}
                  title={e.remarks ?? undefined}
                >
                  {e.remarks ?? ''}
                </span>
                <span className={`${colClass(COLUMNS[5])}`}>
                  {canEdit && e.state === CONFIRMABLE_FROM ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={confirm.pending}
                      onClick={() => void confirm.run(e.id)}
                    >
                      Confirm
                    </Button>
                  ) : null}
                </span>
              </>
            )}
          />
        )}
      </div>
    </div>
  );
}

/** The per-entry outcome of the last commit. Persists until the next one —
 *  a skipped entry is a task, not a notification. */
function CommitSummary({
  result,
  nameById,
}: {
  result: EntryCommitResultDTO;
  nameById: Map<string, string>;
}) {
  const { committed, skipped } = result;
  return (
    <div
      data-testid="entries-commit-summary"
      className="border-b border-border bg-muted/20 px-5 py-3"
    >
      <p className="text-xs font-medium text-foreground">
        {committed.length === 0 && skipped.length === 0
          ? 'Nothing new to commit — every confirmed entry is already on the roster.'
          : `${committed.length} committed to the roster.`}
      </p>
      {skipped.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {skipped.map((s) => (
            <li key={s.id} className="text-2xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {nameById.get(s.id) ?? s.id}
              </span>{' '}
              skipped — {skipReasonLabel(s.reason)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
