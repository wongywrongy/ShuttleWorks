/**
 * How a workspace dates itself in the Hub list: a multi-day event shows a
 * RANGE rather than only its first day.
 *
 * The Hub used to ALSO strip a trailing year off the name here, so a row read
 * "Taipei Open" while the workspace header, the public tier and the venue
 * board all read "Taipei Open (2026)". One surface quietly disagreeing with
 * three others is worse than the redundancy it hid. The name rule now lives
 * where the name is written — `canonical_tournament_name` in
 * `simulator/tournament_sim/seed.py`, with `seed repair-names` for rows
 * already persisted — and every tier renders the stored name verbatim
 * (P5, 2026-09-08). A director-authored title is never rewritten, here or
 * anywhere else.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { eventRangeOf } from './hubFacets';

/** ISO day (YYYY-MM-DD) → the display date. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The numeric event date: `2026-07-28`, or a range `2026-07-28 – 08-03`
 * (P2: an EN DASH, the range glyph — the old `→` read as navigation and
 * joined the row's accessible name as "right arrow").
 * (the end collapses to `MM-DD` in the same year, `YYYY-MM-DD` otherwise).
 * Null when the workspace has no date.
 */
export function formatEventRange(t: TournamentSummaryDTO): string | null {
  const range = eventRangeOf(t);
  if (!range) return null;
  const start = dayOf(range.start);
  const end = dayOf(range.end);
  if (end === start) return start;
  return `${start} – ${end.slice(0, 4) === start.slice(0, 4) ? end.slice(5) : end}`;
}
