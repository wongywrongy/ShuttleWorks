/**
 * "Up next" list — a workspace's next ≤3 scheduled matches (from
 * `signals.nextUp`). Each row: match code · time · court. Renders nothing
 * when there's nothing scheduled. The match code (e.g. "MS1") carries the
 * discipline, so no separate module glyph is needed. (The old trailing
 * "Sched" tag said nothing time · court didn't — SP-CONSOLE-REFINE H2.1.)
 *
 * Shared by the Hub inspector and the workspace Overview — it lives here
 * rather than under either product so neither imports the other's internals
 * (SP-UI-1; it was the last such edge between hub and workspace).
 *
 * Rows are DOORS when the caller supplies `linkFor` (SP-CONSOLE-2 OV-1):
 * a row that names a match and cannot open it is a readout pretending to be
 * a list. The link lands on /live with the match pre-selected
 * (`?select={source}:{id}` — Operations' own selection key, ADR 0006).
 * Rows without identity (older payloads) stay plain.
 */
import { Link } from 'react-router-dom';
import type { NextMatchDTO } from '../../api/dto';

export function NextUpList({
  items,
  linkFor,
}: {
  items: NextMatchDTO[];
  /** The /live deep link for one row; null/undefined = not linkable. */
  linkFor?: (n: NextMatchDTO) => string | null;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-[3px]">
      {items.map((n, i) => {
        const body = (
          <>
            <span className="w-9 shrink-0 text-xs font-semibold sw-num text-foreground">{n.code}</span>
            <span className="min-w-0 flex-1 break-words text-2xs sw-num text-muted-foreground">
              {[n.timeLabel, n.courtLabel].filter(Boolean).join(' · ')}
            </span>
          </>
        );
        const href = linkFor?.(n) ?? null;
        return href ? (
          <Link
            key={`${n.code}-${i}`}
            to={href}
            data-testid={`next-up-open-${n.code}`}
            className="group flex items-center gap-2.5 rounded-lg bg-surface-card px-2.5 py-2 transition-colors duration-fast ease-brand hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {body}
            <span
              aria-hidden
              className="shrink-0 text-muted-foreground transition-colors duration-fast ease-brand group-hover:text-accent"
            >
              &rsaquo;
            </span>
          </Link>
        ) : (
          <div
            key={`${n.code}-${i}`}
            className="flex items-center gap-2.5 rounded-lg bg-surface-card px-2.5 py-2"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
