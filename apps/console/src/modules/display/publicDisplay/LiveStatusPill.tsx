/**
 * Small status chip showing spectator-calm freshness for the TV boards — how
 * current the data on screen is, in spectator voice. Driven by
 * `FreshnessState` (see ./freshness.ts), derived in each board's sync
 * hook from the age of the last *successful* poll.
 *
 * Deliberately avoids operator/technical language: no "Reconnecting",
 * "Offline", "server", or "backend" ever renders here, and `stale`
 * renders as a muted/neutral pill (no red-alarm styling) so an aging
 * board reads as "a bit behind", not "broken". There's intentionally no
 * `error` prop — a raw sync error is operator/technical language by
 * definition, so it's never threaded into this component at all (not
 * even into a tooltip); callers keep it for their own optional debug
 * use, but the pill only ever renders the calm, fixed copy below.
 */
import type { FreshnessState } from './freshness';

interface LiveStatusPillProps {
  status: FreshnessState;
}

export function LiveStatusPill({ status }: LiveStatusPillProps) {
  const styles =
    status === 'live'
      ? 'border-status-live/40 bg-status-live/10 text-status-live'
      : status === 'delayed'
        ? 'border-status-warning/40 bg-status-warning/10 text-status-warning'
        : 'border-status-idle/40 bg-status-idle/10 text-status-idle';
  const label = status === 'live' ? 'Live' : status === 'delayed' ? 'Delayed' : 'Out of date';
  const quietTitle =
    status === 'live'
      ? 'Showing the latest results'
      : status === 'delayed'
        ? "Results may be a little behind, but they'll catch up shortly"
        : 'Results may be out of date';
  return (
    <span
      // `text-xs` (12px), not `text-3xs` — this is a word caption
      // ("Live"/"Delayed"/"Out of date"), and the caption floor is 12px
      // (v3 consolidated plan, package 07, ruling R1; V3-07-1). `text-3xs`
      // is fully retired as of package 17 — see debt-log.md.
      className={`inline-flex h-badge items-center whitespace-nowrap rounded-xs border px-2 text-xs font-semibold uppercase leading-none tracking-[0.06em] ${styles}`}
      title={quietTitle}
      data-testid="tv-live-status"
      role="status"
      aria-live="polite"
    >
      {label}
    </span>
  );
}
