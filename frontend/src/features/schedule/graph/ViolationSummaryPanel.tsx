/**
 * Side panel showing constraint violation summary
 */
import type { ConstraintViolation } from '../../../api/dto';

interface ViolationSummaryPanelProps {
  violations: ConstraintViolation[];
  solutionCount?: number;
  elapsed?: number;
  objectiveScore?: number;
}

const TYPE_LABELS: Record<string, string> = {
  overlap: 'Player Overlap',
  rest: 'Rest Time',
  court_capacity: 'Court Capacity',
  availability: 'Availability',
};

const TYPE_COLORS: Record<string, string> = {
  overlap: 'bg-red-400',
  rest: 'bg-orange-400',
  court_capacity: 'bg-purple-400',
  availability: 'bg-blue-400',
};

export function ViolationSummaryPanel({
  violations,
  solutionCount,
  elapsed,
  objectiveScore,
}: ViolationSummaryPanelProps) {
  // Group violations by type
  const byType = violations.reduce((acc, v) => {
    acc[v.type] = (acc[v.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const hardCount = violations.filter(v => v.severity === 'hard').length;
  const softCount = violations.filter(v => v.severity === 'soft').length;

  // Format elapsed time
  const formatElapsed = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="bg-white border border-border rounded-lg p-4 w-56 text-sm">
      <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
        Solver Status
      </h3>

      {/* Solver metrics */}
      {(solutionCount !== undefined || elapsed !== undefined) && (
        <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
          {elapsed !== undefined && (
            <div className="bg-muted/40 rounded p-2">
              <div className="text-muted-foreground">Elapsed</div>
              <div className="font-mono font-medium">{formatElapsed(elapsed)}</div>
            </div>
          )}
          {solutionCount !== undefined && (
            <div className="bg-muted/40 rounded p-2">
              <div className="text-muted-foreground">Solutions</div>
              <div className="font-mono font-medium">{solutionCount}</div>
            </div>
          )}
          {objectiveScore !== undefined && (
            <div className="bg-muted/40 rounded p-2 col-span-2">
              <div className="text-muted-foreground">Objective Score</div>
              <div className="font-mono font-medium">{objectiveScore.toFixed(1)}</div>
            </div>
          )}
        </div>
      )}

      {/* Violation summary counts */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className={`rounded p-2 text-center ${hardCount > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className={`text-xl font-bold ${hardCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {hardCount}
          </div>
          <div className={`text-xs ${hardCount > 0 ? 'text-red-700' : 'text-green-700'}`}>
            Hard
          </div>
        </div>
        <div className={`rounded p-2 text-center ${softCount > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
          <div className={`text-xl font-bold ${softCount > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
            {softCount}
          </div>
          <div className={`text-xs ${softCount > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
            Soft
          </div>
        </div>
      </div>

      {/* Breakdown by type */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Type</h4>
        {Object.entries(TYPE_LABELS).map(([type, label]) => {
          const count = byType[type] || 0;
          return (
            <div
              key={type}
              className={`flex justify-between items-center text-xs p-1.5 rounded ${
                count > 0 ? 'bg-muted/40' : ''
              }`}
            >
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${TYPE_COLORS[type]}`} />
                {label}
              </span>
              <span
                className={`font-medium px-1.5 py-0.5 rounded ${
                  count > 0 ? 'bg-red-100 text-red-700' : 'text-green-600'
                }`}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-border">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Edge Legend
        </h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-red-500 rounded"></div>
            <span className="text-muted-foreground">Hard violation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-yellow-500 rounded"></div>
            <span className="text-muted-foreground">Soft violation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-green-500 rounded"></div>
            <span className="text-muted-foreground">Satisfied</span>
          </div>
        </div>
      </div>
    </div>
  );
}
