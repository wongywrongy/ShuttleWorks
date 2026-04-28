import { Link } from 'react-router-dom';
import { useSchedule } from '../hooks/useSchedule';
import { useTournament } from '../hooks/useTournament';
import { useAppStore } from '../store/appStore';
import { useSmoothedAssignments } from '../hooks/useSmoothedAssignments';
import { useTrafficLights } from '../hooks/useTrafficLights';
import { ScheduleActions } from '../features/schedule/ScheduleActions';
import { DragGantt } from '../features/schedule/DragGantt';
import { LiveTimelineGrid } from '../features/schedule/live/LiveTimelineGrid';
import { SolverProgressLog } from '../features/schedule/live/SolverProgressLog';
import { LiveMetricsBar } from '../features/schedule/live/LiveMetricsBar';
import { MatchDetailsPanel } from '../features/control-center/MatchDetailsPanel';
import { DisruptionDialog } from '../features/control-center/DisruptionDialog';
import { CandidatesPanel } from '../features/schedule/CandidatesPanel';
import { WarmRestartDialog } from '../features/schedule/WarmRestartDialog';
import { exportScheduleXlsx } from '../features/exports/xlsxExports';
import { StaleBanner } from '../features/schedule/StaleBanner';
import { computeConstraintViolations } from '../utils/constraintChecker';
import { formatSlotTime } from '../lib/time';
import { useCurrentSlot } from '../hooks/useCurrentSlot';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { INTERACTIVE_BASE } from '../lib/utils';
import type { ScheduleAssignment, MatchDTO, PlayerDTO, TournamentConfig, RosterGroupDTO } from '../api/dto';
import { InlineSearch, type FilterChipGroup } from '../components/InlineSearch';
import { useSearchParamState, useSearchParamSet } from '../hooks/useSearchParamState';
import { buildGroupIndex, getPlayerSchoolAccent } from '../lib/schoolAccent';
import { SchoolDot } from '../components/SchoolDot';

type TableView = 'time' | 'court';

// Matches table component with time/court view toggle
function MatchesTable({
  assignments,
  matches,
  players,
  groups,
  config,
  view,
  onViewChange,
  selectedMatchId,
  onSelectMatch,
}: {
  assignments: ScheduleAssignment[];
  matches: MatchDTO[];
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
  config: TournamentConfig;
  view: TableView;
  onViewChange: (view: TableView) => void;
  selectedMatchId?: string | null;
  onSelectMatch?: (matchId: string) => void;
}) {
  const matchMap = useMemo(() => new Map(matches.map(m => [m.id, m])), [matches]);
  const playerMap = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);
  const groupIndex = useMemo(() => buildGroupIndex(groups), [groups]);

  // URL-backed search + filter state mirroring Matches tab.
  const [searchQuery, setSearchQuery] = useSearchParamState('q', '');
  const [eventFilter, , toggleEvent] = useSearchParamSet('event');
  const [courtFilter, , toggleCourt] = useSearchParamSet('court');

  const filteredAssignments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const eventActive = eventFilter.size > 0;
    const courtActive = courtFilter.size > 0;
    if (!q && !eventActive && !courtActive) return assignments;
    return assignments.filter((a) => {
      const m = matchMap.get(a.matchId);
      if (q) {
        const sideA = (m?.sideA ?? []).map((id) => playerMap.get(id)?.name ?? '').join(' ');
        const sideB = (m?.sideB ?? []).map((id) => playerMap.get(id)?.name ?? '').join(' ');
        const event = m?.eventRank ?? '';
        const matchNum = m?.matchNumber ? `M${m.matchNumber}` : '';
        if (
          !event.toLowerCase().includes(q) &&
          !matchNum.toLowerCase().includes(q) &&
          !sideA.toLowerCase().includes(q) &&
          !sideB.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (eventActive) {
        const prefix = (m?.eventRank ?? '').match(/^[A-Z]+/)?.[0] ?? '';
        if (!eventFilter.has(prefix)) return false;
      }
      if (courtActive && !courtFilter.has(`c${a.courtId}`)) return false;
      return true;
    });
  }, [assignments, searchQuery, eventFilter, courtFilter, matchMap, playerMap]);

  // Minimal — search input only. Event + Court chips removed per the
  // user's "minimal search" directive. Free-text matches both.
  const filterGroups: FilterChipGroup[] = [];

  const clearAll = () => {
    setSearchQuery('');
    eventFilter.forEach((id) => toggleEvent(id));
    courtFilter.forEach((id) => toggleCourt(id));
  };

  // Render the side-A school dot for an assignment (the dominant
  // school identity for the row).
  const renderSchoolDot = (matchId: string) => {
    const m = matchMap.get(matchId);
    if (!m || !m.sideA?.length) return null;
    const p = playerMap.get(m.sideA[0]);
    if (!p) return null;
    const accent = getPlayerSchoolAccent(p, groupIndex);
    return accent.name ? <SchoolDot accent={accent} size="sm" /> : null;
  };

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

  // Group by time slot — driven by the *filtered* assignments so an
  // active filter actually narrows what's rendered.
  const byTime = useMemo(() => {
    const groups = new Map<number, ScheduleAssignment[]>();
    for (const a of filteredAssignments) {
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
  }, [filteredAssignments, config]);

  // Group by court (filtered).
  const byCourt = useMemo(() => {
    const groups = new Map<number, ScheduleAssignment[]>();
    for (const a of filteredAssignments) {
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
  }, [filteredAssignments]);

  if (assignments.length === 0) {
    return <div className="text-xs text-muted-foreground italic p-2">No matches scheduled yet</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* View toggle + inline search row */}
      <div className="mb-2 flex flex-shrink-0 flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onViewChange('time')}
            className={`px-2 py-0.5 text-xs rounded ${
              view === 'time'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            By Time
          </button>
          <button
            onClick={() => onViewChange('court')}
            className={`px-2 py-0.5 text-xs rounded ${
              view === 'court'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            By Court
          </button>
        </div>
        <div className="flex-1 min-w-[16rem]">
          <InlineSearch
            query={searchQuery}
            onQueryChange={setSearchQuery}
            placeholder="Search event, player, court…"
            filters={filterGroups}
            showClear
            onClearAll={clearAll}
          />
        </div>
      </div>

      {filteredAssignments.length === 0 && (
        <div className="rounded border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
          No assignments match these filters.
        </div>
      )}

      {/* Table */}
      <div className={`flex-1 overflow-auto ${filteredAssignments.length === 0 ? 'hidden' : ''}`}>
        {view === 'time' ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-14">Time</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-8">Ct</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-12">Match</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground">Players</th>
              </tr>
            </thead>
            <tbody>
              {byTime.flatMap(({ slotId: _slotId, time, assignments: slotAssignments }) =>
                slotAssignments.map((a, idx) => {
                  const isSelected = selectedMatchId === a.matchId;
                  return (
                    <tr
                      key={a.matchId}
                      onClick={() => onSelectMatch?.(a.matchId)}
                      className={`${onSelectMatch ? 'cursor-pointer' : ''} ${
                        isSelected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/50'
                      } ${idx === 0 ? 'border-t-2 border-border' : 'border-t border-border/60'}`}
                    >
                      <td className="px-2 py-1 text-muted-foreground font-mono whitespace-nowrap">
                        {idx === 0 ? time : ''}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">C{a.courtId}</td>
                      <td className="px-2 py-1 font-medium text-foreground">{getMatchLabel(a.matchId)}</td>
                      <td className="px-2 py-1 text-foreground/80 truncate max-w-xs" title={getPlayerNames(a.matchId)}>
                        <span className="inline-flex items-center gap-1.5">
                          {renderSchoolDot(a.matchId)}
                          <span className="truncate">{getPlayerNames(a.matchId)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-12">Court</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-14">Time</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-12">Match</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground">Players</th>
              </tr>
            </thead>
            <tbody>
              {byCourt.flatMap(({ courtId, assignments: courtAssignments }) =>
                courtAssignments.map((a, idx) => {
                  const isSelected = selectedMatchId === a.matchId;
                  return (
                    <tr
                      key={a.matchId}
                      onClick={() => onSelectMatch?.(a.matchId)}
                      className={`${onSelectMatch ? 'cursor-pointer' : ''} ${
                        isSelected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/50'
                      } ${idx === 0 ? 'border-t-2 border-border' : 'border-t border-border/60'}`}
                    >
                      <td className="px-2 py-1 text-foreground font-medium">
                        {idx === 0 ? `C${courtId}` : ''}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground font-mono">{formatSlotTime(a.slotId, config)}</td>
                      <td className="px-2 py-1 font-medium text-foreground">{getMatchLabel(a.matchId)}</td>
                      <td className="px-2 py-1 text-foreground/80 truncate max-w-xs" title={getPlayerNames(a.matchId)}>
                        <span className="inline-flex items-center gap-1.5">
                          {renderSchoolDot(a.matchId)}
                          <span className="truncate">{getPlayerNames(a.matchId)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
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
  const groups = useAppStore((state) => state.groups);
  const matchStates = useAppStore((state) => state.matchStates);
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

  // Match selection. The right sidebar shows match details by default;
  // the solver log only surfaces while a generation is running, and
  // collapses back to details once the run finishes — so the rail
  // never sits empty.
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'log' | 'details' | 'candidates'>('details');
  const [disruptionOpen, setDisruptionOpen] = useState(false);
  const [warmRestartOpen, setWarmRestartOpen] = useState(false);
  const [disruptionPrefill, setDisruptionPrefill] = useState<{
    type?: 'withdrawal' | 'court_closed' | 'overrun' | 'cancellation';
    matchId?: string;
    courtId?: number;
  }>({});

  // Wall-clock slot for traffic-light + rest-time computation.
  // Refreshed every minute via the shared ``useCurrentSlot`` hook so the
  // panel stays in sync with the live tab.
  const currentSlot = useCurrentSlot();

  // Use global loading state - persists across tab switches
  const isOptimizing = loading;

  // Auto-flip the sidebar tab as solver state changes:
  //   • starts solving → switch to Log so progress is visible immediately
  //   • finishes solving → switch back to Details (log is no longer
  //     needed; details is the natural inspect-and-tweak surface)
  // Selecting a match while idle still snaps to Details. Manual taps
  // on the toggle (when shown) override either default.
  useEffect(() => {
    if (isOptimizing) {
      setSidebarTab('log');
    } else {
      setSidebarTab('details');
    }
  }, [isOptimizing]);
  useEffect(() => {
    if (selectedMatchId && !isOptimizing) setSidebarTab('details');
  }, [selectedMatchId, isOptimizing]);

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
        <div className="text-muted-foreground">Loading tournament configuration...</div>
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

  // Player-name lookup for the details panel.
  const playerNames = useMemo(
    () => new Map(players.map((p) => [p.id, p.name])),
    [players],
  );

  // Traffic lights drive the Ready/Resting/Blocked badge in the
  // details panel. Computed against the persisted schedule (not the
  // smoothed live view) so the result is stable while idle.
  const trafficLights = useTrafficLights(
    schedule ?? null,
    matches,
    matchStates,
    players,
    config ?? null,
    currentSlot,
  );

  // Selected-match derivations.
  const selectedMatch = selectedMatchId
    ? matches.find((m) => m.id === selectedMatchId)
    : undefined;
  const selectedAssignment = selectedMatchId && schedule
    ? schedule.assignments.find((a) => a.matchId === selectedMatchId)
    : undefined;
  const selectedMatchState = selectedMatchId ? matchStates[selectedMatchId] : undefined;
  const selectedTrafficLight = selectedMatchId
    ? trafficLights.get(selectedMatchId)
    : undefined;

  const slotToTime = (slot: number) => (config ? formatSlotTime(slot, config) : '00:00');

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
        <div className="p-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded text-xs flex-shrink-0 dark:bg-yellow-500/10 dark:border-yellow-500/30 dark:text-yellow-200">
          <span className="font-medium">Config needed:</span>{' '}
          <Link to="/setup" className="underline hover:text-yellow-900 dark:hover:text-yellow-100">Tournament Setup</Link>
        </div>
      )}

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs flex-shrink-0 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-200">
          {error}
        </div>
      )}

      {schedule?.status === 'infeasible' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-xs flex-shrink-0 dark:bg-red-500/10 dark:border-red-500/30">
          <div className="font-medium text-red-800 dark:text-red-200 mb-1">
            Couldn't generate a feasible schedule
          </div>
          <div className="text-red-700 dark:text-red-300">
            Try adding courts, reducing default rest time, extending the day,
            or relaxing player availability windows in Setup.
          </div>
          {schedule.infeasibleReasons && schedule.infeasibleReasons.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-red-600 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200">
                Details ({schedule.infeasibleReasons.length})
              </summary>
              <ul className="mt-1 pl-3 text-red-600 max-h-24 overflow-y-auto dark:text-red-300 list-disc">
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

      {/* Main content */}
      {showVisualization && displayAssignments.length > 0 && config ? (
        <div className="flex-1 min-h-0 flex gap-2">
          {/* Main area - Grid + Matches list */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* Grid container */}
            <div className="bg-card rounded border border-border flex flex-col overflow-hidden">
              {/* Header with metrics and actions */}
              <div className="px-2 py-1.5 border-b border-border flex items-center justify-between flex-shrink-0">
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
                    className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground`}
                  >
                    <Download aria-hidden="true" className="h-4 w-4" />
                    Export XLSX
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
                    selectedMatchId={selectedMatchId}
                    onMatchSelect={setSelectedMatchId}
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
            <div className="flex-1 min-h-0 bg-card rounded border border-border flex flex-col overflow-hidden">
              <div className="px-2 py-1.5 border-b border-border flex items-center justify-between flex-shrink-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Matches</span>
                <span className="text-xs text-muted-foreground">{displayAssignments.length}/{matches.length}</span>
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

          {/* Match details sidebar.
              Log is offered as a tab only while a solver run is active
              — once it ends, the toggle disappears and the rail is
              dedicated to match details. */}
          <div className="w-72 flex-shrink-0 bg-card rounded border border-border flex flex-col overflow-hidden">
            <div className="px-2 py-1.5 border-b border-border flex-shrink-0 flex items-center gap-1">
              {isOptimizing ? (
                <>
                  <button
                    onClick={() => setSidebarTab('log')}
                    className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded ${
                      sidebarTab === 'log'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Log
                  </button>
                  <button
                    onClick={() => setSidebarTab('details')}
                    className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded ${
                      sidebarTab === 'details'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Details
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setSidebarTab('details')}
                    className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded ${
                      sidebarTab === 'details'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Details
                  </button>
                  {(schedule?.candidates?.length ?? 0) > 0 && (
                    <button
                      onClick={() => setSidebarTab('candidates')}
                      className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded ${
                        sidebarTab === 'candidates'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Candidates
                    </button>
                  )}
                  <button
                    onClick={() => setWarmRestartOpen(true)}
                    className="ml-auto px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded text-muted-foreground hover:bg-muted"
                    title="Re-plan from here (full re-solve, stay-close objective)"
                  >
                    Re-plan…
                  </button>
                  <button
                    onClick={() => {
                      setDisruptionPrefill({});
                      setDisruptionOpen(true);
                    }}
                    className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded text-muted-foreground hover:bg-muted"
                    title="Repair after a disruption"
                  >
                    Disruption…
                  </button>
                </>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {isOptimizing && sidebarTab === 'log' ? (
                <div className="p-2">
                  <SolverProgressLog
                    solutionCount={solutionCount}
                    objectiveScore={objectiveScore}
                    matchCount={displayAssignments.length}
                    totalMatches={matches.length}
                    status={status}
                    violations={violations}
                  />
                </div>
              ) : sidebarTab === 'candidates' ? (
                <CandidatesPanel
                  schedule={schedule}
                  onSelect={(i) => useAppStore.getState().setActiveCandidateIndex(i)}
                />
              ) : (
                <MatchDetailsPanel
                  assignment={selectedAssignment}
                  match={selectedMatch}
                  matchState={selectedMatchState}
                  matches={matches}
                  trafficLight={selectedTrafficLight}
                  playerNames={playerNames}
                  slotToTime={slotToTime}
                  onSelectMatch={setSelectedMatchId}
                  schedule={schedule}
                  matchStates={matchStates}
                  players={players}
                  groups={groups}
                  config={config}
                  currentSlot={currentSlot}
                  onRequestDisruption={(type, matchId) => {
                    // Court closure pre-fills the courtId from the
                    // selected match's assignment so the operator
                    // doesn't have to look it up.
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
                />
              )}
            </div>
          </div>
          <DisruptionDialog
            isOpen={disruptionOpen}
            onClose={() => setDisruptionOpen(false)}
            initialType={disruptionPrefill.type}
            initialMatchId={disruptionPrefill.matchId}
            initialCourtId={disruptionPrefill.courtId}
          />
          <WarmRestartDialog
            isOpen={warmRestartOpen}
            onClose={() => setWarmRestartOpen(false)}
          />
        </div>
      ) : isOptimizing && !hasLiveProgress ? (
        /* Starting optimization spinner */
        <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-card rounded border border-border">
          <div className="w-8 h-8 border-[3px] border-border border-t-primary rounded-full animate-spin"></div>
          <div className="text-muted-foreground text-sm">Starting optimization...</div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center bg-card rounded border border-border">
          <div className="text-muted-foreground mb-3">
            <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
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
