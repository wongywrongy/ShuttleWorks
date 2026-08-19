/**
 * Wall-clock + elapsed-time formatters that read ISO-8601 UTC timestamps.
 *
 * Defensive: every function returns a sentinel rather than "Invalid Date"
 * if the input is missing or unparseable.
 */
import { parseMatchStartMs } from './time';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Render an ISO-8601 timestamp as the operator's local HH:mm clock. */
export function formatIsoClock(iso: string | null | undefined): string {
  const ms = parseMatchStartMs(iso);
  if (ms === null) return '–';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Gap between two ISO timestamps as ``Xm`` / ``Xh Ym``. Zero / negative /
 * unparseable gaps collapse to ``0m`` — never a negative value.
 */
export function formatDuration(aIso: string | null | undefined, bIso: string | null | undefined): string {
  const aMs = parseMatchStartMs(aIso);
  const bMs = parseMatchStartMs(bIso);
  if (aMs === null || bMs === null) return '0m';
  const mins = Math.max(0, Math.round((bMs - aMs) / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Elapsed-since-start, stable across the elapsed range:
 *   < 1 h    →  ``M:SS``
 *   < 24 h   →  ``H:MM:SS``
 *   ≥ 24 h   →  ``null``
 *
 * Returns ``null`` when the start timestamp is missing, unparseable, or a day
 * or more old, so the caller can omit the chip rather than render a
 * placeholder or a falsehood. No match runs for a day: a ≥24 h reading means
 * the timestamp is stale (a finished tournament left with rows still marked
 * playing, a restored backup), and this value is read by the public
 * spectator board, where "1d 2h" beside a live badge asserts something that
 * is not happening. Operator surfaces that need to SEE the stale row use the
 * match's status and start time directly.
 */
export function formatElapsed(startIso: string | undefined | null): string | null {
  const started = parseMatchStartMs(startIso);
  if (started === null) return null;
  const secs = Math.max(0, Math.floor((Date.now() - started) / 1000));
  if (secs >= 86_400) return null;
  const hours = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (hours >= 1) return `${hours}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}
