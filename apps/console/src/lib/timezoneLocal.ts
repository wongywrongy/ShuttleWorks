const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  const zone = timezone || 'UTC';
  let value = formatters.get(zone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    formatters.set(zone, value);
  }
  return value;
}

/** Format an instant without using the workstation's timezone. */
export function zonedLocalInput(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(formatter(timezone).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Reject gaps; when the clock repeats, use the earlier matching instant.
 * Sample surrounding offsets rather than assuming all transitions last an hour. */
export function localInputToUtc(value: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const wallTime = Date.UTC(+year, +month - 1, +day, +hour, +minute);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = wallTime + hours * 3_600_000;
    const local = zonedLocalInput(new Date(sample).toISOString(), timezone);
    offsets.add(Date.parse(`${local}:00Z`) - sample);
  }
  const candidates = [...offsets].map((offset) => wallTime - offset)
    .filter((instant) => zonedLocalInput(new Date(instant).toISOString(), timezone) === value)
    .sort((a, b) => a - b);
  return candidates.length ? new Date(candidates[0]).toISOString() : null;
}

/** True only when this exact local wall-clock value occurs twice in this
 * timezone (a clock-change fold) — the one case `localInputToUtc` resolves
 * silently by picking the earlier instant. Used to show contextual help
 * only when it is actually relevant to the timezone and time entered
 * (V3-OC07.3), rather than a blanket sentence shown on every date field. */
export function isAmbiguousLocalTime(value: string, timezone: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match;
  const wallTime = Date.UTC(+year, +month - 1, +day, +hour, +minute);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = wallTime + hours * 3_600_000;
    const local = zonedLocalInput(new Date(sample).toISOString(), timezone);
    offsets.add(Date.parse(`${local}:00Z`) - sample);
  }
  const matches = [...offsets].filter(
    (offset) => zonedLocalInput(new Date(wallTime - offset).toISOString(), timezone) === value,
  );
  return matches.length > 1;
}
