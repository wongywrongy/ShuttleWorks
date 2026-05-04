/**
 * Live timeline grid showing matches as blocks on a court x timeslot grid
 * Compact design consistent with LiveOperationsGrid
 */
import { useMemo, useEffect, useState, useRef } from 'react';
import { calculateTotalSlots, formatSlotTime } from '../../../lib/time';
import { indexById } from '../../../store/selectors';
import type { ScheduleAssignment, MatchDTO, PlayerDTO, TournamentConfig } from '../../../api/dto';

interface LiveTimelineGridProps {
  assignments: ScheduleAssignment[];
  matches: MatchDTO[];
  players: PlayerDTO[];
  config: TournamentConfig;
  status?: 'solving' | 'complete' | 'error';
}

const SLOT_WIDTH = 48;
const ROW_HEIGHT = 32;

// Event type colors - block style consistent with LiveOperationsGrid
const EVENT_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  MS: { bg: 'bg-blue-100', border: 'border-blue-300', label: "Men's Singles" },
  WS: { bg: 'bg-pink-100', border: 'border-pink-300', label: "Women's Singles" },
  MD: { bg: 'bg-green-100', border: 'border-green-300', label: "Men's Doubles" },
  WD: { bg: 'bg-purple-100', border: 'border-purple-300', label: "Women's Doubles" },
  XD: { bg: 'bg-orange-100', border: 'border-orange-300', label: "Mixed Doubles" },
};

const DEFAULT_COLOR = { bg: 'bg-muted', border: 'border-border', label: 'Unknown' };

export function LiveTimelineGrid({
  assignments,
  matches,
  players,
  config,
  status = 'solving',
}: LiveTimelineGridProps) {
  // Track which assignments are "new" for animation purposes
  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());
  const prevAssignmentsRef = useRef<string[]>([]);

  // Build lookup maps
  const matchMap = useMemo(() => indexById(matches), [matches]);
  const playerMap = useMemo(() => indexById(players), [players]);

  // Calculate time slots (handles overnight schedules)
  const totalSlots = useMemo(() => calculateTotalSlots(config), [config]);

  // Generate slot labels
  const slotLabels = useMemo(() => {
    return Array.from({ length: totalSlots }, (_, i) => formatSlotTime(i, config));
  }, [totalSlots, config]);

  // Determine visible slot range (only show slots that have matches)
  const { minSlot, maxSlot } = useMemo(() => {
    if (assignments.length === 0) return { minSlot: 0, maxSlot: Math.min(12, totalSlots) };
    const slots = assignments.map(a => a.slotId);
    const endSlots = assignments.map(a => a.slotId + a.durationSlots);
    return {
      minSlot: Math.max(0, Math.min(...slots) - 1),
      maxSlot: Math.min(totalSlots, Math.max(...endSlots) + 1),
    };
  }, [assignments, totalSlots]);

  const visibleSlots = maxSlot - minSlot;
  const courts = Array.from({ length: config.courtCount }, (_, i) => i + 1);

  // Build court assignments map
  const courtAssignments = useMemo(() => {
    const byCourtMap = new Map<number, ScheduleAssignment[]>();
    for (let c = 1; c <= config.courtCount; c++) {
      byCourtMap.set(c, []);
    }
    for (const assignment of assignments) {
      const courtList = byCourtMap.get(assignment.courtId) || [];
      courtList.push(assignment);
      byCourtMap.set(assignment.courtId, courtList);
    }
    return byCourtMap;
  }, [assignments, config.courtCount]);

  // Track new assignments for animation
  useEffect(() => {
    const currentIds = assignments.map(a => a.matchId);
    const prevIds = prevAssignmentsRef.current;
    const newIds = currentIds.filter(id => !prevIds.includes(id));

    if (newIds.length > 0) {
      // Add new IDs to animated set with minimal stagger
      newIds.forEach((id, index) => {
        setTimeout(() => {
          setAnimatedIds(prev => new Set([...prev, id]));
        }, index * 10);
      });
    }

    prevAssignmentsRef.current = currentIds;
  }, [assignments]);

  // Get event type from eventRank (e.g., "MS1" -> "MS")
  const getEventType = (eventRank: string | null | undefined): string => {
    if (!eventRank) return '';
    return eventRank.replace(/[0-9]/g, '');
  };

  // Get colors for a match based on event type
  const getMatchColors = (matchId: string) => {
    const match = matchMap.get(matchId);
    if (!match?.eventRank) return DEFAULT_COLOR;
    const eventType = getEventType(match.eventRank);
    return EVENT_COLORS[eventType] || DEFAULT_COLOR;
  };

  // Get match label for display
  const getMatchLabel = (match: MatchDTO): string => {
    if (match.matchNumber) return `M${match.matchNumber}`;
    if (match.eventRank) return match.eventRank;
    return match.id.slice(0, 4);
  };

  // Get detailed tooltip for a match
  const getMatchTooltip = (matchId: string, assignment: ScheduleAssignment) => {
    const match = matchMap.get(matchId);
    if (!match) return matchId;

    const lines: string[] = [];
    if (match.eventRank) {
      const eventType = getEventType(match.eventRank);
      const eventConfig = EVENT_COLORS[eventType];
      const eventLabel = eventConfig?.label || eventType;
      lines.push(`${eventLabel} #${match.eventRank.replace(/[^0-9]/g, '')}`);
    }

    const sideANames = match.sideA?.map(id => playerMap.get(id)?.name || 'Unknown').join(', ');
    const sideBNames = match.sideB?.map(id => playerMap.get(id)?.name || 'Unknown').join(', ');
    if (sideANames) lines.push(`A: ${sideANames}`);
    if (sideBNames) lines.push(`B: ${sideBNames}`);

    const time = formatSlotTime(assignment.slotId, config);
    const duration = assignment.durationSlots * config.intervalMinutes;
    lines.push(`Court ${assignment.courtId} @ ${time} (${duration} min)`);

    return lines.join('\n');
  };

  if (assignments.length === 0) {
    return (
      <div className="bg-muted/40 rounded border border-border p-4 text-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
          <div className="text-xs">Waiting for first solution...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded border border-border overflow-hidden">
      {/* Header with legend and status */}
      <div className="px-2 py-1 border-b border-border bg-muted/40 flex items-center gap-3 text-xs">
        {/* Legend */}
        {Object.entries(EVENT_COLORS).map(([key, { bg, border, label }]) => (
          <span key={key} className="flex items-center gap-1 text-muted-foreground" title={label}>
            <span className={`w-2.5 h-2.5 rounded ${bg} border ${border}`}></span>
            {key}
          </span>
        ))}

        <div className="flex-1" />

        {/* Status */}
        {status === 'solving' && (
          <span className="flex items-center gap-1 text-blue-600">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
            Optimizing
          </span>
        )}
        {status === 'complete' && (
          <span className="flex items-center gap-1 text-green-600">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Complete
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Time header */}
          <div className="flex border-b border-border">
            <div className="w-12 flex-shrink-0 px-1 py-0.5 bg-muted/40 text-xs text-muted-foreground" />
            {Array.from({ length: visibleSlots }, (_, i) => minSlot + i).map((slot, i) => (
              <div
                key={slot}
                style={{ width: SLOT_WIDTH }}
                className="flex-shrink-0 px-0.5 py-0.5 text-center text-xs border-l border-border/60 bg-muted/40 text-muted-foreground"
              >
                {i % 2 === 0 ? slotLabels[slot] : ''}
              </div>
            ))}
          </div>

          {/* Court rows */}
          {courts.map(courtId => (
            <div key={courtId} className="flex border-b border-border/60">
              <div className="w-12 flex-shrink-0 px-1 bg-muted/40 text-xs font-medium text-muted-foreground flex items-center">
                C{courtId}
              </div>
              <div className="flex-1 relative" style={{ height: ROW_HEIGHT }}>
                {/* Slot grid lines */}
                <div className="absolute inset-0 flex">
                  {Array.from({ length: visibleSlots }, (_, i) => minSlot + i).map(slot => (
                    <div
                      key={slot}
                      style={{ width: SLOT_WIDTH }}
                      className="flex-shrink-0 border-l border-border/60"
                    />
                  ))}
                </div>

                {/* Match blocks */}
                {(courtAssignments.get(courtId) || []).map(assignment => {
                  const match = matchMap.get(assignment.matchId);
                  const colors = getMatchColors(assignment.matchId);
                  const isAnimated = animatedIds.has(assignment.matchId);

                  // Calculate position relative to visible range
                  const left = (assignment.slotId - minSlot) * SLOT_WIDTH;
                  const width = assignment.durationSlots * SLOT_WIDTH - 2;

                  return (
                    <div
                      key={assignment.matchId}
                      className={`absolute top-0.5 rounded border cursor-default hover:brightness-95
                        ${colors.bg} ${colors.border}
                        transition-[opacity,transform] duration-150 ease-brand
                        ${isAnimated ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                      style={{ left, width, height: ROW_HEIGHT - 4 }}
                      title={getMatchTooltip(assignment.matchId, assignment)}
                    >
                      <div className="px-1 h-full flex items-center overflow-hidden">
                        <span className="text-xs font-medium truncate text-foreground">
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
