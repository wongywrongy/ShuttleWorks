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

/**
 * Legacy imports occasionally contain a storage slug where the public event
 * code belongs (for example `mens_doubles_final`). Keep normalization at the
 * rendering boundary so the public page never exposes database-style names;
 * the wire contract and operator vocabulary remain unchanged.
 */
function displayEventCode(code: string): string {
  const compact = eventCodeLabel(code);
  if (!compact.includes('_')) return compact;
  return compact
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function displayEventName(name: string, code: string): string {
  const source = name.trim() || code;
  if (!source.includes('_')) return source;
  return source
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function EventRow({
  event,
  entrantsHref,
}: {
  event: EntryEventDTO;
  /** Null when the Entrants tab is not visible — no link to a hidden panel. */
  entrantsHref: string | null;
}) {
  const publicFields = event as EntryEventDTO & { format?: string | null; eligibility?: string | null; capacity?: number | null; drawPublished?: boolean; resultsPublished?: boolean };
  const facts = [publicFields.format, publicFields.eligibility ?? genderLabel(event.genderConstraint)].filter(Boolean);
  const countLabel = publicFields.capacity !== null && publicFields.capacity !== undefined
    ? `${event.entryCount} of ${publicFields.capacity} entered`
    : `${event.entryCount} entered`;
  const state = event.isOpen ? 'Open for entries' : publicFields.resultsPublished ? 'Results published' : publicFields.drawPublished ? 'Draw published' : 'Entries closed';
  return (
    <li className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-medium text-foreground">
          {displayEventName(event.discipline, event.code) || "Tournament event"}{' '}
          <span className="text-xs font-semibold tracking-wide text-muted-foreground">
            ({displayEventCode(event.code)})
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {facts.join(' · ')}{event.ageBracketed ? ' · Age-restricted' : ''}
        </p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">{state}</p>
      </div>
      {/* One template string, not adjacent JSX expressions: React 19's SSR
          stream separates those with comment nodes, breaking text-level
          assertions and, worse, screen-reader continuity of the phrase. */}
      <p className="text-sm tabular-nums text-muted-foreground">{countLabel}</p>
      <p className={`text-sm font-medium ${event.isOpen ? 'text-status-live' : 'text-status-done'}`}>
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
