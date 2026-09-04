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

const GROUP = 'inline-flex rounded-sm border border-rule-control';
const ITEM =
  'inline-flex h-8 items-center px-3 text-sm first:rounded-s-xs last:rounded-e-xs';
const DIVIDER = 'border-s border-rule-control';
export const SEGMENT_ACTIVE = 'bg-accent font-semibold text-accent-ink';
export const SEGMENT_IDLE = 'text-muted-foreground hover:bg-surface-sunken hover:text-foreground';

export function SegmentedNav({
  label,
  segments,
  className = '',
  currentAttr = 'page',
}: {
  label: string;
  segments: readonly Segment[];
  className?: string;
  /** `aria-current` value for the active item: `page` for navigation, `true` for a view. */
  currentAttr?: 'page' | 'true';
}) {
  return (
    <nav aria-label={label} className={className === '' ? GROUP : `${GROUP} ${className}`}>
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
