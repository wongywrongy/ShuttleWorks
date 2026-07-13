/**
 * The small "×" delete affordance on a row, guarded by the canon two-click arm.
 *
 * Interaction-audit finding F1: deleting a roster player and deleting a match
 * were single-click, hover-revealed, irreversible, and completely unguarded —
 * while the very same app already used a two-click arm for Generate-replace and
 * Remove-player. One stray click destroyed data with no confirm and no undo.
 *
 * The first press arms (the × turns into a destructive check that names the
 * consequence); the second press commits; the arm decays after a few seconds and
 * on blur, so a stray first click is harmless.
 */
import { Check, X } from '@phosphor-icons/react';
import { useConfirmClick } from '../hooks/useConfirmClick';

export function ConfirmDeleteButton({
  label,
  onConfirm,
  className = '',
  testId,
}: {
  /** What is being deleted, for the accessible name ("Remove Alice"). */
  label: string;
  onConfirm: () => void;
  className?: string;
  testId?: string;
}) {
  const confirm = useConfirmClick(onConfirm);
  return (
    <button
      type="button"
      data-no-select="true"
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        confirm.press();
      }}
      onBlur={confirm.reset}
      title={confirm.armed ? `Click again to remove ${label}` : `Remove ${label}`}
      aria-label={
        confirm.armed ? `Confirm removal of ${label}` : `Remove ${label}`
      }
      className={[
        'shrink-0 rounded-sm p-0.5 transition-opacity duration-fast ease-brand',
        // Armed: stay visible (it is no longer a hover-only affordance) and read
        // as destructive, so the second click is an informed one.
        confirm.armed
          ? 'bg-destructive/10 text-destructive opacity-100'
          : 'text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100',
        className,
      ].join(' ')}
    >
      {confirm.armed ? (
        <Check aria-hidden="true" weight="bold" className="h-3.5 w-3.5" />
      ) : (
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
