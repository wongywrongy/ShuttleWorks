/**
 * Warm-restart confirmation dialog.
 *
 * The escape hatch when targeted repair isn't enough — the operator
 * wants the solver to re-plan from where the tournament currently is.
 * Finished + in-progress matches stay pinned; everything else may
 * move under a per-match move-penalty so the new schedule stays as
 * close to the old one as the constraints allow.
 *
 * Conservative / Balanced / Aggressive map to weights 10 / 5 / 1
 * (lower weight = solver more willing to move matches).
 */
import { useState } from 'react';

import { Modal } from '../../components/common/Modal';
import { useRepair } from '../../hooks/useRepair';
import { INTERACTIVE_BASE } from '../../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const WEIGHTS: Array<{ id: 'conservative' | 'balanced' | 'aggressive'; label: string; weight: number; hint: string }> = [
  { id: 'conservative', label: 'Conservative', weight: 10, hint: 'Strongest stay-close — very few moves' },
  { id: 'balanced',     label: 'Balanced',     weight: 5,  hint: 'Default — moves when objective improves' },
  { id: 'aggressive',   label: 'Aggressive',   weight: 1,  hint: 'Lowest stay-close — re-optimises freely' },
];

export function WarmRestartDialog({ isOpen, onClose }: Props) {
  const [pick, setPick] = useState<typeof WEIGHTS[number]['id']>('conservative');
  const { warmRestart, status } = useRepair();
  const loading = status === 'loading';

  if (!isOpen) return null;

  const submit = async () => {
    const w = WEIGHTS.find((x) => x.id === pick)!.weight;
    const result = await warmRestart(w);
    if (result) onClose();
  };

  return (
    <Modal onClose={onClose} titleId="warm-restart-title" widthClass="max-w-md">
      <div className="p-4 space-y-4">
        <h2 id="warm-restart-title" className="text-base font-semibold">
          Re-plan from here
        </h2>

        <p className="text-xs text-muted-foreground">
          Finished and in-progress matches stay where they are. Future matches
          may move; choose how much the solver should prefer keeping the
          existing schedule.
        </p>

        <div className="space-y-1.5">
          {WEIGHTS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPick(opt.id)}
              className={`${INTERACTIVE_BASE} w-full text-left rounded border px-3 py-2 text-sm ${
                pick === opt.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:bg-accent'
              }`}
            >
              <div className="font-medium">{opt.label}</div>
              <div className="text-2xs text-muted-foreground mt-0.5">{opt.hint}</div>
            </button>
          ))}
        </div>

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
            {loading ? 'Re-planning…' : 'Re-plan'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
