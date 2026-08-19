/**
 * Pending-decision banner.
 *
 * The single alert pipeline routes advisories to exactly one place by
 * severity (SPEC_AMENDMENT_alerts_activity_panel.md §2). This banner is
 * the **decision** sink: it surfaces the one highest-priority advisory
 * that is a proposal awaiting the operator (Repair / Apply / Re-optimize /
 * warm-restart), persisting until acted on. Warnings and info go to the
 * Alerts & Activity rail, never here — so an event never renders twice.
 *
 * At most one decision shows; additional queued decisions collapse to a
 * "+N more" count. Built on the shared `Notice` grammar.
 */
import { Button, Notice } from '@scheduler/design-system/components';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';
import { useMatchStateStore } from '../../store/matchStateStore';
import { hasStaleActualTiming } from '../../lib/time';
import { classifyAdvisory } from '../../platform/domain/alertModel';
import type { Advisory, MatchStateDTO, ScheduleDTO, TournamentConfig } from '../../api/dto';

/**
 * Does this advisory's number come from actual timestamps the product itself
 * REFUSES? The Gantt already draws planned times for a stamp that is nowhere
 * near its plan and captions "their recorded start times are not from this
 * tournament's day" — so "Tournament started 286294 min late" and "running
 * 286117 min behind schedule" are precise falsehoods printed beside the
 * disclaimer that contradicts them (and their Review buttons would clock-shift
 * the day by 199 days). Both are the same seeded restore artifact.
 *
 * Same predicate as the refusal (`hasStaleActualTiming` → `isNearPlan`), not a
 * second threshold: ONE rule decides whether an actual stamp is believable.
 * Unjudgeable (schedule not loaded yet) keeps the advisory — suppression needs
 * positive evidence that the stamps are dirty.
 */
function isDerivedFromRejectedTiming(
  a: Advisory,
  schedule: ScheduleDTO | null,
  matchStates: Record<string, MatchStateDTO>,
  config: TournamentConfig | null,
): boolean {
  if (!schedule || !config || schedule.assignments.length === 0) return false;
  const stale = (asg: { matchId: string; slotId: number }) =>
    hasStaleActualTiming(asg, matchStates[asg.matchId], config);

  // Per-match claim (overrun) — judge the match it names.
  if (a.matchId) {
    const asg = schedule.assignments.find((x) => x.matchId === a.matchId);
    return asg ? stale(asg) : false;
  }
  // Measured against the earliest assignment (ties → first), as the backend does.
  if (a.kind === 'start_delay_detected') {
    return stale(schedule.assignments.reduce((m, x) => (x.slotId < m.slotId ? x : m)));
  }
  // Averaged over finished matches' actual times. Unbelievable only when NO
  // finished match has a believable stamp — one dirty row among good ones is
  // the average's problem to defend, not a reason to hide a real warning.
  if (a.kind === 'running_behind') {
    const timed = schedule.assignments.filter((x) => {
      const ms = matchStates[x.matchId];
      return ms?.status === 'finished' && Boolean(ms.actualStartTime);
    });
    return timed.length > 0 && timed.every(stale);
  }
  return false;
}

interface AdvisoryBannerProps {
  /** When true, show the message only (no Review button) — e.g. a
   *  read-only spectator surface. */
  readOnly?: boolean;
  /** Handler for the Review button — routes the advisory's suggestedAction
   *  to the matching dialog. */
  onReview?: (advisory: Advisory) => void;
  className?: string;
}

export function AdvisoryBanner({ readOnly = false, onReview, className = '' }: AdvisoryBannerProps) {
  // `?? []` — surfaces that replace the uiStore wholesale in tests (and any
  // token-scoped mount without the poller) leave the slice undefined.
  const advisories = useUiStore((s) => s.advisories) ?? [];
  const schedule = useTournamentStore((s) => s.schedule);
  const config = useTournamentStore((s) => s.config);
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const decisions = advisories
    .filter(
      (a) =>
        classifyAdvisory(a) === 'decision' &&
        !isDerivedFromRejectedTiming(a, schedule, matchStates, config),
    )
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

  if (decisions.length === 0) return null;
  const top = decisions[0];
  const extra = decisions.length - 1;

  return (
    <Notice
      tone="accent"
      placement="full-bleed"
      className={`motion-enter ${className}`}
      title={top.summary}
      action={
        <div className="flex items-center gap-2">
          {extra > 0 && (
            <span className="whitespace-nowrap text-2xs font-medium text-muted-foreground tabular-nums">
              +{extra} more
            </span>
          )}
          {!readOnly && top.suggestedAction && onReview && (
            <Button type="button" size="xs" variant="outline" onClick={() => onReview(top)}>
              Review
            </Button>
          )}
        </div>
      }
    >
      {top.detail ?? undefined}
    </Notice>
  );
}
