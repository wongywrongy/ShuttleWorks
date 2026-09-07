/**
 * Checkbox — the canonical boolean control for a non-immediate, form-scoped
 * setting (one that waits for Save), as opposed to `Toggle`/`Switch`, which
 * are for a binary setting that takes effect immediately (R3, v3
 * consolidated plan §3 "Switch because selected Off is blue").
 *
 * Closes the same primitive gap `TextField` closed for text inputs: call
 * sites across Setup, Publish and the entrant tier each hand-rolled a bare
 * `<input type="checkbox">` with no consistent label wiring or hit area
 * (the visual box is 16-20px, well under the 24x24 CSS px AA minimum target
 * size). This wraps the native input in a real `<label>` so the whole
 * label text is part of the hit area and the measured target is never
 * smaller than 24x24, without inflating the visible box — WCAG 2.2's target
 * size criterion is satisfied by the clickable region, not the paint.
 *
 * Accessibility:
 *   - `<label>` wraps the input, so a screen reader's accessible name comes
 *     from the label text with no extra `aria-label` needed; `for`/`id`
 *     wiring still applies for the id-based association contract shared
 *     with `TextField`/`Select`.
 *   - `hint` and `error` wire through `aria-describedby`, same contract as
 *     `TextField`.
 */
import * as React from 'react';

import { cn } from '../lib/utils';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Visible label. Always render one — an icon-only checkbox has no name. */
  label: React.ReactNode;
  /** Persistent help text below the control. */
  hint?: React.ReactNode;
  /** Field-level failure. Replaces the hint while present. */
  error?: React.ReactNode;
  /** Extra classes for the outer <label>. */
  className?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, hint, error, className, id, disabled, ...inputProps }, ref) {
    const reactId = React.useId();
    const fieldId = id ?? `cb-${reactId}`;
    const hintId = `${fieldId}-hint`;
    const errorId = `${fieldId}-error`;
    const describedBy = error ? errorId : hint ? hintId : undefined;

    return (
      <div className={className}>
        <label
          htmlFor={fieldId}
          className={cn(
            // min-h-6 (24px) is the measured hit area, not a pseudo-element —
            // the label itself is the clickable region and it is never
            // smaller than the AA target-size minimum.
            'inline-flex min-h-6 cursor-pointer select-none items-start gap-2 text-sm text-foreground',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <input
            {...inputProps}
            ref={ref}
            id={fieldId}
            type="checkbox"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded-xs border border-rule-control text-accent accent-accent',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed',
            )}
          />
          <span>{label}</span>
        </label>
        {error ? (
          <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="mt-1 text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
