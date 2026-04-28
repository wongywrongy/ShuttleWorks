/**
 * Candidates panel — lists the top-N alternative schedules the solver
 * found while improving and lets the operator swap to one with a
 * single click. No solver work happens; the swap is a pure store
 * action that updates ``schedule.assignments`` to match the chosen
 * candidate.
 *
 * Useful when reality (overrun, withdrawal, court closure) makes the
 * primary schedule no longer fit but a near-optimal alternative does.
 *
 * Hidden when no candidates were captured (legacy schedules, or
 * solves that ran without the collector).
 */
import { useMemo } from 'react';
import { Check } from 'lucide-react';

import type { ScheduleCandidate, ScheduleDTO } from '../../api/dto';
import { INTERACTIVE_BASE } from '../../lib/utils';

interface Props {
  schedule: ScheduleDTO | null;
  onSelect: (index: number) => void;
}

export function CandidatesPanel({ schedule, onSelect }: Props) {
  const candidates = schedule?.candidates ?? [];
  const activeIndex = schedule?.activeCandidateIndex ?? 0;

  // Pre-compute "moves vs active" so the operator can spot
  // low-disruption alternatives at a glance. Distance metric: count of
  // matches whose (slot, court) differs from the active candidate.
  const moveCounts = useMemo(() => {
    if (!candidates.length) return new Map<string, number>();
    const active = candidates[activeIndex];
    const activeIndexMap = new Map(active.assignments.map((a) => [a.matchId, a]));
    const out = new Map<string, number>();
    for (const c of candidates) {
      let moved = 0;
      for (const a of c.assignments) {
        const ref = activeIndexMap.get(a.matchId);
        if (!ref || ref.slotId !== a.slotId || ref.courtId !== a.courtId) moved += 1;
      }
      out.set(c.solutionId, moved);
    }
    return out;
  }, [candidates, activeIndex]);

  if (candidates.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No alternative candidates captured. Run Generate to produce a candidate pool.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
      </div>
      {candidates.map((c: ScheduleCandidate, i: number) => {
        const isActive = i === activeIndex;
        const movedCount = moveCounts.get(c.solutionId) ?? 0;
        const isLowDisruption = !isActive && movedCount <= 2;
        return (
          <button
            key={c.solutionId}
            type="button"
            onClick={() => onSelect(i)}
            disabled={isActive}
            className={`${INTERACTIVE_BASE} text-left rounded border px-3 py-2 text-xs transition-colors ${
              isActive
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border bg-card hover:bg-accent'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">
                Candidate #{i + 1}
                {isActive && <Check className="inline-block h-3 w-3 ml-1" />}
              </div>
              <div className="text-muted-foreground tabular-nums">
                score {Math.round(c.objectiveScore)}
              </div>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-2xs text-muted-foreground">
              <span>found at {c.foundAtSeconds.toFixed(1)}s</span>
              {!isActive && (
                <span className={isLowDisruption ? 'text-green-600 dark:text-green-400 font-medium' : ''}>
                  {movedCount} move{movedCount === 1 ? '' : 's'} vs active
                  {isLowDisruption ? ' · low-disruption' : ''}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
