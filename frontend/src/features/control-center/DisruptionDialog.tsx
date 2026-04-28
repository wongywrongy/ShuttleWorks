/**
 * Disruption dialog — operator picks a disruption type and confirms.
 *
 * One dialog, body switches by ``type``. Submit calls
 * ``useRepair().repair(disruption)`` which updates the schedule via
 * the store. Closes automatically on success.
 *
 * The UX is intentionally minimal in v1: a type chip, a couple of
 * fields per type, and a submit button. Polished previews ("here's
 * what will move") are a follow-up — the success toast already shows
 * the count.
 */
import { useEffect, useState } from 'react';

import type { DisruptionType } from '../../api/client';
import { Modal } from '../../components/common/Modal';
import { useAppStore } from '../../store/appStore';
import { useRepair } from '../../hooks/useRepair';
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

  // When the parent re-opens with new prefill, sync local state so the
  // dialog reflects the row that triggered it.
  useEffect(() => {
    if (!isOpen) return;
    if (initialType) setType(initialType);
    if (initialMatchId) setMatchId(initialMatchId);
    if (initialCourtId !== undefined) setCourtId(initialCourtId);
  }, [isOpen, initialType, initialMatchId, initialCourtId]);

  const { repair, status } = useRepair();
  const loading = status === 'loading';

  if (!isOpen) return null;

  const submit = async () => {
    const result = await repair({
      type,
      playerId: type === 'withdrawal' ? playerId : undefined,
      courtId: type === 'court_closed' ? courtId : undefined,
      matchId: ['overrun', 'cancellation'].includes(type) ? matchId : undefined,
      extraMinutes: type === 'overrun' ? extraMinutes : undefined,
    });
    if (result) onClose();
  };

  return (
    <Modal onClose={onClose} titleId="disruption-title" widthClass="max-w-md">
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
            onClick={onClose}
            className={`${INTERACTIVE_BASE} rounded border border-border bg-background px-3 py-1.5 text-sm`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className={`${INTERACTIVE_BASE} rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground`}
          >
            {loading ? 'Repairing…' : 'Repair'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
