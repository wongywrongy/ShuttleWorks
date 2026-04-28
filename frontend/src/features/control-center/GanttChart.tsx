/**
 * Gantt Chart - Status-Based Colors
 * Shows match status at a glance: Scheduled, Called, In Progress, Finished
 * Delayed matches get a yellow ring to stand out
 */
import { useMemo, useEffect, useState, useRef } from 'react';
import { calculateTotalSlots, formatSlotTime, getRenderSlot } from '../../utils/timeUtils';
import type { TrafficLightResult } from '../../utils/trafficLight';
import type {
  ScheduleDTO,
  MatchDTO,
  MatchStateDTO,
  TournamentConfig,
  ScheduleAssignment,
} from '../../api/dto';

interface GanttChartProps {
  schedule: ScheduleDTO;
  matches: MatchDTO[];
  matchStates: Record<string, MatchStateDTO>;
  config: TournamentConfig;
  currentSlot: number;
  selectedMatchId?: string | null;
  onMatchSelect: (matchId: string) => void;
  impactedMatchIds?: string[];
  /** Per-match traffic-light result so the grid can surface conflicts
   *  (player resting / blocked) as a visible ring on still-actionable
   *  blocks. The rows/cards already surface this, but operators working
   *  from the Gantt view were missing it.
   */
  trafficLights?: Map<string, TrafficLightResult>;
}

// Slot width chosen so that even when a court has TWO overlapping
// matches sharing the slot (each block getting SLOT_WIDTH/2 under the
// sub-lane packing rule), every block still gets enough horizontal
// room to show a 4-character event code like "MS17" without clipping.
// 96 ÷ 2 = 48 px per half-block, which matches the pre-overlap
// single-block width and is proven to fit a 4-char code comfortably
// at text-[11px].
// Sized to match the schedule-tab DragGantt so a director's eye doesn't
// have to recalibrate when switching between Schedule and Live. Both
// grids use 80×40 with a dotted grid background.
const SLOT_WIDTH = 80;
const ROW_HEIGHT = 40;
const COURT_LABEL_WIDTH = 56;

// Status-based colors. Drives the Gantt block styling per match state.
// Wired to the semantic ``status-*`` tokens in src/index.css so light /
// dark / contrast pass cleanly together. The palette: idle = slate,
// called = amber (operator has called the court), live = emerald
// (match is being played), done = slate-muted (finished). This is the
// single source of truth — schedule blocks, the live ops grid, the
// matches list, and the TV preview all read from these classes.
const STATUS_STYLES = {
  scheduled: {
    bg: 'bg-status-idle-bg',
    border: 'border-status-idle/40',
    text: 'text-foreground',
  },
  called: {
    bg: 'bg-status-called-bg',
    border: 'border-status-called/60',
    text: 'text-status-called',
  },
  started: {
    bg: 'bg-status-live-bg',
    border: 'border-status-live/60',
    text: 'text-status-live',
  },
  finished: {
    bg: 'bg-status-done-bg',
    border: 'border-status-done/30',
    text: 'text-muted-foreground',
  },
};

function getMatchLabel(match: MatchDTO): string {
  if (match.eventRank) return match.eventRank;
  if (match.matchNumber) return `M${match.matchNumber}`;
  return match.id.slice(0, 6);
}

export function GanttChart({
  schedule,
  matches,
  matchStates,
  config,
  currentSlot,
  selectedMatchId,
  onMatchSelect,
  impactedMatchIds = [],
  trafficLights,
}: GanttChartProps) {
  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const impactedSet = useMemo(() => new Set(impactedMatchIds), [impactedMatchIds]);
  const totalSlots = calculateTotalSlots(config);

  // Track state changes for animation
  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());
  const prevStatesRef = useRef<Record<string, string>>({});

  // Generate slot labels
  const slotLabels = useMemo(() => {
    return Array.from({ length: totalSlots }, (_, i) => formatSlotTime(i, config));
  }, [totalSlots, config]);

  // Determine visible slot range
  const { minSlot, maxSlot } = useMemo(() => {
    if (schedule.assignments.length === 0) return { minSlot: 0, maxSlot: Math.min(12, totalSlots) };
    const slots = schedule.assignments.map(a => a.slotId);
    const endSlots = schedule.assignments.map(a => a.slotId + a.durationSlots);
    return {
      minSlot: Math.max(0, Math.min(...slots) - 1),
      maxSlot: Math.min(totalSlots, Math.max(...endSlots) + 1),
    };
  }, [schedule.assignments, totalSlots]);

  const visibleSlots = maxSlot - minSlot;
  const courts = Array.from({ length: config.courtCount }, (_, i) => i + 1);

  // Group assignments by court (use actualCourtId if match has been moved)
  const courtAssignments = useMemo(() => {
    const byCourtMap = new Map<number, ScheduleAssignment[]>();
    for (let c = 1; c <= config.courtCount; c++) {
      byCourtMap.set(c, []);
    }
    for (const assignment of schedule.assignments) {
      // Use actualCourtId if set, otherwise use scheduled courtId
      const effectiveCourtId = matchStates[assignment.matchId]?.actualCourtId ?? assignment.courtId;
      const courtList = byCourtMap.get(effectiveCourtId) || [];
      courtList.push(assignment);
      byCourtMap.set(effectiveCourtId, courtList);
    }
    // Sort by the *rendered* slot so a later-starting match renders
    // after earlier ones on the same court.
    byCourtMap.forEach((assignments) => {
      assignments.sort((a, b) => {
        const ra = getRenderSlot(a, matchStates[a.matchId], config);
        const rb = getRenderSlot(b, matchStates[b.matchId], config);
        return ra.slotId - rb.slotId || a.slotId - b.slotId;
      });
    });
    return byCourtMap;
  }, [schedule.assignments, config, config.courtCount, matchStates]);

  // Horizontal sub-lane packing. When matches on the same court
  // overlap in time (e.g. a late-starting match drifts into the next
  // scheduled slot), we keep the court row at its normal 32 px height
  // and split the overlap window *horizontally* — each overlapping
  // block gets 1/N of the slot width and sits side-by-side. No lane
  // is hidden; labels truncate a bit under overlap but every match is
  // reachable.
  //
  // Each block's ``groupSize`` is the max number of blocks that were
  // simultaneously active on this court at any point during the
  // block's lifetime. A 1-block group keeps full width; a 2-block
  // group halves; a 3-block group thirds. The block's ``lane`` is the
  // lowest unused horizontal lane at the moment it was placed.
  const packing = useMemo(() => {
    const laneByMatchId = new Map<string, number>();
    const groupSizeByMatchId = new Map<string, number>();
    courtAssignments.forEach((assignments) => {
      let active: { matchId: string; lane: number; end: number }[] = [];
      for (const a of assignments) {
        const r = getRenderSlot(a, matchStates[a.matchId], config);
        const start = r.slotId;
        const end = start + r.durationSlots;

        // Prune ended blocks so their lane indices free up. Their
        // group-size stamps have already been updated in prior
        // iterations (see the "max-concurrent" bump below).
        active = active.filter((x) => x.end > start);

        // Lowest unused lane index for the new block.
        const used = new Set(active.map((x) => x.lane));
        let lane = 0;
        while (used.has(lane)) lane++;
        laneByMatchId.set(a.matchId, lane);

        active.push({ matchId: a.matchId, lane, end });

        // Stamp the CURRENT group size onto every still-active block.
        // By `max`, a block that was once part of a 3-block group
        // keeps size=3 even after two of its neighbours finish.
        const size = active.length;
        for (const x of active) {
          const prior = groupSizeByMatchId.get(x.matchId) ?? 1;
          if (size > prior) groupSizeByMatchId.set(x.matchId, size);
        }
      }
    });
    return { laneByMatchId, groupSizeByMatchId };
  }, [courtAssignments, matchStates, config]);

  // Track state changes for animation
  useEffect(() => {
    const currentStates: Record<string, string> = {};
    schedule.assignments.forEach(a => {
      currentStates[a.matchId] = matchStates[a.matchId]?.status || 'scheduled';
    });

    const changedIds = Object.keys(currentStates).filter(
      id => prevStatesRef.current[id] !== currentStates[id]
    );

    if (changedIds.length > 0) {
      changedIds.forEach((id, index) => {
        setTimeout(() => {
          setAnimatedIds(prev => new Set([...prev, id]));
          setTimeout(() => {
            setAnimatedIds(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }, 300);
        }, index * 30);
      });
    }

    prevStatesRef.current = currentStates;
  }, [schedule.assignments, matchStates]);

  // Get status for a match
  const getMatchStatus = (matchId: string): 'scheduled' | 'called' | 'started' | 'finished' => {
    return matchStates[matchId]?.status || 'scheduled';
  };

  // Check if match is late (past scheduled time but not started)
  const isMatchLate = (assignment: ScheduleAssignment): boolean => {
    const state = matchStates[assignment.matchId];
    const status = state?.status || 'scheduled';
    // Late if: past scheduled slot AND (scheduled or called)
    return currentSlot > assignment.slotId && (status === 'scheduled' || status === 'called');
  };

  // Check if match is explicitly postponed
  const isMatchPostponed = (matchId: string): boolean => {
    return matchStates[matchId]?.postponed === true;
  };

  return (
    <div className="overflow-hidden">
      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Time header — matches DragGantt: court label on the left,
              time labels every other slot. */}
          <div className="flex border-b border-border bg-muted/40">
            <div
              className="flex-shrink-0 px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
              style={{ width: COURT_LABEL_WIDTH }}
            >
              Court
            </div>
            {Array.from({ length: visibleSlots }, (_, i) => minSlot + i).map((slot, i) => (
              <div
                key={slot}
                style={{ width: SLOT_WIDTH }}
                className={`flex-shrink-0 border-l border-border px-1 py-1 text-center text-2xs tabular-nums ${
                  slot === currentSlot
                    ? 'bg-blue-100/70 font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
                    : 'text-muted-foreground'
                }`}
              >
                {i % 2 === 0 ? slotLabels[slot] : ''}
              </div>
            ))}
          </div>

          {/* Court rows */}
          {courts.map(courtId => (
            <div key={courtId} className="flex border-b border-border/60">
              <div
                className="flex-shrink-0 flex items-center bg-muted/30 px-2 text-xs font-semibold tabular-nums text-foreground"
                style={{ width: COURT_LABEL_WIDTH, height: ROW_HEIGHT }}
              >
                C{courtId}
              </div>
              <div
                className="flex-1 relative gantt-grid"
                style={{ height: ROW_HEIGHT }}
              >
                {/* Slot grid lines */}
                <div className="absolute inset-0 flex">
                  {Array.from({ length: visibleSlots }, (_, i) => minSlot + i).map(slot => (
                    <div
                      key={slot}
                      style={{ width: SLOT_WIDTH }}
                      className={`flex-shrink-0 border-l border-border/40 ${
                        slot === currentSlot ? 'bg-blue-100/40 dark:bg-blue-500/10' : ''
                      }`}
                    />
                  ))}
                </div>

                {/* Match blocks */}
                {(courtAssignments.get(courtId) || []).map(assignment => {
                  const match = matchMap.get(assignment.matchId);
                  const status = getMatchStatus(assignment.matchId);
                  const styles = STATUS_STYLES[status];
                  const isSelected = selectedMatchId === assignment.matchId;
                  const isAnimated = animatedIds.has(assignment.matchId);
                  const isLate = isMatchLate(assignment);
                  const isPostponed = isMatchPostponed(assignment.matchId);
                  const isInProgress = status === 'started';

                  const isImpacted = impactedSet.has(assignment.matchId);
                  const traffic = trafficLights?.get(assignment.matchId);
                  // Conflict rings are only meaningful while the match
                  // is still actionable (scheduled / called). Once
                  // started or finished, the traffic light is moot.
                  const conflictActionable =
                    traffic && (status === 'scheduled' || status === 'called');
                  const isBlocked = conflictActionable && traffic.status === 'red';
                  const isResting = conflictActionable && traffic.status === 'yellow';

                  // Ring priority: selected > blocked conflict > impacted
                  // > postponed > resting > late. Conflict-red outranks
                  // impacted because a player physically can't be on the
                  // court — harder constraint than a soft impact.
                  let ringClass = '';
                  if (isSelected) {
                    ringClass = 'ring-2 ring-inset ring-blue-500';
                  } else if (isBlocked) {
                    ringClass = 'ring-2 ring-inset ring-red-500';
                  } else if (isImpacted) {
                    ringClass = 'ring-2 ring-inset ring-purple-500';
                  } else if (isPostponed) {
                    ringClass = 'ring-2 ring-inset ring-red-400';
                  } else if (isResting) {
                    ringClass = 'ring-2 ring-inset ring-amber-400';
                  } else if (isLate) {
                    ringClass = 'ring-2 ring-inset ring-yellow-400';
                  }

                  // Live render position: started/finished blocks use
                  // actualStartTime / actualEndTime; scheduled/called
                  // stay at the paper slot. Any change to the render
                  // slot animates via the existing transition-all.
                  const render = getRenderSlot(
                    assignment,
                    matchStates[assignment.matchId],
                    config,
                  );
                  const baseLeft = (render.slotId - minSlot) * SLOT_WIDTH;
                  const baseWidth = Math.max(48, render.durationSlots * SLOT_WIDTH - 2);
                  // If this block shares its time window with others on
                  // the same court, shrink width + offset horizontally
                  // so every block stays visible without making the row
                  // taller. Non-overlapping blocks keep full width.
                  const groupSize = packing.groupSizeByMatchId.get(assignment.matchId) ?? 1;
                  const lane = packing.laneByMatchId.get(assignment.matchId) ?? 0;
                  const width = groupSize > 1 ? baseWidth / groupSize : baseWidth;
                  const left = groupSize > 1 ? baseLeft + lane * width : baseLeft;

                  return (
                    <div
                      key={assignment.matchId}
                      onClick={() => onMatchSelect(assignment.matchId)}
                      className={`absolute top-0.5 rounded border cursor-pointer
                        ${styles.bg} ${styles.border}
                        transition-all duration-150 ease-out
                        ${isAnimated ? 'scale-105' : ''}
                        ${ringClass}
                        ${isInProgress ? 'shadow-sm' : ''}
                        hover:brightness-95`}
                      style={{ left, width, height: ROW_HEIGHT - 4 }}
                      title={
                        (match ? getMatchLabel(match) : '?') +
                        (traffic?.reason && conflictActionable
                          ? ` — ${traffic.reason}`
                          : '')
                      }
                    >
                      <div
                        className={`h-full flex items-center justify-center overflow-hidden ${
                          groupSize > 1 ? 'px-0' : 'px-1'
                        }`}
                      >
                        {/* Status carried entirely by block fill +
                            border + any inset conflict ring; no extra
                            glyphs. Overlap blocks drop the font a tick
                            and tighten letter-spacing so a 4-char code
                            like MS17 clears the ~44 px available at
                            half-width. No ellipsis on overflow — we
                            clip to show as many characters as fit. */}
                        <span
                          className={`font-semibold whitespace-nowrap overflow-hidden tabular-nums ${styles.text} ${
                            groupSize > 1
                              ? 'text-[9px] tracking-tighter'
                              : 'text-[11px]'
                          }`}
                        >
                          {match ? getMatchLabel(match) : '?'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
