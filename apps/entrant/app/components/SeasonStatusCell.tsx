/**
 * The §2.4 status column. One right-aligned cell per calendar row; the STATE
 * arrives decided (`statusCell`, `lib/phase.ts`) — there is no judgement here.
 *
 * Never a dead link, by construction rather than by care: `StatusCell` is a
 * closed sum type whose `completed` arm carries no `href` field at all, so the
 * "Completed, but no winners published" row has nowhere to link and no way to
 * grow a link by accident (§7 trap 3).
 *
 * The two link arms are `relative z-10`: every calendar row is one stretched
 * link over the tournament page, and a real link inside it has to sit above
 * that overlay or the row swallows the click.
 *
 * No `whitespace-nowrap` here, unlike `StatusChip`: that allowance is one
 * allowlisted line for a closed four-string vocabulary, and these labels
 * ("In progress · follow live") are longer. They wrap at 380px, which is the
 * tier's rule — a pill that wraps beats a value the reader cannot see.
 */
import type { StatusCell } from '../lib/phase';
import { StatusChip } from './StatusChip';

/** Both chip arms share the pill shape; only the ramp differs. */
const PILL = 'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium';

export function SeasonStatusCell({ cell }: { cell: StatusCell }) {
  // The open row is the chip the whole tier already wears — same component,
  // same two-state copy, no second vocabulary for the same fact.
  if (cell.kind === 'chip-open') return <StatusChip state={cell.chip} />;

  if (cell.kind === 'chip-live') {
    return (
      <a
        href={cell.href}
        className={`relative z-10 ${PILL} border-status-live/40 bg-status-live-bg text-status-live underline-offset-4 hover:underline`}
      >
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-live" />
        {cell.label}
      </a>
    );
  }

  if (cell.kind === 'chip-muted') {
    return (
      <span className={`${PILL} border-status-done/40 bg-status-done-bg text-status-done`}>
        {cell.label}
      </span>
    );
  }

  if (cell.kind === 'link') {
    return (
      <a
        href={cell.href}
        className="relative z-10 text-sm font-semibold text-accent underline-offset-4 hover:underline"
      >
        {cell.label} →
      </a>
    );
  }

  return <span className="text-sm text-muted-foreground">{cell.label}</span>;
}
