/**
 * MATCH_LIST_COLUMNS — the single column geometry shared by Meet Matches
 * and Bracket Matches. Anatomy: warning-icon gutter (Meet) / spacer
 * (Bracket) · per-group `#` · event code · two flex-[3] sides · Status ·
 * trailing action gutter (Meet: delete button, Bracket: contingency menu).
 * One spec so the two surfaces cannot drift; the parity test pins usage.
 *
 * Priorities: `#` and `Status` collapse first when the surface narrows
 * (docked detail pane open, small window) — the sides and event code are
 * what operators actually read. Requires the surface's scroll wrapper to
 * be `@container/table`.
 *
 * MATCH_CELL — the per-column CELL class strings (geometry + priority
 * visibility) row cells must consume instead of re-declaring raw width
 * classes; the parity test pins this too.
 */
import type { BandedListColumn } from './BandedList';
import { colClass } from './BandedList';

// Fixed-width cells are `shrink-0`: they are flex items, and without it a
// docked detail pane squeezing the row CRUSHES them — their content then
// overflows onto the neighboring cells. Only the two flex sides give way.
export const MATCH_LIST_COLUMNS: BandedListColumn[] = [
  { label: '', className: 'w-4 shrink-0' },
  { label: '#', className: 'w-8 shrink-0', priority: 2 },
  { label: 'Event', className: 'w-20 shrink-0' },
  { label: 'Side A', className: 'min-w-0 flex-[3]' },
  { label: 'Side B', className: 'min-w-0 flex-[3]' },
  { label: 'Status', className: 'w-[5.5rem] shrink-0 text-right', priority: 2 },
  { label: '', className: 'w-8 shrink-0' },
];

export const MATCH_CELL = {
  warnGutter: colClass(MATCH_LIST_COLUMNS[0]),
  number: colClass(MATCH_LIST_COLUMNS[1]),
  event: colClass(MATCH_LIST_COLUMNS[2]),
  side: colClass(MATCH_LIST_COLUMNS[3]),
  status: colClass(MATCH_LIST_COLUMNS[5]),
  actionGutter: colClass(MATCH_LIST_COLUMNS[6]),
} as const;
