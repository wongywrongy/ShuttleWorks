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
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : status === 'reconnecting'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300';
  const dot =
    status === 'live'
      ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse'
      : status === 'reconnecting'
        ? 'bg-amber-500 dark:bg-amber-400 animate-pulse'
        : 'bg-red-500 dark:bg-red-400';
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
