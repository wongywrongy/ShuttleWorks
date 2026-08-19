/**
 * SchoolChip — the compact club identity chip (SP-CONSOLE-REFINE G6):
 * accent dot + the school's short code ("NBA"), full name in the tooltip.
 * Replaces full-width school-name pills in detail panes; `SchoolDot` stays
 * the row-level cue where even a code is too much.
 *
 * The code renders in body ink, not the accent color — the 8-color palette
 * sits below AA for 10px text on tinted fills, so color identity rides on
 * the dot and the text stays legible.
 */
import type { SchoolAccent } from '../lib/schoolAccent';

export function SchoolChip({
  accent,
  className = '',
}: {
  accent: SchoolAccent;
  className?: string;
}) {
  if (!accent.name) return null;
  return (
    <span
      title={accent.name}
      className={`inline-flex shrink-0 items-center gap-1 rounded-sm border border-border bg-muted/40 px-1 py-px text-3xs font-semibold text-muted-foreground ${className}`}
    >
      {/* Bare marker, not <SchoolDot/> — the chip's own title already names
          the school, and a second tooltip-bearing element inside it would
          announce the name twice.

          A rounded SQUARE, not a circle: round dots mean match state
          everywhere else in the console, so shape carries the distinction
          even when a school's hue happens to sit near a status one. */}
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
        style={{ backgroundColor: accent.color }}
      />
      {accent.abbrev}
    </span>
  );
}
