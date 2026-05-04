/**
 * Move / postpone a single match.
 *
 * The everyday counterpart to the heavier replan/repair flows: a match
 * is just running late ("postpone by 15 min") or needs to swap to a
 * different court ("move to 11:30 on court 2"). Both routes through
 * the same proposal pipeline as warm-restart and disruption — so the
 * operator sees who's affected before committing.
 *
 * Two modes, switched by a segmented control:
 *
 *   - **Postpone**: pin the match `N` minutes later on its current
 *     court. Converts minutes → slots via `config.intervalMinutes`,
 *     rounding *up* so a 10-min postpone on a 30-min grid still
 *     advances by one full slot rather than rounding to zero.
 *
 *   - **Move to**: pin to a specific HH:MM time and court. Time is
 *     mapped to the nearest slot via `timeToSlot`.
 *
 * Both end up calling `useProposals.createManualEdit(matchId, slot,
 * court)`, which produces a `manual_edit` proposal the operator
 * reviews + commits. The cascade is bounded by warm-restart's
 * `stayCloseWeight=10` so unrelated matches stay put.
 */
import { useEffect, useMemo, useState } from 'react';
import { Clock, ArrowRight } from '@phosphor-icons/react';

import { Modal } from '../../components/common/Modal';
import { ScheduleDiffView } from '../schedule/ScheduleDiffView';
import { useProposals } from '../../hooks/useProposals';
import { useAppStore } from '../../store/appStore';
import { formatSlotTime, timeToSlot, slotToTime } from '../../lib/time';
import { INTERACTIVE_BASE } from '../../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-selected match. The dialog is always invoked from a specific
   *  match's row/details, so this is required. */
  matchId?: string;
}

type Mode = 'postpone' | 'move-to';

export function MoveMatchDialog({ isOpen, onClose, matchId }: Props) {
  const config = useAppStore((s) => s.config);
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);
  const schedule = useAppStore((s) => s.schedule);
  const activeProposal = useAppStore((s) => s.activeProposal);
  const { createManualEdit, commit, cancel, status } = useProposals();
  const loading = status === 'loading';

  const [mode, setMode] = useState<Mode>('postpone');
  const [postponeMin, setPostponeMin] = useState<number>(15);
  // moveToTime defaults to the match's scheduled time when the dialog opens.
  const [moveToTime, setMoveToTime] = useState<string>('');
  const [moveToCourt, setMoveToCourt] = useState<number>(1);

  const match = useMemo(() => matches.find((m) => m.id === matchId), [matches, matchId]);
  const assignment = useMemo(
    () => schedule?.assignments.find((a) => a.matchId === matchId),
    [schedule, matchId],
  );

  // When the dialog opens with a fresh match, prefill move-to with
  // the match's current time + court so the operator only has to
  // change the parts they want to change.
  useEffect(() => {
    if (!isOpen || !assignment || !config) return;
    setMoveToTime(slotToTime(assignment.slotId, config));
    setMoveToCourt(assignment.courtId);
    setMode('postpone');
    setPostponeMin(15);
  }, [isOpen, assignment, config]);

  if (!isOpen) return null;

  const formatSlotForDiff = (slotId: number | null | undefined): string => {
    if (slotId === null || slotId === undefined) return '—';
    if (!config) return `slot ${slotId}`;
    return formatSlotTime(slotId, config);
  };

  const handleCancel = async () => {
    if (activeProposal) await cancel();
    onClose();
  };

  const handleCommit = async () => {
    const result = await commit();
    if (result) onClose();
  };

  // Compute the proposed (slot, court) target depending on mode. Returns
  // null when the inputs are invalid (e.g., target time outside day).
  const computeTarget = (): { slotId: number; courtId: number } | null => {
    if (!config || !assignment) return null;
    if (mode === 'postpone') {
      if (postponeMin <= 0) return null;
      const interval = Math.max(1, config.intervalMinutes);
      // Round *up* so a sub-interval postpone still advances at least
      // one full slot. A 10-min postpone on a 30-min grid → +1 slot.
      const slotDelta = Math.ceil(postponeMin / interval);
      return {
        slotId: assignment.slotId + slotDelta,
        courtId: assignment.courtId,
      };
    }
    // mode === 'move-to'
    const slotId = timeToSlot(moveToTime, config);
    if (slotId < 0) return null;
    return { slotId, courtId: moveToCourt };
  };

  const handlePreview = async () => {
    if (!matchId) return;
    const target = computeTarget();
    if (!target) return;
    await createManualEdit(matchId, target.slotId, target.courtId);
  };

  // Proposal stage — show the diff and commit/cancel.
  if (activeProposal && activeProposal.kind === 'manual_edit') {
    return (
      <Modal onClose={handleCancel} titleId="move-match-title" widthClass="max-w-2xl">
        <div className="p-4 space-y-3">
          <div>
            <h2 id="move-match-title" className="text-base font-semibold">
              Review move
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {activeProposal.summary || 'Review the cascade before committing.'}
            </p>
          </div>
          <ScheduleDiffView
            impact={activeProposal.impact}
            formatSlot={formatSlotForDiff}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={handleCancel}
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
              {loading ? 'Committing…' : 'Commit move'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (!match || !assignment || !config) {
    return (
      <Modal onClose={handleCancel} titleId="move-match-title" widthClass="max-w-md">
        <div className="p-4 text-sm text-muted-foreground">
          Cannot move this match — no scheduled assignment available.
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className={`${INTERACTIVE_BASE} rounded border border-border bg-background px-3 py-1.5 text-sm`}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Inputs view — pick mode + values, then Preview.
  const currentTime = slotToTime(assignment.slotId, config);
  const matchLabel = match.matchNumber != null
    ? `#${match.matchNumber}${match.eventRank ? ` ${match.eventRank}` : ''}`
    : match.id.slice(0, 6);

  // Side names for the header (helps the operator visually confirm
  // they're moving the right match).
  const sideNames = (ids: string[] | undefined): string =>
    (ids ?? []).map((pid) => players.find((p) => p.id === pid)?.name ?? pid).join(' & ');
  const sideALabel = sideNames(match.sideA);
  const sideBLabel = sideNames(match.sideB);

  const target = computeTarget();
  const previewLabel =
    target != null
      ? `${slotToTime(target.slotId, config)} · c${target.courtId}`
      : '—';

  return (
    <Modal onClose={handleCancel} titleId="move-match-title" widthClass="max-w-md">
      <div className="p-4 space-y-3">
        <div>
          <h2 id="move-match-title" className="text-base font-semibold">
            Move match
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-mono">{matchLabel}</span>
            {sideALabel && ` — ${sideALabel}`}
            {sideBLabel && ` vs ${sideBLabel}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Currently <span className="font-mono">{currentTime}</span> on court{' '}
            <span className="font-mono">{assignment.courtId}</span>.
          </p>
        </div>

        {/* Mode segmented control */}
        <div className="flex rounded border border-border bg-bg-subtle p-0.5">
          <button
            type="button"
            onClick={() => setMode('postpone')}
            className={`${INTERACTIVE_BASE} flex-1 rounded px-2 py-1 text-xs font-medium ${
              mode === 'postpone'
                ? 'bg-card text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Clock aria-hidden="true" className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            Postpone
          </button>
          <button
            type="button"
            onClick={() => setMode('move-to')}
            className={`${INTERACTIVE_BASE} flex-1 rounded px-2 py-1 text-xs font-medium ${
              mode === 'move-to'
                ? 'bg-card text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <ArrowRight aria-hidden="true" className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            Move to…
          </button>
        </div>

        {/* Mode-specific inputs */}
        {mode === 'postpone' ? (
          <label className="block text-xs">
            <span className="text-muted-foreground">Delay by (minutes)</span>
            <input
              type="number"
              min={1}
              max={24 * 60}
              step={config.intervalMinutes}
              value={postponeMin}
              onChange={(e) => setPostponeMin(parseInt(e.target.value || '0', 10))}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
            />
            <span className="mt-1 block text-2xs text-muted-foreground">
              Rounds up to the next {config.intervalMinutes}-min slot.
            </span>
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span className="text-muted-foreground">Time</span>
              <input
                type="time"
                value={moveToTime}
                onChange={(e) => setMoveToTime(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
              />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">Court</span>
              <select
                value={moveToCourt}
                onChange={(e) => setMoveToCourt(parseInt(e.target.value, 10))}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              >
                {Array.from({ length: config.courtCount }, (_, i) => i + 1).map((c) => (
                  <option key={c} value={c}>
                    Court {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Pinned target preview */}
        <div className="rounded border border-border bg-bg-subtle px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">Pinned target: </span>
          <span className="font-mono text-fg">{previewLabel}</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleCancel}
            className={`${INTERACTIVE_BASE} rounded border border-border bg-background px-3 py-1.5 text-sm`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={loading || target == null}
            className={`${INTERACTIVE_BASE} rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50`}
          >
            {loading ? 'Solving…' : 'Preview impact'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
