/**
 * How a workspace names and dates itself in the Hub list.
 *
 * Two rules, both about the same redundancy: the row shows a numeric date, so
 * the name must not repeat the year the date already supplies ("Yunavero Club
 * Open 2026" beside "2026-07-28" says 2026 twice), and a multi-day event shows
 * a RANGE rather than only its first day.
 *
 * The stored name is never touched — this is a display rule. A name whose year
 * does NOT match the event date keeps it (it is then a real distinguishing
 * fact, e.g. a 2025 edition rescheduled into 2026).
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { eventRangeOf } from './hubFacets';

/** ISO day (YYYY-MM-DD) → the display date. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The numeric event date: `2026-07-28`, or a range `2026-07-28 → 08-03`
 * (the end collapses to `MM-DD` in the same year, `YYYY-MM-DD` otherwise).
 * Null when the workspace has no date.
 */
export function formatEventRange(t: TournamentSummaryDTO): string | null {
  const range = eventRangeOf(t);
  if (!range) return null;
  const start = dayOf(range.start);
  const end = dayOf(range.end);
  if (end === start) return start;
  return `${start} → ${end.slice(0, 4) === start.slice(0, 4) ? end.slice(5) : end}`;
}

/**
 * The displayed workspace name, with a trailing year dropped when the event
 * date already carries it. Handles "Name 2026", "Name - 2026", "Name (2026)".
 */
export function displayWorkspaceName(t: TournamentSummaryDTO): string {
  const name = (t.name ?? '').trim();
  if (!name) return 'Untitled';
  const range = eventRangeOf(t);
  if (!range) return name;
  const year = range.start.slice(0, 4);
  const stripped = name
    .replace(new RegExp(`[\\s\\u2013\\u2014\\u00b7\\-,(\\[]*${year}[)\\]]*\\s*$`), '')
    .trim();
  // Never strip the name away entirely ("2026" as the whole name is the name).
  return stripped || name;
}
