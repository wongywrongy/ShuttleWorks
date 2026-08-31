/**
 * The Entries desk — the operator's half of the E1 walking skeleton.
 *
 * Small, and now complete. It shows what the public form produced, runs Seam
 * A reporting per-entry what happened, and carries the operator's whole half
 * of the spec's §6 state machine: confirm, reject, promote, withdraw.
 *
 * **E2 (program Phase 7) added the last three, and the rule that decides
 * which of them a row offers lives on the SERVER.** The desk renders from
 * `state` alone and each action re-reads afterwards; every refusal is the
 * backend's 409 carrying its own reason. A desk that predicted the machine's
 * answers locally would be a second copy of the state machine, and the copy
 * would be the one that went stale.
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
import { Button, Notice } from '@scheduler/design-system';
import { StatusPill } from '../../components/StatusPill';
import {
  ActionsBar,
  BandedTable,
  EmptyState,
  NAME_COL_MIN,
  colClass,
  type BandedTableColumn,
} from '../../components/control-plane';
import { apiClient } from '../../api/client';
import type { EntryCommitResultDTO, EntryDTO } from '../../api/dto';
import { useAction } from '../../hooks/useAction';
import { useCanEdit } from '../../hooks/useCanEdit';
import { useConfirmClick } from '../../hooks/useConfirmClick';
import { MODULE_LABELS } from '../../platform/product-shell/types';
import type { EntryGroup } from './entryDisplay';
import {
  ENTRY_STATE_LABEL,
  ENTRY_STATE_TONE,
  formatCents,
  groupBySubmission,
  hasAttention,
  reasonLabel,
  skipReasonLabel,
} from './entryDisplay';
import { TEXT_EMPHASIS, TEXT_MUTED_2XS, TEXT_MUTED_XS } from '../../lib/utils'

/** Ruling D1: `pending` is the only state a confirm may start from. Mirrors
 *  `_CONFIRMABLE_FROM` in `entries/entries_routes.py`, which answers 409
 *  otherwise. */
const CONFIRMABLE_FROM = 'pending';

/** The states each E2 action starts from — `entries.lifecycle`'s guards,
 *  mirrored for the sole purpose of deciding whether to DRAW a control. The
 *  server refuses regardless; this only avoids offering a button whose one
 *  outcome is a toast. */
const REJECTABLE_FROM: readonly string[] = ['pending', 'waitlisted', 'unverified'];
const PROMOTABLE_FROM: readonly string[] = ['waitlisted'];
const WITHDRAWABLE_FROM: readonly string[] = [
  'unverified',
  'pending',
  'waitlisted',
  'confirmed',
];

const COLUMNS: BandedTableColumn[] = [
  // Entrant carries a person name — it floors at NAME_COL_MIN, not zero.
  { label: 'Entrant', className: `${NAME_COL_MIN} flex-[2]` },
  { label: 'Event', className: 'w-16' },
  { label: 'State', className: 'w-28' },
  { label: 'Attention', className: 'w-32', priority: 2 },
  { label: 'Remarks', className: 'min-w-0 flex-[2]', priority: 3 },
  // Wider since E2: a row can offer up to three actions. Still last, still
  // right-aligned, still unlabelled.
  { label: '', className: 'w-56 text-right' },
];

export function EntriesDesk({ tid }: { tid: string }) {
  const canEdit = useCanEdit();
  const [entries, setEntries] = useState<EntryDTO[] | null>(null);
  // A THIRD state, distinct from "loading" (`entries === null`) and from
  // "loaded, and there are none" (`entries.length === 0`). The read used to
  // collapse a rejection into the empty array, and the desk then told the
  // organiser "0 submitted · No entries yet" while the GET had 500'd on 54
  // real submissions (2026-08-10 full-scale browser pass). How many entries
  // exist is UNKNOWN when the read fails; it is never zero.
  const [loadFailed, setLoadFailed] = useState(false);
  const [result, setResult] = useState<EntryCommitResultDTO | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await apiClient.listEntries(tid));
      setLoadFailed(false);
    } catch {
      // Keep whatever rows we already have — a failed refresh doesn't delete
      // them — but stop presenting the list as complete.
      setLoadFailed(true);
    }
  }, [tid]);

  useEffect(() => {
    let cancelled = false;
    // A different workspace's rows are not this one's; drop them rather than
    // showing them under the new tid while the first read is in flight.
    setEntries(null);
    setLoadFailed(false);
    apiClient
      .listEntries(tid)
      .then((rows) => !cancelled && setEntries(rows))
      .catch(() => !cancelled && setLoadFailed(true));
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

  // The other three transitions (E2). Same shape as `confirm`: act, then
  // re-read, because the server's row is the authoritative one and a
  // transition can change more than the state field.
  const reject = useAction(
    useCallback(
      async (id: string) => {
        await apiClient.rejectEntry(tid, id);
        await load();
      },
      [tid, load],
    ),
    { errorMessage: 'Could not reject that entry' },
  );

  const promote = useAction(
    useCallback(
      async (id: string) => {
        await apiClient.promoteEntry(tid, id);
        await load();
      },
      [tid, load],
    ),
    { errorMessage: 'Could not promote that entry' },
  );

  // E5: the payment record, at the ACT level — the band, not the row.
  // Putting it on a row would offer to mark one entry of a three-event act
  // paid, which is not a thing that can happen: one form act is one
  // transfer.
  const setPaid = useAction(
    useCallback(
      async (id: string) => {
        await apiClient.markSubmissionPaid(tid, id);
        await load();
      },
      [tid, load],
    ),
    { errorMessage: 'Could not record that payment' },
  );

  const setUnpaid = useAction(
    useCallback(
      async (id: string) => {
        await apiClient.markSubmissionUnpaid(tid, id);
        await load();
      },
      [tid, load],
    ),
    { errorMessage: 'Could not undo that payment' },
  );

  const withdraw = useAction(
    useCallback(
      async (id: string) => {
        await apiClient.withdrawEntry(tid, id);
        await load();
      },
      [tid, load],
    ),
    { errorMessage: 'Could not withdraw that entry' },
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
        title={MODULE_LABELS.entries}
        status={
          loadFailed ? (
            <span className="text-xs text-status-warning-fg">Count unknown</span>
          ) : entries ? (
            <span className={TEXT_MUTED_XS}>
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

        {loadFailed ? (
          <div className="p-5" data-testid="entries-load-error">
            <Notice
              tone="warning"
              title="Entries didn't load"
              action={
                <Button size="xs" variant="ghost" onClick={() => void load()}>
                  Retry
                </Button>
              }
            >
              This is a failed read, not an empty desk: how many entries this
              workspace has is unknown until it loads.
            </Notice>
          </div>
        ) : null}

        {entries === null ? (
          loadFailed ? null : (
            <p className="p-5 text-sm text-muted-foreground">Loading…</p>
          )
        ) : entries.length === 0 ? (
          loadFailed ? null : (
            <EmptyState
              title="No entries yet"
              body="Entries submitted through this workspace's public entry page land here for review."
            />
          )
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
              // The payment control rides the BAND because the act is what
              // was paid. `owesMoney` gates it: an act with no quote has not
              // been declared free, so offering to mark it paid would be
              // offering to record a transfer of an unknown amount.
              action:
                canEdit && owesMoney(g)
                  ? paymentControl(g, {
                      pending: setPaid.pending || setUnpaid.pending,
                      onPaid: () => void setPaid.run(g.key),
                      onUnpaid: () => void setUnpaid.run(g.key),
                    })
                  : null,
            }))}
            rowId={(e) => e.id}
            rowTestId={(e) => `entry-row-${e.id}`}
            renderRow={(e) => (
              <>
                <span role="cell" className={colClass(COLUMNS[0])}>
                  <span className="block break-words text-xs text-foreground">
                    {e.playerName}
                  </span>
                </span>
                <span
                  role="cell"
                  className={`${colClass(COLUMNS[1])} text-xs text-muted-foreground`}
                >
                  {e.eventCode ?? '–'}
                </span>
                <span role="cell" className={colClass(COLUMNS[2])}>
                  <StatusPill tone={ENTRY_STATE_TONE[e.state]} dot>
                    {ENTRY_STATE_LABEL[e.state]}
                  </StatusPill>
                </span>
                <span role="cell" className={`${colClass(COLUMNS[3])} flex flex-wrap gap-1`}>
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
                {/* Free text, so it is the cell most likely to need two
                    lines — and the one an ellipsis destroys, since a remark's
                    point is usually its end ("…allergic to latex"). The
                    column is already priority 3: on a narrow desk it yields
                    ENTIRELY rather than showing a cut-off version, and where
                    it is shown it wraps and the row grows. */}
                <span
                  role="cell"
                  className={`${colClass(COLUMNS[4])} min-w-0 break-words text-2xs text-muted-foreground`}
                >
                  {e.remarks ?? ''}
                </span>
                <span
                  role="cell"
                  className={`${colClass(COLUMNS[5])} flex items-center justify-end gap-1`}
                >
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
                  {/* Promote reads first on a waitlisted row: it is the
                      action an operator is looking for there, and confirm
                      is refused until it happens. */}
                  {canEdit && PROMOTABLE_FROM.includes(e.state) ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={promote.pending}
                      onClick={() => void promote.run(e.id)}
                    >
                      Promote
                    </Button>
                  ) : null}
                  {/* Both of the terminal moves are two-click armed. They
                      are not catastrophic enough for a modal (nothing is
                      deleted and an operator can re-enter a player at the
                      desk), and they are far too easy to hit by accident on
                      a dense list to be one press. `window.confirm` is
                      banned product-wide. */}
                  {canEdit && REJECTABLE_FROM.includes(e.state) ? (
                    <ArmedAction
                      label="Reject"
                      armedLabel="Reject?"
                      pending={reject.pending}
                      onConfirm={() => void reject.run(e.id)}
                    />
                  ) : null}
                  {canEdit && WITHDRAWABLE_FROM.includes(e.state) ? (
                    <ArmedAction
                      label="Withdraw"
                      armedLabel="Withdraw?"
                      pending={withdraw.pending}
                      onConfirm={() => void withdraw.run(e.id)}
                    />
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


/** Does this act owe money? `null` is not zero: a tournament that priced
 *  nothing has not declared its entries free, and offering to mark such an
 *  act paid would be offering to record a transfer of an unknown amount.
 *  Mirrors `entries/money.owes_payment`. */
function owesMoney(group: EntryGroup): boolean {
  return !!group.feeTotalCents;
}

/** Has this act been paid? Derived from the entries' reasons rather than
 *  from a `paidAt` the desk row does not carry — `awaiting_payment` is set
 *  and cleared by the same service call, so the two cannot disagree, and
 *  reading the reason is what the operator is looking at anyway. */
function isPaid(group: EntryGroup): boolean {
  return !group.entries.some((e) => e.pendingReasons.includes('awaiting_payment'));
}

/** The band's payment affordance: a state and its inverse action.
 *
 *  "Paid" is a STATEMENT with a quiet undo beside it, not a toggle: the
 *  common case is recording a payment once, and a control that reads as a
 *  switch invites a press to see what happens. Marking paid is not armed —
 *  it destroys nothing and its own undo sits next to it. */
function paymentControl(
  group: EntryGroup,
  {
    pending,
    onPaid,
    onUnpaid,
  }: { pending: boolean; onPaid: () => void; onUnpaid: () => void },
) {
  if (isPaid(group)) {
    return (
      <span className="flex items-center gap-2">
        <StatusPill tone="green" dot>
          Paid
        </StatusPill>
        <Button size="xs" variant="ghost" disabled={pending} onClick={onUnpaid}>
          Undo
        </Button>
      </span>
    );
  }
  return (
    <Button size="xs" variant="outline" disabled={pending} onClick={onPaid}>
      Mark paid
    </Button>
  );
}

/**
 * A destructive desk action behind the canon two-click arm.
 *
 * Its own component because `useConfirmClick` is a hook and the desk renders
 * one of these per row — a hook cannot be called inside the row callback, and
 * hoisting the arm state to the table would arm every row at once.
 */
function ArmedAction({
  label,
  armedLabel,
  pending,
  onConfirm,
}: {
  label: string;
  armedLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const arm = useConfirmClick(onConfirm);
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={pending}
      onClick={arm.press}
      onBlur={arm.reset}
      className={arm.armed ? 'text-status-warning-fg' : undefined}
    >
      {arm.armed ? armedLabel : label}
    </Button>
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
          ? 'Nothing new to commit: every confirmed entry is already on the roster.'
          : `${committed.length} committed to the roster.`}
      </p>
      {skipped.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {skipped.map((s) => (
            <li key={s.id} className={TEXT_MUTED_2XS}>
              <span className={TEXT_EMPHASIS}>
                {nameById.get(s.id) ?? s.id}
              </span>{' '}
              skipped: {skipReasonLabel(s.reason)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
