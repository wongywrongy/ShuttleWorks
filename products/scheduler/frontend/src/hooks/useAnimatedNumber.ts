/**
 * Smoothly animates a numeric value toward its target using requestAnimationFrame.
 *
 * Used by the SolverHud to tick the objective score down as the solver finds
 * better solutions. An instant jump looks like a state reset; a 300 ms interpolation
 * makes the optimization feel alive.
 */
import { useEffect, useRef, useState } from 'react';

export function useAnimatedNumber(
  target: number | undefined,
  durationMs: number = 320,
): number | undefined {
  const [display, setDisplay] = useState<number | undefined>(target);
  const fromRef = useRef<number | undefined>(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === undefined) {
      setDisplay(undefined);
      fromRef.current = undefined;
      return;
    }
    const from = fromRef.current ?? target;
    const start = performance.now();

    // Respect prefers-reduced-motion: skip the interpolation and snap.
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from === target) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (target - from) * eased;
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, durationMs]);

  return display;
}
