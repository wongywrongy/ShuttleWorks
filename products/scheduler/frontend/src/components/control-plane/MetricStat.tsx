import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow';

/** A control-plane KPI tile: a mono overline label over a large tabular
 *  value. Used in the Hub summary band. `accent` tints the value in the theme
 *  accent (for an alarming count, e.g. items needing attention). */
export function MetricStat({
  label,
  value,
  accent,
  testId,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col gap-0.5">
      <Eyebrow>{label}</Eyebrow>
      <span className={`text-xl font-semibold tabular-nums ${accent ? 'text-accent' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
