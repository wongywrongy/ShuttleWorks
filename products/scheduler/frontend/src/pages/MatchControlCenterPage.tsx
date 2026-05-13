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
import { Download, CaretLeft, CaretRight, ClipboardText, GearSix } from '@phosphor-icons/react';
import { Button } from '@scheduler/design-system/components';
import { useLiveTracking } from '../hooks/useLiveTracking';
import { useLiveOperations } from '../hooks/useLiveOperations';
import { useTrafficLights } from '../hooks/useTrafficLights';
import { useProposals } from '../hooks/useProposals';
import { useAppStore } from '../store/appStore';
import { GanttChart } from '../features/control-center/GanttChart';
import { WorkflowPanel } from '../features/control-center/WorkflowPanel';
import { MatchDetailsPanel } from '../features/control-center/MatchDetailsPanel';
import { DisruptionDialog } from '../features/control-center/DisruptionDialog';
import { MoveMatchDialog } from '../features/control-center/MoveMatchDialog';
import { DirectorToolsPanel } from '../features/director/DirectorToolsPanel';
import { WarmRestartDialog } from '../features/schedule/WarmRestartDialog';
import { Modal } from '../components/common/Modal';
import { AdvisoryBanner } from '../components/status/AdvisoryBanner';
import { SuggestionsRail } from '../features/suggestions/SuggestionsRail';
import { GanttLegend } from '../features/control-center/GanttLegend';
import { exportScheduleXlsx } from '../features/exports/xlsxExports';
import { INTERACTIVE_BASE } from '../lib/utils';
import type { Advisory } from '../api/dto';

export function MatchControlCenterPage() {
  const liveTracking = useLiveTracking();
  const liveOps = useLiveOperations();
  const { cancel: cancelProposal } = useProposals();
  const players = useAppStore((state) => state.players);
  const groups = useAppStore((state) => state.groups);
  const schedule = useAppStore((state) => state.schedule);
  const setSchedule = useAppStore((state) => state.setSchedule);
  const setMatchState = useAppStore((state) => state.setMatchState);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [currentSlot, setCurrentSlot] = useState(0);
  // Open by default to mirror the Schedule tab — the right rail
  // shouldn't sit empty while the operator is still picking matches.
  const [detailsOpen, setDetailsOpen] = useState(true);
  // Disruption dialog state, mirrored from the Schedule page so live
  // ops can also trigger repair from a started match.
  const [disruptionOpen, setDisruptionOpen] = useState(false);
  const [disruptionPrefill, setDisruptionPrefill] = useState<{
    type?: 'withdrawal' | 'court_closed' | 'overrun' | 'cancellation';
    matchId?: string;
    courtId?: number;
  }>({});
  const [directorOpen, setDirectorOpen] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('director') === 'closed-courts') {
      setDirectorOpen(true);
      // Clear the param so a refresh doesn't auto-reopen and the URL
      // stays clean for copy/share.
      params.delete('director');
      const search = params.toString();
      const newUrl = window.location.pathname + (search ? `?${search}` : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);
  const [moveMatchId, setMoveMatchId] = useState<string | null>(null);
  const [warmRestartOpen, setWarmRestartOpen] = useState(false);
  // Lifted from MatchDetailsPanel so the WorkflowPanel rows can pop
  // the score editor directly: clicking Score on a started row
  // selects the match AND flips the rail to its score mode.
  const [panelMode, setPanelMode] = useState<'idle' | 'score' | 'roster'>('idle');
  const requestScore = useCallback((matchId: string) => {
    setSelectedMatchId(matchId);
    setDetailsOpen(true);
    setPanelMode('score');
  }, []);
  // Reset to idle whenever the user picks a different match — the
  // editor that was open belonged to the previous match.
  useEffect(() => {
    setPanelMode('idle');
  }, [selectedMatchId]);

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

  // Handle cascading court shift when starting a match.
  //
  // We intentionally DO NOT mutate schedule.assignments[starting].slotId.
  // Instead, the starting match's real runtime position is derived
  // downstream from `matchState.actualStartTime` (see getRenderSlot in
  // timeUtils + GanttChart). That lets the block slide smoothly to the
  // wall-clock slot instead of snapping.
  //
  // We DO still shift subsequent scheduled/called matches off the
  // blocked court-slot window so the paper schedule stops promising
  // courts that are physically occupied.
  const handleCascadingStart = useCallback((
    matchId: string,
    courtId: number
  ) => {
    if (!schedule || !liveOps.config) return;

    const startingAssignmentIdx = schedule.assignments.findIndex(a => a.matchId === matchId);
    if (startingAssignmentIdx === -1) return;

    const startingAssignment = schedule.assignments[startingAssignmentIdx];
    const duration = startingAssignment.durationSlots;

    // Working copy for the cascade of *other* matches.
    const workingAssignments = schedule.assignments.map(a => ({ ...a }));

    // Anchor for the cascade is the current wall-clock slot — that's
    // where the match is actually about to block the court.
    const nowSlot = Math.max(0, currentSlot);

    const originalSlot = startingAssignment.slotId;
    const originalCourt = startingAssignment.courtId;

    // Store original position in match state for Undo, but leave the
    // assignment in schedule.assignments untouched.
    const currentStartState = liveOps.matchStates[matchId];
    setMatchState(matchId, {
      ...currentStartState,
      matchId: matchId,
      status: currentStartState?.status || 'scheduled',
      actualCourtId: courtId !== originalCourt ? courtId : undefined,
      originalSlotId: originalSlot,
      originalCourtId: originalCourt,
    });

    const startSlot = nowSlot;
    const endSlot = startSlot + duration;

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
  }, [schedule, liveOps.config, currentSlot, liveOps.matchStates, setSchedule, setMatchState]);

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

  // Live-operations advisory dispatcher. Routes every suggestedAction
  // kind to the matching dialog so the toast's "Review" button and
  // the AdvisoryBanner's Review button both have somewhere to land.
  // Moved above the early returns so it satisfies Rules of Hooks —
  // every render path now reaches the same hook calls in the same
  // order regardless of liveTracking.schedule / liveOps.config state.
  const handleAdvisoryReview = useCallback((advisory: Advisory) => {
    const action = advisory.suggestedAction;
    if (!action) return;
    if (action.kind === 'repair') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = action.payload as Record<string, any>;
      setDisruptionPrefill({
        type: payload.type,
        matchId: payload.matchId,
        courtId: payload.courtId,
      });
      setDisruptionOpen(true);
    } else if (action.kind === 'warm_restart') {
      setWarmRestartOpen(true);
    } else if (
      action.kind === 'delay_start' ||
      action.kind === 'insert_blackout' ||
      action.kind === 'remove_blackout' ||
      action.kind === 'compress_remaining'
    ) {
      setDirectorOpen(true);
    }
  }, []);

  // Cross-component intent: the toast's onAction sets
  // `pendingAdvisoryReview` on the store; this effect picks it up and
  // dispatches to the same handler the banner's Review button uses.
  const pendingAdvisoryReview = useAppStore((s) => s.pendingAdvisoryReview);
  const setPendingAdvisoryReview = useAppStore((s) => s.setPendingAdvisoryReview);
  useEffect(() => {
    if (!pendingAdvisoryReview) return;
    handleAdvisoryReview(pendingAdvisoryReview);
    setPendingAdvisoryReview(null);
  }, [pendingAdvisoryReview, handleAdvisoryReview, setPendingAdvisoryReview]);

  // No schedule state
  if (!liveTracking.schedule) {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="motion-enter flex flex-1 flex-col items-center justify-center gap-3">
          <ClipboardText aria-hidden="true" className="h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">No schedule generated.</p>
          <p className="text-xs text-muted-foreground">
            Generate a schedule on the{' '}
            <Link to="/schedule" className="font-medium text-accent hover:underline">Schedule page</Link>
          </p>
        </div>
      </div>
    );
  }

  if (!liveTracking.config || !liveOps.config || !liveOps.schedule) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <AdvisoryBanner onReview={handleAdvisoryReview} />
      <SuggestionsRail />
      {/* One flat surface. Stats bar / Gantt / legend / queue stack
          vertically in the left column separated by hairlines; the
          Match-details column on the right is a sibling separated by a
          single vertical hairline. No per-region cards. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Operator header strip — eyebrow + stats + actions, single
              baseline. Same vocabulary as Matches/Roster/Setup. */}
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
            <div className="flex min-w-0 items-baseline gap-3">
              <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Live
              </span>
              <span
                className="text-sm font-semibold text-foreground tabular-nums"
                title="Share of currently-scheduled matches that are finished. Cancelled or court-closed matches drop out of both sides of the ratio."
              >
                {stats?.percentage || 0}%
              </span>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {stats?.finished || 0} of {stats?.total || 0} matches
              </span>
              {(stats?.inProgress || 0) > 0 ? (
                <span className="text-xs font-medium text-status-live tabular-nums whitespace-nowrap">
                  · {stats.inProgress} active
                </span>
              ) : null}
              {delayedCount > 0 ? (
                <span className="rounded-sm border border-status-warning/40 bg-status-warning/10 px-1.5 py-0.5 text-2xs font-semibold text-status-warning tabular-nums">
                  {delayedCount} late
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="toolbar"
                onClick={() => void exportScheduleXlsx(
                  liveOps.schedule,
                  liveOps.matches,
                  players,
                  liveOps.config!,
                )}
                disabled={!liveOps.schedule || liveOps.schedule.assignments.length === 0}
                title={
                  !liveOps.schedule || liveOps.schedule.assignments.length === 0
                    ? 'No schedule to export'
                    : 'Download schedule as XLSX'
                }
              >
                <Download aria-hidden="true" />
                Export XLSX
              </Button>
              <Button
                type="button"
                size="xs"
                variant="toolbar"
                onClick={() => setDirectorOpen(true)}
                title="Director tools — delays, breaks, blackouts"
              >
                <GearSix aria-hidden="true" />
                Director
              </Button>
              <Button
                type="button"
                size="xs"
                variant="toolbar"
                onClick={() => {
                  setDisruptionPrefill({});
                  setDisruptionOpen(true);
                }}
                title="Repair after a disruption (court closed, withdrawal, overrun, cancellation)"
              >
                Disruption
              </Button>
              <Button
                type="button"
                size="xs"
                variant="toolbar"
                onClick={liveOps.triggerReoptimize}
                disabled={liveOps.isReoptimizing}
                title="Re-solve the schedule, keeping started and finished matches fixed. For lighter changes use Re-plan or Move/postpone."
              >
                {liveOps.isReoptimizing ? 'Optimizing…' : 'Re-optimize'}
              </Button>
            </div>
          </header>
          {/* Gantt grid */}
          <div className="shrink-0 overflow-x-auto border-b border-border px-4 py-3">
            <GanttChart
              schedule={liveOps.schedule}
              matches={liveOps.matches}
              matchStates={liveOps.matchStates}
              config={liveOps.config}
              currentSlot={currentSlot}
              selectedMatchId={selectedMatchId}
              onMatchSelect={setSelectedMatchId}
              impactedMatchIds={selectedAnalysis?.directlyImpacted}
              trafficLights={trafficLights}
              onRequestReopenCourt={() => setDirectorOpen(true)}
            />
          </div>
          {/* Legend strip */}
          <div className="shrink-0 border-b border-border px-4 py-1">
            <GanttLegend />
          </div>
          {/* Match queue (WorkflowPanel) */}
          <div className="min-h-0 flex-1 overflow-hidden">
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
              onRequestScore={requestScore}
            />
          </div>
        </div>

        {/* Right column — Match details (vertical hairline as separator) */}
        {detailsOpen ? (
          <div className="motion-enter flex w-72 shrink-0 flex-col overflow-hidden border-l border-border">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
              <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Match details
              </span>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                title="Collapse details"
                aria-label="Collapse details"
                className={`${INTERACTIVE_BASE} flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-fast ease-brand hover:bg-muted hover:text-foreground`}
              >
                <CaretRight aria-hidden="true" className="h-3.5 w-3.5" />
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
              groups={groups}
              config={liveOps.config}
              currentSlot={currentSlot}
              onUpdateStatus={liveTracking.updateMatchStatus}
              onConfirmPlayer={liveTracking.confirmPlayer}
              onSubstitute={handleSubstitute}
              onRemovePlayer={handleRemovePlayer}
              onCascadingStart={handleCascadingStart}
              onUndoStart={handleUndoStart}
              mode={panelMode}
              onModeChange={setPanelMode}
              onRequestDisruption={(type, matchId) => {
                const courtId =
                  type === 'court_closed' && selectedAssignment
                    ? selectedAssignment.courtId
                    : undefined;
                setDisruptionPrefill({
                  type,
                  matchId: type === 'court_closed' ? undefined : matchId,
                  courtId,
                });
                setDisruptionOpen(true);
              }}
              onRequestMove={(matchId) => setMoveMatchId(matchId)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            title="Show match details"
            aria-label="Show match details"
            className={`${INTERACTIVE_BASE} flex w-6 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors duration-fast ease-brand hover:bg-muted hover:text-foreground`}
          >
            <CaretLeft aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {liveTracking.isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-14 left-1/2 z-overlay -translate-x-1/2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur"
        >
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border-2 border-border border-t-primary animate-spin" aria-hidden />
            Loading…
          </span>
        </div>
      )}
      <DisruptionDialog
        isOpen={disruptionOpen}
        onClose={() => setDisruptionOpen(false)}
        initialType={disruptionPrefill.type}
        initialMatchId={disruptionPrefill.matchId}
        initialCourtId={disruptionPrefill.courtId}
      />
      <MoveMatchDialog
        isOpen={moveMatchId !== null}
        onClose={() => setMoveMatchId(null)}
        matchId={moveMatchId ?? undefined}
      />
      {directorOpen && (
        <Modal
          // Closing the modal must also discard any in-flight director
          // proposal — otherwise the next dialog opens with a stale
          // preview from the abandoned action.
          onClose={() => {
            void cancelProposal();
            setDirectorOpen(false);
          }}
          titleId="director-tools-title"
          widthClass="max-w-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 id="director-tools-title" className="text-sm font-semibold">
              Director tools
            </h2>
            <button
              type="button"
              onClick={() => {
                void cancelProposal();
                setDirectorOpen(false);
              }}
              className={`${INTERACTIVE_BASE} rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground`}
              aria-label="Close director tools"
            >
              ×
            </button>
          </div>
          <div className="overflow-y-auto max-h-[calc(80vh-3rem)]">
            <DirectorToolsPanel />
          </div>
        </Modal>
      )}
      <WarmRestartDialog
        isOpen={warmRestartOpen}
        onClose={() => setWarmRestartOpen(false)}
      />
    </div>
  );
}
