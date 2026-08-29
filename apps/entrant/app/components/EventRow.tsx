/**
 * One row of the Events tab: discipline · code · constraint labels ·
 * "N entered" · open/closed as text+tone · a link into the Entrants tab's
 * anchor (Z11 — the link half of "expanding or linking"; a per-row
 * disclosure would duplicate entrant data into this panel for no
 * capability). "N entered" only — G2 (caps) was declined, so no "of M".
 */
import type { EntryEventDTO } from '../lib/entryPage.types';
import { eventCodeLabel } from '../lib/draws.types';

function genderLabel(constraint: string | null): string {
  if (constraint === null) return 'Open to all';
  const folded = constraint.toLowerCase();
  if (folded === 'm') return 'Men';
  if (folded === 'f') return 'Women';
  return constraint;
}

export function EventRow({
  event,
  entrantsHref,
}: {
  event: EntryEventDTO;
  /** Null when the Entrants tab is not visible — no link to a hidden panel. */
  entrantsHref: string | null;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-medium text-foreground">
          {event.discipline || "Tournament event"}{' '}
          <span className="rounded-full border border-rule-soft bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
            {eventCodeLabel(event.code)}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {genderLabel(event.genderConstraint)}
          {event.ageBracketed ? ' · Age-restricted' : ''}
        </p>
      </div>
      {/* One template string, not adjacent JSX expressions: React 19's SSR
          stream separates those with comment nodes, breaking text-level
          assertions and, worse, screen-reader continuity of the phrase. */}
      <p className="text-sm tabular-nums text-muted-foreground">{`${event.entryCount} entered`}</p>
      <p
        className={`text-sm font-medium ${
          event.isOpen ? 'text-status-live' : 'text-status-done'
        }`}
      >
        {event.isOpen ? 'Open' : 'Closed'}
      </p>
      {entrantsHref !== null && event.entryCount > 0 ? (
        <a
          href={entrantsHref}
          className="text-sm text-accent underline-offset-4 hover:underline"
        >
          See entrants
        </a>
      ) : null}
    </li>
  );
}
