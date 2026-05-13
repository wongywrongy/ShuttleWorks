/**
 * Persistent connection-status pill rendered in the operator header
 * (Step G of the architecture-adjustment arc).
 *
 * Three derived states:
 *
 *   - **Green** (no text): both reachability + Realtime are healthy.
 *   - **Amber** + "Reconnecting…": exactly one signal is unhealthy.
 *     The system is still partially functional — Realtime alone
 *     means writes go through but the live view lags; FastAPI alone
 *     means commands queue but the audit / sync is degraded.
 *   - **Red** + "Offline": both signals have been unhealthy for
 *     more than 60 seconds. The threshold avoids flicker when both
 *     services briefly hiccup in sync (deployment rollover, transient
 *     network blip). Goes back to amber (and then green) the moment
 *     either signal recovers.
 *
 * Props rather than internal hooks so the component is unit-testable
 * with explicit input. The mounting page (TabBar) drives the hooks
 * and passes results down.
 *
 * Not rendered on the public-display surface — that's a brand /
 * audience view and operator chrome would be intrusive.
 */
import { useEffect, useRef, useState } from 'react';
import type { Reachability } from '../hooks/useReachability';
import type { RealtimeStatus } from '../hooks/useRealtimeStatus';

const RED_THRESHOLD_MS = 60_000;

export interface ConnectionIndicatorProps {
  reachability: Reachability;
  realtime: RealtimeStatus;
  /** Test-only override of the 60-second threshold. */
  redThresholdMs?: number;
  className?: string;
}

type Display = 'green' | 'amber' | 'red';

export function ConnectionIndicator({
  reachability,
  realtime,
  redThresholdMs = RED_THRESHOLD_MS,
  className = '',
}: ConnectionIndicatorProps) {
  const bothOffline =
    reachability === 'offline' && realtime !== 'connected';
  const anyOffline =
    reachability === 'offline' || realtime !== 'connected';

  // Red is *both* offline for > redThresholdMs. The threshold starts
  // when the both-offline condition first holds and clears the moment
  // either signal recovers.
  const [redElapsed, setRedElapsed] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (bothOffline) {
      if (timeoutRef.current === null) {
        timeoutRef.current = window.setTimeout(() => {
          setRedElapsed(true);
          timeoutRef.current = null;
        }, redThresholdMs);
      }
    } else {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setRedElapsed(false);
    }
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [bothOffline, redThresholdMs]);

  const display: Display = redElapsed
    ? 'red'
    : anyOffline
      ? 'amber'
      : 'green';

  const dotClass =
    display === 'green'
      ? 'bg-emerald-500'
      : display === 'amber'
        ? 'bg-amber-500'
        : 'bg-red-500';

  const text =
    display === 'green' ? '' : display === 'amber' ? 'Reconnecting…' : 'Offline';

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="connection-indicator"
      data-state={display}
      className={
        `inline-flex items-center gap-1.5 text-2xs text-muted-foreground ${className}`
      }
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${dotClass}`}
      />
      {text && <span data-testid="connection-text">{text}</span>}
    </span>
  );
}
