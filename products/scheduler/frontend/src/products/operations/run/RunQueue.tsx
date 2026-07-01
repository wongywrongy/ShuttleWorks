/**
 * RunQueue — global ordered queue of matches not yet on a court.
 *
 * Renders the queue in the exact order passed by the surface (do NOT re-sort).
 * Position is meaningful: each row shows `#{i+1}`.
 *
 * Design language mirrors the Run board: a compact M/B source square, an
 * UPPERCASE tabular match code, then the sides. Selection matches the board.
 */
import type { RunMatch } from '../runtime/runModel';

// ── source initial + square tint (M=meet azure, B=bracket violet) ─────────
const SOURCE_INITIAL: Record<'meet' | 'bracket', string> = { meet: 'M', bracket: 'B' };
const SOURCE_SQUARE: Record<'meet' | 'bracket', string> = {
  meet: 'bg-module-meet/15 text-module-meet',
  bracket: 'bg-module-bracket/15 text-module-bracket',
};
const SOURCE_LABEL: Record<'meet' | 'bracket', string> = { meet: 'Meet', bracket: 'Bracket' };

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
            <span className="w-6 flex-shrink-0 text-right text-2xs sw-num text-ink-faint">
              #{i + 1}
            </span>

            {/* Source initial square */}
            <span
              aria-hidden
              title={SOURCE_LABEL[match.source]}
              className={`inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-xs text-[9px] font-semibold sw-num ${SOURCE_SQUARE[match.source]}`}
            >
              {SOURCE_INITIAL[match.source]}
            </span>

            {/* Match code — tabular */}
            <span className="w-16 flex-shrink-0 truncate text-2xs font-semibold sw-num text-ink-3">
              {match.label}
            </span>

            {/* Sides — truncated with tooltip */}
            <span
              className="min-w-0 flex-1 truncate text-sm"
              title={sidesLabel}
            >
              {match.sideA}
              <span className="px-1.5 text-2xs uppercase tracking-[0.08em] text-muted-foreground">
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
