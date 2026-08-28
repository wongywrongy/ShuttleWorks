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
import { isDoublesCode } from '../../../../lib/doubles';

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

/**
 * Pointer travel (px) before a roster pool row turns into a drag.
 *
 * It was 4px, which is INSIDE normal click jitter: a click that drifted four
 * pixels stopped being a click and became a drag onto whatever cell the
 * pointer was over (console-IA finding 1.2, the best code-level explanation
 * of the misclick complaint). 8px is the threshold the platform conventionally
 * uses and still fires long before a deliberate drag feels sticky.
 *
 * Lives here rather than inline in `RosterTab` so it is assertable: jsdom runs
 * no layout and dispatches no real pointer stream, so a rendering test cannot
 * observe dnd-kit's activation maths — the number itself is the contract.
 */
export const ROSTER_DRAG_ACTIVATION_DISTANCE = 8;

/** Meet Setup's supported per-event position limit. */
export const MAX_POSITION_COUNT = 20;

/**
 * A configured count safe for interactive roster consumers.
 *
 * The source-of-truth blob deliberately tolerates out-of-range legacy/junk
 * values, while Meet Setup only permits 0..20. Clamp here so a persisted
 * value cannot make the grid or player picker allocate an unbounded array.
 */
export function configuredRankCount(
  counts: Record<string, number> | undefined,
  division: string,
): number | undefined {
  const count = counts?.[division];
  return count !== undefined && Number.isSafeInteger(count) && count > 0
    ? Math.min(count, MAX_POSITION_COUNT)
    : undefined;
}

/**
 * Return a rank's configured position for one division, without producing
 * every position in that division. The numeric suffix must be canonical so
 * `MS01` does not alias the generated `MS1` slot.
 */
export function configuredSlotPosition(
  rank: string,
  division: string,
  counts: Record<string, number> | undefined,
): number | undefined {
  const count = configuredRankCount(counts, division);
  if (count === undefined || !rank.startsWith(division)) return undefined;
  const suffix = rank.slice(division.length);
  if (!/^[1-9]\d*$/.test(suffix)) return undefined;
  const position = Number(suffix);
  return Number.isSafeInteger(position) && position <= count ? position : undefined;
}

/** Whether a rank names any configured numbered position. */
export function isConfiguredSlot(
  rank: string,
  counts: Record<string, number> | undefined,
): boolean {
  return Object.keys(counts ?? {}).some(
    (division) => configuredSlotPosition(rank, division, counts) !== undefined,
  );
}

/** Whether a rank is a configured bare division awaiting position assignment. */
export function isConfiguredBareDivision(
  rank: string,
  counts: Record<string, number> | undefined,
): boolean {
  return configuredRankCount(counts, rank) !== undefined && !isConfiguredSlot(rank, counts);
}

/**
 * `isDoubles(prefix)` — true when an event prefix ("MD", "WS") is doubles.
 * `isDoublesRank(rank)` — the same question about a rank (prefix+digits,
 * e.g. "MD2"); used to enforce the singles invariant (≤1 player per school
 * per singles rank) at every mutation point.
 *
 * Both are now RE-EXPORTS of `lib/doubles.ts::isDoublesCode`, the console's
 * one authority (F-DM-13) — it strips trailing digits unconditionally, which
 * is a no-op for a prefix. The two names survive so the ~15 meet call sites
 * do not churn; there is no second rule behind them.
 */
export { isDoublesCode as isDoubles, isDoublesCode as isDoublesRank };

/** Maximum number of players a lineup position can hold. */
export function rankCapacity(rank: string): 1 | 2 {
  return isDoublesCode(rank) ? 2 : 1;
}
