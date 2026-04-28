/**
 * Workflow View
 * Horizontal three-column layout for managing match status transitions
 * Shows all matches, grays out those not in current slot
 * Sorts Up Next by traffic light status (green first, then yellow, then red)
 */
import { useMemo } from 'react';
import { MatchStatusCard } from '../tracking/MatchStatusCard';
import { InlineSearch } from '../../components/InlineSearch';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { usePlayerNames } from '../../hooks/usePlayerNames';
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

  // Free-text search across event code + player names. Applies to all
  // three columns simultaneously so the operator can sweep a player
  // through their state machine without losing them as the card moves
  // between columns.
  const [searchQuery, setSearchQuery] = useSearchParamState('q', '');
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const { getPlayerNames } = usePlayerNames();

  const filterByQuery = (list: ScheduleAssignment[]) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter((assignment) => {
      const m = matchById.get(assignment.matchId);
      if (!m) return false;
      if ((m.eventRank ?? '').toLowerCase().includes(q)) return true;
      const allIds = [...m.sideA, ...m.sideB, ...(m.sideC ?? [])];
      return getPlayerNames(allIds).some((n) => n.toLowerCase().includes(q));
    });
  };

  // Apply search to each column's sorted list so the cards survive
  // the filter, but the In Progress / Up Next / Finished partition
  // and ordering stay intact.
  const startedFiltered = filterByQuery(startedSorted);
  const upNextFiltered = filterByQuery(upNextSorted);
  const finishedFiltered = filterByQuery(finishedSorted);

  return (
    <div className="flex h-full flex-col overflow-hidden gap-2">
      <div className="flex-shrink-0">
        <InlineSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Search event or player…"
          showClear
          onClearAll={() => setSearchQuery('')}
        />
      </div>
      <div className="flex-1 grid grid-cols-3 gap-2 overflow-hidden">
      {/* In Progress */}
      <div className="flex flex-col min-h-0">
        <div className="flex items-center gap-1 mb-1 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs font-semibold text-foreground">In Progress</span>
          <span className="text-xs text-muted-foreground">({matchesByStatus.started.length})</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {startedFiltered.length === 0 ? (
            <div className="bg-muted/40 rounded p-2 text-center text-muted-foreground text-xs">
              {searchQuery && startedSorted.length > 0 ? 'No match' : 'None'}
            </div>
          ) : (
            startedFiltered.map((assignment) => (
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
          {upNextFiltered.length === 0 ? (
            <div className="bg-muted/40 rounded p-2 text-center text-muted-foreground text-xs">
              {searchQuery && upNextSorted.length > 0 ? 'No match' : 'None'}
            </div>
          ) : (
            upNextFiltered.map((assignment) => (
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
          {finishedFiltered.length === 0 ? (
            <div className="bg-muted/40 rounded p-2 text-center text-muted-foreground text-xs">
              {searchQuery && finishedSorted.length > 0 ? 'No match' : 'None'}
            </div>
          ) : (
            finishedFiltered.map((assignment) => (
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
    </div>
  );
}
