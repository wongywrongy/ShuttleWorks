/**
 * PositionGrid helpers — pure constants + small helpers used across
 * PositionGrid's internal sub-components.
 *
 * NOTE the EVENT_LABEL `header` / `body` Tailwind classes use the
 * default Tailwind palette (bg-blue-200 etc.) — BRAND.md §1.10 anti-
 * pattern. They survive here because they're a per-event accent
 * scheme the user hasn't asked to swap. A follow-up pass can route
 * them through --status-* tokens or a new --event-* palette.
 */

export const EVENT_ORDER = ['MD', 'WD', 'XD', 'WS', 'MS'] as const;

export const EVENT_LABEL: Record<
  string,
  { full: string; header: string; body: string }
> = {
  MS: {
    full: "Men's Singles",
    header: 'bg-blue-200 text-blue-900 border-blue-400',
    body:   'bg-blue-50/40',
  },
  WS: {
    full: "Women's Singles",
    header: 'bg-purple-200 text-purple-900 border-purple-400',
    body:   'bg-purple-50/40',
  },
  MD: {
    full: "Men's Doubles",
    header: 'bg-rose-200 text-rose-900 border-rose-400',
    body:   'bg-rose-50/40',
  },
  WD: {
    full: "Women's Doubles",
    header: 'bg-teal-200 text-teal-900 border-teal-400',
    body:   'bg-teal-50/40',
  },
  XD: {
    full: "Mixed Doubles",
    header: 'bg-amber-200 text-amber-900 border-amber-400',
    body:   'bg-amber-50/40',
  },
};

export function isDoubles(prefix: string): boolean {
  return prefix.endsWith('D');
}
