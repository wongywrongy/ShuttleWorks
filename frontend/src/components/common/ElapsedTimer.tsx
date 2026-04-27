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

function format(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
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
