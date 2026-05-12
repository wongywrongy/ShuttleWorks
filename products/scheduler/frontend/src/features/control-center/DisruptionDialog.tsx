/**
 * Disruption dialog — operator picks a disruption type and reviews the
 * resulting proposal before committing.
 *
 * Two-step flow: pick disruption type + fields → click "Preview impact"
 * (creates a repair proposal) → review the impact diff → "Commit repair"
 * (atomic swap) or Cancel (discards proposal). Routes through
 * ``useProposals.createRepair`` + ``commit`` for the two-phase commit.
 */
import { useEffect, useState } from 'react';

import type { DisruptionType } from '../../api/client';
import { Modal } from '../../components/common/Modal';
import { ScheduleDiffView } from '../schedule/ScheduleDiffView';
import { useAppStore } from '../../store/appStore';
import { useProposals } from '../../hooks/useProposals';
import { formatSlotTime } from '../../lib/time';
import { INTERACTIVE_BASE } from '../../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill matchId when the dialog is opened from a specific row. */
  initialMatchId?: string;
  /** Pre-fill type when the dialog is opened from a court chip etc. */
  initialType?: DisruptionType;
  /** Pre-fill courtId for ``court_closed``. */
  initialCourtId?: number;
}

const TYPE_LABEL: Record<DisruptionType, string> = {
  withdrawal: 'Player withdrew',
  court_closed: 'Court closed',
  overrun: 'Match overrun',
  cancellation: 'Match cancelled',
};

export function DisruptionDialog({
  isOpen,
  onClose,
  initialMatchId,
  initialType,
  initialCourtId,
}: Props) {
  const players = useAppStore((s) => s.players);
  const config = useAppStore((s) => s.config);
  const matches = useAppStore((s) => s.matches);

  const [type, setType] = useState<DisruptionType>(initialType ?? 'court_closed');
  const [playerId, setPlayerId] = useState<string>(players[0]?.id ?? '');
  const [courtId, setCourtId] = useState<number>(initialCourtId ?? 1);
  const [matchId, setMatchId] = useState<string>(initialMatchId ?? matches[0]?.id ?? '');
  const [extraMinutes, setExtraMinutes] = useState<number>(15);
  // Court-closed time bounds. ``temporary` controls whether we send
  // from/to to the server. Defaults to indefinite (all-day) for the
  // legacy fast path; flipping the toggle reveals time pickers.
  const [closureTemporary, setClosureTemporary] = useState<boolean>(false);
  const [closureFrom, setClosureFrom] = useState<string>(config?.dayStart ?? '09:00');
  const [closureTo, setClosureTo] = useState<string>(config?.dayEnd ?? '17:00');

  // When the parent re-opens with new prefill, sync local state so the
  // dialog reflects the row that triggered it.
  useEffect(() => {
    if (!isOpen) return;
    if (initialType) setType(initialType);
    if (initialMatchId) setMatchId(initialMatchId);
    if (initialCourtId !== undefined) setCourtId(initialCourtId);
  }, [isOpen, initialType, initialMatchId, initialCourtId]);

  const { createRepair, commit, cancel, status } = useProposals();
  const activeProposal = useAppStore((s) => s.activeProposal);
  const loading = status === 'loading';

  if (!isOpen) return null;

  const handlePreview = async () => {
    await createRepair({
      type,
      playerId: type === 'withdrawal' ? playerId : undefined,
      courtId: type === 'court_closed' ? courtId : undefined,
      matchId: ['overrun', 'cancellation'].includes(type) ? matchId : undefined,
      extraMinutes: type === 'overrun' ? extraMinutes : undefined,
      // Time-bounded closure only when the operator opted in.
      fromTime: type === 'court_closed' && closureTemporary ? closureFrom : undefined,
      toTime: type === 'court_closed' && closureTemporary ? closureTo : undefined,
    });
  };

  const handleCommit = async () => {
    const result = await commit();
    if (result) onClose();
  };

  const handleCancel = async () => {
    if (activeProposal) await cancel();
    onClose();
  };

  const formatSlot = (slotId: number | null | undefined): string => {
    if (slotId === null || slotId === undefined) return '—';
    if (!config) return `slot ${slotId}`;
    return formatSlotTime(slotId, config);
  };

  // Proposal stage: review the impact diff and commit/cancel.
  if (activeProposal && activeProposal.kind === 'repair') {
    return (
      <Modal onClose={handleCancel} titleId="disruption-title" widthClass="max-w-2xl">
        <div className="p-4 space-y-3">
          <div>
            <h2 id="disruption-title" className="text-base font-semibold">
              Review repair
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {activeProposal.summary || 'Review the impact before committing.'}
            </p>
          </div>
          <ScheduleDiffView impact={activeProposal.impact} formatSlot={formatSlot} />
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
              {loading ? 'Committing…' : 'Commit repair'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={handleCancel} titleId="disruption-title" widthClass="max-w-md">
      <div className="p-4 space-y-4">
        <h2 id="disruption-title" className="text-base font-semibold">
          Repair after disruption
        </h2>

        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TYPE_LABEL) as DisruptionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`${INTERACTIVE_BASE} rounded-full px-3 py-1 text-xs ${
                type === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {type === 'withdrawal' && (
          <label className="block text-xs">
            <span className="text-muted-foreground">Withdrawn player</span>
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === 'court_closed' && config && (
          <div className="space-y-2">
            <label className="block text-xs">
              <span className="text-muted-foreground">Closed court</span>
              <select
                value={courtId}
                onChange={(e) => setCourtId(parseInt(e.target.value, 10))}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              >
                {Array.from({ length: config.courtCount }, (_, i) => i + 1).map((c) => (
                  <option key={c} value={c}>
                    Court {c}
                  </option>
                ))}
              </select>
            </label>

            {/* Closure mode — indefinite (default) or time-bounded. */}
            <div className="rounded border border-border bg-bg-subtle p-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={closureTemporary}
                  onChange={(e) => setClosureTemporary(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                <span className="text-fg">
                  Temporary closure (specify start/end time)
                </span>
              </label>
              {closureTemporary && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block text-xs">
                    <span className="text-muted-foreground">From</span>
                    <input
                      type="time"
                      value={closureFrom}
                      onChange={(e) => setClosureFrom(e.target.value)}
                      className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="text-muted-foreground">To</span>
                    <input
                      type="time"
                      value={closureTo}
                      onChange={(e) => setClosureTo(e.target.value)}
                      className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
                    />
                  </label>
                </div>
              )}
              {!closureTemporary && (
                <div className="mt-1 text-2xs text-muted-foreground">
                  Closes the court for the rest of the day. Use the
                  director "Reopen court" action to restore it.
                </div>
              )}
            </div>
          </div>
        )}

        {(type === 'overrun' || type === 'cancellation') && (
          <label className="block text-xs">
            <span className="text-muted-foreground">Match</span>
            <select
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.eventRank ?? m.id}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === 'overrun' && (
          <label className="block text-xs">
            <span className="text-muted-foreground">Extra minutes</span>
            <input
              type="number"
              value={extraMinutes}
              onChange={(e) => setExtraMinutes(parseInt(e.target.value || '0', 10))}
              min={0}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
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
            disabled={loading}
            className={`${INTERACTIVE_BASE} rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground`}
          >
            {loading ? 'Solving…' : 'Preview impact'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
