/**
 * One row of the Draws index (ADR 0028; reduced by public-visual-fixes P6).
 *
 * **Four cells, no more: event name · entrants · progress · Open.** The row
 * used to carry a facts line assembled from the draw card — format, "Open to
 * all", a pair count that repeated the count column, a round count derivable
 * from the draw itself, and "Draw published · rounds to be scheduled" beside
 * a button that already said the draw existed. None of it answered the
 * question a reader brings to an index ("where has this got to?"), and all of
 * it is on the draw page. What replaced it is one true progress phrase from
 * the projection's own `progress` (`R16 in play`, `Final 14:00`, `Complete`)
 * and nothing when the server published none.
 *
 * **The whole row is ONE native link** to the draw, so the target is the row
 * a finger or a pointer aims at and the keyboard gets one stop per event with
 * a visible focus ring. Everything inside it is therefore inert markup —
 * there is no nested anchor, which is why the champion's name renders as text
 * through the identity seam rather than as a PersonRef link, and why the
 * Entrants button is gone (the Players tab is one click away in the tab bar
 * and was the only reason this row ever held two links).
 *
 * Before a draw is published there is nothing to open, so the row is a plain
 * container and the progress cell states the entry state instead — the one
 * fact that IS live at that point.
 */
import { personRefModel } from '../../public/assets/person-ref.js';
import type { DrawCardDTO } from '../lib/draws.types';
import { drawProgressLabel, entryCountLabel, eventCodeLabel, kindLabel } from '../lib/draws.types';
import type { EntryEventDTO } from '../lib/entryPage.types';
import { eventLabel, isStandardEventCode } from '../lib/eventLabels';

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
  // V3-PE04.1: one of the five standard disciplines always reads from the
  // canonical map — "Men's singles", never a freeform "Mens Singles" the
  // organizer's `discipline` text happened to carry.
  if (isStandardEventCode(code)) return eventLabel(code);
  const source = name.trim() || code;
  const normalized = source.replace(/(?:\s+|_)final$/i, '').trim();
  if (!normalized.includes('_')) return normalized;
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/** The row's grid, shared with the index's column header. */
export const EVENT_ROW_COLUMNS = 'sm:grid-cols-[minmax(0,1fr)_7rem_9rem_4rem]';

export function EventRow({
  event,
  draw = null,
  drawHref = null,
  slug = '',
  showFormat = false,
}: {
  event: EntryEventDTO;
  /** The published draw card for this event, when there is one. */
  draw?: DrawCardDTO | null;
  drawHref?: string | null;
  slug?: string;
  /** Set by the index only when formats DIFFER between rows — a column of
   *  five identical "Elimination" tags distinguishes nothing. */
  showFormat?: boolean;
}) {
  const name = displayEventName(event.discipline, event.code) || 'Tournament event';
  const registrationCount = event.registrationCount ?? event.entryCount;
  // Exactly ONE count, in ONE unit. A published draw's own participant count
  // supersedes the registration count for this row — the two can legitimately
  // differ (imported rosters, opt-outs) and showing both read as a
  // contradiction rather than two distinct, gated sources (V3-PE04.2).
  const countLabel = draw
    ? entryCountLabel(draw.eventCode, draw.drawParticipantCount ?? draw.size)
    : entryCountLabel(event.code, registrationCount);
  // Progress is the draw's when the server published one, and the entry state
  // otherwise — never both, and never a publication message repeating what the
  // link already says.
  const progress =
    drawProgressLabel(draw?.progress) ?? (event.isOpen ? 'Entries open' : draw ? null : 'Entries closed');
  const progressTone =
    draw?.progress?.state === 'in_play'
      ? 'text-status-live'
      : event.isOpen && !draw?.progress
        ? 'text-status-live'
        : 'text-muted-foreground';
  const champions = (draw?.champions ?? []).map((person, index) =>
    // The identity seam owns the display string; only its `text` is used
    // here, because a link inside this row's link is not a link.
    personRefModel({
      slug,
      identity: person.identity,
      state: person.resolution,
      label: person.label,
    }).text || `Champion ${index + 1}`,
  );

  const cells = (
    <>
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {name}{' '}
          <span className="text-xs font-semibold tracking-wide text-muted-foreground">
            ({displayEventCode(event.code)})
          </span>
        </p>
        {showFormat && draw ? (
          <p className="text-xs text-muted-foreground">{kindLabel(draw.kind)}</p>
        ) : null}
        {champions.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Champion{' '}
            {champions.map((champion) => (
              // Stacked, never slash-joined (contract §3.1): a doubles pair is
              // two names, not one string with a glyph in the middle.
              <span key={champion} className="block font-medium text-foreground">
                {champion}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {/* Refinement 2026-09-12: below `sm:` the count and the progress
          share ONE line under the name instead of stacking as three rows;
          from `sm:` up `contents` dissolves the wrapper so both are grid
          cells in the header's columns again. One template string, not
          adjacent JSX expressions: React 19's SSR stream separates those
          with comment nodes, breaking text-level assertions and, worse,
          screen-reader continuity of the phrase. */}
      <div className="col-span-2 flex flex-wrap gap-x-3 gap-y-0.5 sm:contents">
        <p className="text-sm tabular-nums text-muted-foreground">{countLabel}</p>
        <p className={`text-sm font-medium ${progressTone}`}>{progress ?? ''}</p>
      </div>
    </>
  );

  // Two columns on a phone (name · action), the header's four from `sm:`.
  const grid = `grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-3 sm:items-center sm:gap-3 ${EVENT_ROW_COLUMNS}`;
  if (drawHref === null) {
    return (
      <li>
        <div className={grid}>
          {cells}
          <p className="order-first col-start-2 sm:order-none sm:col-start-auto" />
        </div>
      </li>
    );
  }
  return (
    <li>
      <a
        href={drawHref}
        aria-label={`${name} draw`}
        className={`${grid} hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent`}
      >
        {cells}
        {/* On a phone the action sits beside the name (first row, second
            column); from `sm:` it is the last cell, under the empty header
            slot, right-aligned. */}
        <span className="col-start-2 row-start-1 self-center text-sm font-semibold text-accent sm:col-start-auto sm:row-start-auto sm:text-right">Open</span>
      </a>
    </li>
  );
}
