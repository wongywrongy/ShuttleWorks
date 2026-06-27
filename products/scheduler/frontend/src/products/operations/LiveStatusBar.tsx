/**
 * LiveStatusBar — the at-a-glance strip for the Live console. A few numbers
 * a director actually scans: how far through the day, how many courts are
 * busy vs free, how many matches are live right now. Deliberately small.
 */
import { useMemo } from 'react';
import type { OpsBlock } from './opsBlock';

export function LiveStatusBar({ blocks, courtCount }: { blocks: OpsBlock[]; courtCount: number }) {
  const m = useMemo(() => {
    const total = blocks.length;
    const done = blocks.filter((b) => b.done).length;
    const live = blocks.filter((b) => b.started && !b.done).length;
    // A court is "busy" when a match is actually being played on it.
    const busyCourts = new Set(
      blocks.filter((b) => b.court != null && b.started && !b.done).map((b) => b.court),
    ).size;
    const free = Math.max(0, courtCount - busyCourts);
    return { total, done, live, busyCourts, free };
  }, [blocks, courtCount]);

  const Item = ({ label, value, tone = '' }: { label: string; value: string; tone?: string }) => (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="text-2xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border bg-muted/30 px-4 py-2">
      <Item label="completed" value={`${m.done}/${m.total}`} />
      <Item label="playing now" value={String(m.live)} tone={m.live > 0 ? 'text-status-live' : 'text-muted-foreground'} />
      <Item label="courts free" value={`${m.free}/${courtCount}`} tone={m.free > 0 ? 'text-status-done' : 'text-muted-foreground'} />
    </div>
  );
}
