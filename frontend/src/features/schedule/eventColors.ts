/**
 * Per-event-type palette shared between every gantt-style view.
 * Keys are the rank prefix (`MS`, `WD`, …); the rank suffix (e.g. `MS1`)
 * is stripped before lookup. Live and idle gantts both pull from this
 * map so the legend on one matches the blocks on the other.
 */
export interface EventColor {
  bg: string;
  border: string;
  label: string;
}

export const EVENT_COLORS: Record<string, EventColor> = {
  MS: { bg: 'bg-blue-100', border: 'border-blue-300', label: "Men's Singles" },
  WS: { bg: 'bg-pink-100', border: 'border-pink-300', label: "Women's Singles" },
  MD: { bg: 'bg-green-100', border: 'border-green-300', label: "Men's Doubles" },
  WD: { bg: 'bg-purple-100', border: 'border-purple-300', label: "Women's Doubles" },
  XD: { bg: 'bg-orange-100', border: 'border-orange-300', label: "Mixed Doubles" },
};

export const DEFAULT_EVENT_COLOR: EventColor = {
  bg: 'bg-muted',
  border: 'border-border',
  label: 'Unknown',
};

export function getEventColor(eventRank: string | undefined | null): EventColor {
  if (!eventRank) return DEFAULT_EVENT_COLOR;
  const prefix = eventRank.match(/^[A-Z]+/)?.[0] ?? '';
  return EVENT_COLORS[prefix] ?? DEFAULT_EVENT_COLOR;
}
