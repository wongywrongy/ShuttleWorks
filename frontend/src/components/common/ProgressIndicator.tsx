import { useEffect, useState } from 'react';

interface ProgressIndicatorProps {
  elapsed: number; // milliseconds
  currentObjective?: number;
  bestBound?: number;
  solutionCount?: number;
  status: 'solving' | 'complete' | 'error';
}

export function ProgressIndicator({
  elapsed,
  currentObjective,
  bestBound,
  solutionCount,
  status
}: ProgressIndicatorProps) {
  const [displayElapsed, setDisplayElapsed] = useState(elapsed);

  // Update displayed elapsed time
  useEffect(() => {
    setDisplayElapsed(elapsed);
  }, [elapsed]);

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  };

  const calculateGap = (): number | null => {
    if (currentObjective === undefined || bestBound === undefined) return null;
    if (currentObjective === 0) return null;
    return ((currentObjective - bestBound) / currentObjective) * 100;
  };

  const gap = calculateGap();

  return (
    <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
      {/* Status Header */}
      <div className="flex items-center gap-2">
        {status === 'solving' && (
          <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        )}
        {status === 'complete' && (
          <div className="h-5 w-5 bg-green-500 rounded-full" />
        )}
        {status === 'error' && (
          <div className="h-5 w-5 bg-red-500 rounded-full" />
        )}
        <span className="font-medium text-foreground">
          {status === 'solving' && 'Optimizing Schedule...'}
          {status === 'complete' && 'Optimization Complete'}
          {status === 'error' && 'Optimization Failed'}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div>
          <div className="text-muted-foreground text-xs">Elapsed Time</div>
          <div className="font-semibold text-foreground">{formatTime(displayElapsed)}</div>
        </div>

        {solutionCount !== undefined && solutionCount > 0 && (
          <div>
            <div className="text-muted-foreground text-xs">Solutions Found</div>
            <div className="font-semibold text-foreground">{solutionCount}</div>
          </div>
        )}

        {currentObjective !== undefined && (
          <div>
            <div className="text-muted-foreground text-xs">Current Score</div>
            <div className="font-semibold text-foreground">{Math.round(currentObjective)}</div>
          </div>
        )}

        {gap !== null && gap > 0 && (
          <div>
            <div className="text-muted-foreground text-xs">Gap to Optimal</div>
            <div className="font-semibold text-blue-600">{gap.toFixed(1)}%</div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {status === 'solving' && gap !== null && gap > 0 && (
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${Math.min(100 - gap, 100)}%` }}
            ></div>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {(100 - gap).toFixed(1)}% toward optimal
          </div>
        </div>
      )}

      {status === 'solving' && (gap === null || gap === 0) && (
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 animate-pulse w-full"></div>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            Finding optimal solution...
          </div>
        </div>
      )}
    </div>
  );
}
