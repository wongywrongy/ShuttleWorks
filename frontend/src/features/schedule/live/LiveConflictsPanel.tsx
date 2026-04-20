/**
 * Live conflicts panel showing constraint violation log
 */
import { useEffect, useState, useRef } from 'react';
import type { ConstraintViolation } from '../../../api/dto';

interface LiveConflictsPanelProps {
  violations: ConstraintViolation[];
  matchCount: number;
  totalMatches: number;
  status: 'solving' | 'complete' | 'error';
}

export function LiveConflictsPanel({
  violations,
  matchCount,
  totalMatches,
}: LiveConflictsPanelProps) {
  const unscheduledCount = totalMatches - matchCount;
  const [prevMatchCount, setPrevMatchCount] = useState(matchCount);
  const [matchCountFlash, setMatchCountFlash] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const softViolations = violations.filter(v => v.severity === 'soft');

  // Flash effect when match count changes
  useEffect(() => {
    if (matchCount !== prevMatchCount) {
      setMatchCountFlash(true);
      const timeout = setTimeout(() => setMatchCountFlash(false), 400);
      setPrevMatchCount(matchCount);
      return () => clearTimeout(timeout);
    }
  }, [matchCount, prevMatchCount]);

  // Auto-scroll log when new violations appear
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [violations.length]);

  return (
    <div className="h-full flex flex-col">
      {/* Match count summary */}
      <div className={`mb-2 pb-2 border-b border-border/60 transition-all duration-300 ${matchCountFlash ? 'bg-muted/40 -mx-2 px-2 -mt-2 pt-2' : ''}`}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Matches</span>
          <span className={`font-medium transition-colors duration-300 ${matchCountFlash ? 'text-foreground' : 'text-foreground'}`}>
            {matchCount}<span className="text-muted-foreground">/{totalMatches}</span>
          </span>
        </div>
        {unscheduledCount > 0 && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {unscheduledCount} unscheduled
          </div>
        )}
      </div>

      {/* Violation log */}
      <div className="flex-1 min-h-0">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Log {softViolations.length > 0 && <span className="text-muted-foreground">({softViolations.length})</span>}
        </h4>
        <div
          ref={logRef}
          className="overflow-y-auto max-h-32 text-xs space-y-1"
        >
          {softViolations.length === 0 ? (
            <div className="text-muted-foreground italic">No violations</div>
          ) : (
            softViolations.map((v, i) => (
              <div key={i} className="text-muted-foreground py-0.5 border-b border-border/60 last:border-0">
                {v.description}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
