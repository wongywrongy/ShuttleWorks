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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, CalendarBlank } from '@phosphor-icons/react';
import { useSchedule } from '../hooks/useSchedule';
import { useTournament } from '../hooks/useTournament';
import { useAppStore } from '../store/appStore';
import { useSmoothedAssignments } from '../hooks/useSmoothedAssignments';
import { useTrafficLights } from '../hooks/useTrafficLights';
import { useCurrentSlot } from '../hooks/useCurrentSlot';
import { ScheduleActions } from '../features/schedule/ScheduleActions';
import { DragGantt } from '../features/schedule/DragGantt';
import { LiveTimelineGrid } from '../features/schedule/live/LiveTimelineGrid';
import { LiveMetricsBar } from '../features/schedule/live/LiveMetricsBar';
import { StaleBanner } from '../features/schedule/StaleBanner';
import { SuggestionsRail } from '../features/suggestions/SuggestionsRail';
import { exportScheduleXlsx } from '../features/exports/xlsxExports';
import { computeConstraintViolations } from '../utils/constraintChecker';
import { formatSlotTime } from '../lib/time';
import { INTERACTIVE_BASE } from '../lib/utils';
import { MatchesTable, type TableView } from './schedule/MatchesTable';
import { ScheduleSidebar } from './schedule/ScheduleSidebar';

export function SchedulePage() {
  const { config, loading: configLoading, error: configError } = useTournament();
  const players = useAppStore((state) => state.players);
  const matches = useAppStore((state) => state.matches);
  const groups = useAppStore((state) => state.groups);
  const matchStates = useAppStore((state) => state.matchStates);
  const scheduleStats = useAppStore((state) => state.scheduleStats);
  const addSolverLog = useAppStore((state) => state.addSolverLog);
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

  const currentSlot = useCurrentSlot();
  const isOptimizing = loading;

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

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading tournament configuration...</div>
      </div>
    );
  }

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
  const elapsed = hasLiveProgress ? generationProgress.elapsed_ms : scheduleStats?.elapsed || 0;
  const solutionCount = hasLiveProgress
    ? generationProgress.solution_count
    : scheduleStats?.solutionCount;
  const objectiveScore = hasLiveProgress
    ? generationProgress.current_objective
    : scheduleStats?.objectiveScore || schedule?.objectiveScore || undefined;
  const bestBound = hasLiveProgress ? generationProgress.best_bound : scheduleStats?.bestBound;

  return (
    <div className="flex h-full w-full flex-col gap-2 px-3 py-2">
      <StaleBanner />
      <SuggestionsRail />

      {needsConfig && (
        <div className="flex-shrink-0 rounded border border-status-warning/40 bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
          <span className="font-medium">Config needed:</span>{' '}
          <Link to="/setup" className="underline">
            Tournament Setup
          </Link>
        </div>
      )}

      {error && (
        <div className="flex-shrink-0 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {schedule?.status === 'infeasible' && (
        <div className="flex-shrink-0 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          <div className="mb-1 font-semibold text-destructive">
            Couldn't generate a feasible schedule
          </div>
          <div className="text-destructive/90">
            Try adding courts, reducing default rest time, extending the day,
            or relaxing player availability windows in Setup.
          </div>
          {schedule.infeasibleReasons && schedule.infeasibleReasons.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-destructive hover:underline">
                Details ({schedule.infeasibleReasons.length})
              </summary>
              <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 text-destructive/90">
                {schedule.infeasibleReasons.slice(0, 10).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
                {schedule.infeasibleReasons.length > 10 && (
                  <li>…and {schedule.infeasibleReasons.length - 10} more</li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}

      {showVisualization && displayAssignments.length > 0 && config ? (
        <div className="flex-1 min-h-0 flex bg-card rounded border border-border overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="px-2 py-1.5 border-b border-border/60 flex items-center justify-between flex-shrink-0">
              <LiveMetricsBar
                elapsed={elapsed}
                solutionCount={solutionCount}
                objectiveScore={objectiveScore}
                bestBound={bestBound}
                status={status}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void exportScheduleXlsx(schedule, matches, players, config)}
                  disabled={!schedule || schedule.assignments.length === 0}
                  data-testid="export-schedule"
                  title={
                    !schedule || schedule.assignments.length === 0
                      ? 'Generate a schedule first'
                      : 'Download schedule as XLSX'
                  }
                  className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-sm text-card-foreground hover:bg-muted/40 hover:text-foreground`}
                >
                  <Download aria-hidden="true" className="h-4 w-4" />
                  Export XLSX
                </button>
                <ScheduleActions
                  onGenerate={handleGenerate}
                  generating={isOptimizing}
                  hasSchedule={!!schedule}
                  confirmingReplace={confirmingReplace}
                />
              </div>
            </div>

            <div className="p-2 overflow-auto border-b border-border/60">
              {schedule && !isOptimizing ? (
                <DragGantt
                  schedule={schedule}
                  matches={matches}
                  config={config}
                  readOnly={isOptimizing}
                  selectedMatchId={selectedMatchId}
                  onMatchSelect={setSelectedMatchId}
                  onRequestReopenCourt={() => {
                    /* hook to ScheduleSidebar's directorOpen if needed */
                  }}
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

            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-2 py-1.5 border-b border-border/60 flex items-center justify-between flex-shrink-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Matches
                </span>
                <span className="text-xs text-muted-foreground">
                  {displayAssignments.length}/{matches.length}
                </span>
              </div>
              <div className="flex-1 min-h-0 p-2">
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
          />
        </div>
      ) : isOptimizing && !hasLiveProgress ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-card rounded border border-border">
          <div className="w-8 h-8 border-[3px] border-border border-t-primary rounded-full animate-spin"></div>
          <div className="text-muted-foreground text-sm">Starting optimization...</div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-card rounded-lg border border-dashed border-border">
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
          />
        </div>
      )}
    </div>
  );
}
