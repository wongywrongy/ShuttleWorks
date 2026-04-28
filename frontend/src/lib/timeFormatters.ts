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
  if (ms === null) return '—';
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
 *   ≥ 24 h   →  ``Xd Hh``  (stale data — operator should resolve)
 *
 * Returns ``null`` when the start timestamp is missing/unparseable so the
 * caller can omit the chip rather than render a placeholder.
 */
export function formatElapsed(startIso: string | undefined | null): string | null {
  const started = parseMatchStartMs(startIso);
  if (started === null) return null;
  const secs = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const days = Math.floor(secs / 86400);
  if (days >= 1) return `${days}d ${Math.floor((secs % 86400) / 3600)}h`;
  const hours = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (hours >= 1) return `${hours}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}
