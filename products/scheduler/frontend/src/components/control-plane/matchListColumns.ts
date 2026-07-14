/**
 * MATCH_LIST_COLUMNS — the single column geometry shared by Meet Matches
 * and Bracket Matches. Anatomy: warning-icon gutter (Meet) / spacer
 * (Bracket) · per-group `#` · event code · two flex-[3] sides · Status ·
 * trailing action gutter (Meet: delete button, Bracket: contingency menu).
 * One spec so the two surfaces cannot drift; the parity test pins usage.
 */
import type { BandedListColumn } from './BandedList';

export const MATCH_LIST_COLUMNS: BandedListColumn[] = [
  { label: '', className: 'w-4' },
  { label: '#', className: 'w-8' },
  { label: 'Event', className: 'w-20' },
  { label: 'Side A', className: 'min-w-0 flex-[3]' },
  { label: 'Side B', className: 'min-w-0 flex-[3]' },
  { label: 'Status', className: 'w-[5.5rem] text-right' },
  { label: '', className: 'w-8' },
];
