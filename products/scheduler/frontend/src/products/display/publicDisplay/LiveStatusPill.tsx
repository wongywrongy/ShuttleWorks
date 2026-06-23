/**
 * Small pill showing whether the TV is still talking to the backend.
 * Driven by `liveStatus` derived from the last-successful sync age in
 * `useDisplaySync`.
 */
import type { LiveStatus } from './useDisplaySync';

interface LiveStatusPillProps {
  status: LiveStatus;
  error: string | null;
}

export function LiveStatusPill({ status, error }: LiveStatusPillProps) {
  const styles =
    status === 'live'
      ? 'border-status-live/40 bg-status-live/10 text-status-live'
      : status === 'reconnecting'
        ? 'border-status-warning/40 bg-status-warning/10 text-status-warning'
        : 'border-status-blocked/40 bg-status-blocked/10 text-status-blocked';
  const dot =
    status === 'live'
      ? 'bg-status-live animate-pulse'
      : status === 'reconnecting'
        ? 'bg-status-warning animate-pulse'
        : 'bg-status-blocked';
  const label =
    status === 'live'
      ? 'Live'
      : status === 'reconnecting'
        ? 'Reconnecting…'
        : 'Offline';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${styles}`}
      title={error ?? `Live data ${status}`}
      data-testid="tv-live-status"
      role="status"
      aria-live="polite"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
