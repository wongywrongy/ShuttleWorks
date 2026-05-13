/**
 * PendingBadge — small pulsing amber dot rendered on a match card
 * while an idempotent operator command is in-flight (Step G of the
 * architecture-adjustment arc).
 *
 * Pure presentational. Subscribes to nothing; takes ``isPending`` as
 * a prop. Consumer surfaces (WorkflowPanel's UpNextCard, future
 * DragGantt match blocks, public-display TBD) subscribe to the
 * ``pendingCommandsByMatchId`` selector and pass the boolean down.
 *
 * Renders ``null`` when not pending so the badge collapses out of
 * layout when there's no in-flight command.
 *
 * The amber matches the "called" traffic-light hue elsewhere in the
 * app (Tailwind ``amber-500``); the pulse is the standard
 * ``animate-pulse`` utility. Tooltip is a native ``title`` attribute
 * for accessibility without dragging in a Radix Tooltip — the badge
 * is decoration, not an interactive primary surface.
 */
import { forwardRef } from 'react';

export interface PendingBadgeProps {
  /** Whether the consumer has an in-flight command for the match. */
  isPending: boolean;
  /**
   * Optional tooltip override. Defaults to the prompt's spec text.
   */
  tooltip?: string;
  /** Optional extra Tailwind classes for positioning at the call site. */
  className?: string;
}

export const PendingBadge = forwardRef<HTMLSpanElement, PendingBadgeProps>(
  function PendingBadge(
    { isPending, tooltip = 'Change pending — waiting for connection', className = '' },
    ref,
  ) {
    if (!isPending) return null;
    return (
      <span
        ref={ref}
        role="status"
        aria-live="polite"
        title={tooltip}
        data-testid="pending-badge"
        className={
          `inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse ` +
          `shadow-sm shadow-amber-500/40 ${className}`
        }
      />
    );
  },
);
