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
import { parseIsoDate, parseMoment } from './phase';

const MONTHS = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);
const MONTHS_LONG = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);
const WEEKDAYS = Object.freeze([
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]);

/** `Jan`-style month for a zero-based index — the `DateBadge`'s vocabulary. */
export function monthShort(index: number): string {
  return MONTHS[index] ?? '';
}

/** `2026-09-19` → `Saturday 19 September 2026`; null/unparseable → `''`. */
export function formatDateLong(iso: string | null): string {
  const date = parseIsoDate(iso);
  if (date === null) return '';
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS_LONG[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
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
