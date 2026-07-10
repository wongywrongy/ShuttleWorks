import { CircleNotch } from '@phosphor-icons/react';
import { Button } from '@scheduler/design-system/components';

/**
 * Schedule toolbar — the single primary action for producing a plan.
 *
 * Uses the shared `Button size="xs"` so it sits flush with the rest of
 * the toolbar chips (Export, and the Live page's Director / Disruption
 * / Re-optimize). Variant flips: `brand` for the resting/primary state,
 * `destructive` while confirming a replace, `toolbar` while busy.
 *
 * The previous "Re-optimize" sibling button was redundant: it ran the
 * solver with previous assignments as warm start but did NOT pin
 * started/finished matches, which made it actively unsafe mid-tournament.
 * The sidebar's Re-plan action covers the same warm-start use case
 * AND auto-pins played matches, so Re-optimize was strictly weaker.
 */
interface ScheduleActionsProps {
  onGenerate: () => void;
  generating: boolean;
  hasSchedule: boolean;
  /** When true, the Generate button enters a "are-you-sure?" inline state. */
  confirmingReplace?: boolean;
  /** The day is under way (matches called/started/finished). The confirm
   *  copy names the stakes and a caution chip sits beside the button —
   *  re-solving a live day moves the remaining matches. */
  liveDay?: boolean;
}

export function ScheduleActions({
  onGenerate,
  generating,
  hasSchedule,
  confirmingReplace = false,
  liveDay = false,
}: ScheduleActionsProps) {
  const confirming = hasSchedule && confirmingReplace && !generating;
  // No standing "Day is live" caption: the destructive guard itself
  // communicates the stakes ("Replace LIVE schedule?") at the moment it
  // matters (Phase 4.3 — the guard replaces the chrome).
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="xs"
        variant={generating ? 'toolbar' : confirming ? 'destructive' : 'brand'}
        onClick={onGenerate}
        disabled={generating}
        data-testid="schedule-generate"
        aria-busy={generating}
        className={confirming ? 'sw-pulse' : undefined}
      >
        {generating && <CircleNotch aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
        {generating
          ? 'Generating…'
          : confirming
            ? liveDay
              ? 'Replace LIVE schedule?'
              : 'Click again to replace'
            : 'Generate'}
      </Button>
    </div>
  );
}
