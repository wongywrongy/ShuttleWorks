/**
 * The workspace lifecycle stepper (SP-UI-1) — the Overview's spine.
 *
 * Replaces the "1 / 4 steps" progress bar, which measured setup completeness
 * and called it the event's state. A percentage cannot say "this event is
 * live"; a stepper can, and it is the thing an operator actually wants to
 * know at a glance.
 *
 * Renders ONLY the phases passed in — `visiblePhases` has already dropped any
 * that don't exist for this workspace. No placeholder slots, no dashed
 * "future" phases, no disabled steps: a phase appears only once it is real.
 */
import type { WorkspacePhase } from '../../platform/domain/lifecycle';
import { PHASE_LABEL } from '../../platform/domain/overviewPhase';

interface Props {
  phases: readonly WorkspacePhase[];
  current: WorkspacePhase;
  /** Renders the terminal phase as "Archived" — the shared lifecycle
   *  precedence (archived > live > complete) lives in `lifecycle.ts`. */
  archived?: boolean;
}

export function PhaseStepper({ phases, current, archived = false }: Props) {
  if (phases.length === 0) return null;
  const currentIdx = phases.indexOf(current);

  return (
    <ol
      data-testid="phase-stepper"
      aria-label="Event lifecycle"
      className="flex items-center gap-1"
    >
      {phases.map((phase, i) => {
        const done = currentIdx > -1 && i < currentIdx;
        const active = i === currentIdx;
        const isLast = i === phases.length - 1;
        const label = archived && isLast ? 'Archived' : PHASE_LABEL[phase];

        return (
          <li key={phase} className="flex items-center gap-1">
            <span
              data-testid={`phase-step-${phase}`}
              data-state={active ? 'current' : done ? 'done' : 'upcoming'}
              aria-current={active ? 'step' : undefined}
              className={[
                'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-2xs font-semibold uppercase tracking-[0.08em]',
                active
                  ? 'bg-accent/12 text-accent'
                  : done
                    ? 'text-text-secondary'
                    : 'text-text-muted',
              ].join(' ')}
            >
              {done ? (
                <span aria-hidden className="text-status-live">
                  ✓
                </span>
              ) : (
                <span
                  aria-hidden
                  className={[
                    'h-1.5 w-1.5 rounded-full',
                    active ? 'bg-accent' : 'bg-border',
                  ].join(' ')}
                />
              )}
              {label}
            </span>
            {/* Hairline connector — the spine, not decoration. */}
            {!isLast ? (
              <span aria-hidden className="h-px w-6 shrink-0 bg-border" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
