/**
 * The merged setup checklist (SP-UI-1) — readiness and "needs attention" as
 * ONE object instead of two lists stating the same fact set.
 *
 * Each step renders once. Incomplete steps carry their reason as a subline and
 * a direct action routing to the surface that fixes them; completed steps
 * compress to a single checked line with no subline; blocked steps stay
 * present but quiet so the sequence is legible.
 *
 * Two densities: `full` for the Overview's primary column (action buttons),
 * `compact` for the Hub's 344px rail (no buttons — the rail already has a
 * primary CTA, and a second column of buttons in 344px reads as clutter).
 */
import type { AppTab } from '../../store/uiStore';
import type { ChecklistStep } from '../../platform/domain/setupChecklist';

interface Props {
  steps: readonly ChecklistStep[];
  variant?: 'full' | 'compact';
  /** Invoked with the step's target segment. Omitted in `compact`. */
  onAction?: (segment: AppTab) => void;
  testId?: string;
}

/** State icon: done → filled check; blocked → hollow muted; actionable →
 *  hollow at full strength so the eye lands on the step that is next. */
function StepIcon({ step }: { step: ChecklistStep }) {
  if (step.done) {
    return (
      <span
        aria-hidden
        className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-status-live/15 text-[10px] text-status-live"
      >
        ✓
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={[
        'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]',
        step.blocked ? 'border-border text-text-muted' : 'border-ink-faint text-ink-faint',
      ].join(' ')}
    >
      ○
    </span>
  );
}

export function SetupChecklist({ steps, variant = 'full', onAction, testId }: Props) {
  if (steps.length === 0) return null;
  const compact = variant === 'compact';

  return (
    <ul
      data-testid={testId ?? 'setup-checklist'}
      className={compact ? 'space-y-1.5' : 'divide-y divide-rule-soft'}
    >
      {steps.map((step) => (
        <li
          key={step.key}
          data-testid={`setup-step-${step.key}`}
          data-state={step.done ? 'done' : step.blocked ? 'blocked' : 'actionable'}
          className={[
            'flex items-start gap-2.5',
            compact ? '' : 'py-2.5',
            // Completed steps compress and recede — they are history, not work.
            step.done ? 'text-text-muted' : step.blocked ? 'text-text-muted' : 'text-foreground',
          ].join(' ')}
        >
          <StepIcon step={step} />

          <div className="min-w-0 flex-1">
            <span
              className={[
                'block capitalize',
                compact ? 'text-xs' : 'text-sm',
                step.done ? '' : step.blocked ? '' : 'font-medium',
              ].join(' ')}
            >
              {step.label}
            </span>
            {/* The former "needs attention" copy, now attached to the step it
                explains rather than restated in a second list. */}
            {step.reason && !step.done ? (
              <span className="mt-0.5 block text-xs text-text-muted">{step.reason}</span>
            ) : null}
          </div>

          {!compact && step.action && onAction ? (
            <button
              type="button"
              data-testid={`setup-action-${step.key}`}
              onClick={() => onAction(step.action!.segment)}
              className={[
                'shrink-0 rounded-sm border border-border px-2.5 py-1 text-xs font-medium',
                'text-foreground transition-colors duration-fast ease-brand',
                'hover:border-accent/40 hover:bg-accent/10 hover:text-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              ].join(' ')}
            >
              {step.action.label}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
