/**
 * MatchStatusFilter — the status filter strip shared by BOTH match lists
 * (Meet Matches, Bracket Matches). Same chip grammar as the Hub's lifecycle
 * facet strip: quiet text, the selected facet is a raised pill, a non-zero
 * Live count reads live-green. Single-select; "All" clears.
 *
 * The active value rides the URL (`?status=`) at the call sites, mirroring
 * the `?q=` search contract — a pasted link restores the operator's view.
 */
import { STATUS_LABEL, type MatchListStatus } from './matchStatus';
import { ActiveChoice } from '../ActiveChoice';

export type MatchStatusFilterValue = MatchListStatus | 'all';

/** Chip order: lifecycle order, All first (mirrors the Hub strip). */
const CHIP_ORDER: MatchStatusFilterValue[] = ['all', 'pending', 'ready', 'live', 'done'];

export function MatchStatusFilter({
  counts,
  active,
  onChange,
  testIdPrefix,
}: {
  /** Counts over the FULL list (not the search-filtered one) so a chip
   *  always states what selecting it will show. */
  counts: Record<MatchListStatus, number>;
  active: MatchStatusFilterValue;
  onChange: (next: MatchStatusFilterValue) => void;
  testIdPrefix: string;
}) {
  const total = counts.done + counts.live + counts.ready + counts.pending;
  return (
    <div
      role="group"
      aria-label="Filter matches by status"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-rule-soft px-5 py-1.5"
    >
      {CHIP_ORDER.map((value) => {
        const count = value === 'all' ? total : counts[value];
        const isActive = active === value;
        const countTone =
          value === 'live' && count > 0 ? 'text-status-live' : 'text-ink-faint';
        return (
          <ActiveChoice
            key={value}
            active={isActive}
            geometry="segment"
            semantics="pressed"
            onClick={() => onChange(value)}
            data-testid={`${testIdPrefix}-status-${value}`}
            className="shrink-0 whitespace-nowrap px-2.5 py-1 text-2xs"
          >
            {value === 'all' ? 'All' : STATUS_LABEL[value]} ·{' '}
            <span className={`sw-num ${isActive ? 'text-current opacity-75' : countTone}`}>{count}</span>
          </ActiveChoice>
        );
      })}
    </div>
  );
}

/** Narrows a raw `?status=` URL value to the chip vocabulary; anything
 *  unknown (typo'd deep link) falls back to 'all' rather than an empty list. */
export function parseMatchStatusFilter(raw: string): MatchStatusFilterValue {
  return raw === 'pending' || raw === 'ready' || raw === 'live' || raw === 'done'
    ? raw
    : 'all';
}
