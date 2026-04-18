import { Link } from 'react-router-dom';
import { useSchedule } from '../hooks/useSchedule';
import { useTournament } from '../hooks/useTournament';
import { useAppStore } from '../store/appStore';
import { useSmoothedAssignments } from '../hooks/useSmoothedAssignments';
import { ScheduleActions } from '../features/schedule/ScheduleActions';
import { DragGantt } from '../features/schedule/DragGantt';
import { LiveTimelineGrid } from '../features/schedule/live/LiveTimelineGrid';
import { SolverProgressLog } from '../features/schedule/live/SolverProgressLog';
import { LiveMetricsBar } from '../features/schedule/live/LiveMetricsBar';
import { exportScheduleXlsx } from '../features/exports/xlsxExports';
import { StaleBanner } from '../features/schedule/StaleBanner';
import { computeConstraintViolations } from '../utils/constraintChecker';
import { formatSlotTime } from '../utils/timeUtils';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScheduleAssignment, MatchDTO, PlayerDTO, TournamentConfig } from '../api/dto';

type TableView = 'time' | 'court';

// Matches table component with time/court view toggle
function MatchesTable({
  assignments,
  matches,
  players,
  config,
  view,
  onViewChange,
}: {
  assignments: ScheduleAssignment[];
  matches: MatchDTO[];
  players: PlayerDTO[];
  config: TournamentConfig;
  view: TableView;
  onViewChange: (view: TableView) => void;
}) {
  const matchMap = useMemo(() => new Map(matches.map(m => [m.id, m])), [matches]);
  const playerMap = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);

  const getMatchLabel = (matchId: string): string => {
    const match = matchMap.get(matchId);
    if (!match) return matchId.slice(0, 6);
    if (match.matchNumber) return `M${match.matchNumber}`;
    if (match.eventRank) return match.eventRank;
    return matchId.slice(0, 6);
  };

  const getPlayerNames = (matchId: string): string => {
    const match = matchMap.get(matchId);
    if (!match) return '';
    const sideA = match.sideA?.map(id => playerMap.get(id)?.name || '?').join('/') || '?';
    const sideB = match.sideB?.map(id => playerMap.get(id)?.name || '?').join('/') || '?';
    return `${sideA} vs ${sideB}`;
  };

  // Group by time slot
  const byTime = useMemo(() => {
    const groups = new Map<number, ScheduleAssignment[]>();
    for (const a of assignments) {
      const list = groups.get(a.slotId) || [];
      list.push(a);
      groups.set(a.slotId, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([_slotId, items]) => ({
        slotId: _slotId,
        time: formatSlotTime(_slotId, config),
        assignments: items.sort((a, b) => a.courtId - b.courtId),
      }));
  }, [assignments, config]);

  // Group by court
  const byCourt = useMemo(() => {
    const groups = new Map<number, ScheduleAssignment[]>();
    for (const a of assignments) {
      const list = groups.get(a.courtId) || [];
      list.push(a);
      groups.set(a.courtId, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([courtId, items]) => ({
        courtId,
        assignments: items.sort((a, b) => a.slotId - b.slotId),
      }));
  }, [assignments]);

  if (assignments.length === 0) {
    return <div className="text-xs text-gray-400 italic p-2">No matches scheduled yet</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* View toggle */}
      <div className="flex items-center gap-1 mb-2 flex-shrink-0">
        <button
          onClick={() => onViewChange('time')}
          className={`px-2 py-0.5 text-xs rounded ${
            view === 'time'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          By Time
        </button>
        <button
          onClick={() => onViewChange('court')}
          className={`px-2 py-0.5 text-xs rounded ${
            view === 'court'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          By Court
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {view === 'time' ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-100">
              <tr>
                <th className="text-left px-2 py-1 font-medium text-gray-600 w-14">Time</th>
                <th className="text-left px-2 py-1 font-medium text-gray-600 w-8">Ct</th>
                <th className="text-left px-2 py-1 font-medium text-gray-600 w-12">Match</th>
                <th className="text-left px-2 py-1 font-medium text-gray-600">Players</th>
              </tr>
            </thead>
            <tbody>
              {byTime.flatMap(({ slotId: _slotId, time, assignments: slotAssignments }) =>
                slotAssignments.map((a, idx) => (
                  <tr key={a.matchId} className={`hover:bg-gray-50 ${idx === 0 ? 'border-t-2 border-gray-300' : 'border-t border-gray-100'}`}>
                    <td className="px-2 py-1 text-gray-500 font-mono whitespace-nowrap">
                      {idx === 0 ? time : ''}
                    </td>
                    <td className="px-2 py-1 text-gray-500">C{a.courtId}</td>
                    <td className="px-2 py-1 font-medium text-gray-700">{getMatchLabel(a.matchId)}</td>
                    <td className="px-2 py-1 text-gray-600 truncate max-w-xs" title={getPlayerNames(a.matchId)}>
                      {getPlayerNames(a.matchId)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-100">
              <tr>
                <th className="text-left px-2 py-1 font-medium text-gray-600 w-12">Court</th>
                <th className="text-left px-2 py-1 font-medium text-gray-600 w-14">Time</th>
                <th className="text-left px-2 py-1 font-medium text-gray-600 w-12">Match</th>
                <th className="text-left px-2 py-1 font-medium text-gray-600">Players</th>
              </tr>
            </thead>
            <tbody>
              {byCourt.flatMap(({ courtId, assignments: courtAssignments }) =>
                courtAssignments.map((a, idx) => (
                  <tr key={a.matchId} className={`hover:bg-gray-50 ${idx === 0 ? 'border-t-2 border-gray-300' : 'border-t border-gray-100'}`}>
                    <td className="px-2 py-1 text-gray-600 font-medium">
                      {idx === 0 ? `C${courtId}` : ''}
                    </td>
                    <td className="px-2 py-1 text-gray-500 font-mono">{formatSlotTime(a.slotId, config)}</td>
                    <td className="px-2 py-1 font-medium text-gray-700">{getMatchLabel(a.matchId)}</td>
                    <td className="px-2 py-1 text-gray-600 truncate max-w-xs" title={getPlayerNames(a.matchId)}>
                      {getPlayerNames(a.matchId)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function SchedulePage() {
  const { config, loading: configLoading, error: configError } = useTournament();
  const players = useAppStore((state) => state.players);
  const matches = useAppStore((state) => state.matches);
  const scheduleStats = useAppStore((state) => state.scheduleStats);
  const addSolverLog = useAppStore((state) => state.addSolverLog);
  const {
    schedule,
    loading,
    error,
    generateSchedule,
    reoptimizeSchedule,
    generationProgress,
  } = useSchedule();

  // Track processed message timestamps to avoid duplicates
  const processedMessages = useRef(new Set<string>());

  // Process verbose messages from solver progress
  useEffect(() => {
    if (generationProgress?.messages) {
      for (const msg of generationProgress.messages) {
        // Create unique key for this message
        const key = `${generationProgress.elapsed_ms}-${msg.text}`;
        if (!processedMessages.current.has(key)) {
          processedMessages.current.add(key);
          addSolverLog(msg.text, 'progress');
        }
      }
    }
  }, [generationProgress, addSolverLog]);

  // Clear processed messages when a new generation starts
  useEffect(() => {
    if (loading) {
      processedMessages.current.clear();
    }
  }, [loading]);

  // Table view state
  const [tableView, setTableView] = useState<TableView>('time');

  // Use global loading state - persists across tab switches
  const isOptimizing = loading;

  // Two-click inline guard replaces the old window.confirm() dialog:
  // first click when a schedule exists flips the button into "Confirm replace"
  // state; second click within 4s actually regenerates. Any unrelated action
  // resets the guard. This is both less intrusive and unblocks Playwright.
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

  const handleReoptimize = async () => {
    try {
      await reoptimizeSchedule();
    } catch (err) {
      console.error('Reoptimization failed:', err);
    }
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading tournament configuration...</div>
      </div>
    );
  }

  const needsConfig = !config || (configError && configError.includes("not found"));

  // Determine what to show for visualization
  const hasLiveProgress = isOptimizing && generationProgress?.current_assignments && generationProgress.current_assignments.length > 0;

  // Raw assignments from backend (live progress or stored)
  // Priority: live progress > final schedule > stats snapshot
  const rawAssignments = hasLiveProgress
    ? (generationProgress.current_assignments ?? [])
    : (schedule?.assignments || scheduleStats?.assignments || []);

  // Smooth assignments for consistent animation during generation
  const displayAssignments = useSmoothedAssignments(rawAssignments, isOptimizing, {
    releaseInterval: 40, // 40ms between each assignment appearing
    enabled: true,
  });

  const showVisualization = config && (hasLiveProgress || scheduleStats || schedule);

  // Compute violations for log
  const violations = useMemo(
    () => config ? computeConstraintViolations(displayAssignments, matches, players, config) : [],
    [displayAssignments, matches, players, config]
  );

  const status = isOptimizing ? 'solving' : 'complete';
  const elapsed = hasLiveProgress ? generationProgress.elapsed_ms : (scheduleStats?.elapsed || 0);
  const solutionCount = hasLiveProgress ? generationProgress.solution_count : scheduleStats?.solutionCount;
  const objectiveScore = hasLiveProgress ? generationProgress.current_objective : (scheduleStats?.objectiveScore || schedule?.objectiveScore || undefined);
  const bestBound = hasLiveProgress ? generationProgress.best_bound : scheduleStats?.bestBound;

  return (
    <div className="w-full h-[calc(100vh-56px)] flex flex-col px-2 py-1 gap-2">
      <StaleBanner />
      {/* Alerts */}
      {needsConfig && (
        <div className="p-2 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded text-xs flex-shrink-0">
          <span className="font-medium">Config needed:</span>{' '}
          <Link to="/setup" className="underline hover:text-yellow-900">Tournament Setup</Link>
        </div>
      )}

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs flex-shrink-0">
          {error}
        </div>
      )}

      {schedule?.status === 'infeasible' && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs flex-shrink-0">
          <span className="font-medium text-red-800">Infeasible:</span>{' '}
          <span className="text-red-700">{schedule.infeasibleReasons?.length || 0} constraint violations.</span>
          {schedule.infeasibleReasons && schedule.infeasibleReasons.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-red-600 hover:text-red-800">View details</summary>
              <ul className="mt-1 pl-3 text-red-600 max-h-24 overflow-y-auto">
                {schedule.infeasibleReasons.slice(0, 10).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
                {schedule.infeasibleReasons.length > 10 && (
                  <li>...and {schedule.infeasibleReasons.length - 10} more</li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Main content */}
      {showVisualization && displayAssignments.length > 0 && config ? (
        <div className="flex-1 min-h-0 flex gap-2">
          {/* Main area - Grid + Matches list */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* Grid container */}
            <div className="bg-white rounded border border-gray-200 flex flex-col overflow-hidden">
              {/* Header with metrics and actions */}
              <div className="px-2 py-1.5 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
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
                    className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ⤓ Export XLSX
                  </button>
                  <ScheduleActions
                    onGenerate={handleGenerate}
                    onReoptimize={handleReoptimize}
                    generating={isOptimizing}
                    reoptimizing={isOptimizing}
                    hasSchedule={!!schedule}
                    confirmingReplace={confirmingReplace}
                  />
                </div>
              </div>

              {/* Drag-to-reschedule Gantt (live solver-aware) */}
              <div className="p-2 overflow-auto">
                {schedule && !isOptimizing ? (
                  <DragGantt
                    schedule={schedule}
                    matches={matches}
                    config={config}
                    readOnly={isOptimizing}
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
            </div>

            {/* Matches table - below grid */}
            <div className="flex-1 min-h-0 bg-white rounded border border-gray-200 flex flex-col overflow-hidden">
              <div className="px-2 py-1.5 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Matches</span>
                <span className="text-xs text-gray-400">{displayAssignments.length}/{matches.length}</span>
              </div>
              <div className="flex-1 min-h-0 p-2">
                <MatchesTable
                  assignments={displayAssignments}
                  matches={matches}
                  players={players}
                  config={config}
                  view={tableView}
                  onViewChange={setTableView}
                />
              </div>
            </div>
          </div>

          {/* Log - sidebar */}
          <div className="w-72 flex-shrink-0 bg-white rounded border border-gray-200 flex flex-col overflow-hidden">
            <div className="px-2 py-1.5 border-b border-gray-200 flex-shrink-0">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Log</span>
            </div>
            <div className="flex-1 min-h-0 p-2 overflow-auto">
              <SolverProgressLog
                solutionCount={solutionCount}
                objectiveScore={objectiveScore}
                matchCount={displayAssignments.length}
                totalMatches={matches.length}
                status={status}
                violations={violations}
              />
            </div>
          </div>
        </div>
      ) : isOptimizing && !hasLiveProgress ? (
        /* Starting optimization spinner */
        <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-white rounded border border-gray-200">
          <div className="w-8 h-8 border-3 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
          <div className="text-gray-500 text-sm">Starting optimization...</div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded border border-gray-200">
          <div className="text-gray-400 mb-3">
            <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            {needsConfig ? 'Configure tournament first.' : 'No schedule generated.'}
          </p>
          <ScheduleActions
            onGenerate={handleGenerate}
            onReoptimize={handleReoptimize}
            generating={isOptimizing}
            reoptimizing={isOptimizing}
            hasSchedule={!!schedule}
            confirmingReplace={confirmingReplace}
          />
        </div>
      )}
    </div>
  );
}
