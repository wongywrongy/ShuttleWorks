/**
 * Per-event-type palette shared between every gantt-style view.
 * Keys are the rank prefix (`MS`, `WD`, …); the rank suffix (e.g. `MS1`)
 * is stripped before lookup. Live and idle gantts both pull from this
 * map so the legend on one matches the blocks on the other.
 *
 * Dark-mode variants follow the codebase convention already
 * established in `MatchDetailsPanel.tsx` / `UpNextCard.tsx`: bg becomes
 * `{color}-500/15` (15%-tint readable on a dark canvas) and the border
 * lifts to `{color}-500/30`. Light-mode classes stay unchanged so
 * existing screenshots continue to match.
 */
export interface EventColor {
  bg: string;
  border: string;
  label: string;
}

export const EVENT_COLORS: Record<string, EventColor> = {
  MS: {
    bg: 'bg-blue-100 dark:bg-blue-500/15',
    border: 'border-blue-300 dark:border-blue-500/30',
    label: "Men's Singles",
  },
  WS: {
    bg: 'bg-pink-100 dark:bg-pink-500/15',
    border: 'border-pink-300 dark:border-pink-500/30',
    label: "Women's Singles",
  },
  MD: {
    bg: 'bg-green-100 dark:bg-emerald-500/15',
    border: 'border-green-300 dark:border-emerald-500/30',
    label: "Men's Doubles",
  },
  WD: {
    bg: 'bg-purple-100 dark:bg-purple-500/15',
    border: 'border-purple-300 dark:border-purple-500/30',
    label: "Women's Doubles",
  },
  XD: {
    bg: 'bg-orange-100 dark:bg-orange-500/15',
    border: 'border-orange-300 dark:border-orange-500/30',
    label: "Mixed Doubles",
  },
};

export const DEFAULT_EVENT_COLOR: EventColor = {
  // Theme tokens already adapt to dark mode via the global CSS vars.
  bg: 'bg-muted',
  border: 'border-border',
  label: 'Unknown',
};

export function getEventColor(eventRank: string | undefined | null): EventColor {
  if (!eventRank) return DEFAULT_EVENT_COLOR;
  const prefix = eventRank.match(/^[A-Z]+/)?.[0] ?? '';
  return EVENT_COLORS[prefix] ?? DEFAULT_EVENT_COLOR;
}
