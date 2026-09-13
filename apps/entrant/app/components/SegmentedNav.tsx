/**
 * The bordered segmented link group of the entrant site (ADR 0028): the
 * season views, the tournament sections, the schedule days and organisation,
 * the draw views. Links, never a widget — each item is a full document load,
 * and the active one is a `<span aria-current>` rather than a dead link.
 *
 * The mock rounds the group with `overflow: hidden` and keeps labels on one
 * line with `white-space: nowrap`; this tier bans both
 * (`tests/noTruncation.test.ts`), so the end items carry the inner radius
 * themselves and labels are short enough to wrap harmlessly at 390px.
 */
import type { ReactNode } from 'react';

export interface Segment {
  label: string;
  href: string;
  current?: boolean;
  /** Optional trailing figure (a count), rendered tabular. */
  count?: number | string | null;
  /** Rendered after the label, inside the item (e.g. a sr-only hint). */
  extra?: ReactNode;
}

// v3-consolidated work package 26b: `flex-wrap` added. The doc comment
// above already claimed "labels are short enough to wrap harmlessly at
// 390px", but `inline-flex` alone is `flex-wrap: nowrap` by default — there
// was no wrap utility anywhere on this group, so the three Discovery
// segments ("Season" / "Taking entries · N" / "Completed · N") forced this
// nav wider than a 320/390px viewport instead of wrapping (plan §6
// "Responsive/signage": no horizontal document scroll). Verified against a
// real running page: this alone (with the `SeasonControls.tsx` popover fix
// alongside it) closes Discovery's 320/390px horizontal-scroll defect.
const GROUP = 'inline-flex flex-wrap gap-4 border-b border-rule-soft';
// The single-row shape (`wrap={false}`): `flex-nowrap` and `min-w-full` so
// the rule under the group spans the whole scroll region, with every item
// `shrink-0` so a narrow viewport scrolls the region instead of squeezing
// the labels. Labels still wrap INSIDE an item if a locale needs it — this
// is a row of whole items, not `white-space: nowrap`.
const GROUP_ROW = 'flex min-w-full flex-nowrap gap-4 border-b border-rule-soft [&>a]:shrink-0';
// P7: the shared navigation control carries the same visible focus as every
// other action on the tier (`ACTION_LINK`'s outline) — it had none, so a
// keyboard reader tabbing across the tournament sections, the schedule days
// or the season selector saw only the browser default, which is invisible
// against this ground in several browsers.
const ITEM =
  'inline-flex min-h-9 items-center px-0.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const DIVIDER = '';
export const SEGMENT_ACTIVE = 'border-b-2 border-accent font-semibold text-accent';
export const SEGMENT_IDLE = 'text-muted-foreground hover:text-foreground';

export function SegmentedNav({
  label,
  segments,
  className = '',
  currentAttr = 'page',
  wrap = true,
}: {
  label: string;
  segments: readonly Segment[];
  className?: string;
  /** `aria-current` value for the active item: `page` for navigation, `true` for a view. */
  currentAttr?: 'page' | 'true';
  /**
   * `false` keeps the group on ONE line and lets its items keep their own
   * width, for a caller that puts the group inside its own horizontal
   * scroll region (the tournament tab bar on a phone). The default wraps,
   * which is right for a group that has no scroll region of its own.
   */
  wrap?: boolean;
}) {
  const group = wrap ? GROUP : GROUP_ROW;
  return (
    <nav aria-label={label} className={className === '' ? group : `${group} ${className}`}>
      {segments.map((segment, index) => {
        const classes = `${ITEM} ${index === 0 ? '' : `${DIVIDER} `}${
          segment.current ? SEGMENT_ACTIVE : SEGMENT_IDLE
        }`;
        const body = (
          <>
            {segment.label}
            {segment.count === null || segment.count === undefined ? null : (
              <span className={`ms-2 tabular-nums ${segment.current ? 'font-normal opacity-80' : ''}`}>
                {segment.count}
              </span>
            )}
            {segment.extra}
          </>
        );
        // The active item stays a real link (`aria-current="page"`), as tabs
        // and view switches conventionally do; nothing here is a dead control.
        return (
          <a
            key={segment.href}
            href={segment.href}
            aria-current={segment.current ? currentAttr : undefined}
            className={classes}
          >
            {body}
          </a>
        );
      })}
    </nav>
  );
}
