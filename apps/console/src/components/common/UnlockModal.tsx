/**
 * Strong-confirm dialog at the schedule-lock boundary.
 *
 * Replaces the bare ``window.confirm`` previously used by ``useLockGuard``
 * with a real modal that:
 *   - Spells out exactly what will be cleared (committed schedule,
 *     candidates, solver HUD).
 *   - Optionally describes the triggering action so the operator
 *     remembers what they clicked (e.g., "Edit court count").
 *   - Defaults focus to the *Cancel* button, not the destructive one.
 *   - Uses the existing ``Modal`` primitive for focus trap + Escape
 *     + backdrop-click, all consistent with the rest of the app.
 *
 * The two-phase commit pipeline (proposal → review → commit) is the
 * primary path for changing a committed schedule; this modal is the
 * escape hatch for "throw it all away and start over" intent.
 */
import { useState } from 'react';
import { Modal } from './Modal';

interface UnlockModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  /** Short phrase describing what the operator was trying to do, e.g.
   *  "Edit court count" or "Add a new player". Optional — when omitted
   *  the modal uses generic copy. */
  actionDescription?: string;
  /** Extra disclosure line for the cross-module case, e.g. "This will
   *  also clear the bracket schedule." Optional — omitted when the
   *  triggering 409 only named the current module's own schedule. */
  crossModuleNote?: string;
}

export function UnlockModal({
  onConfirm,
  onCancel,
  actionDescription,
  crossModuleNote,
}: UnlockModalProps) {
  // Tracks whether the operator has explicitly clicked the destructive
  // primary. We deliberately don't auto-focus it — the destructive
  // button is the *second* tab stop after Cancel.
  const [, setTouched] = useState(false);

  const action = actionDescription || 'This change';

  return (
    <Modal onClose={onCancel} titleId="unlock-modal-title" widthClass="max-w-lg">
      <div className="p-6">
        <h2
          id="unlock-modal-title"
          className="text-lg font-semibold text-foreground"
        >
          Discard committed schedule?
        </h2>
        <p className="mt-3 text-sm text-foreground">
          {action} will clear the currently committed schedule. The next
          generate or replan will start fresh.
        </p>
        {crossModuleNote && (
          <p className="mt-2 text-sm font-medium text-danger-fg">
            {crossModuleNote}
          </p>
        )}
        <div className="mt-4 rounded border border-border bg-muted p-3 text-sm text-muted-foreground">
          <div className="font-medium text-foreground">This will clear:</div>
          <ul className="mt-1 list-disc pl-5">
            <li>The committed schedule and any alternate schedules it produced</li>
            <li>Scheduling progress and recent log entries</li>
            <li>Any in-flight proposal awaiting review</li>
          </ul>
          <div className="mt-2 text-muted-foreground">
            Match states (called/started/finished, scores) are preserved.
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              onConfirm();
            }}
            className="rounded border border-danger-fg bg-danger px-4 py-2 text-sm font-medium text-danger-fg hover:bg-danger-strong focus:outline-none focus:ring-2 focus:ring-danger-fg"
          >
            Discard committed schedule
          </button>
        </div>
      </div>
    </Modal>
  );
}
