/**
 * RunSummaryBand — derived at-a-glance stat strip for the Operations Run surface.
 *
 * Presentational only: renders exactly what is passed via `summary` (no
 * internal counting). Four stats: done / playing / courts free / late.
 * Matches the LiveStatusBar idiom (same token grammar: bg-muted/30,
 * border-border, text-2xs uppercase, text-sm font-semibold tabular-nums).
 * The `late` count is tinted with `text-status-warning` when non-zero.
 */
import type { RunSummary } from '../runtime/runModel';

interface Props {
  summary: RunSummary;
}

interface StatItemProps {
  label: string;
  value: string;
  testId: string;
  tone?: string;
  /** data attribute placed on the value span for targeted CSS / test assertions */
  valueMeta?: Record<string, string>;
}

function StatItem({ label, value, testId, tone = 'text-foreground', valueMeta = {} }: StatItemProps) {
  const metaAttrs = Object.fromEntries(
    Object.entries(valueMeta).map(([k, v]) => [`data-${k}`, v]),
  );
  return (
    <div
      data-testid={testId}
      className="flex flex-1 flex-col gap-0.5 border-r border-border px-4 py-2 last:border-r-0"
    >
      <span className={`text-lg font-bold leading-none sw-num ${tone}`} {...metaAttrs}>
        {value}
      </span>
      <span className="text-3xs uppercase tracking-[0.06em] text-ink-faint">
        {label}
      </span>
    </div>
  );
}

export function RunSummaryBand({ summary }: Props) {
  const { done, total, playing, courtsFree, late } = summary;

  return (
    <div
      role="status"
      aria-label="Run summary"
      className="flex items-stretch border-b border-border bg-surface-band/40"
    >
      <StatItem
        testId="run-band-done"
        label="done"
        value={`${done} / ${total}`}
        tone={done === total && total > 0 ? 'text-status-done' : 'text-foreground'}
      />
      <StatItem
        testId="run-band-playing"
        label="playing"
        value={String(playing)}
        tone={playing > 0 ? 'text-status-live' : 'text-muted-foreground'}
      />
      <StatItem
        testId="run-band-courts-free"
        label="courts free"
        value={String(courtsFree)}
        tone={courtsFree > 0 ? 'text-foreground' : 'text-muted-foreground'}
      />
      <StatItem
        testId="run-band-late"
        label="late"
        value={String(late)}
        tone={late > 0 ? 'text-status-warning' : 'text-muted-foreground'}
        valueMeta={late > 0 ? { 'late-value': 'true' } : {}}
      />
    </div>
  );
}
