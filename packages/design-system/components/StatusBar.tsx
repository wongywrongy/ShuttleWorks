import { cn } from '../lib/utils';
import type { PillTone } from './StatusPill';

/**
 * StatusBar — a row of mono-uppercase status counts.
 *
 * Telemetry strip for surfaces that need an at-a-glance state tally
 * (e.g. the bracket chrome's DONE / LIVE / READY / PEND counters). Each
 * cell is a `StatusCount`: a `--status-*`-coloured label next to a
 * tabular-nums count.
 *
 * Pure presentational — the consumer maps its own domain state onto
 * `tone` / `label` / `count`. Tones route through the same `PillTone`
 * ladder as `StatusPill` so the same semantic state reads the same
 * colour everywhere (DESIGN.md §4).
 */

const TONE_TEXT: Record<PillTone, string> = {
  green:  'text-status-live',
  yellow: 'text-status-warning',
  red:    'text-status-blocked',
  blue:   'text-status-started',
  amber:  'text-status-called',
  idle:   'text-status-idle',
  done:   'text-status-done',
};

export interface StatusCountItem {
  tone: PillTone;
  label: string;
  count: number;
}

export function StatusCount({ tone, label, count }: StatusCountItem) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span
        className={cn(
          'text-2xs font-semibold uppercase tracking-wider',
          TONE_TEXT[tone]
        )}
      >
        {label}
      </span>
      <span className="tabular-nums text-xs text-ink">{count}</span>
    </span>
  );
}

interface StatusBarProps {
  items: StatusCountItem[];
  className?: string;
}

export function StatusBar({ items, className }: StatusBarProps) {
  return (
    <div className={cn('flex items-center gap-2 font-mono', className)}>
      {items.map((item) => (
        <StatusCount key={item.label} {...item} />
      ))}
    </div>
  );
}
