/**
 * Container component for constraint graph visualization
 * Combines the graph and violation summary panel
 */
import { useMemo } from 'react';
import { ConstraintGraph } from './ConstraintGraph';
import { ViolationSummaryPanel } from './ViolationSummaryPanel';
import { buildGraphData } from './buildGraphData';
import { computeConstraintViolations } from '../../../utils/constraintChecker';
import type {
  ScheduleAssignment,
  MatchDTO,
  PlayerDTO,
  TournamentConfig,
} from '../../../api/dto';

interface ConstraintGraphPanelProps {
  assignments: ScheduleAssignment[];
  matches: MatchDTO[];
  players: PlayerDTO[];
  config: TournamentConfig;
  isRealtime?: boolean;
  elapsed?: number;
  solutionCount?: number;
  objectiveScore?: number;
}

export function ConstraintGraphPanel({
  assignments,
  matches,
  players,
  config,
  isRealtime = false,
  elapsed,
  solutionCount,
  objectiveScore,
}: ConstraintGraphPanelProps) {
  // Compute violations client-side
  const violations = useMemo(
    () => computeConstraintViolations(assignments, matches, players, config),
    [assignments, matches, players, config]
  );

  // Build graph data
  const graphData = useMemo(
    () => buildGraphData(assignments, matches, players, violations),
    [assignments, matches, players, violations]
  );

  if (assignments.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-border rounded p-4">
        <div className="text-center">
          <div className="text-2xl mb-2">...</div>
          <div className="text-muted-foreground text-sm">
            {isRealtime ? 'Waiting for first solution...' : 'No assignments to visualize'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">Constraint Graph</h3>
          {isRealtime && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
              Live
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {graphData.nodes.length} players · {graphData.links.length} edges
        </div>
      </div>

      {/* Content */}
      <div className="flex">
        {/* Graph area */}
        <div className="flex-1 p-3">
          <ConstraintGraph
            data={graphData}
            width={480}
            height={280}
          />
        </div>

        {/* Side panel */}
        <div className="border-l border-border p-3 bg-muted/40">
          <ViolationSummaryPanel
            violations={violations}
            elapsed={elapsed}
            solutionCount={solutionCount}
            objectiveScore={objectiveScore}
          />
        </div>
      </div>
    </div>
  );
}
