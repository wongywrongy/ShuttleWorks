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

/**
 * Contract §7.1 `date` context, for a bare `YYYY-MM-DD` calendar day (the
 * schedule/draw day facet — never an instant, so there is no timezone to
 * apply beyond the day the wire already names). `Saturday, 8 August`;
 * unparseable → the input verbatim (the day facet key itself, not invented
 * prose). D11: the entrant time authority, not `Intl.DateTimeFormat` — this
 * module's whole reason to exist is a fixed table that renders identically
 * on every node the SSR process runs on, and `Intl`'s locale data is a
 * runtime variable this authority is not allowed to reintroduce.
 */
export function formatCalendarDay(day: string): string {
  const date = parseIsoDate(day);
  if (date === null) return day;
  return `${WEEKDAYS[date.getUTCDay()]}, ${monthLong(date.getUTCMonth())} ${date.getUTCDate()}`;
}

/** `2026-08` → `August 2026`; unparseable → the input verbatim. */
export function formatCalendarMonth(month: string): string {
  const date = parseIsoDate(`${month}-01`);
  if (date === null) return month;
  return `${monthLong(date.getUTCMonth())} ${date.getUTCFullYear()}`;
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

/**
 * Format the server's UTC moment in the tournament's declared timezone — the
 * entrant tier's time authority (D11). Contract §7.2: a timestamp that fails
 * to parse is OMITTED, never printed as raw ISO/wire prose (D12) — so a
 * caller composing this into a sentence must itself omit the whole clause
 * when this returns `null`, exactly as a missing value would.
 */
export function formatMomentInZone(wire: string, timeZone: string): string | null {
  const moment = parseMoment(wire);
  if (moment === null) return null;
  try {
    const parts = new Intl.DateTimeFormat('en', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone, timeZoneName: 'short',
    }).formatToParts(moment);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return `${value('day')} ${value('month')} ${value('year')}, ${value('hour')}:${value('minute')} ${value('timeZoneName')}`;
  } catch {
    // An unrecognised `timeZone` string, not a parse failure — the moment IS
    // real, so fall back to the UTC rendering rather than omitting a known
    // instant. Still never raw ISO.
    return formatMoment(wire);
  }
}
