/**
 * Timezone-aware time formatting authority (contract
 * `docs/reference/contracts/state-and-formatting.md` §7.3). One
 * locale/timezone-aware formatter with explicit named contexts — plan §3
 * X6: no raw ISO in ordinary prose; machine attributes, exports and
 * diagnostics may retain ISO.
 *
 * Every context renders in the **tournament timezone**, never the
 * browser's. When the timezone is unknown, callers fall back to `'UTC'`
 * and it is always labeled (`clock_with_zone`/`deadline`/`diagnostic`) —
 * never a silent local-time assumption (§7.2, the D11 failure).
 *
 * Originally factored out of `SyncBackupsTab.tsx` (work package 19,
 * V3-19-2); that call site now redirects here.
 */

/** The named time contexts from contract §7.1. */
export type TimeContext =
  | 'clock'
  | 'clock_with_zone'
  | 'date'
  | 'date_with_year'
  | 'datetime'
  | 'deadline'
  | 'diagnostic';

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clockPart(d: Date, timeZone: string, withZone: boolean): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    ...(withZone ? { timeZoneName: 'short' } : {}),
  }).format(d);
}

function datePart(d: Date, timeZone: string, withYear: boolean): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(d);
}

/**
 * Format `iso` in `timeZone` (falls back to `'UTC'`, labeled per §7.2)
 * under the named `context`. Returns `null` when `iso` is missing or
 * fails to parse — §7.2's rule is that the field is **omitted**, never a
 * placeholder like `00:00` or `—`, and the raw value goes to the
 * diagnostic channel (the `diagnostic` context) instead of ordinary prose.
 */
export function formatDateTime(
  iso: string | null | undefined,
  context: TimeContext,
  timeZone?: string,
): string | null {
  const d = parse(iso);
  if (!d) return null;
  const zone = timeZone || 'UTC';
  switch (context) {
    case 'clock':
      return clockPart(d, zone, false);
    case 'clock_with_zone':
      return clockPart(d, zone, true);
    case 'date':
      return datePart(d, zone, false);
    case 'date_with_year':
      return datePart(d, zone, true);
    case 'datetime':
      return `${datePart(d, zone, false)}, ${clockPart(d, zone, false)}`;
    case 'deadline':
      return `${datePart(d, zone, true)}, ${clockPart(d, zone, true)}`;
    case 'diagnostic':
      return iso ?? d.toISOString();
    default:
      return null;
  }
}

/** Wall-clock minute key in `timeZone`, for detecting two instants that
 * collide on the same displayed minute (never rendered itself). */
export function minuteKey(iso: string, timeZone: string): string {
  const d = parse(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

/** Day header in `timeZone`: `'Today'`, else the `date`/`date_with_year`
 * context (year only outside the current year). */
export function dayLabel(iso: string, timeZone: string): string {
  const d = parse(iso);
  if (!d) return iso;
  const zone = timeZone || 'UTC';
  const dayKey = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return 'Today';
  return datePart(d, zone, d.getFullYear() !== now.getFullYear()).replace(/^\w+, /, '');
}

/** Time-of-day in `timeZone`, always zone-qualified (`clock_with_zone`)
 * unless the caller says a collision requires seconds too. */
export function fmtTime(iso: string, timeZone: string, withSeconds: boolean): string {
  const d = parse(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    timeZoneName: 'short',
  }).format(d);
}

/** Full timestamp for a grouped list's inspection affordance — weekday,
 * month, day, time and zone, with seconds only on a same-minute collision. */
export function fmtTimestamp(iso: string, timeZone: string, withSeconds: boolean): string {
  const d = parse(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    timeZoneName: 'short',
  }).format(d);
}
