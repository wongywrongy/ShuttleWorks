/**
 * Workflow View
 * Horizontal three-column layout for managing match status transitions
 * Shows all matches, grays out those not in current slot
 * Sorts Up Next by traffic light status (green first, then yellow, then red)
 */
import { MatchStatusCard } from '../tracking/MatchStatusCard';
import type { ScheduleAssignment, MatchDTO, MatchStateDTO, TournamentConfig } from '../../api/dto';
import type { TrafficLightResult } from '../../utils/trafficLight';

interface WorkflowViewProps {
  matchesByStatus: {
    scheduled: ScheduleAssignment[];
    called: ScheduleAssignment[];
    started: ScheduleAssignment[];
    finished: ScheduleAssignment[];
  };
  matches: MatchDTO[];
  matchStates: Record<string, MatchStateDTO>;
  config: TournamentConfig | null;
  currentSlot: number;
  onUpdateStatus: (matchId: string, status: MatchStateDTO['status'], additionalData?: Partial<MatchStateDTO>) => Promise<void>;
  selectedMatchId?: string | null;
  onSelectMatch?: (matchId: string) => void;
  trafficLights?: Map<string, TrafficLightResult>;
}

export function WorkflowView({
  matchesByStatus,
  matches,
  matchStates,
  config,
  currentSlot,
  onUpdateStatus,
  selectedMatchId,
  onSelectMatch,
  trafficLights,
}: WorkflowViewProps) {
  // Sort assignments by time (slotId)
  const sortByTime = (a: ScheduleAssignment, b: ScheduleAssignment) => a.slotId - b.slotId;

  const startedSorted = [...matchesByStatus.started].sort(sortByTime);
  const finishedSorted = [...matchesByStatus.finished].sort(sortByTime).reverse(); // Most recent first

  // Combine called and scheduled for "Up Next"
  // Sort by: 1) called first, 2) traffic light (green > yellow > red), 3) time
  const calledIds = new Set(matchesByStatus.called.map(a => a.matchId));
  const trafficPriority: Record<string, number> = { green: 0, yellow: 1, red: 2 };

  const upNextSorted = [...matchesByStatus.called, ...matchesByStatus.scheduled].sort((a, b) => {
    // Called matches always come first
    const aIsCalled = calledIds.has(a.matchId);
    const bIsCalled = calledIds.has(b.matchId);
    if (aIsCalled && !bIsCalled) return -1;
    if (!aIsCalled && bIsCalled) return 1;

    // For non-called matches, sort by traffic light status
    if (!aIsCalled && !bIsCalled && trafficLights) {
      const aLight = trafficLights.get(a.matchId)?.status || 'green';
      const bLight = trafficLights.get(b.matchId)?.status || 'green';
      const priorityDiff = trafficPriority[aLight] - trafficPriority[bLight];
      if (priorityDiff !== 0) return priorityDiff;
    }

    // Secondary: by scheduled time
    return a.slotId - b.slotId;
  });
  const upNextCount = upNextSorted.length;

  // Check if assignment is in current slot (or within 1 slot)
  const isCurrentSlot = (assignment: ScheduleAssignment) => {
    const matchEnd = assignment.slotId + assignment.durationSlots;
    return assignment.slotId <= currentSlot + 1 && matchEnd > currentSlot;
  };

  // Check if match is called (never dimmed)
  const isCalled = (assignment: ScheduleAssignment) => calledIds.has(assignment.matchId);

  return (
    <div className="h-full grid grid-cols-3 gap-2 overflow-hidden">
      {/* In Progress */}
      <div className="flex flex-col min-h-0">
        <div className="flex items-center gap-1 mb-1 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs font-semibold text-foreground">In Progress</span>
          <span className="text-xs text-muted-foreground">({matchesByStatus.started.length})</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {startedSorted.length === 0 ? (
            <div className="bg-muted/40 rounded p-2 text-center text-muted-foreground text-xs">
              None
            </div>
          ) : (
            startedSorted.map((assignment) => (
              <MatchStatusCard
                key={assignment.matchId}
                assignment={assignment}
                match={matches.find((m) => m.id === assignment.matchId)}
                matchState={matchStates[assignment.matchId]}
                config={config}
                onUpdateStatus={onUpdateStatus}
                dimmed={false}
                onSelect={onSelectMatch}
                selected={selectedMatchId === assignment.matchId}
                currentSlot={currentSlot}
              />
            ))
          )}
        </div>
      </div>

      {/* Up Next - all matches sorted by time */}
      <div className="flex flex-col min-h-0">
        <div className="flex items-center gap-1 mb-1 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-xs font-semibold text-foreground">Up Next</span>
          <span className="text-xs text-muted-foreground">({upNextCount})</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {upNextSorted.length === 0 ? (
            <div className="bg-muted/40 rounded p-2 text-center text-muted-foreground text-xs">
              None
            </div>
          ) : (
            upNextSorted.map((assignment) => (
              <MatchStatusCard
                key={assignment.matchId}
                assignment={assignment}
                match={matches.find((m) => m.id === assignment.matchId)}
                matchState={matchStates[assignment.matchId]}
                config={config}
                onUpdateStatus={onUpdateStatus}
                dimmed={!isCalled(assignment) && !isCurrentSlot(assignment)}
                onSelect={onSelectMatch}
                selected={selectedMatchId === assignment.matchId}
                currentSlot={currentSlot}
                trafficLight={trafficLights?.get(assignment.matchId)}
              />
            ))
          )}
        </div>
      </div>

      {/* Finished - show all */}
      <div className="flex flex-col min-h-0">
        <div className="flex items-center gap-1 mb-1 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-xs font-semibold text-foreground">Finished</span>
          <span className="text-xs text-muted-foreground">({matchesByStatus.finished.length})</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {finishedSorted.length === 0 ? (
            <div className="bg-muted/40 rounded p-2 text-center text-muted-foreground text-xs">
              None
            </div>
          ) : (
            finishedSorted.map((assignment) => (
              <MatchStatusCard
                key={assignment.matchId}
                assignment={assignment}
                match={matches.find((m) => m.id === assignment.matchId)}
                matchState={matchStates[assignment.matchId]}
                config={config}
                onUpdateStatus={onUpdateStatus}
                dimmed={false}
                onSelect={onSelectMatch}
                selected={selectedMatchId === assignment.matchId}
                currentSlot={currentSlot}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
