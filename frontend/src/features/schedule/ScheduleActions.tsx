import { Loader2 } from 'lucide-react';
import { INTERACTIVE_BASE } from '../../lib/utils';

interface ScheduleActionsProps {
  onGenerate: () => void;
  onReoptimize: () => void;
  generating: boolean;
  reoptimizing: boolean;
  hasSchedule: boolean;
  /** When true, the Generate button enters a "are-you-sure?" inline state. */
  confirmingReplace?: boolean;
}

const BTN = `${INTERACTIVE_BASE} inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium`;

export function ScheduleActions({
  onGenerate,
  onReoptimize,
  generating,
  reoptimizing,
  hasSchedule,
  confirmingReplace = false,
}: ScheduleActionsProps) {
  const confirming = hasSchedule && confirmingReplace && !generating;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        data-testid="schedule-generate"
        aria-busy={generating}
        className={[
          BTN,
          generating
            ? 'bg-muted text-muted-foreground'
            : confirming
              ? 'bg-red-600 text-white hover:bg-red-700 motion-safe:animate-pulse'
              : 'bg-blue-600 text-white hover:bg-blue-700',
        ].join(' ')}
      >
        {generating && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
        {generating
          ? 'Generating…'
          : confirming
            ? 'Click again to replace schedule'
            : hasSchedule
              ? 'Generate (replaces schedule)'
              : 'Generate Schedule'}
      </button>
      {hasSchedule && (
        <button
          type="button"
          onClick={onReoptimize}
          disabled={reoptimizing}
          aria-busy={reoptimizing}
          className={[
            BTN,
            reoptimizing
              ? 'bg-muted text-muted-foreground'
              : 'bg-muted text-foreground hover:bg-accent hover:text-accent-foreground',
          ].join(' ')}
        >
          {reoptimizing && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          {reoptimizing ? 'Optimizing…' : 'Re-optimize'}
        </button>
      )}
    </div>
  );
}
