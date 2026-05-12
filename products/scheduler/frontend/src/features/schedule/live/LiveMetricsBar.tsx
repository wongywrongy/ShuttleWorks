/**
 * Live metrics bar showing solver progress during optimization
 * Enhanced with smooth animations and visual feedback
 */
import { useEffect, useState, useRef } from 'react';

interface LiveMetricsBarProps {
  elapsed: number;
  solutionCount?: number;
  objectiveScore?: number;
  bestBound?: number;
  status: 'solving' | 'complete' | 'error';
}

// Animated number component for smooth counting
function AnimatedNumber({
  value,
  formatFn = (n: number) => n.toString(),
}: {
  value: number | undefined;
  formatFn?: (n: number) => string;
}) {
  const [displayValue, setDisplayValue] = useState(value ?? 0);
  const prevValueRef = useRef(value ?? 0);

  useEffect(() => {
    if (value === undefined) return;

    const prevValue = prevValueRef.current;
    const diff = value - prevValue;
    const duration = 300;
    const steps = 20;
    const stepDuration = duration / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(prevValue + diff * easeProgress);

      if (currentStep >= steps) {
        clearInterval(interval);
        setDisplayValue(value);
      }
    }, stepDuration);

    prevValueRef.current = value;
    return () => clearInterval(interval);
  }, [value]);

  return <span>{value !== undefined ? formatFn(displayValue) : '-'}</span>;
}

export function LiveMetricsBar({
  elapsed,
  solutionCount,
  objectiveScore,
  bestBound,
}: LiveMetricsBarProps) {
  const [showPulse, setShowPulse] = useState(false);
  const prevSolutionCountRef = useRef(solutionCount);

  // Calculate optimality gap
  const gap = objectiveScore && bestBound && objectiveScore > 0
    ? ((objectiveScore - bestBound) / objectiveScore) * 100
    : null;

  // Flash effect when solution count increases
  useEffect(() => {
    if (solutionCount !== undefined && solutionCount !== prevSolutionCountRef.current) {
      setShowPulse(true);
      const timeout = setTimeout(() => setShowPulse(false), 500);
      prevSolutionCountRef.current = solutionCount;
      return () => clearTimeout(timeout);
    }
  }, [solutionCount]);

  // Format elapsed time
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Time:</span>
          <span className="font-mono font-medium text-foreground tabular-nums">{formatTime(elapsed)}</span>
        </div>

        <div className={`flex items-center gap-1 transition-transform duration-300 ease-brand ${showPulse ? 'scale-105' : ''}`}>
          <span className="text-muted-foreground">Solutions:</span>
          <span className={`font-mono font-medium tabular-nums ${showPulse ? 'text-green-600' : 'text-foreground'}`}>
            <AnimatedNumber value={solutionCount} formatFn={(n) => Math.round(n).toString()} />
          </span>
        </div>

        <div
          className="flex cursor-help items-center gap-1"
          title="Total penalty score — lower is better. Sums rest violations, late finishes, and movement away from any prior schedule."
        >
          <span className="underline decoration-dotted underline-offset-2 text-muted-foreground">Score:</span>
          <span className="font-mono font-medium text-foreground tabular-nums">
            <AnimatedNumber value={objectiveScore} formatFn={(n) => Math.round(n).toString()} />
          </span>
        </div>

        {gap !== null && (
          <div
            className="flex cursor-help items-center gap-1"
            title="Optimality gap — distance between the best score found and the solver's proven lower bound. 0% means provably optimal."
          >
            <span className="underline decoration-dotted underline-offset-2 text-muted-foreground">Gap:</span>
            <span className="font-mono font-medium text-foreground tabular-nums">
              <AnimatedNumber value={gap} formatFn={(n) => `${n.toFixed(1)}%`} />
            </span>
          </div>
        )}
    </div>
  );
}
