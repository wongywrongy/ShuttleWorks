/**
 * Schedule page — orchestrates the solver lifecycle + the
 * three-zone visualization (live metrics bar / Gantt grid / matches
 * table) with the right-column sidebar.
 *
 * The page itself stays thin: it computes derived state (selected
 * match, smoothed assignments, traffic lights, violations) and hands
 * it off to dedicated components in `pages/schedule/`. Sidebar state
 * (tabs, dialogs) lives inside `ScheduleSidebar`; matches table state
 * (search, filters, view toggle) lives inside `MatchesTable`.
 */
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, CalendarBlank, GearSix } from '@phosphor-icons/react';
import { Button } from '@scheduler/design-system/components';
import { useSchedule } from '../../hooks/useSchedule';
import { useTournament } from '../../hooks/useTournament';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useTournamentStore } from '../../store/tournamentStore';
import { useMatchStateStore } from '../../store/matchStateStore';
import { useUiStore } from '../../store/uiStore';
import { useSmoothedAssignments } from '../../hooks/useSmoothedAssignments';
import { useTrafficLights } from '../../hooks/useTrafficLights';
import { useCurrentSlot } from '../../hooks/useCurrentSlot';
import { useMatchStateSync } from '../../hooks/useMatchStateSync';
import { ScheduleActions } from './schedule/ScheduleActions';
import { DragGantt } from './schedule/DragGantt';
import { LiveTimelineGrid } from './schedule/live/LiveTimelineGrid';
import { StaleBanner } from './schedule/StaleBanner';
import { SuggestionsRail } from './suggestions/SuggestionsRail';
import { AdvisoryBanner } from '../../components/status/AdvisoryBanner';
import { DisruptionDialog } from './control-center/DisruptionDialog';
import { MoveMatchDialog } from './control-center/MoveMatchDialog';
import { WarmRestartDialog } from './schedule/WarmRestartDialog';
import { DirectorToolsPanel } from './director/DirectorToolsPanel';
import { Modal } from '../../components/common/Modal';
import { useProposals } from '../../hooks/useProposals';
import { useActivityLog } from '../../hooks/useActivityLog';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { Advisory } from '../../api/dto';
import { exportScheduleXlsx } from './exports/xlsxExports';
import { computeConstraintViolations } from '../../utils/constraintChecker';
import { formatSlotTime } from '../../lib/time';
import { MatchesTable, type TableView } from './schedule/MatchesTable';
import { ScheduleSidebar } from './schedule/ScheduleSidebar';
import { SourceChip } from '../../components/SourceChip';
import { ActionsBar } from '../../components/control-plane';

export function SchedulePage() {
  const tid = useTournamentId();
  const { config, loading: configLoading, error: configError } = useTournament();
  const players = useTournamentStore((state) => state.players);
  const matches = useTournamentStore((state) => state.matches);
  const groups = useTournamentStore((state) => state.groups);
  const matchStates = useMatchStateStore((state) => state.matchStates);
  // Keep live match state converged on the PLAN surface too — the live-day
  // Generate guard below reads it, and without a loader the store is empty
  // after a reload (same root cause the Run surface hit on 2026-07-02).
  useMatchStateSync(tid);
  const scheduleStats = useUiStore((state) => state.scheduleStats);
  const addSolverLog = useUiStore((state) => state.addSolverLog);
  const {
    schedule,
    loading,
    error,
    generateSchedule,
    generationProgress,
  } = useSchedule();

  // Track processed message timestamps to avoid duplicates.
  const processedMessages = useRef(new Set<string>());

  useEffect(() => {
    if (generationProgress?.messages) {
      for (const msg of generationProgress.messages) {
        const key = `${generationProgress.elapsed_ms}-${msg.text}`;
        if (!processedMessages.current.has(key)) {
          processedMessages.current.add(key);
          addSolverLog(msg.text, 'progress');
        }
      }
    }
  }, [generationProgress, addSolverLog]);

  useEffect(() => {
    if (loading) processedMessages.current.clear();
  }, [loading]);

  const [tableView, setTableView] = useState<TableView>('time');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // Record match-state transitions into the Alerts & Activity trail while
  // the operator is on the Plan surface (Phase 4.1).
  useActivityLog();

  // Dialog hosts live on the page (same home as the Run surface) so both
  // the toolbar actions and the rail's intents open them (Phase 4.3).
  const [disruptionOpen, setDisruptionOpen] = useState(false);
  const [warmRestartOpen, setWarmRestartOpen] = useState(false);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [moveMatchId, setMoveMatchId] = useState<string | null>(null);
  const [disruptionPrefill, setDisruptionPrefill] = useState<{
    type?: 'withdrawal' | 'court_closed' | 'overrun' | 'cancellation';
    matchId?: string;
    courtId?: number;
  }>({});
  const { cancel: cancelProposal } = useProposals();
  const openDirector = useCallback(() => setDirectorOpen(true), []);
  const openDisruption = useCallback(
    (prefill: { type?: 'withdrawal' | 'court_closed' | 'overrun' | 'cancellation'; matchId?: string; courtId?: number } = {}) => {
      setDisruptionPrefill(prefill);
      setDisruptionOpen(true);
    },
    [],
  );

  // Advisory Review dispatcher — identical routing to the Run surface, so
  // the decision banner + rail entries are actionable here too (Phase 4.1).
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

  const currentSlot = useCurrentSlot();
  const isOptimizing = loading;

  // The day is LIVE once any match has left `scheduled` (called / started /
  // finished). Re-solving then is a destructive act — the guard below makes
  // the Generate confirm say so instead of inviting a casual re-plan.
  const liveDay = Object.values(matchStates).some(
    (ms) => ms.status && ms.status !== 'scheduled',
  );

  // Two-click inline guard replaces the old window.confirm(): first
  // click flips the button into "Confirm replace" state for 4s, second
  // click within the window actually regenerates.
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  useEffect(() => {
    if (!confirmingReplace) return;
    const t = window.setTimeout(() => setConfirmingReplace(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmingReplace]);

  const handleGenerate = async () => {
    if (schedule && !confirmingReplace) {
      setConfirmingReplace(true);
      return;
    }
    setConfirmingReplace(false);
    try {
      await generateSchedule();
    } catch (err) {
      console.error('Generation failed:', err);
    }
  };

  // ── Derived values + hooks. ALL hooks must be called unconditionally
  // before any early return, per Rules of Hooks. The `configLoading`
  // branch lives below.
  const needsConfig = !config || (configError && configError.includes('not found'));

  const hasLiveProgress =
    isOptimizing &&
    generationProgress?.current_assignments &&
    generationProgress.current_assignments.length > 0;

  const rawAssignments = hasLiveProgress
    ? (generationProgress.current_assignments ?? [])
    : (schedule?.assignments || scheduleStats?.assignments || []);

  const displayAssignments = useSmoothedAssignments(rawAssignments, isOptimizing, {
    releaseInterval: 40,
    enabled: true,
  });

  const showVisualization = config && (hasLiveProgress || scheduleStats || schedule);

  const violations = useMemo(
    () =>
      config
        ? computeConstraintViolations(displayAssignments, matches, players, config)
        : [],
    [displayAssignments, matches, players, config],
  );

  const playerNames = useMemo(
    () => new Map(players.map((p) => [p.id, p.name])),
    [players],
  );

  const trafficLights = useTrafficLights(
    schedule ?? null,
    matches,
    matchStates,
    players,
    config ?? null,
    currentSlot,
  );

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading tournament configuration...</div>
      </div>
    );
  }

  const selectedMatch = selectedMatchId
    ? matches.find((m) => m.id === selectedMatchId)
    : undefined;
  const selectedAssignment =
    selectedMatchId && schedule
      ? schedule.assignments.find((a) => a.matchId === selectedMatchId)
      : undefined;
  const selectedMatchState = selectedMatchId ? matchStates[selectedMatchId] : undefined;
  const selectedTrafficLight = selectedMatchId
    ? trafficLights.get(selectedMatchId)
    : undefined;

  const slotToTime = (slot: number) => (config ? formatSlotTime(slot, config) : '00:00');

  const status: 'solving' | 'complete' = isOptimizing ? 'solving' : 'complete';
  const solutionCount = hasLiveProgress
    ? generationProgress.solution_count
    : scheduleStats?.solutionCount;
  const objectiveScore = hasLiveProgress
    ? generationProgress.current_objective
    : scheduleStats?.objectiveScore || schedule?.objectiveScore || undefined;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StaleBanner />
      {/* Tier-1 pending-decision banner — same single pipeline as Run; the
          Review action dispatches to this page's dialog hosts (Phase 4.1). */}
      <AdvisoryBanner onReview={handleAdvisoryReview} />
      <SuggestionsRail />

      {needsConfig ? (
        <div className="shrink-0 border-b border-status-warning/40 bg-status-warning/5 px-4 py-2 text-xs text-status-warning">
          <span className="font-medium">Config needed:</span>{' '}
          <Link to="/setup" className="underline">
            Tournament Setup
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="motion-enter shrink-0 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {schedule?.status === 'infeasible' ? (
        <div className="motion-enter shrink-0 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs">
          <div className="mb-1 font-semibold text-destructive">
            Couldn't generate a feasible schedule
          </div>
          <div className="text-status-danger-fg">
            Try adding courts, reducing default rest time, extending the day,
            or relaxing player availability windows in Setup.
          </div>
          {schedule.infeasibleReasons && schedule.infeasibleReasons.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-destructive hover:underline">
                Details ({schedule.infeasibleReasons.length})
              </summary>
              <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 text-status-danger-fg">
                {schedule.infeasibleReasons.slice(0, 10).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
                {schedule.infeasibleReasons.length > 10 ? (
                  <li>…and {schedule.infeasibleReasons.length - 10} more</li>
                ) : null}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {showVisualization && displayAssignments.length > 0 && config ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col">
            <ActionsBar
              title="Courts"
              status={
                // Solver telemetry left the toolbar (Phase 4.3): live progress
                // shows in the SolverHud + the rail's Log tab during a solve;
                // the last score sits in the timeline's bottom status line.
                <SourceChip source="meet" />
              }
            >
              <Button
                type="button"
                size="xs"
                variant="toolbar"
                onClick={() => void exportScheduleXlsx(schedule, matches, players, config)}
                disabled={!schedule || schedule.assignments.length === 0}
                data-testid="export-schedule"
                title={
                  !schedule || schedule.assignments.length === 0
                    ? 'Generate a schedule first'
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
                onClick={openDirector}
                title="Director tools — delays, breaks, reopen courts"
              >
                <GearSix aria-hidden="true" />
                Director
              </Button>
              <Button
                type="button"
                size="xs"
                variant="toolbar"
                onClick={() => setWarmRestartOpen(true)}
                title="Re-plan from here (full re-solve, stay-close objective)"
              >
                Re-plan
              </Button>
              <Button
                type="button"
                size="xs"
                variant="toolbar"
                onClick={() => openDisruption()}
                title="Repair after a disruption"
              >
                Disruption
              </Button>
              <ScheduleActions
                onGenerate={handleGenerate}
                generating={isOptimizing}
                hasSchedule={!!schedule}
                confirmingReplace={confirmingReplace}
                liveDay={liveDay}
              />
            </ActionsBar>

            <div className="shrink-0 overflow-x-auto border-b border-border px-4 py-3">
              {schedule && !isOptimizing ? (
                <DragGantt
                  schedule={schedule}
                  matches={matches}
                  config={config}
                  readOnly={isOptimizing}
                  selectedMatchId={selectedMatchId}
                  onMatchSelect={setSelectedMatchId}
                  currentSlot={currentSlot ?? undefined}
                  matchStates={matchStates}
                  trafficLights={trafficLights}
                  objectiveScore={objectiveScore}
                  onRequestReopenCourt={openDirector}
                />
              ) : (
                <LiveTimelineGrid
                  assignments={displayAssignments}
                  matches={matches}
                  players={players}
                  config={config}
                  status={status}
                />
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
                <div className="flex min-w-0 items-baseline gap-3">
                  <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Matches
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {displayAssignments.length} of {matches.length} scheduled
                  </span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <MatchesTable
                  assignments={displayAssignments}
                  matches={matches}
                  players={players}
                  groups={groups}
                  config={config}
                  view={tableView}
                  onViewChange={setTableView}
                  selectedMatchId={selectedMatchId}
                  onSelectMatch={setSelectedMatchId}
                />
              </div>
            </div>
          </div>

          <ScheduleSidebar
            isOptimizing={isOptimizing}
            schedule={schedule}
            matches={matches}
            matchStates={matchStates}
            players={players}
            groups={groups}
            config={config}
            currentSlot={currentSlot}
            selectedMatchId={selectedMatchId}
            setSelectedMatchId={setSelectedMatchId}
            selectedAssignment={selectedAssignment}
            selectedMatch={selectedMatch}
            selectedMatchState={selectedMatchState}
            selectedTrafficLight={selectedTrafficLight}
            playerNames={playerNames}
            slotToTime={slotToTime}
            displayAssignments={displayAssignments}
            solutionCount={solutionCount}
            objectiveScore={objectiveScore}
            status={status}
            violations={violations}
            onAdvisoryReview={handleAdvisoryReview}
            onRequestDisruption={openDisruption}
            onRequestMove={setMoveMatchId}
          />
        </div>
      ) : isOptimizing && !hasLiveProgress ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-accent" />
          <div className="text-sm text-muted-foreground">Starting optimization…</div>
        </div>
      ) : (
        <div className="motion-enter flex flex-1 flex-col items-center justify-center gap-3">
          <CalendarBlank
            aria-hidden="true"
            className="h-10 w-10 text-muted-foreground/60"
            strokeWidth={1.5}
          />
          <p className="text-sm text-muted-foreground">
            {needsConfig ? 'Configure tournament first.' : 'No schedule generated.'}
          </p>
          <ScheduleActions
            onGenerate={handleGenerate}
            generating={isOptimizing}
            hasSchedule={!!schedule}
            confirmingReplace={confirmingReplace}
            liveDay={liveDay}
          />
          {!needsConfig && matches.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No matches yet —{' '}
              <Link
                to={`/tournaments/${tid}/matches`}
                replace
                className="underline hover:text-foreground"
              >
                generate matches
              </Link>{' '}
              before scheduling.
            </p>
          ) : null}
        </div>
      )}

      {/* Dialog hosts — page-owned so the toolbar, the banner's Review, and
          the rail's intents all land in one place (same shape as Run). */}
      <DisruptionDialog
        isOpen={disruptionOpen}
        onClose={() => setDisruptionOpen(false)}
        initialType={disruptionPrefill.type}
        initialMatchId={disruptionPrefill.matchId}
        initialCourtId={disruptionPrefill.courtId}
      />
      <WarmRestartDialog isOpen={warmRestartOpen} onClose={() => setWarmRestartOpen(false)} />
      <MoveMatchDialog
        isOpen={moveMatchId !== null}
        onClose={() => setMoveMatchId(null)}
        matchId={moveMatchId ?? undefined}
      />
      {directorOpen && (
        <Modal
          // Closing must also discard any in-flight director proposal —
          // otherwise the next dialog opens with a stale preview.
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
    </div>
  );
}
