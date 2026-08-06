/**
 * CourtMark — a badminton court, drawn to scale.
 *
 * The Direction-C signature (2026-08-06 design review). Not a decorative
 * stripe: the geometry is the real court, so the mark is recognisable to
 * anyone who has stood on one.
 *
 * The viewBox is the court in DECIMETRES — 134 × 61, the regulation
 * 13.4 m × 6.1 m — so every marking sits at its true position and the 2.2:1
 * proportion is structural rather than eyeballed:
 *
 *   - outer boundary            the doubles court
 *   - side tramlines            0.46 m in from each sideline
 *   - net                       across the middle, drawn heavier
 *   - short service lines       1.98 m either side of the net
 *   - centre lines              short service line → back boundary (the T)
 *
 * The doubles long service line (0.76 m from the back) is deliberately
 * omitted: at row scale it lands under a quarter of a pixel and only muddies
 * the mark.
 *
 * Colour comes from `currentColor`, so a mark inside a live row lights with
 * that row's state without this component knowing anything about state.
 */
import * as React from 'react';

import { cn } from '../lib/utils';

/** Court aspect ratio, 13.4 m : 6.1 m. Exported so callers can size by width. */
export const COURT_ASPECT = 134 / 61;

export interface CourtMarkProps extends React.SVGAttributes<SVGSVGElement> {
  /** Rendered width in px. Height follows the true court proportion. */
  width?: number;
  /** Fill the court surface with the sunken surface token. */
  filled?: boolean;
  /**
   * Accessible name. Omit for decoration sitting beside a visible court
   * label — the default is `aria-hidden`, because a court plan next to the
   * text "Court 3" is a duplicate announcement, not information.
   */
  label?: string;
}

export function CourtMark({
  width = 46,
  filled = true,
  label,
  className,
  ...rest
}: CourtMarkProps) {
  const height = Math.round(width / COURT_ASPECT);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 134 61"
      className={cn('block flex-none', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      {filled ? (
        <rect x="0" y="0" width="134" height="61" rx="1.5" fill="hsl(var(--surface-sunken))" />
      ) : null}
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        {/* doubles court boundary */}
        <rect x="0.8" y="0.8" width="132.4" height="59.4" rx="1.5" />
        {/* side tramlines, 0.46 m in */}
        <path d="M0.8 4.6H133.2M0.8 56.4H133.2" />
        {/* short service lines, 1.98 m either side of the net */}
        <path d="M47.2 0.8V60.2M86.8 0.8V60.2" />
        {/* centre lines — short service line to back boundary */}
        <path d="M0.8 30.5H47.2M86.8 30.5H133.2" />
      </g>
      {/* the net, drawn heavier so it reads at row scale */}
      <path d="M67 0V61" stroke="currentColor" strokeWidth="3" fill="none" />
    </svg>
  );
}
