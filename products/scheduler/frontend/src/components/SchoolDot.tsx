/**
 * Tiny colored marker used as a school identifier across player chips,
 * match cards, and live ops blocks. Deliberately minimal — 8×8 px,
 * no border, no label. Tooltip carries the school name for screen
 * readers and hover.
 *
 * A rounded SQUARE, not a circle (SP-CONSOLE-2 MAT-4): a round dot means
 * match state everywhere else in the console, so shape keeps school
 * identity out of the status vocabulary even before hue does.
 */
import type { SchoolAccent } from '../lib/schoolAccent';

interface SchoolDotProps {
  accent: SchoolAccent;
  /** ``sm`` = 8px (default, inline next to text — 8px is the contrast
   *  floor for the dot to read). ``md`` = 8px (chips, card headers).
   *  ``lg`` = 10px (TV, headline contexts). */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_PX: Record<NonNullable<SchoolDotProps['size']>, number> = {
  sm: 8,
  md: 8,
  lg: 10,
};

export function SchoolDot({ accent, size = 'sm', className = '' }: SchoolDotProps) {
  if (!accent.name) return null;
  const px = SIZE_PX[size];
  return (
    <span
      className={`inline-block shrink-0 rounded-[2px] align-middle ${className}`}
      style={{ width: px, height: px, backgroundColor: accent.color }}
      aria-label={`School: ${accent.name}`}
      title={accent.name}
    />
  );
}
