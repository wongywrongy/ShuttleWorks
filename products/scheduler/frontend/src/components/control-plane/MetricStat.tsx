import type { ReactNode } from 'react';

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
      <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className={`text-xl font-semibold tabular-nums ${accent ? 'text-accent' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
