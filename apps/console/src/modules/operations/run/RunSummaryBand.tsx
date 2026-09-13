/**
 * RunSummaryBand — derived at-a-glance stat strip for the Operations Run surface.
 *
 * Presentational only: renders exactly what is passed via `summary` (no
 * internal counting). Four stats: done / playing / courts free / late.
 * Matches the LiveStatusBar idiom (same token grammar: bg-muted/30,
 * border-border, text-2xs uppercase, text-sm font-semibold tabular-nums).
 * The `late` count is tinted with `text-status-warning` when non-zero.
 */
import { STATE_WORD } from '../../../lib/stateWords';
import type { RunSummary } from '../runtime/runModel';

interface Props {
  summary: RunSummary;
  /** Which engines these matches came from, e.g. "meet + bracket". The done
   *  figure counts every match on the floor, and on a hybrid workspace an
   *  operator reading "34 / 84 done" under a Meet-shaped mental model would
   *  read it as the meet's own progress (LIVE-3). Same honesty the Display
   *  footer already carries ("12 / 24 meet matches complete"). */
  scope?: string;
}

interface StatItemProps {
  label: string;
  value: string;
  testId: string;
  tone?: string;
  /** Seamed-surface status signal: a 2px TOP accent bar (never a full colored
   *  border on a flush cell — handoff "Seamed, not gapped" rule). Pass a
   *  border-top color class; defaults to transparent (bar reserved, invisible). */
  topBar?: string;
  /** data attribute placed on the value span for targeted CSS / test assertions */
  valueMeta?: Record<string, string>;
}

function StatItem({
  label,
  value,
  testId,
  tone = 'text-foreground',
  topBar = 'border-t-transparent',
  valueMeta = {},
}: StatItemProps) {
  const metaAttrs = Object.fromEntries(
    Object.entries(valueMeta).map(([k, v]) => [`data-${k}`, v]),
  );
  return (
    <div
      data-testid={testId}
      className={`flex flex-1 flex-col gap-0.5 border-r border-t-2 border-border px-4 py-2 last:border-r-0 ${topBar}`}
    >
      <span className={`text-lg font-bold leading-none sw-num ${tone}`} {...metaAttrs}>
        {value}
      </span>
      <span className="text-xs uppercase tracking-[0.06em] text-ink-faint">
        {label}
      </span>
    </div>
  );
}

export function RunSummaryBand({ summary, scope }: Props) {
  const { done, total, playing, courtsFree, late, disputedCourts } = summary;

  return (
    <div
      role="status"
      aria-label="Run summary"
      className="flex items-stretch border-b border-border bg-surface-band/40"
    >
      <StatItem
        testId="run-band-done"
        label={scope ? `${STATE_WORD.done} · ${scope}` : STATE_WORD.done}
        value={`${done} / ${total}`}
        tone={done === total && total > 0 ? 'text-status-done' : 'text-foreground'}
      />
      <StatItem
        testId="run-band-playing"
        label="playing matches"
        value={String(playing)}
        tone={playing > 0 ? 'text-status-live' : 'text-muted-foreground'}
        topBar={playing > 0 ? 'border-t-status-live/55' : 'border-t-transparent'}
      />
      <StatItem
        testId="run-band-courts-free"
        label="courts free"
        value={String(courtsFree)}
        tone={courtsFree > 0 ? 'text-foreground' : 'text-muted-foreground'}
      />
      {/* V3-OC19.2: a disputed court is its OWN bucket — never folded into
       * "playing" (which would read as a confident total the court cards
       * contradict) and never counted as free. Only rendered when non-zero
       * so an ordinary quiet day does not carry a permanent zero tile. */}
      {/* `-ink` is the ink for the SOLID overdue fill; on the band's own
       * surface it is near-white, and the count read pale (P6).
       * `status-overdue` is the gated on-surface foreground. */}
      {disputedCourts > 0 ? (
        <StatItem
          testId="run-band-disputed"
          label="court conflicts"
          value={String(disputedCourts)}
          tone="text-status-overdue"
          topBar="border-t-status-overdue-solid/60"
        />
      ) : null}
      <StatItem
        testId="run-band-late"
        label="late"
        value={String(late)}
        tone={late > 0 ? 'text-status-warning' : 'text-muted-foreground'}
        topBar={late > 0 ? 'border-t-status-warning/60' : 'border-t-transparent'}
        valueMeta={late > 0 ? { 'late-value': 'true' } : {}}
      />
    </div>
  );
}
