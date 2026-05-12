/**
 * PositionGrid helpers — pure constants + small helpers used across
 * PositionGrid's internal sub-components.
 *
 * EVENT_LABEL encodes per-event identity color (not status — events
 * are five distinct disciplines, not a state machine). Each event gets:
 *   - LIGHT mode: pastel header + tinted body wash (high contrast text
 *     on light pastel)
 *   - DARK mode: low-saturation 15% header tint + 5% body wash so the
 *     pastels don't punch holes through the dark substrate. Header
 *     text shifts to the 300-band of each hue for legibility on the
 *     muted background.
 *
 * Header borders move from the 400-band (vivid on light) to the
 * 500/40 alpha (muted on dark) so the table grid stays visible
 * without screaming.
 */

export const EVENT_ORDER = ['MD', 'WD', 'XD', 'WS', 'MS'] as const;

export const EVENT_LABEL: Record<
  string,
  { full: string; header: string; body: string }
> = {
  MS: {
    full: "Men's Singles",
    header: 'bg-blue-200 dark:bg-blue-500/15 text-blue-900 dark:text-blue-300 border-blue-400 dark:border-blue-500/40',
    body:   'bg-blue-50/40 dark:bg-blue-500/5',
  },
  WS: {
    full: "Women's Singles",
    header: 'bg-purple-200 dark:bg-purple-500/15 text-purple-900 dark:text-purple-300 border-purple-400 dark:border-purple-500/40',
    body:   'bg-purple-50/40 dark:bg-purple-500/5',
  },
  MD: {
    full: "Men's Doubles",
    header: 'bg-rose-200 dark:bg-rose-500/15 text-rose-900 dark:text-rose-300 border-rose-400 dark:border-rose-500/40',
    body:   'bg-rose-50/40 dark:bg-rose-500/5',
  },
  WD: {
    full: "Women's Doubles",
    header: 'bg-teal-200 dark:bg-teal-500/15 text-teal-900 dark:text-teal-300 border-teal-400 dark:border-teal-500/40',
    body:   'bg-teal-50/40 dark:bg-teal-500/5',
  },
  XD: {
    full: "Mixed Doubles",
    header: 'bg-amber-200 dark:bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-400 dark:border-amber-500/40',
    body:   'bg-amber-50/40 dark:bg-amber-500/5',
  },
};

export function isDoubles(prefix: string): boolean {
  return prefix.endsWith('D');
}
