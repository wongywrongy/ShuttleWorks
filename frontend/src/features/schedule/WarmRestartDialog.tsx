/**
 * Warm-restart proposal dialog.
 *
 * Two-step flow:
 *   1. Operator picks a stay-close weight (Conservative / Balanced /
 *      Aggressive). Submit creates a *proposal* — the solver runs but
 *      the committed schedule does NOT change yet.
 *   2. The dialog body switches to a `ScheduleDiffView` showing exactly
 *      what would change. Operator commits ("Commit replan") to apply,
 *      or cancels to discard.
 *
 * Replaces the legacy single-step flow that called the solver and
 * applied the result in one click. The proposal pipeline gives the
 * operator a chance to see repercussions before the committed state
 * changes.
 */
import { useState } from 'react';

import { Modal } from '../../components/common/Modal';
import { ScheduleDiffView } from './ScheduleDiffView';
import { useProposals } from '../../hooks/useProposals';
import { formatSlotTime } from '../../lib/time';
import { useAppStore } from '../../store/appStore';
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
  const { createWarmRestart, commit, cancel, status } = useProposals();
  const activeProposal = useAppStore((s) => s.activeProposal);
  const config = useAppStore((s) => s.config);
  const loading = status === 'loading';

  if (!isOpen) return null;

  const handlePreview = async () => {
    const w = WEIGHTS.find((x) => x.id === pick)!.weight;
    await createWarmRestart(w);
    // The proposal is now in the store; the dialog body will re-render
    // showing the impact view.
  };

  const handleCommit = async () => {
    const result = await commit();
    if (result) onClose();
  };

  const handleCancel = async () => {
    if (activeProposal) {
      await cancel();
    }
    onClose();
  };

  // Slot formatter for the diff view's "From / To" columns.
  const formatSlot = (slotId: number | null | undefined): string => {
    if (slotId === null || slotId === undefined) return '—';
    if (!config) return `slot ${slotId}`;
    return formatSlotTime(slotId, config);
  };

  // Proposal stage: show diff + commit/cancel.
  if (activeProposal && activeProposal.kind === 'warm_restart') {
    return (
      <Modal onClose={handleCancel} titleId="warm-restart-title" widthClass="max-w-2xl">
        <div className="p-4 space-y-3">
          <div>
            <h2 id="warm-restart-title" className="text-base font-semibold">
              Review re-plan
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
              {loading ? 'Committing…' : 'Commit replan'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Initial stage: pick a weight.
  return (
    <Modal onClose={handleCancel} titleId="warm-restart-title" widthClass="max-w-md">
      <div className="p-4 space-y-4">
        <h2 id="warm-restart-title" className="text-base font-semibold">
          Re-plan from here
        </h2>

        <p className="text-xs text-muted-foreground">
          Finished and in-progress matches stay where they are. Future matches
          may move; choose how much the solver should prefer keeping the
          existing schedule. The next step previews exactly what will change.
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
