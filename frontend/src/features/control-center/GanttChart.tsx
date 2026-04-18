/**
 * Gantt Chart - Status-Based Colors
 * Shows match status at a glance: Scheduled, Called, In Progress, Finished
 * Delayed matches get a yellow ring to stand out
 */
import { useMemo, useEffect, useState, useRef } from 'react';
import { calculateTotalSlots, formatSlotTime } from '../../utils/timeUtils';
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
}

const SLOT_WIDTH = 48;
const ROW_HEIGHT = 32;

// Status-based colors - intuitive and distinct
const STATUS_STYLES = {
  scheduled: {
    bg: 'bg-gray-100',
    border: 'border-gray-300',
    text: 'text-gray-600',
  },
  called: {
    bg: 'bg-blue-100',
    border: 'border-blue-400',
    text: 'text-blue-700',
  },
  started: {
    bg: 'bg-green-200',
    border: 'border-green-500',
    text: 'text-green-800',
  },
  finished: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-400',
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
    // Sort by time
    byCourtMap.forEach((assignments) => {
      assignments.sort((a, b) => a.slotId - b.slotId);
    });
    return byCourtMap;
  }, [schedule.assignments, config.courtCount, matchStates]);

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
          {/* Time header */}
          <div className="flex border-b border-gray-200">
            <div className="w-10 flex-shrink-0 px-1 py-0.5 bg-gray-50 text-xs text-gray-500" />
            {Array.from({ length: visibleSlots }, (_, i) => minSlot + i).map((slot, i) => (
              <div
                key={slot}
                style={{ width: SLOT_WIDTH }}
                className={`flex-shrink-0 px-0.5 py-0.5 text-center text-[10px] border-l border-gray-100 bg-gray-50 text-gray-400 ${
                  slot === currentSlot ? 'bg-blue-50 text-blue-600 font-medium' : ''
                }`}
              >
                {i % 2 === 0 ? slotLabels[slot] : ''}
              </div>
            ))}
          </div>

          {/* Court rows */}
          {courts.map(courtId => (
            <div key={courtId} className="flex border-b border-gray-100">
              <div className="w-10 flex-shrink-0 px-1 bg-gray-50 text-xs font-medium text-gray-600 flex items-center">
                C{courtId}
              </div>
              <div className="flex-1 relative" style={{ height: ROW_HEIGHT }}>
                {/* Slot grid lines */}
                <div className="absolute inset-0 flex">
                  {Array.from({ length: visibleSlots }, (_, i) => minSlot + i).map(slot => (
                    <div
                      key={slot}
                      style={{ width: SLOT_WIDTH }}
                      className={`flex-shrink-0 border-l border-gray-100 ${
                        slot === currentSlot ? 'bg-blue-50/30' : ''
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

                  // Determine which inset ring to show (priority: selected > impacted > postponed > late)
                  let ringClass = '';
                  if (isSelected) {
                    ringClass = 'ring-2 ring-inset ring-blue-500';
                  } else if (isImpacted) {
                    ringClass = 'ring-2 ring-inset ring-purple-500';
                  } else if (isPostponed) {
                    ringClass = 'ring-2 ring-inset ring-red-400';
                  } else if (isLate) {
                    ringClass = 'ring-2 ring-inset ring-yellow-400';
                  }

                  // Calculate position
                  const left = (assignment.slotId - minSlot) * SLOT_WIDTH;
                  const width = Math.max(48, assignment.durationSlots * SLOT_WIDTH - 2);

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
                      title={match ? getMatchLabel(match) : '?'}
                    >
                      <div className="px-1.5 h-full flex items-center gap-1 overflow-hidden">
                        {/* Pulsing dot for in-progress */}
                        {isInProgress && (
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                        )}
                        {/* Checkmark for finished */}
                        {status === 'finished' && (
                          <span className="text-gray-400 text-[10px] flex-shrink-0">✓</span>
                        )}
                        <span className={`text-[11px] font-medium truncate ${styles.text}`}>
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
