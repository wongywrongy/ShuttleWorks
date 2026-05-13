/**
 * Solver progress log showing real-time optimization updates
 * Shows solver messages and violation warnings
 * Uses global store for persistence across page navigation
 */
import { useEffect, useRef } from 'react';
import { useUiStore, type SolverLogEntry } from '../../../store/uiStore';
import type { ConstraintViolation } from '../../../api/dto';

interface SolverProgressLogProps {
  solutionCount?: number;
  objectiveScore?: number;
  matchCount: number;
  totalMatches: number;
  status: 'solving' | 'complete' | 'error';
  violations: ConstraintViolation[];
}

export function SolverProgressLog({
  solutionCount,
  objectiveScore,
  matchCount,
  totalMatches,
  status,
  violations,
}: SolverProgressLogProps) {
  const logs = useUiStore((state) => state.solverLogs);
  const addSolverLog = useUiStore((state) => state.addSolverLog);
  const clearSolverLogs = useUiStore((state) => state.clearSolverLogs);

  const logRef = useRef<HTMLDivElement>(null);
  const prevSolutionCount = useRef(solutionCount);
  const prevObjectiveScore = useRef(objectiveScore);
  const prevStatus = useRef(status);
  const prevViolationCount = useRef(0);
  const completionStatsAdded = useRef(false);

  // Track status changes
  useEffect(() => {
    if (status !== prevStatus.current) {
      if (status === 'solving') {
        clearSolverLogs(); // Clear on new solve
        completionStatsAdded.current = false;
        prevViolationCount.current = 0;
        addSolverLog('Starting optimization...', 'info');
      } else if (status === 'error') {
        addSolverLog('Error during optimization', 'info');
      }
      prevStatus.current = status;
    }
  }, [status, addSolverLog, clearSolverLogs]);

  // Track solution improvements
  useEffect(() => {
    if (solutionCount !== undefined && solutionCount !== prevSolutionCount.current) {
      if (prevSolutionCount.current !== undefined && solutionCount > prevSolutionCount.current) {
        const scoreStr = objectiveScore !== undefined ? ` (score: ${Math.round(objectiveScore)})` : '';
        addSolverLog(`Found solution #${solutionCount}${scoreStr}`, 'solution');
      }
      prevSolutionCount.current = solutionCount;
    }
  }, [solutionCount, objectiveScore, addSolverLog]);

  // Track significant score improvements
  useEffect(() => {
    if (objectiveScore !== undefined && prevObjectiveScore.current !== undefined) {
      const improvement = prevObjectiveScore.current - objectiveScore;
      if (improvement > 10) {
        addSolverLog(`Score improved by ${Math.round(improvement)} points`, 'solution');
      }
    }
    prevObjectiveScore.current = objectiveScore;
  }, [objectiveScore, addSolverLog]);

  // Track new violations
  useEffect(() => {
    if (violations.length > prevViolationCount.current) {
      // Log only the new violations
      const newViolations = violations.slice(prevViolationCount.current);
      for (const v of newViolations) {
        const severityLabel = v.severity === 'hard' ? 'HARD' : 'Soft';
        addSolverLog(`${severityLabel} violation: ${v.description}`, 'violation');
      }
      prevViolationCount.current = violations.length;
    }
  }, [violations, addSolverLog]);

  // Add final stats when complete (only if not already added)
  useEffect(() => {
    // Check if completion stats already exist in logs (prevents duplicates on page revisit)
    const hasCompletionStats = logs.some(log => log.type === 'stats' && log.message.startsWith('Stats:'));

    if (status === 'complete' && !completionStatsAdded.current && !hasCompletionStats) {
      completionStatsAdded.current = true;

      const hardViolations = violations.filter(v => v.severity === 'hard').length;
      const softViolations = violations.filter(v => v.severity === 'soft').length;

      // Add completion message
      addSolverLog(`Complete - ${matchCount}/${totalMatches} matches scheduled`, 'info');

      // Add stats summary
      const parts: string[] = [];
      if (hardViolations > 0) {
        parts.push(`${hardViolations} hard violation${hardViolations !== 1 ? 's' : ''}`);
      }
      if (softViolations > 0) {
        parts.push(`${softViolations} soft violation${softViolations !== 1 ? 's' : ''}`);
      }
      if (objectiveScore !== undefined) {
        parts.push(`score: ${Math.round(objectiveScore)}`);
      }

      if (parts.length > 0) {
        addSolverLog(`Stats: ${parts.join(', ')}`, 'stats');
      } else {
        addSolverLog('Stats: No violations detected', 'stats');
      }
    }
  }, [status, violations, matchCount, totalMatches, objectiveScore, addSolverLog, logs]);

  // Auto-scroll
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  // Get color for log entry type
  const getEntryColor = (type: SolverLogEntry['type']) => {
    switch (type) {
      case 'solution':
        return 'text-green-600';
      case 'violation':
        return 'text-amber-600';
      case 'stats':
        return 'text-blue-600 font-medium';
      case 'progress':
        return 'text-muted-foreground italic';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div
      ref={logRef}
      className="h-full overflow-y-auto text-xs font-mono space-y-0.5"
    >
      {logs.length === 0 ? (
        <div className="text-muted-foreground italic">Waiting for solver...</div>
      ) : (
        logs.map((entry) => (
          <div key={entry.id} className="flex gap-1.5">
            <span className="text-muted-foreground flex-shrink-0 text-3xs">
              {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </span>
            <span className={getEntryColor(entry.type)}>{entry.message}</span>
          </div>
        ))
      )}
    </div>
  );
}
