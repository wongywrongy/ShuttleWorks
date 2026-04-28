/**
 * Elapsed timer — reads an ISO-8601 UTC timestamp and updates every
 * second. Falls back to legacy HH:MM via parseMatchStartMs for one
 * release cycle (a console.warn flags legacy values for cleanup).
 */
import { useEffect, useState } from 'react';
import { parseMatchStartMs } from '../../utils/timeUtils';

interface ElapsedTimerProps {
  startTime: string | null | undefined;
  className?: string;
}

/**
 * Format an elapsed-millis value as a human timer.
 *
 *   < 1 h    →  ``M:SS``           (e.g. ``42:09``)
 *   < 24 h   →  ``H:MM:SS``        (e.g. ``3:14:07``)
 *   ≥ 24 h   →  ``Xd Hh``          (e.g. ``2d 5h``) — the match clearly
 *                                   isn't a real running clock at this
 *                                   point (typically stale state from
 *                                   a previous tournament day); show
 *                                   the duration in days+hours so the
 *                                   operator notices and can resolve.
 *
 * Negative inputs clamp to ``0:00``. Was previously naive ``M:SS`` only,
 * which produced absurd values like ``11395:48`` for a stale start time.
 */
function format(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(secs / 86400);
  if (days >= 1) {
    const hours = Math.floor((secs % 86400) / 3600);
    return `${days}d ${hours}h`;
  }
  const hours = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (hours >= 1) {
    return `${hours}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ElapsedTimer({ startTime, className = 'tabular-nums' }: ElapsedTimerProps) {
  const [elapsed, setElapsed] = useState('0:00');

  useEffect(() => {
    const startMs = parseMatchStartMs(startTime);
    if (startMs === null) {
      setElapsed('0:00');
      return;
    }

    const tick = () => setElapsed(format(Date.now() - startMs));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span className={className}>{elapsed}</span>;
}
