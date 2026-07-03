/**
 * Small pill showing spectator-calm freshness for the TV boards — how
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
  const dot =
    status === 'live'
      ? 'bg-status-live sw-pulse'
      : status === 'delayed'
        ? 'bg-status-warning sw-pulse'
        : 'bg-status-idle';
  const label = status === 'live' ? 'Live' : status === 'delayed' ? 'Delayed' : 'Out of date';
  const quietTitle =
    status === 'live'
      ? 'Showing the latest results'
      : status === 'delayed'
        ? "Results may be a little behind — they'll catch up shortly"
        : 'Results may be out of date';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${styles}`}
      title={quietTitle}
      data-testid="tv-live-status"
      role="status"
      aria-live="polite"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
