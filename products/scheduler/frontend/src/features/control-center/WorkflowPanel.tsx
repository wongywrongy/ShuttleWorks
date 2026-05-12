/**
 * Workflow Panel — operator state machine view.
 *
 * Top: pinned "In Progress" strip (collapses when no active matches).
 * Bottom: tabbed Up Next / Finished list. Single inline search filters
 * all three lists simultaneously by event code or player name.
 *
 * The three card types (InProgress, Up Next, Finished) each own their
 * lifecycle button row, optimistic-update spinner state, and trafficLight-
 * tinted left border. They live in `./workflowPanel/`.
 */
import { useState, useMemo } from 'react';
import type {
  ScheduleAssignment,
  MatchDTO,
  MatchStateDTO,
  TournamentConfig,
  PlayerDTO,
} from '../../api/dto';
import type { TrafficLightResult } from '../../utils/trafficLight';
import { InlineSearch } from '../../components/InlineSearch';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { InProgressCard } from './workflowPanel/InProgressCard';
import { UpNextCard } from './workflowPanel/UpNextCard';
import { FinishedCard } from './workflowPanel/FinishedCard';

interface WorkflowPanelProps {
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
  onUpdateStatus: (
    matchId: string,
    status: MatchStateDTO['status'],
    additionalData?: Partial<MatchStateDTO>,
  ) => Promise<void>;
  onConfirmPlayer?: (matchId: string, playerId: string, confirmed: boolean) => Promise<void>;
  selectedMatchId?: string | null;
  onSelectMatch?: (matchId: string) => void;
  trafficLights?: Map<string, TrafficLightResult>;
  playerNames: Map<string, string>;
  players?: PlayerDTO[];
  onSubstitute?: (matchId: string, oldPlayerId: string, newPlayerId: string) => void;
  onRemovePlayer?: (matchId: string, playerId: string) => void;
  onCascadingStart?: (matchId: string, courtId: number) => void;
  onUndoStart?: (matchId: string) => void;
  /** Request the side-rail score editor for a match. Selects the
   *  match and pops the panel into score-mode. */
  onRequestScore?: (matchId: string) => void;
}

export function WorkflowPanel({
  matchesByStatus,
  matches,
  matchStates,
  config,
  currentSlot,
  onUpdateStatus,
  onConfirmPlayer,
  selectedMatchId,
  onSelectMatch,
  trafficLights,
  playerNames,
  onCascadingStart,
  onUndoStart,
  onRequestScore,
}: WorkflowPanelProps) {
  const [activeTab, setActiveTab] = useState<'up_next' | 'finished'>('up_next');

  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const calledIds = useMemo(
    () => new Set(matchesByStatus.called.map((a) => a.matchId)),
    [matchesByStatus.called],
  );

  const playerDelayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    Object.values(matchStates).forEach((state) => {
      if (state.delayedPlayerId) {
        const current = counts.get(state.delayedPlayerId) || 0;
        counts.set(state.delayedPlayerId, current + 1);
      }
    });
    return counts;
  }, [matchStates]);

  // Sort Up Next by: called first → time slot → court number.
  const upNextSorted = useMemo(() => {
    return [...matchesByStatus.called, ...matchesByStatus.scheduled].sort((a, b) => {
      const aIsCalled = calledIds.has(a.matchId);
      const bIsCalled = calledIds.has(b.matchId);
      if (aIsCalled && !bIsCalled) return -1;
      if (!aIsCalled && bIsCalled) return 1;
      if (a.slotId !== b.slotId) return a.slotId - b.slotId;
      return a.courtId - b.courtId;
    });
  }, [matchesByStatus.called, matchesByStatus.scheduled, calledIds]);

  const finishedSorted = useMemo(
    () => [...matchesByStatus.finished].sort((a, b) => b.slotId - a.slotId),
    [matchesByStatus.finished],
  );
  const startedSorted = useMemo(
    () => [...matchesByStatus.started].sort((a, b) => a.slotId - b.slotId),
    [matchesByStatus.started],
  );

  // Free-text search across event code + player names. Applies to
  // every list in the panel so the operator can sweep one player
  // through their whole state machine without losing them.
  const [searchQuery, setSearchQuery] = useSearchParamState('q', '');
  const filterByQuery = (list: ScheduleAssignment[]) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter((a) => {
      const m = matchMap.get(a.matchId);
      if (!m) return false;
      if ((m.eventRank ?? '').toLowerCase().includes(q)) return true;
      const allIds = [...m.sideA, ...m.sideB, ...(m.sideC ?? [])];
      return allIds.some((id) => (playerNames.get(id) ?? '').toLowerCase().includes(q));
    });
  };
  const startedFiltered = filterByQuery(startedSorted);
  const upNextFiltered = filterByQuery(upNextSorted);
  const finishedFiltered = filterByQuery(finishedSorted);

  const hasActive = startedFiltered.length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      <div className="flex-shrink-0 border-b border-border/60 px-2 py-1.5">
        <InlineSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Search event or player…"
          showClear
          onClearAll={() => setSearchQuery('')}
        />
      </div>
      {hasActive && (
        <div className="flex-shrink-0 border-b border-border/60">
          <div className="px-2 py-1.5 flex items-center justify-between border-b border-border/60">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                In Progress
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {matchesByStatus.started.length} active
            </span>
          </div>
          <div className="p-1.5 max-h-44 overflow-auto">
            {startedFiltered.map((assignment) => (
              <InProgressCard
                key={assignment.matchId}
                assignment={assignment}
                match={matchMap.get(assignment.matchId)}
                matchState={matchStates[assignment.matchId]}
                playerNames={playerNames}
                isSelected={selectedMatchId === assignment.matchId}
                onSelect={() => onSelectMatch?.(assignment.matchId)}
                onUpdateStatus={onUpdateStatus}
                onUndoStart={onUndoStart}
                onRequestScore={onRequestScore}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-border/60 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('up_next')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                activeTab === 'up_next'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              Up Next ({upNextFiltered.length}
              {searchQuery ? `/${upNextSorted.length}` : ''})
            </button>
            <button
              onClick={() => setActiveTab('finished')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                activeTab === 'finished'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              Finished ({finishedFiltered.length}
              {searchQuery ? `/${finishedSorted.length}` : ''})
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {activeTab === 'up_next' &&
            (upNextFiltered.length === 0 ? (
              <div className="text-center text-muted-foreground text-[10px] py-4">
                {searchQuery && upNextSorted.length > 0
                  ? 'No match for current search'
                  : 'No matches pending'}
              </div>
            ) : (
              upNextFiltered.map((assignment) => (
                <UpNextCard
                  key={assignment.matchId}
                  assignment={assignment}
                  match={matchMap.get(assignment.matchId)}
                  matchState={matchStates[assignment.matchId]}
                  playerNames={playerNames}
                  playerDelayCounts={playerDelayCounts}
                  trafficLight={trafficLights?.get(assignment.matchId)}
                  isSelected={selectedMatchId === assignment.matchId}
                  isCalled={calledIds.has(assignment.matchId)}
                  config={config}
                  currentSlot={currentSlot}
                  onSelect={() => onSelectMatch?.(assignment.matchId)}
                  onUpdateStatus={onUpdateStatus}
                  onConfirmPlayer={onConfirmPlayer}
                  onCascadingStart={onCascadingStart}
                />
              ))
            ))}
          {activeTab === 'finished' &&
            (finishedFiltered.length === 0 ? (
              <div className="text-center text-muted-foreground text-xs py-4">
                {searchQuery && finishedSorted.length > 0
                  ? 'No match for current search'
                  : 'No completed matches'}
              </div>
            ) : (
              finishedFiltered.map((assignment) => (
                <FinishedCard
                  key={assignment.matchId}
                  assignment={assignment}
                  match={matchMap.get(assignment.matchId)}
                  matchState={matchStates[assignment.matchId]}
                  playerNames={playerNames}
                  isSelected={selectedMatchId === assignment.matchId}
                  onSelect={() => onSelectMatch?.(assignment.matchId)}
                  onUpdateStatus={onUpdateStatus}
                />
              ))
            ))}
        </div>
      </div>
    </div>
  );
}
