/**
 * FormActions — the one Save/Discard contract for every console
 * setup/settings form (v3 consolidated plan §3 X12, ruling R2).
 *
 * Five states, driven by plain booleans rather than a single enum so a
 * caller's own `dirty`/`saving`/`error` state maps straight through with no
 * translation layer:
 *
 *   - locked   `locked` is true: Save and Discard are not rendered at all —
 *              a disabled Save with no reason is exactly the "gray Save
 *              means disabled" anti-pattern the plan calls out. `lockedReason`
 *              is the one-line explanation of why, and what unlocks it.
 *   - clean    not dirty, not saving, no error: Save is disabled AND a
 *              visible reason sits next to it (default "No changes") — never
 *              inferred from gray pixels alone. Discard is not shown; there
 *              is nothing to discard.
 *   - dirty    Save is enabled; Discard is shown (only a real change offers
 *              Discard).
 *   - saving   Save reads "Saving…" and is disabled; Discard is hidden so a
 *              save in flight cannot be abandoned mid-request.
 *   - error    the failure message names what failed and stays visible;
 *              Save re-enables as the retry action (the draft that failed to
 *              save is still `dirty` from the form's point of view, so
 *              nothing here needs a separate "Retry" verb) and Discard stays
 *              available since the input is preserved, not cleared.
 *
 * Placement is the caller's job (a `PropertyPanel` action slot, a page
 * header) — this component only owns what renders inside that slot, so
 * "stable Save placement" is a property of where the caller puts one of
 * these, not of this component itself.
 */
import * as React from 'react';

import { cn } from '../lib/utils';
import { Button } from './Button';

export interface FormActionsProps {
  /** The draft differs from the last saved/loaded value. */
  dirty: boolean;
  /** A save request is in flight. */
  saving?: boolean;
  /** The last save attempt failed. Takes precedence over the clean reason. */
  error?: React.ReactNode;
  /** The form cannot be edited at all (e.g. `authority === 'domain'`).
   *  Hides Save/Discard entirely in favor of `lockedReason`. */
  locked?: boolean;
  /** One-line reason shown instead of Save/Discard when `locked`. */
  lockedReason?: React.ReactNode;
  /** Visible reason shown beside a disabled, clean Save. Default "No changes". */
  cleanReason?: React.ReactNode;
  onSave: () => void;
  /** Omit to hide Discard even while dirty (rare — most forms want it). */
  onDiscard?: () => void;
  saveLabel?: React.ReactNode;
  savingLabel?: React.ReactNode;
  discardLabel?: React.ReactNode;
  size?: 'sm' | 'default';
  className?: string;
  /**
   * An ambient precondition unrelated to the draft itself blocks saving
   * (e.g. offline). Unlike `locked`, this does not hide Save/Discard or
   * replace them with a reason — it disables Save on top of the ordinary
   * dirty/saving/error rules while leaving the rest of the row (and the
   * caller's own explanation of the precondition, typically a `role="status"`
   * line above this component) visible. Reserve `locked` for the form
   * itself being non-editable.
   */
  saveBlocked?: boolean;
  /**
   * Render Save as `type="submit"` with no `onClick`, so a surrounding
   * `<form onSubmit>` — not this component — drives `onSave`. Without this,
   * a native `type="submit"` button inside a form would both fire this
   * component's `onClick` AND dispatch the form's submit event, invoking
   * `onSave` twice. Default `false`: Save is `type="button"` and calls
   * `onSave` directly, for callers with no surrounding `<form>`.
   */
  asFormSubmit?: boolean;
}

export function FormActions({
  dirty,
  saving = false,
  error,
  locked = false,
  lockedReason,
  cleanReason = 'No changes',
  onSave,
  onDiscard,
  saveLabel = 'Save',
  savingLabel = 'Saving…',
  discardLabel = 'Discard',
  size = 'sm',
  className,
  saveBlocked = false,
  asFormSubmit = false,
}: FormActionsProps) {
  const reactId = React.useId();
  const reasonId = `form-actions-reason-${reactId}`;

  if (locked) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>{lockedReason}</p>
    );
  }

  const showDiscard = dirty && !saving && onDiscard != null;
  // Errored save: the draft is still logically dirty (it never reached the
  // server), so Save stays the retry action rather than growing a second verb.
  const saveDisabled = saving || saveBlocked || (!dirty && !error);

  return (
    <span className={cn('flex items-center gap-2', className)}>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : !dirty && !saving ? (
        <span id={reasonId} className="text-xs text-muted-foreground">
          {cleanReason}
        </span>
      ) : null}
      {showDiscard ? (
        <Button type="button" variant="ghost" size={size} onClick={onDiscard}>
          {discardLabel}
        </Button>
      ) : null}
      <Button
        type={asFormSubmit ? 'submit' : 'button'}
        size={size}
        onClick={asFormSubmit ? undefined : onSave}
        disabled={saveDisabled}
        aria-describedby={!error && !dirty && !saving ? reasonId : undefined}
      >
        {saving ? savingLabel : saveLabel}
      </Button>
    </span>
  );
}
