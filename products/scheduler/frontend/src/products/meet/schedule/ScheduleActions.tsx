import { CircleNotch } from '@phosphor-icons/react';
import { Button } from '@scheduler/design-system/components';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { useConfirmClick } from '../../../hooks/useConfirmClick';
import { READ_ONLY_MESSAGE } from '../../../platform/domain/permissions';

/**
 * Schedule toolbar — the single action for producing a plan.
 *
 * WEIGHT. With no schedule yet, Generate is the primary action of the surface
 * and wears the glow. Once a schedule EXISTS the same press replaces it
 * wholesale, and a destructive action does not get to look like the primary
 * one: it drops to `outline`, distinct from the four neutral toolbar chips
 * beside it (Export / Director / Re-plan / Disruption) without inviting the
 * click, and a rule separates it from them. It goes `destructive` only while
 * armed, where the colour is a warning rather than an invitation.
 *
 * ARMING. The replace press is guarded by `useConfirmClick`, the canon
 * two-click arm — the same hook Run's Record button and bracket's
 * WinnerButton use, so Escape cancels an accidental arm instead of the
 * operator waiting out a timer. It replaces the page-level `confirmingReplace`
 * state + hand-rolled 4s effect that used to own this, which is precisely the
 * copy-pasted timer that hook's docstring says it exists to retire.
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
  /** The day is under way (matches called/started/finished). The armed copy
   *  names the stakes — re-solving a live day moves the remaining matches. */
  liveDay?: boolean;
  /** There is something to schedule. With no matches the solver has nothing to
   *  place, so Generate would run a pointless solve and return an empty plan
   *  (audit A6) — the button says so instead of doing it. */
  hasMatches?: boolean;
}

export function ScheduleActions({
  onGenerate,
  generating,
  hasSchedule,
  liveDay = false,
  hasMatches = true,
}: ScheduleActionsProps) {
  // A viewer may not re-solve the day (audit A2). `disabled` on the native
  // button blocks pointer AND keyboard activation — the seam in
  // `useTournamentState` is the backstop, this is the vocabulary.
  const canEditWorkspace = useCanEdit();
  const confirm = useConfirmClick(onGenerate);
  // Only the REPLACE press is destructive; the first solve of the day is not.
  const replaces = hasSchedule && !generating;
  const armed = replaces && confirm.armed;
  const disabledReason = !canEditWorkspace
    ? READ_ONLY_MESSAGE
    : !hasMatches
      ? 'Add matches before generating a schedule'
      : undefined;
  // No standing "Day is live" caption: the destructive guard itself
  // communicates the stakes ("Replace LIVE schedule?") at the moment it
  // matters (Phase 4.3 — the guard replaces the chrome).
  return (
    <div className="flex items-center gap-2">
      {/* The rule, not the 8px gap, is what separates the action that replaces
          the whole schedule from the four neutral chips beside it. */}
      {replaces ? <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" /> : null}
      <Button
        type="button"
        size="xs"
        variant={generating ? 'toolbar' : armed ? 'destructive' : replaces ? 'outline' : 'brand'}
        onClick={replaces ? confirm.press : onGenerate}
        onBlur={confirm.reset}
        disabled={generating || !canEditWorkspace || !hasMatches}
        title={disabledReason}
        data-testid="schedule-generate"
        aria-busy={generating}
        className={armed ? 'sw-pulse' : undefined}
      >
        {generating && <CircleNotch aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
        {generating
          ? 'Generating…'
          : armed
            ? liveDay
              ? 'Replace LIVE schedule?'
              : 'Click again to replace'
            : 'Generate'}
      </Button>
    </div>
  );
}
