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
 *
 * The ``full`` display names come from the shared, styling-free
 * ``DISCIPLINE_NAMES`` map so there's a single source of truth for the
 * discipline names; this table adds only the per-event color styling.
 */
import { DISCIPLINE_NAMES } from '../../../../lib/disciplineNames';

// Canonical order lives in lib/eventColors (shared with the bracket's
// matches list); re-exported here for the meet's existing import sites.
import { DISCIPLINE_ORDER } from '../../../../lib/eventColors';
export { DISCIPLINE_ORDER as EVENT_ORDER } from '../../../../lib/eventColors';

/**
 * The configured events of a meet, in default column order: the canonical
 * disciplines first (MD/WD/XD/WS/MS), then every OTHER configured event in
 * `rankCounts` order.
 *
 * A meet's events are ITS OWN vocabulary — a junior league configures U10 /
 * U11, not disciplines. Callers used to intersect `rankCounts` against the
 * canonical five, which silently dropped every such event: the roster grid
 * said "No events configured" on a workspace with two, and the roster export
 * wrote a sheet with no event columns (2026-08-10 browser pass). Events with
 * a zero count are omitted — that is how an event is turned off.
 */
export function defaultEventOrder(counts: Record<string, number>): string[] {
  const configured = Object.keys(counts).filter((ev) => (counts[ev] ?? 0) > 0);
  return [
    ...DISCIPLINE_ORDER.filter((ev) => configured.includes(ev)),
    ...configured.filter((ev) => !(DISCIPLINE_ORDER as readonly string[]).includes(ev)),
  ];
}

export const EVENT_LABEL: Record<
  string,
  { full: string; header: string; body: string }
> = {
  MS: {
    full: DISCIPLINE_NAMES.MS,
    header: 'bg-blue-200 dark:bg-blue-500/15 text-blue-900 dark:text-blue-300 border-blue-400 dark:border-blue-500/40',
    body:   'bg-blue-50/40 dark:bg-blue-500/5',
  },
  WS: {
    full: DISCIPLINE_NAMES.WS,
    header: 'bg-purple-200 dark:bg-purple-500/15 text-purple-900 dark:text-purple-300 border-purple-400 dark:border-purple-500/40',
    body:   'bg-purple-50/40 dark:bg-purple-500/5',
  },
  MD: {
    full: DISCIPLINE_NAMES.MD,
    header: 'bg-rose-200 dark:bg-rose-500/15 text-rose-900 dark:text-rose-300 border-rose-400 dark:border-rose-500/40',
    body:   'bg-rose-50/40 dark:bg-rose-500/5',
  },
  WD: {
    full: DISCIPLINE_NAMES.WD,
    header: 'bg-teal-200 dark:bg-teal-500/15 text-teal-900 dark:text-teal-300 border-teal-400 dark:border-teal-500/40',
    body:   'bg-teal-50/40 dark:bg-teal-500/5',
  },
  XD: {
    full: DISCIPLINE_NAMES.XD,
    header: 'bg-amber-200 dark:bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-400 dark:border-amber-500/40',
    body:   'bg-amber-50/40 dark:bg-amber-500/5',
  },
};

export function isDoubles(prefix: string): boolean {
  return prefix.endsWith('D');
}

/**
 * True when the given rank (prefix+digits, e.g. "MD2", "WS3") belongs
 * to a doubles event. Strips the trailing digits and consults
 * `isDoubles`. Used to enforce the singles invariant (≤1 player per
 * school per singles rank) at every mutation point.
 */
export function isDoublesRank(rank: string): boolean {
  const prefix = rank.replace(/\d+$/, '');
  return isDoubles(prefix);
}
