/**
 * Director time-axis tools panel.
 *
 * Mounted alongside log/details/candidates as a new "Director" tab on
 * the Live page. Surfaces three actions:
 *
 *   - **Delay start** — bump ``config.clockShiftMinutes`` (no solver
 *     re-run, no slot moves; just shifts displayed wall-clock).
 *   - **Insert break** — append a forbidden window to ``config.breaks``
 *     and warm-restart so matches avoid it.
 *   - **Active blackouts** — list of inserted breaks with × to remove
 *     (drops the entry and re-solves to reuse the freed window).
 *
 * Every action routes through the proposal pipeline so the operator
 * sees the full impact (which matches move, what the new finish time
 * is) before committing.
 */
import { useState } from 'react';
import { Clock, Coffee, DoorOpen, X } from '@phosphor-icons/react';

import { Modal } from '../../components/common/Modal';
import { ScheduleDiffView } from '../schedule/ScheduleDiffView';
import { useProposals } from '../../hooks/useProposals';
import { useAppStore } from '../../store/appStore';
import { formatSlotTime } from '../../lib/time';
import { INTERACTIVE_BASE } from '../../lib/utils';

export function DirectorToolsPanel() {
  const config = useAppStore((s) => s.config);
  const matchStates = useAppStore((s) => s.matchStates);
  const activeProposal = useAppStore((s) => s.activeProposal);
  const { createDirectorAction, commit, cancel, status } = useProposals();
  const loading = status === 'loading';

  // Form state
  const [delayMin, setDelayMin] = useState<number>(15);
  const [breakStart, setBreakStart] = useState<string>('12:00');
  const [breakEnd, setBreakEnd] = useState<string>('13:00');
  const [breakReason, setBreakReason] = useState<string>('');

  // Disable delay-start once any match has started — the clock-shift
  // semantics get muddled mid-tournament. Operator can still insert
  // blackouts.
  const tournamentStarted = Object.values(matchStates).some(
    (ms) => ms.status === 'started' || ms.status === 'finished',
  );

  if (!config) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        Configure the tournament before using director tools.
      </div>
    );
  }

  const handleDelayStart = async () => {
    await createDirectorAction({ kind: 'delay_start', minutes: delayMin });
  };

  const handleInsertBlackout = async () => {
    await createDirectorAction({
      kind: 'insert_blackout',
      fromTime: breakStart,
      toTime: breakEnd,
      reason: breakReason.trim() || undefined,
    });
  };

  const handleRemoveBlackout = async (index: number) => {
    await createDirectorAction({ kind: 'remove_blackout', blackoutIndex: index });
  };

  const handleReopenCourt = async (courtId: number) => {
    await createDirectorAction({ kind: 'reopen_court', courtId });
  };

  const handleCommit = async () => {
    await commit();
  };

  const handleCancelProposal = async () => {
    await cancel();
  };

  const formatSlot = (slotId: number | null | undefined): string => {
    if (slotId === null || slotId === undefined) return '—';
    return formatSlotTime(slotId, config);
  };

  return (
    <div className="space-y-4 p-3">
      {/* Delay start */}
      <section className="rounded border border-border p-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-fg-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Delay start</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Shift every unstarted match's displayed wall-clock by N minutes.
          No matches move slots; the schedule grid stays exactly the same.
        </p>
        <div className="mt-2 flex items-end gap-2">
          <label className="block text-xs flex-1">
            <span className="text-muted-foreground">Delay (minutes)</span>
            <input
              type="number"
              min={1}
              max={24 * 60}
              value={delayMin}
              onChange={(e) => setDelayMin(parseInt(e.target.value || '0', 10))}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
          <button
            type="button"
            onClick={handleDelayStart}
            disabled={tournamentStarted || loading || delayMin <= 0}
            title={
              tournamentStarted
                ? 'Disabled once any match has started'
                : undefined
            }
            className={`${INTERACTIVE_BASE} rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50`}
          >
            Preview…
          </button>
        </div>
        {(config.clockShiftMinutes ?? 0) > 0 && (
          <div className="mt-2 text-xs text-fg-muted">
            Currently shifted by {config.clockShiftMinutes} min.
          </div>
        )}
      </section>

      {/* Insert break / blackout */}
      <section className="rounded border border-border p-3">
        <div className="flex items-center gap-2">
          <Coffee className="h-4 w-4 text-fg-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Insert break</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Forbid a wall-clock window. Matches scheduled inside it get pushed
          past the break.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block text-xs">
            <span className="text-muted-foreground">From</span>
            <input
              type="time"
              value={breakStart}
              onChange={(e) => setBreakStart(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">To</span>
            <input
              type="time"
              value={breakEnd}
              onChange={(e) => setBreakEnd(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <label className="mt-2 block text-xs">
          <span className="text-muted-foreground">Reason (optional)</span>
          <input
            type="text"
            value={breakReason}
            placeholder="Lunch, awards, etc."
            onChange={(e) => setBreakReason(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={handleInsertBlackout}
            disabled={loading || breakStart >= breakEnd}
            className={`${INTERACTIVE_BASE} rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50`}
          >
            Preview…
          </button>
        </div>
      </section>

      {/* Active blackouts */}
      {config.breaks.length > 0 && (
        <section className="rounded border border-border p-3">
          <h3 className="text-sm font-semibold">Active blackouts</h3>
          <ul className="mt-2 space-y-1.5">
            {config.breaks.map((b, i) => (
              <li
                key={`${b.start}-${b.end}-${i}`}
                className="flex items-center justify-between rounded bg-bg-subtle px-2 py-1 text-xs"
              >
                <span className="text-fg">
                  {b.start}–{b.end}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveBlackout(i)}
                  disabled={loading}
                  aria-label="Remove blackout"
                  className={`${INTERACTIVE_BASE} rounded p-0.5 text-fg-muted hover:bg-bg-subtle hover:text-fg`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Closed courts — operator reopens by clicking the row. The
          reopen action runs a warm-restart so matches can flow back
          onto the freed court. Combines legacy ``closedCourts`` (all
          day) with time-bounded ``courtClosures`` into one list. */}
      {((config.closedCourts ?? []).length > 0 ||
        (config.courtClosures ?? []).length > 0) && (
        <section className="rounded border border-border p-3">
          <div className="flex items-center gap-2">
            <DoorOpen className="h-4 w-4 text-fg-muted" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Closed courts</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Reopening removes every closure for that court (all-day
            and time-bounded entries alike).
          </p>
          <ul className="mt-2 space-y-1.5">
            {(config.closedCourts ?? []).map((courtId) => (
              <li
                key={`legacy-${courtId}`}
                className="flex items-center justify-between rounded bg-bg-subtle px-2 py-1 text-xs"
              >
                <span className="text-fg">
                  Court {courtId}{' '}
                  <span className="ml-1 text-fg-muted">· all day</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleReopenCourt(courtId)}
                  disabled={loading}
                  className={`${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-2xs text-fg hover:bg-accent disabled:opacity-50`}
                >
                  <DoorOpen className="h-3 w-3" aria-hidden="true" />
                  Reopen…
                </button>
              </li>
            ))}
            {(config.courtClosures ?? []).map((closure, i) => (
              <li
                key={`window-${closure.courtId}-${i}`}
                className="flex items-center justify-between rounded bg-bg-subtle px-2 py-1 text-xs"
              >
                <span className="text-fg">
                  Court {closure.courtId}{' '}
                  <span className="ml-1 text-fg-muted">
                    · {closure.fromTime ?? 'start'}–{closure.toTime ?? 'end'}
                    {closure.reason ? ` · ${closure.reason}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleReopenCourt(closure.courtId)}
                  disabled={loading}
                  className={`${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-2xs text-fg hover:bg-accent disabled:opacity-50`}
                >
                  <DoorOpen className="h-3 w-3" aria-hidden="true" />
                  Reopen…
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Active proposal — modal-style impact preview */}
      {activeProposal && activeProposal.kind === 'director_action' && (
        <Modal
          onClose={handleCancelProposal}
          titleId="director-proposal-title"
          widthClass="max-w-2xl"
        >
          <div className="p-4 space-y-3">
            <div>
              <h2 id="director-proposal-title" className="text-base font-semibold">
                Review director action
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeProposal.summary || 'Review the impact before committing.'}
              </p>
            </div>
            <ScheduleDiffView impact={activeProposal.impact} formatSlot={formatSlot} />
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={handleCancelProposal}
                className={`${INTERACTIVE_BASE} rounded border border-border bg-background px-3 py-1.5 text-sm`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={loading}
                className={`${INTERACTIVE_BASE} rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground`}
              >
                {loading ? 'Committing…' : 'Commit'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
