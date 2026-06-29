/**
 * RunQueue — global ordered queue of matches not yet on a court.
 *
 * Renders the queue in the exact order passed by the surface (do NOT re-sort).
 * Position is meaningful: each row shows `#{i+1}`.
 *
 * Design language mirrors UnifiedOpsList rows: same dense layout, tokens,
 * and selection treatment. Source dot: sky = meet, violet = bracket (same
 * as RunBoard's left-edge colour).
 */
import type { RunMatch } from '../runtime/runModel';

// ── source dot colour (sky = meet, violet = bracket) ─────────────────────
const SOURCE_DOT: Record<'meet' | 'bracket', string> = {
  meet: 'bg-sky-500',
  bracket: 'bg-violet-500',
};

// ── eyebrow label (source word) ───────────────────────────────────────────
const SOURCE_LABEL: Record<'meet' | 'bracket', string> = {
  meet: 'Meet',
  bracket: 'Brkt',
};

// ── props ─────────────────────────────────────────────────────────────────
export interface RunQueueProps {
  queue: RunMatch[];
  selectedKey?: string | null;
  onSelect(key: string): void;
}

// ── component ─────────────────────────────────────────────────────────────
export function RunQueue({ queue, selectedKey, onSelect }: RunQueueProps) {
  if (queue.length === 0) {
    return (
      <div className="flex items-center justify-center px-4 py-6 text-sm text-muted-foreground">
        Queue empty — every match is on a court.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/60 border-t border-border">
      {queue.map((match, i) => {
        const isSelected = selectedKey === match.key;
        const dot = SOURCE_DOT[match.source];
        const sidesLabel = `${match.sideA} vs ${match.sideB}`;

        return (
          <li
            key={match.key}
            data-testid={`run-queue-row-${match.key}`}
            data-source={match.source}
            className={`flex cursor-pointer items-center gap-3 px-4 py-1.5 hover:bg-muted/30 ${
              isSelected ? 'bg-muted/40' : ''
            }`}
            onClick={() => onSelect(match.key)}
          >
            {/* Position */}
            <span className="w-6 flex-shrink-0 text-right font-mono text-2xs tabular-nums text-muted-foreground">
              #{i + 1}
            </span>

            {/* Source dot */}
            <span
              aria-hidden
              className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`}
              title={SOURCE_LABEL[match.source]}
            />

            {/* Source eyebrow word */}
            <span className="w-8 flex-shrink-0 text-2xs uppercase tracking-[0.16em] text-muted-foreground">
              {SOURCE_LABEL[match.source]}
            </span>

            {/* Match code — mono */}
            <span className="w-16 flex-shrink-0 truncate font-mono text-2xs tracking-wider text-foreground">
              {match.label}
            </span>

            {/* Sides — truncated with tooltip */}
            <span
              className="min-w-0 flex-1 truncate text-sm"
              title={sidesLabel}
            >
              {match.sideA}
              <span className="px-1.5 text-2xs uppercase tracking-[0.18em] text-muted-foreground">
                v
              </span>
              {match.sideB}
            </span>

            {/* Late marker */}
            {match.late && (
              <span
                data-testid={`run-queue-late-${match.key}`}
                aria-label="Late"
                className="flex-shrink-0 text-2xs font-semibold uppercase tracking-[0.16em] text-status-warning"
              >
                Late
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
