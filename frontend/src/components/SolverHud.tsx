import { useEffect, useRef, useState } from 'react';
import { useAppStore, type SolverPhase } from '../store/appStore';
import { useSchedule } from '../hooks/useSchedule';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

type PhaseStyle = {
  label: string;
  ring: string;          // CSS custom property value for --phase-ring (used by phase-glow)
  pill: string;          // Tailwind classes
  dot: string;           // colored status LED
  loop: boolean;         // whether to run infinite glow
};

const PHASES: Record<NonNullable<SolverPhase>, PhaseStyle> = {
  presolve: {
    label: 'Presolve',
    ring: 'rgba(245, 158, 11, 0.55)',
    pill: 'bg-amber-50 text-amber-800 border-amber-300',
    dot: 'bg-amber-500',
    loop: true,
  },
  search: {
    label: 'Searching',
    ring: 'rgba(59, 130, 246, 0.55)',
    pill: 'bg-blue-50 text-blue-800 border-blue-300',
    dot: 'bg-blue-500',
    loop: true,
  },
  proving: {
    label: 'Proving optimal',
    ring: 'rgba(16, 185, 129, 0.55)',
    pill: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    dot: 'bg-emerald-500',
    loop: false,
  },
};

export function SolverHud() {
  const hud = useAppStore((s) => s.solverHud);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const activeTab = useAppStore((s) => s.activeTab);

  // Track whether a final "complete" sheen should play this render.
  const [celebrate, setCelebrate] = useState(false);
  const prevSolutionCountRef = useRef(hud.solutionCount);
  const [objKey, setObjKey] = useState(0); // remounts the obj span so animate-obj-flash replays

  // Trigger obj-flash when a better solution arrives.
  useEffect(() => {
    if (hud.solutionCount > prevSolutionCountRef.current) {
      setObjKey((k) => k + 1);
    }
    prevSolutionCountRef.current = hud.solutionCount;
  }, [hud.solutionCount]);

  // Celebrate when the solver finishes in proving phase (OPTIMAL).
  useEffect(() => {
    if (!isGenerating && hud.phase === 'proving' && hud.solutionCount > 0) {
      setCelebrate(true);
      const t = window.setTimeout(() => setCelebrate(false), 1200);
      return () => window.clearTimeout(t);
    }
  }, [isGenerating, hud.phase, hud.solutionCount]);

  // All hooks must be called unconditionally (Rules of Hooks). The early
  // return for the TV tab happens *after* every hook has been called.
  const animatedObjective = useAnimatedNumber(hud.objective);
  const animatedBound = useAnimatedNumber(hud.bestBound);

  if (activeTab === 'tv') return null;

  const phaseStyle = hud.phase ? PHASES[hud.phase] : null;
  const showHud = isGenerating || hud.solutionCount > 0 || hud.phase !== null;
  if (!showHud) {
    return (
      <footer className="sticky bottom-0 z-10 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2 text-xs text-gray-500">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-300" aria-hidden />
          Solver idle — click Generate to begin.
        </span>
      </footer>
    );
  }

  return (
    <footer
      data-testid="solver-hud"
      className={[
        'relative sticky bottom-0 z-10 flex items-center gap-4 border-t border-gray-200 bg-white px-4 py-2 text-xs text-gray-700 overflow-hidden',
      ].join(' ')}
    >
      {/* Scanline — only during active solve */}
      {isGenerating ? <div className="scan-bar" aria-hidden /> : null}

      {/* One-shot sheen when solver proves optimal */}
      {celebrate ? <div className="sheen-overlay" aria-hidden /> : null}

      {phaseStyle ? (
        <span
          data-testid="solver-hud-phase"
          key={hud.phase ?? ''}
          style={{ ['--phase-ring' as string]: phaseStyle.ring }}
          className={[
            'relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium tracking-tight',
            phaseStyle.pill,
            phaseStyle.loop && isGenerating ? 'motion-safe:animate-phase-glow' : '',
          ].join(' ')}
        >
          <span
            className={[
              'h-1.5 w-1.5 rounded-full',
              phaseStyle.dot,
              phaseStyle.loop && isGenerating ? 'motion-safe:animate-pulse' : '',
            ].join(' ')}
            aria-hidden
          />
          {phaseStyle.label}
        </span>
      ) : null}

      {hud.numMatches !== undefined ? (
        <span
          data-testid="solver-hud-model"
          className="tabular-nums motion-safe:animate-[block-in_0.35s_ease-out_backwards]"
        >
          <span className="text-gray-400">Model</span>{' '}
          <span className="text-gray-700 font-medium">
            {hud.numMatches}
          </span>
          <span className="text-gray-400 mx-1">·</span>
          <span className="tabular-nums">{hud.numIntervals ?? '—'}</span>{' '}
          <span className="text-gray-400">intervals</span>
          <span className="text-gray-400 mx-1">·</span>
          <span className="tabular-nums">{hud.numNoOverlap ?? '—'}</span>{' '}
          <span className="text-gray-400">no-overlap</span>
        </span>
      ) : null}

      {hud.solutionCount > 0 ? (
        <span
          data-testid="solver-hud-solutions"
          className="inline-flex items-center gap-1.5"
        >
          <span className="text-gray-400">Solutions</span>
          <span
            key={hud.solutionCount}
            className="inline-block tabular-nums font-semibold motion-safe:animate-solution-tick"
          >
            {hud.solutionCount}
          </span>
        </span>
      ) : null}

      {animatedObjective !== undefined ? (
        <span data-testid="solver-hud-objective" className="inline-flex items-baseline gap-1.5">
          <span className="text-gray-400">Objective</span>
          <span
            key={objKey}
            className="tabular-nums font-semibold motion-safe:animate-obj-flash"
          >
            {Math.round(animatedObjective)}
          </span>
          {animatedBound !== undefined ? (
            <>
              <span className="text-gray-400">bound</span>
              <span className="tabular-nums text-gray-500">{Math.round(animatedBound)}</span>
            </>
          ) : null}
          {hud.gapPercent !== undefined ? (
            <span className="text-gray-400">({hud.gapPercent.toFixed(1)}%)</span>
          ) : null}
        </span>
      ) : null}

      {hud.elapsedMs > 0 ? (
        <span
          data-testid="solver-hud-elapsed"
          className="tabular-nums text-gray-500"
        >
          {(hud.elapsedMs / 1000).toFixed(1)}s
        </span>
      ) : null}

      <div className="ml-auto" />
      {isGenerating ? <CancelButton /> : null}
    </footer>
  );
}

function CancelButton() {
  const { cancelGeneration } = useSchedule();
  return (
    <button
      type="button"
      onClick={cancelGeneration}
      data-testid="solver-hud-cancel"
      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
    >
      Cancel
    </button>
  );
}
