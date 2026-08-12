/**
 * "Next up" list — a workspace's next ≤3 scheduled matches (from
 * `signals.nextUp`). Each row: match code · time · court · a "Sched" tag.
 * Renders nothing when there's nothing scheduled. The match code (e.g. "MS1")
 * carries the discipline, so no separate module glyph is needed.
 *
 * Shared by the Hub inspector and the workspace Overview — it lives here
 * rather than under either product so neither imports the other's internals
 * (SP-UI-1; it was the last such edge between hub and workspace).
 */
import type { NextMatchDTO } from '../../api/dto';

export function NextUpList({ items }: { items: NextMatchDTO[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-[3px]">
      {items.map((n, i) => (
        <div
          key={`${n.code}-${i}`}
          className="flex items-center gap-2.5 rounded-lg bg-surface-card px-2.5 py-2"
        >
          <span className="w-9 shrink-0 text-xs font-semibold sw-num text-foreground">{n.code}</span>
          <span className="min-w-0 flex-1 break-words text-2xs sw-num text-muted-foreground">
            {[n.timeLabel, n.courtLabel].filter(Boolean).join(' · ')}
          </span>
          <span className="shrink-0 text-2xs font-semibold sw-num text-status-started">Sched</span>
        </div>
      ))}
    </div>
  );
}
