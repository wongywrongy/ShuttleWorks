/**
 * TextField — the canonical single-line text input.
 *
 * Closes the primitive gap the design review found: the package shipped
 * Button/Select/Card but no input, so 54 raw `<input>` elements across 26
 * frontend files each re-derived their own look. The login form in
 * particular used `border-input` (→ `--rule-soft`, the *in-table divider*
 * token, ~1.1:1 on white) where the system's own rule is ≥3:1 for
 * controls — visually absent borders on the first screen a user sees.
 *
 * Styling deliberately mirrors `Select`'s trigger (h-7 sm / h-9 md,
 * rounded-sm, `border-rule-control`) so a text field and a dropdown sitting
 * in the same form are the same object.
 *
 * Accessibility:
 *   - label is a real <label for>; `id` is generated when not supplied.
 *   - `hint` and `error` are wired through aria-describedby; `error` also
 *     sets aria-invalid and is announced (role="alert").
 *   - Error replaces the hint in the description so a screen reader is not
 *     read the requirement and the failure in sequence.
 *
 * Password reveal: `type="password"` gets a show/hide toggle by default
 * (opt out with `revealable={false}`). The toggle is a real button, keyboard
 * reachable, and never submits the form.
 */
import * as React from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';

import { cn } from '../lib/utils';

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Visible label. Always render one — placeholders are not labels. */
  label: React.ReactNode;
  /** Persistent help text: state requirements BEFORE the user submits. */
  hint?: React.ReactNode;
  /** Field-level failure. Replaces the hint while present. */
  error?: React.ReactNode;
  /** sm = h-7 (dense rows); md = h-9 (forms). Default md. */
  size?: 'sm' | 'md';
  /** Show/hide toggle. Defaults on for `type="password"`. */
  revealable?: boolean;
  /** Extra classes for the outer <div>. */
  className?: string;
  /** Extra classes for the <input> itself. */
  inputClassName?: string;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      hint,
      error,
      size = 'md',
      revealable,
      className,
      inputClassName,
      id,
      type = 'text',
      disabled,
      ...inputProps
    },
    ref,
  ) {
    const reactId = React.useId();
    const fieldId = id ?? `tf-${reactId}`;
    const hintId = `${fieldId}-hint`;
    const errorId = `${fieldId}-error`;

    const isPassword = type === 'password';
    const canReveal = revealable ?? isPassword;
    const [revealed, setRevealed] = React.useState(false);
    const resolvedType = isPassword && revealed ? 'text' : type;

    const describedBy = error ? errorId : hint ? hintId : undefined;
    const sizeClass = size === 'sm' ? 'h-7 px-2' : 'h-9 px-3';

    return (
      <div className={cn('block', className)}>
        <label
          htmlFor={fieldId}
          className="mb-1 block text-xs font-medium text-foreground"
        >
          {label}
        </label>
        <div className="relative">
          <input
            {...inputProps}
            ref={ref}
            id={fieldId}
            type={resolvedType}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'w-full rounded-sm border bg-bg-elev text-sm text-foreground',
              'placeholder:text-muted-foreground',
              'transition-colors duration-fast ease-brand',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground',
              error
                ? 'border-destructive'
                : 'border-rule-control hover:border-border',
              sizeClass,
              // Room for the reveal button so long values never slide under it.
              isPassword && canReveal && 'pr-9',
              inputClassName,
            )}
          />
          {isPassword && canReveal ? (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              disabled={disabled}
              // The label states the action, matching the button convention
              // elsewhere: say what happens, not what is true now.
              aria-label={revealed ? 'Hide password' : 'Show password'}
              aria-pressed={revealed}
              className={cn(
                'absolute inset-y-0 right-0 flex w-9 items-center justify-center',
                'text-muted-foreground transition-colors duration-fast ease-brand',
                'hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {revealed ? (
                <EyeSlash className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>
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
