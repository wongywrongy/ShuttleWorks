/**
 * Main container for live schedule visualization during optimization
 * Combines metrics bar, timeline grid, and solver progress log
 */
import { useMemo } from 'react';
import { LiveMetricsBar } from './LiveMetricsBar';
import { LiveTimelineGrid } from './LiveTimelineGrid';
import { SolverProgressLog } from './SolverProgressLog';
import { ScheduleActions } from '../ScheduleActions';
import { computeConstraintViolations } from '../../../utils/constraintChecker';
import type {
  ScheduleAssignment,
  MatchDTO,
  PlayerDTO,
  TournamentConfig,
} from '../../../api/dto';

interface LiveScheduleGridProps {
  assignments: ScheduleAssignment[];
  matches: MatchDTO[];
  players: PlayerDTO[];
  config: TournamentConfig;
  elapsed: number;
  solutionCount?: number;
  objectiveScore?: number;
  bestBound?: number;
  status: 'solving' | 'complete' | 'error';
  totalMatches?: number;
  onGenerate?: () => void;
  onReoptimize?: () => void;
  generating?: boolean;
  reoptimizing?: boolean;
  hasSchedule?: boolean;
}

export function LiveScheduleGrid({
  assignments,
  matches,
  players,
  config,
  elapsed,
  solutionCount,
  objectiveScore,
  bestBound,
  status,
  totalMatches,
  onGenerate,
  onReoptimize,
  generating,
  reoptimizing,
  hasSchedule,
}: LiveScheduleGridProps) {
  // Compute constraint violations for the log
  const violations = useMemo(
    () => computeConstraintViolations(assignments, matches, players, config),
    [assignments, matches, players, config]
  );

  return (
    <div className="bg-card rounded border border-border">
      {/* Header with metrics and actions */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <LiveMetricsBar
          elapsed={elapsed}
          solutionCount={solutionCount}
          objectiveScore={objectiveScore}
          bestBound={bestBound}
          status={status}
        />
        {onGenerate && (
          <ScheduleActions
            onGenerate={onGenerate}
            onReoptimize={onReoptimize!}
            generating={generating || false}
            reoptimizing={reoptimizing || false}
            hasSchedule={hasSchedule || false}
          />
        )}
      </div>

      {/* Timeline Grid (full width) */}
      <div className="p-3">
        <LiveTimelineGrid
          assignments={assignments}
          matches={matches}
          players={players}
          config={config}
          status={status}
        />
      </div>

      {/* Solver Progress Log (bottom) */}
      <div className="px-3 py-2 border-t border-border bg-muted/40">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Log</span>
          <span className="text-xs text-muted-foreground">{assignments.length}/{totalMatches ?? matches.length} matches</span>
        </div>
        <SolverProgressLog
          solutionCount={solutionCount}
          objectiveScore={objectiveScore}
          matchCount={assignments.length}
          totalMatches={totalMatches ?? matches.length}
          status={status}
          violations={violations}
        />
      </div>
    </div>
  );
}
