/**
 * Live Operations Grid - Compact version
 * Displays schedule with actual vs planned times, progress, and re-optimize controls
 */
import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { calculateTotalSlots, formatSlotTime } from '../../utils/timeUtils';
import { calculateScheduleProgress } from '../../utils/scheduleProgress';
import type {
  ScheduleDTO,
  MatchDTO,
  MatchStateDTO,
  TournamentConfig,
  ScheduleAssignment,
} from '../../api/dto';
import type { TrafficLightResult } from '../../utils/trafficLight';

interface LiveOperationsGridProps {
  schedule: ScheduleDTO;
  matches: MatchDTO[];
  matchStates: Record<string, MatchStateDTO>;
  config: TournamentConfig;
  overrunMatches: ScheduleAssignment[];
  impactedMatches: ScheduleAssignment[];
  onMatchSelect: (matchId: string) => void;
  onActualTimeUpdate: (matchId: string, field: 'actualStartTime' | 'actualEndTime', time: string) => void;
  currentSlot: number;
  // Stats and reoptimize
  stats?: {
    total: number;
    finished: number;
    inProgress: number;
    percentage: number;
  };
  onReoptimize?: () => void;
  isReoptimizing?: boolean;
  // Selection and impact highlighting
  selectedMatchId?: string | null;
  selectedImpactedIds?: string[];
  // Traffic lights for scheduled matches
  trafficLights?: Map<string, TrafficLightResult>;
}

const SLOT_WIDTH = 48;
const ROW_HEIGHT = 32;

function getStatusColor(status?: MatchStateDTO['status']): string {
  // Wired to the semantic status tokens from src/index.css. See the
  // sibling STATUS_STYLES in features/control-center/GanttChart.tsx —
  // both views render the same scheduled / called / live / done
  // palette so the operator's mental model carries between tabs.
  switch (status) {
    case 'called':   return 'bg-status-called-bg border-status-called/60';
    case 'started':  return 'bg-status-live-bg border-status-live/60';
    case 'finished': return 'bg-status-done-bg border-status-done/30';
    default:         return 'bg-status-idle-bg border-status-idle/40'; // scheduled or undefined
  }
}

function getMatchLabel(match: MatchDTO): string {
  if (match.matchNumber) return `M${match.matchNumber}`;
  if (match.eventRank) return match.eventRank;
  return match.id.slice(0, 4);
}

export function LiveOperationsGrid({
  schedule,
  matches,
  matchStates,
  config,
  overrunMatches,
  impactedMatches,
  onMatchSelect,
  currentSlot,
  stats,
  onReoptimize,
  isReoptimizing,
  selectedMatchId,
  selectedImpactedIds,
  trafficLights,
}: LiveOperationsGridProps) {
  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  // Calculate schedule progress (running behind indicator)
  const scheduleProgress = useMemo(() => {
    return calculateScheduleProgress(schedule, matchStates, config, currentSlot);
  }, [schedule, matchStates, config, currentSlot]);

  // Calculate total slots (handles overnight schedules)
  const totalSlots = calculateTotalSlots(config);

  const slotLabels = useMemo(() => {
    return Array.from({ length: totalSlots }, (_, i) => formatSlotTime(i, config));
  }, [totalSlots, config]);

  const courtAssignments = useMemo(() => {
    const byCourtMap = new Map<number, ScheduleAssignment[]>();
    for (let c = 1; c <= config.courtCount; c++) {
      byCourtMap.set(c, []);
    }
    for (const assignment of schedule.assignments) {
      const courtList = byCourtMap.get(assignment.courtId) || [];
      courtList.push(assignment);
      byCourtMap.set(assignment.courtId, courtList);
    }
    return byCourtMap;
  }, [schedule.assignments, config.courtCount]);

  const overrunMatchIds = useMemo(() => new Set(overrunMatches.map((a) => a.matchId)), [overrunMatches]);
  const impactedMatchIds = useMemo(() => new Set(impactedMatches.map((a) => a.matchId)), [impactedMatches]);
  const selectedImpactedSet = useMemo(() => new Set(selectedImpactedIds || []), [selectedImpactedIds]);

  // Count delayed matches (explicitly marked OR time-based)
  const delayedCount = useMemo(() => {
    return schedule.assignments.filter((a) => {
      const state = matchStates[a.matchId];
      const isExplicitlyDelayed = state?.delayed === true;
      const isTimeDelayed = currentSlot > a.slotId && (!state || state.status === 'scheduled' || state.status === 'called');
      return isExplicitlyDelayed || isTimeDelayed;
    }).length;
  }, [schedule.assignments, matchStates, currentSlot]);

  const hasImpacts = overrunMatches.length > 0 || impactedMatches.length > 0 || delayedCount > 0;

  return (
    <div className="bg-card rounded border border-border overflow-hidden">
      {/* Header with progress, stats, legend, and reoptimize */}
      <div className="px-2 py-1 border-b border-border bg-muted/40 flex items-center gap-3 text-xs">
        {/* Progress bar */}
        {stats && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all"
                  style={{ width: `${stats.percentage}%` }}
                />
              </div>
              <span className="text-muted-foreground font-medium">{stats.percentage}%</span>
            </div>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">
              <span className="text-green-600 font-medium">{stats.finished}</span>
              <span className="text-muted-foreground">/</span>
              {stats.total}
            </span>
            {stats.inProgress > 0 && (
              <span className="text-blue-600">{stats.inProgress} active</span>
            )}
          </>
        )}

        {/* Running Behind Indicator */}
        {scheduleProgress.overdueCount > 0 && (
          <>
            <span className="text-muted-foreground/60">|</span>
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                scheduleProgress.status === 'significantly_behind'
                  ? 'bg-red-100 text-red-700'
                  : scheduleProgress.status === 'behind'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-green-100 text-green-700'
              }`}
              title={`${scheduleProgress.overdueCount} match${scheduleProgress.overdueCount > 1 ? 'es' : ''} overdue`}
            >
              {scheduleProgress.status === 'significantly_behind' && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              )}
              {scheduleProgress.description}
            </span>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Legend */}
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-green-500" />Ready
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />Resting
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-red-500" />Blocked
        </span>
        <span className="text-muted-foreground/60">|</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="w-2 h-2 rounded ring-2 ring-yellow-500 bg-muted" />Late
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="w-2 h-2 rounded ring-2 ring-blue-500 bg-muted" />Selected
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="w-2 h-2 rounded ring-2 ring-red-500 bg-muted" />Impacted
        </span>

        {/* Re-optimize button */}
        {onReoptimize && (
          <button
            onClick={onReoptimize}
            disabled={isReoptimizing || !hasImpacts}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              isReoptimizing || !hasImpacts
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isReoptimizing ? 'Optimizing...' : 'Re-optimize'}
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Time header */}
          <div className="flex border-b border-border">
            <div className="w-12 flex-shrink-0 px-1 py-0.5 bg-muted/40 text-xs text-muted-foreground" />
            {slotLabels.map((label, i) => (
              <div
                key={i}
                style={{ width: SLOT_WIDTH }}
                className={`flex-shrink-0 px-0.5 py-0.5 text-center text-xs border-l border-border/60 ${
                  i === currentSlot ? 'bg-blue-100 font-medium text-blue-700' : 'bg-muted/40 text-muted-foreground'
                }`}
              >
                {i % 2 === 0 ? label : ''}
              </div>
            ))}
          </div>

          {/* Court rows */}
          {Array.from({ length: config.courtCount }, (_, i) => i + 1).map((courtId) => (
            <div key={courtId} className="flex border-b border-border/60">
              <div className="w-12 flex-shrink-0 px-1 bg-muted/40 text-xs font-medium text-muted-foreground flex items-center">
                C{courtId}
              </div>
              <div className="flex-1 relative" style={{ height: ROW_HEIGHT }}>
                <div className="absolute inset-0 flex">
                  {slotLabels.map((_, i) => (
                    <div
                      key={i}
                      style={{ width: SLOT_WIDTH }}
                      className={`flex-shrink-0 border-l border-border/60 ${
                        i === currentSlot ? 'bg-blue-50' : ''
                      }`}
                    />
                  ))}
                </div>

                {(courtAssignments.get(courtId) || []).map((assignment) => {
                  const match = matchMap.get(assignment.matchId);
                  const state = matchStates[assignment.matchId];
                  const isOverrun = overrunMatchIds.has(assignment.matchId);
                  const isImpacted = impactedMatchIds.has(assignment.matchId);
                  const isSelected = selectedMatchId === assignment.matchId;
                  const isSelectedImpact = selectedImpactedSet.has(assignment.matchId);
                  const trafficLight = trafficLights?.get(assignment.matchId);

                  // Check if match is delayed: explicitly marked OR time-based
                  const isExplicitlyDelayed = state?.delayed === true;
                  const isTimeDelayed = currentSlot > assignment.slotId &&
                    (!state || state.status === 'scheduled' || state.status === 'called');
                  const isDelayed = isExplicitlyDelayed || isTimeDelayed;

                  const left = assignment.slotId * SLOT_WIDTH;
                  const width = assignment.durationSlots * SLOT_WIDTH - 2;

                  // Priority: selected > selected impact > overrun > delayed > impacted
                  let borderClass = '';
                  if (isSelected) borderClass = 'ring-2 ring-blue-500 ring-offset-1';
                  else if (isSelectedImpact) borderClass = 'ring-2 ring-red-500 ring-offset-1';
                  else if (isOverrun) borderClass = 'ring-2 ring-red-500';
                  else if (isDelayed) borderClass = 'ring-2 ring-yellow-500';
                  else if (isImpacted) borderClass = 'ring-2 ring-orange-400';

                  // Status icon for started/finished
                  let statusIcon = null;
                  if (state?.status === 'finished') {
                    statusIcon = (
                      <Check aria-label="Finished" className="h-3.5 w-3.5 text-green-600" />
                    );
                  } else if (state?.status === 'started') {
                    statusIcon = (
                      <span
                        aria-label="In progress"
                        className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"
                      />
                    );
                  }

                  // Traffic light indicator for scheduled/called matches
                  let trafficLightDot = null;
                  if (trafficLight && (!state || state.status === 'scheduled' || state.status === 'called')) {
                    const dotColor = trafficLight.status === 'green'
                      ? 'bg-green-500'
                      : trafficLight.status === 'yellow'
                        ? 'bg-yellow-500'
                        : 'bg-red-500';
                    trafficLightDot = <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />;
                  }

                  // Build tooltip
                  const matchLabel = match ? getMatchLabel(match) : assignment.matchId;
                  const tooltip = trafficLight?.reason
                    ? `${matchLabel}: ${trafficLight.reason}`
                    : matchLabel;

                  return (
                    <div
                      key={assignment.matchId}
                      className={`absolute top-0.5 rounded border cursor-pointer hover:brightness-95 ${getStatusColor(state?.status)} ${borderClass}`}
                      style={{ left, width, height: ROW_HEIGHT - 4 }}
                      onClick={() => onMatchSelect(assignment.matchId)}
                      title={tooltip}
                    >
                      <div className="px-1 h-full flex items-center gap-0.5 overflow-hidden">
                        {trafficLightDot}
                        {statusIcon}
                        <span className="text-xs font-medium truncate">
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
