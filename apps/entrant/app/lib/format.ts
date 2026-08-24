/**
 * Date/moment display formatting for the public pages.
 *
 * Fixed English tables, not `Intl`: the rendered document must be
 * deterministic across every node the SSR process runs on, and a locale
 * lookup is a runtime variable the page-weight and snapshot tests would
 * inherit. Parsing stays in `lib/phase.ts` (`parseMoment`/`parseIsoDate`);
 * this module only turns already-parsed instants into words, and renders
 * NOTHING for a value that does not parse — a page must not invent a date
 * the director never set.
 */
import { monthLong, parseIsoDate, parseMoment } from './phase';

const MONTHS = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);
const WEEKDAYS = Object.freeze([
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]);

/** `Jan`-style month for a zero-based index — the `DateBadge`'s vocabulary. */
export function monthShort(index: number): string {
  return MONTHS[index] ?? '';
}

/** The date half of an ISO instant (`2026-08-12T10:00:00+00:00` →
 * `2026-08-12`); null/other shapes → null. A regex, not a slice: the
 * truncation guard is right that a bare `.slice(0, n)` on display data is
 * the defect it hunts, and a match states what is actually wanted. */
export function dateOfIso(iso: string | null): string | null {
  return /^(\d{4}-\d{2}-\d{2})T/.exec(iso ?? '')?.[1] ?? null;
}

/** `2026-09-19` → `Saturday 19 September 2026`; null/unparseable → `''`. */
export function formatDateLong(iso: string | null): string {
  const date = parseIsoDate(iso);
  if (date === null) return '';
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${monthLong(date.getUTCMonth())} ${date.getUTCFullYear()}`;
}

/** A UTC instant → `14 Aug 2026, 23:59 UTC`. */
export function formatUtcInstant(moment: Date): string {
  const hh = String(moment.getUTCHours()).padStart(2, '0');
  const mm = String(moment.getUTCMinutes()).padStart(2, '0');
  return `${moment.getUTCDate()} ${MONTHS[moment.getUTCMonth()]} ${moment.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/** `2026-08-14 23:59 UTC` (the pinned `_moment` wire format) →
 * `14 Aug 2026, 23:59 UTC`; unparseable → verbatim, which is at worst the
 * server's own display string. */
export function formatMoment(wire: string): string {
  const moment = parseMoment(wire);
  return moment === null ? wire : formatUtcInstant(moment);
}
