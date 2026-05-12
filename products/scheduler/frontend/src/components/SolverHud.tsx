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

// Phase pills route through the semantic ``--status-*`` palette so the
// HUD reads on the same hue ladder as Gantt blocks, toast borders, and
// the TabBar app-status chip. ``ring`` is the rgba expansion of the
// matching token at the saturated lightness — used by the phase-glow
// keyframe (which can't read CSS custom properties directly).
const PHASES: Record<NonNullable<SolverPhase>, PhaseStyle> = {
  presolve: {
    label: 'Presolve',
    ring: 'hsla(38, 92%, 42%, 0.55)',
    pill: 'bg-status-called-bg text-status-called border-status-called/40',
    dot: 'bg-status-called',
    loop: true,
  },
  search: {
    label: 'Searching',
    ring: 'hsla(199, 89%, 38%, 0.55)',
    pill: 'bg-status-started-bg text-status-started border-status-started/40',
    dot: 'bg-status-started',
    loop: true,
  },
  proving: {
    label: 'Proving optimal',
    ring: 'hsla(142, 71%, 38%, 0.55)',
    pill: 'bg-status-live-bg text-status-live border-status-live/40',
    dot: 'bg-status-live',
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
    // The "Solver idle — click Generate to begin." hint is only useful on
    // the surface where the operator would actually click Generate
    // (Schedule). Showing it on Roster / Matches / Live / Setup is just
    // chrome that floats over real content. Hide entirely off-Schedule.
    if (activeTab !== 'schedule') return null;
    return (
      <footer className="sticky bottom-0 z-hud flex items-center justify-between border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-border" aria-hidden />
          Solver idle — click Generate to begin.
        </span>
      </footer>
    );
  }

  return (
    <footer
      data-testid="solver-hud"
      className={[
        'relative sticky bottom-0 z-hud flex items-center gap-4 border-t border-border bg-card px-4 py-2 text-xs text-foreground overflow-hidden',
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
          <span className="text-muted-foreground">Model</span>{' '}
          <span className="text-foreground font-medium">
            {hud.numMatches}
          </span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="tabular-nums">{hud.numIntervals ?? '—'}</span>{' '}
          <span className="text-muted-foreground">intervals</span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="tabular-nums">{hud.numNoOverlap ?? '—'}</span>{' '}
          <span className="text-muted-foreground">no-overlap</span>
        </span>
      ) : null}

      {hud.solutionCount > 0 ? (
        <span
          data-testid="solver-hud-solutions"
          className="inline-flex items-center gap-1.5"
        >
          <span className="text-muted-foreground">Solutions</span>
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
          <span className="text-muted-foreground">Objective</span>
          <span
            key={objKey}
            className="tabular-nums font-semibold text-status-live motion-safe:animate-obj-flash [text-shadow:0_0_12px_hsla(142,71%,45%,0.35)]"
          >
            {Math.round(animatedObjective)}
          </span>
          {animatedBound !== undefined ? (
            <>
              <span className="text-muted-foreground">bound</span>
              <span className="tabular-nums text-muted-foreground">{Math.round(animatedBound)}</span>
            </>
          ) : null}
          {hud.gapPercent !== undefined ? (
            <span className="text-muted-foreground">({hud.gapPercent.toFixed(1)}%)</span>
          ) : null}
        </span>
      ) : null}

      {hud.elapsedMs > 0 ? (
        <span
          data-testid="solver-hud-elapsed"
          className="tabular-nums text-muted-foreground"
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
      className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground hover:bg-muted/40 transition-colors"
    >
      Cancel
    </button>
  );
}
