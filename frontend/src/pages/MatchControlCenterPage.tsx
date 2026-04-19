/**
 * Match Control Center Page
 *
 * Redesigned to mirror the Schedule page's shell:
 *   - Header bar with progress metrics + actions
 *   - Gantt pane in a rounded card
 *   - Matches pane (WorkflowPanel, flattened to a single column) below
 *   - Collapsible Match Details sidebar on the right
 *
 * The old legend strip and separate Suggested Next dock were removed —
 * status colours on the Gantt plus the "Up Next" ordering inside the
 * workflow panel already surface the same information.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useLiveTracking } from '../hooks/useLiveTracking';
import { useLiveOperations } from '../hooks/useLiveOperations';
import { useTrafficLights } from '../hooks/useTrafficLights';
import { useAppStore } from '../store/appStore';
import { GanttChart } from '../features/control-center/GanttChart';
import { WorkflowPanel } from '../features/control-center/WorkflowPanel';
import { MatchDetailsPanel } from '../features/control-center/MatchDetailsPanel';

export function MatchControlCenterPage() {
  const liveTracking = useLiveTracking();
  const liveOps = useLiveOperations();
  const players = useAppStore((state) => state.players);
  const schedule = useAppStore((state) => state.schedule);
  const setSchedule = useAppStore((state) => state.setSchedule);
  const setMatchState = useAppStore((state) => state.setMatchState);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [currentSlot, setCurrentSlot] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Update current slot every minute
  useEffect(() => {
    setCurrentSlot(liveOps.getCurrentSlot());
    const interval = setInterval(() => {
      setCurrentSlot(liveOps.getCurrentSlot());
    }, 60000);
    return () => clearInterval(interval);
  }, [liveOps.getCurrentSlot]);

  // When the user picks a match, auto-open the details sidebar.
  useEffect(() => {
    if (selectedMatchId) setDetailsOpen(true);
  }, [selectedMatchId]);

  // Compute traffic light status for all matches
  const trafficLights = useTrafficLights(
    liveOps.schedule,
    liveOps.matches,
    liveOps.matchStates,
    players,
    liveOps.config,
    currentSlot
  );

  // Player names map for display
  const playerNames = useMemo(() => {
    return new Map(players.map((p) => [p.id, p.name]));
  }, [players]);

  // Get selected match data
  const selectedMatch = selectedMatchId
    ? liveOps.matches.find((m) => m.id === selectedMatchId)
    : undefined;
  const selectedState = selectedMatchId
    ? liveOps.matchStates[selectedMatchId]
    : undefined;
  const selectedAssignment = selectedMatchId && liveOps.schedule
    ? liveOps.schedule.assignments.find((a) => a.matchId === selectedMatchId)
    : undefined;
  const selectedAnalysis = selectedMatchId
    ? liveOps.analyzeImpact(selectedMatchId)
    : null;
  const selectedTrafficLight = selectedMatchId
    ? trafficLights.get(selectedMatchId)
    : undefined;

  // Calculate stats
  const stats = liveTracking.progressStats;

  // Count delayed matches
  const delayedCount = useMemo(() => {
    if (!liveOps.schedule) return 0;
    return liveOps.schedule.assignments.filter((a) => {
      const state = liveOps.matchStates[a.matchId];
      const isExplicitlyDelayed = state?.delayed === true;
      const isTimeDelayed = currentSlot > a.slotId &&
        (!state || state.status === 'scheduled' || state.status === 'called');
      return isExplicitlyDelayed || isTimeDelayed;
    }).length;
  }, [liveOps.schedule, liveOps.matchStates, currentSlot]);

  // Get updateMatch from store
  const updateMatch = useAppStore((state) => state.updateMatch);

  // Handle player substitution
  const handleSubstitute = useCallback((
    matchId: string,
    oldPlayerId: string,
    newPlayerId: string
  ) => {
    const match = liveOps.matches.find(m => m.id === matchId);
    if (!match) return;

    // Replace the player in sideA or sideB
    const newSideA = (match.sideA || []).map(id => id === oldPlayerId ? newPlayerId : id);
    const newSideB = (match.sideB || []).map(id => id === oldPlayerId ? newPlayerId : id);

    updateMatch(matchId, {
      sideA: newSideA,
      sideB: newSideB,
    });

    console.log(`Substituted player ${oldPlayerId} with ${newPlayerId} in match ${matchId}`);
  }, [liveOps.matches, updateMatch]);

  // Handle player removal from match
  const handleRemovePlayer = useCallback((
    matchId: string,
    playerId: string
  ) => {
    const match = liveOps.matches.find(m => m.id === matchId);
    if (!match) return;

    // Remove the player from sideA or sideB
    const newSideA = (match.sideA || []).filter(id => id !== playerId);
    const newSideB = (match.sideB || []).filter(id => id !== playerId);

    updateMatch(matchId, {
      sideA: newSideA,
      sideB: newSideB,
    });

    console.log(`Removed player ${playerId} from match ${matchId}`);
  }, [liveOps.matches, updateMatch]);

  // Handle cascading court shift when starting a match
  const handleCascadingStart = useCallback((
    matchId: string,
    courtId: number
  ) => {
    if (!schedule) return;

    // Find the assignment for this match
    const startingAssignmentIdx = schedule.assignments.findIndex(a => a.matchId === matchId);
    if (startingAssignmentIdx === -1) return;

    const startingAssignment = schedule.assignments[startingAssignmentIdx];
    const duration = startingAssignment.durationSlots;

    // Create a working copy of assignments
    const workingAssignments = schedule.assignments.map(a => ({ ...a }));

    // Find the next available slot on the target court
    // This is right after the last finished/in-progress match on that court
    let nextAvailableSlot = 0; // Start from beginning

    for (const a of workingAssignments) {
      if (a.matchId === matchId) continue;
      const state = liveOps.matchStates[a.matchId];

      // Only consider matches on the target court
      if (a.courtId !== courtId) continue;

      // If match is started or finished, we need to start after it ends
      if (state?.status === 'started' || state?.status === 'finished') {
        const matchEnd = a.slotId + a.durationSlots;
        if (matchEnd > nextAvailableSlot) {
          nextAvailableSlot = matchEnd;
        }
      }
    }

    // Store original position of the starting match
    const originalSlot = startingAssignment.slotId;
    const originalCourt = startingAssignment.courtId;

    // Move the starting match to the target court and available slot
    workingAssignments[startingAssignmentIdx] = {
      ...startingAssignment,
      slotId: nextAvailableSlot,
      courtId: courtId,
    };

    const startSlot = nextAvailableSlot;
    const endSlot = startSlot + duration;

    // Store original position in match state
    const currentStartState = liveOps.matchStates[matchId];
    setMatchState(matchId, {
      ...currentStartState,
      matchId: matchId,
      status: currentStartState?.status || 'scheduled',
      originalSlotId: originalSlot,
      originalCourtId: originalCourt,
    });

    // Now handle cascading for any conflicts on the target court
    const processedIds = new Set<string>([matchId]);
    const shiftsApplied: { matchId: string; fromSlot: number; toSlot: number }[] = [];

    // Function to find and shift conflicts
    const shiftConflicts = (blockStart: number, blockEnd: number) => {
      // Get scheduled/called matches on target court
      const courtMatches = workingAssignments
        .filter(a => {
          if (processedIds.has(a.matchId)) return false;
          const state = liveOps.matchStates[a.matchId];
          if (state?.status === 'started' || state?.status === 'finished') return false;
          return a.courtId === courtId;
        })
        .sort((a, b) => a.slotId - b.slotId);

      for (const match of courtMatches) {
        if (processedIds.has(match.matchId)) continue;

        const matchStart = match.slotId;
        const matchEnd = match.slotId + match.durationSlots;

        // Check if this match overlaps with the block
        if (matchStart < blockEnd && matchEnd > blockStart) {
          // Store original position if not already stored
          const currentState = liveOps.matchStates[match.matchId];
          if (!currentState?.originalSlotId) {
            setMatchState(match.matchId, {
              ...currentState,
              matchId: match.matchId,
              status: currentState?.status || 'scheduled',
              originalSlotId: match.slotId,
              originalCourtId: match.courtId,
            });
          }

          // Shift this match to after the block
          const oldSlot = match.slotId;
          match.slotId = blockEnd;
          shiftsApplied.push({ matchId: match.matchId, fromSlot: oldSlot, toSlot: blockEnd });
          processedIds.add(match.matchId);

          // Recursively check for new conflicts caused by this shift
          shiftConflicts(match.slotId, match.slotId + match.durationSlots);
        }
      }
    };

    // Start the cascade from the starting match's time block
    shiftConflicts(startSlot, endSlot);

    // Update schedule with working assignments
    setSchedule({
      ...schedule,
      assignments: workingAssignments,
    });

    console.log(`Started match ${matchId} on court ${courtId} at slot ${startSlot}. Shifted ${shiftsApplied.length} matches.`);
  }, [schedule, liveOps.matchStates, setSchedule, setMatchState]);

  // Handle undo start - restore match to original position
  const handleUndoStart = useCallback((matchId: string) => {
    if (!schedule) return;

    const matchState = liveOps.matchStates[matchId];

    // If no original position stored, nothing to restore
    if (matchState?.originalSlotId === undefined && matchState?.originalCourtId === undefined) {
      return;
    }

    // Find the assignment for this match
    const assignmentIdx = schedule.assignments.findIndex(a => a.matchId === matchId);
    if (assignmentIdx === -1) return;

    const currentAssignment = schedule.assignments[assignmentIdx];

    // Create a working copy of assignments
    const workingAssignments = schedule.assignments.map(a => ({ ...a }));

    // Restore this match to its original position
    const originalSlot = matchState.originalSlotId ?? currentAssignment.slotId;
    const originalCourt = matchState.originalCourtId ?? currentAssignment.courtId;

    workingAssignments[assignmentIdx] = {
      ...currentAssignment,
      slotId: originalSlot,
      courtId: originalCourt,
    };

    // Also restore any other matches on the same court that were shifted
    // (they have originalSlotId/originalCourtId set)
    for (let i = 0; i < workingAssignments.length; i++) {
      if (i === assignmentIdx) continue;

      const otherState = liveOps.matchStates[workingAssignments[i].matchId];
      // Only restore matches that were on the same original court
      if (otherState?.originalSlotId !== undefined && otherState?.originalCourtId === originalCourt) {
        workingAssignments[i] = {
          ...workingAssignments[i],
          slotId: otherState.originalSlotId,
          courtId: otherState.originalCourtId ?? workingAssignments[i].courtId,
        };

        // Clear the original position from the match state
        setMatchState(workingAssignments[i].matchId, {
          ...otherState,
          matchId: workingAssignments[i].matchId,
          status: otherState.status,
          originalSlotId: undefined,
          originalCourtId: undefined,
        });
      }
    }

    // Clear the original position from this match's state
    setMatchState(matchId, {
      ...matchState,
      matchId: matchId,
      status: matchState.status,
      originalSlotId: undefined,
      originalCourtId: undefined,
    });

    // Update schedule
    setSchedule({
      ...schedule,
      assignments: workingAssignments,
    });

    console.log(`Undid match ${matchId}, restored to slot ${originalSlot} court ${originalCourt}`);
  }, [schedule, liveOps.matchStates, setSchedule, setMatchState]);

  // No schedule state
  if (!liveTracking.schedule) {
    return (
      <div className="w-full h-[calc(100vh-56px)] flex flex-col px-2 py-1 gap-2">
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded border border-gray-200">
          <div className="text-gray-400 mb-3">
            <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 mb-1">No schedule generated.</p>
          <p className="text-xs text-gray-500">
            Generate a schedule on the{' '}
            <Link to="/schedule" className="text-blue-600 hover:underline">Schedule page</Link>
          </p>
        </div>
      </div>
    );
  }

  if (!liveTracking.config || !liveOps.config || !liveOps.schedule) {
    return (
      <div className="w-full h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-56px)] flex flex-col px-2 py-1 gap-2">
      <div className="flex-1 min-h-0 flex gap-2">
        {/* Main area - Gantt + Matches list */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Gantt panel */}
          <div className="bg-white rounded border border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
            <div className="px-2 py-1.5 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-medium text-gray-700">{stats?.percentage || 0}%</span>
                <span className="text-gray-500">
                  {stats?.finished || 0}/{stats?.total || 0} matches
                </span>
                {(stats?.inProgress || 0) > 0 && (
                  <span className="text-green-600">{stats.inProgress} active</span>
                )}
                {delayedCount > 0 && (
                  <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                    {delayedCount} late
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={liveOps.triggerReoptimize}
                  disabled={liveOps.isReoptimizing}
                  className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {liveOps.isReoptimizing ? 'Optimizing…' : 'Re-optimize'}
                </button>
              </div>
            </div>
            <div className="p-2 overflow-x-auto">
              <GanttChart
                schedule={liveOps.schedule}
                matches={liveOps.matches}
                matchStates={liveOps.matchStates}
                config={liveOps.config}
                currentSlot={currentSlot}
                selectedMatchId={selectedMatchId}
                onMatchSelect={setSelectedMatchId}
                impactedMatchIds={selectedAnalysis?.directlyImpacted}
              />
            </div>
          </div>

          {/* Matches panel (workflow: In Progress pinned + tabbed Up Next/Finished) */}
          <div className="flex-1 min-h-0 bg-white rounded border border-gray-200 flex flex-col overflow-hidden">
            <WorkflowPanel
              matchesByStatus={liveTracking.matchesByStatus}
              matches={liveTracking.matches}
              matchStates={liveTracking.matchStates}
              config={liveTracking.config}
              currentSlot={currentSlot}
              onUpdateStatus={liveTracking.updateMatchStatus}
              onConfirmPlayer={liveTracking.confirmPlayer}
              selectedMatchId={selectedMatchId}
              onSelectMatch={setSelectedMatchId}
              trafficLights={trafficLights}
              playerNames={playerNames}
              players={players}
              onSubstitute={handleSubstitute}
              onRemovePlayer={handleRemovePlayer}
              onCascadingStart={handleCascadingStart}
              onUndoStart={handleUndoStart}
            />
          </div>
        </div>

        {/* Collapsible Match Details sidebar */}
        {detailsOpen ? (
          <div className="w-72 flex-shrink-0 bg-white rounded border border-gray-200 flex flex-col overflow-hidden">
            <div className="px-2 py-1.5 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Match Details
              </span>
              <button
                onClick={() => setDetailsOpen(false)}
                title="Collapse details"
                aria-label="Collapse details"
                className="text-gray-400 hover:text-gray-600 text-xs leading-none"
              >
                ›
              </button>
            </div>
            <MatchDetailsPanel
              assignment={selectedAssignment}
              match={selectedMatch}
              matchState={selectedState}
              matches={liveOps.matches}
              trafficLight={selectedTrafficLight}
              analysis={selectedAnalysis}
              playerNames={playerNames}
              slotToTime={liveOps.slotToTime}
              onSelectMatch={setSelectedMatchId}
              schedule={liveOps.schedule}
              matchStates={liveOps.matchStates}
              players={players}
              config={liveOps.config}
              currentSlot={currentSlot}
              onUpdateStatus={liveTracking.updateMatchStatus}
            />
          </div>
        ) : (
          <button
            onClick={() => setDetailsOpen(true)}
            title="Show match details"
            aria-label="Show match details"
            className="w-6 flex-shrink-0 bg-white rounded border border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 text-xs"
          >
            ‹
          </button>
        )}
      </div>

      {liveTracking.isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded border border-gray-200 p-4">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto" />
            <p className="text-gray-600 mt-2 text-xs">Loading…</p>
          </div>
        </div>
      )}
    </div>
  );
}
