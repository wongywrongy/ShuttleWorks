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
 * Status is plain text or a text link. SP-P9 reserves containers for neither
 * routine state nor live state on public discovery.
 */
import type { StatusCell } from '../lib/phase';
import { chipLabel } from '../lib/phase';

export function SeasonStatusCell({ cell }: { cell: StatusCell }) {
  if (cell.kind === 'chip-open') {
    return <span className="text-sm font-semibold text-foreground">{chipLabel(cell.chip)}</span>;
  }

  if (cell.kind === 'chip-live') {
    return (
      <a
        href={cell.href}
        className="relative z-10 text-sm font-semibold text-status-live underline-offset-4 hover:underline"
      >
        {cell.label}
      </a>
    );
  }

  if (cell.kind === 'chip-muted') {
    return (
      <span className="text-sm font-medium text-muted-foreground">
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
