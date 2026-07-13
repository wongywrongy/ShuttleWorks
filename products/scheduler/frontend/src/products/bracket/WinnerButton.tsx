/**
 * Record-a-winner button, guarded by the canon two-click arm.
 *
 * Recording a result is irreversible (the backend 409s an overwrite), so it
 * needs a guard. It used to be `window.confirm` — which the design canon bans,
 * and which blocks the browser's event loop, freezing the page and making the
 * action untestable (audit finding E1). The two-click arm says the same thing
 * in the surface itself: the first press re-labels the button to name the
 * consequence, the second commits, and a stray click decays on its own.
 *
 * Shared by the Live match list and the bracket match-detail panel so both
 * winner paths use one vocabulary.
 */
import { useConfirmClick } from '../../hooks/useConfirmClick';
import { INTERACTIVE_BASE } from '../../lib/utils';

const BASE =
  `${INTERACTIVE_BASE} inline-flex h-7 items-center rounded-sm px-2 text-2xs font-medium ` +
  `disabled:cursor-not-allowed disabled:opacity-50`;
const IDLE = 'border border-border bg-card text-foreground hover:bg-muted/50';
const ARMED = 'bg-destructive text-destructive-foreground hover:brightness-110';

export function WinnerButton({
  label,
  onConfirm,
  disabled,
  testId,
}: {
  /** Side name shown on the button ("Alice", "Alice / Bob"). */
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  const confirm = useConfirmClick(onConfirm);
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        confirm.press();
      }}
      onBlur={confirm.reset}
      className={`${BASE} ${confirm.armed ? ARMED : IDLE}`}
      title={
        confirm.armed
          ? `Click again to record ${label} as the winner — this cannot be undone`
          : `${label} wins`
      }
      aria-label={
        confirm.armed
          ? `Confirm ${label} as the winner — cannot be undone`
          : `${label} wins`
      }
    >
      {confirm.armed ? 'Click again' : `${label} wins`}
    </button>
  );
}
