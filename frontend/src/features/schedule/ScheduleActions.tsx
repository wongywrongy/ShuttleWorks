import { Loader2 } from 'lucide-react';
import { INTERACTIVE_BASE } from '../../lib/utils';

/**
 * Schedule toolbar — the single primary action for producing a plan.
 *
 * The previous "Re-optimize" sibling button was redundant: it ran the
 * solver with previous assignments as warm start but did NOT pin
 * started/finished matches, which made it actively unsafe mid-tournament.
 * The sidebar's Re-plan… action covers the same warm-start use case
 * AND auto-pins played matches, so Re-optimize was strictly weaker.
 */
interface ScheduleActionsProps {
  onGenerate: () => void;
  generating: boolean;
  hasSchedule: boolean;
  /** When true, the Generate button enters a "are-you-sure?" inline state. */
  confirmingReplace?: boolean;
}

const BTN = `${INTERACTIVE_BASE} inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium`;

export function ScheduleActions({
  onGenerate,
  generating,
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
            ? 'Click again to replace'
            : 'Generate'}
      </button>
    </div>
  );
}
