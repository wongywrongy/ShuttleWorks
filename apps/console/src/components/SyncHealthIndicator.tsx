import { useEffect, useMemo, useState } from 'react';

export type SyncHealthState = 'connected' | 'refreshing' | 'stale' | 'offline';

export function deriveSyncHealth(
  nowMs: number,
  lastSyncedAt: number | null,
  error: string | null | undefined,
  terminal = false,
  staleAfterMs = 15_000,
  offlineAfterMs = 45_000,
): SyncHealthState {
  if (terminal || (error && (lastSyncedAt == null || nowMs - lastSyncedAt >= offlineAfterMs))) {
    return 'offline';
  }
  if (lastSyncedAt == null || error) return 'refreshing';
  return nowMs - lastSyncedAt >= staleAfterMs ? 'stale' : 'connected';
}

function formatLastUpdated(lastSyncedAt: number | null): string {
  if (lastSyncedAt == null) return 'No successful update yet';
  return `Last updated ${new Date(lastSyncedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

/**
 * Shared operational freshness cue for Live Day and venue displays. Healthy
 * state is screen-reader-visible but visually quiet. A missed refresh, stale
 * payload, or terminal/offline source gets explicit text so color is never
 * the only signal.
 */
export function SyncHealthIndicator({
  lastSyncedAt,
  error,
  terminal = false,
  nowMs: nowMsOverride,
  className = '',
}: {
  lastSyncedAt: number | null;
  error?: string | null;
  terminal?: boolean;
  nowMs?: number;
  className?: string;
}) {
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    if (nowMsOverride != null) return;
    const timer = window.setInterval(() => setClockMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [nowMsOverride]);
  const nowMs = nowMsOverride ?? clockMs;
  const state = useMemo(
    () => deriveSyncHealth(nowMs, lastSyncedAt, error, terminal),
    [nowMs, lastSyncedAt, error, terminal],
  );
  const copy: Record<SyncHealthState, string> = {
    connected: `Connected · ${formatLastUpdated(lastSyncedAt)}`,
    refreshing: `Refreshing · ${formatLastUpdated(lastSyncedAt)}`,
    stale: `Stale · ${formatLastUpdated(lastSyncedAt)}`,
    offline: `Offline · ${formatLastUpdated(lastSyncedAt)}`,
  };
  const tone = {
    connected: 'text-status-live',
    refreshing: 'text-status-warning',
    stale: 'text-status-warning',
    offline: 'text-status-danger-fg',
  }[state];
  return (
    <span
      data-testid="sync-health-indicator"
      data-sync-state={state}
      role="status"
      aria-live="polite"
      className={`${state === 'connected' ? 'sr-only' : 'inline-flex items-center rounded-full border border-current/30 bg-current/5 px-2 py-0.5 text-2xs font-medium'} ${tone} ${className}`}
    >
      {copy[state]}
    </span>
  );
}
