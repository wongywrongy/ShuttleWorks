/**
 * RunQueue — global ordered queue of matches not yet on a court.
 *
 * Renders the queue in the exact order passed by the surface (do NOT re-sort).
 * Position is meaningful: each row shows `#{i+1}`.
 *
 * Design language mirrors the Run board: a compact M/B source square, an
 * UPPERCASE tabular match code, then the sides. Selection matches the board.
 */
import type { CSSProperties } from 'react';
import type { RunMatch } from '../runtime/runModel';
import { RUN_STATUS_LABEL } from '../runtime/runMachine';
import { SELECTABLE_ROW_FOCUS, selectableRowProps } from '../../../lib/selectableRow';
import { EYEBROW_CLASS } from '../../../lib/utils';

// ── source label + square tint (M=meet azure, B=bracket violet) ───────────
// One vocabulary for the engine, everywhere on this surface: the square shows
// the INITIAL of the same word the row's tooltip and the inspector's
// `SourceChip` spell out. The inspector used to say "BRKT" beside a "B".
const SOURCE_LABEL: Record<'meet' | 'bracket', string> = { meet: 'Meet', bracket: 'Bracket' };
const SOURCE_SQUARE: Record<'meet' | 'bracket', string> = {
  meet: 'bg-module-meet/15 text-module-meet',
  bracket: 'bg-module-bracket/15 text-module-bracket',
};

// Why an ineligible row can't be sent, in the terms of its own engine —
// `RunMatch.eligible` means "both sides known" for meet and "every feeder
// resolved" for bracket (see toRunMatches).
const WAITING_REASON: Record<'meet' | 'bracket', string> = {
  meet: 'Waiting on both sides to be decided',
  bracket: 'Waiting on an earlier result to decide a side',
};

// ── props ─────────────────────────────────────────────────────────────────
export interface RunQueueProps {
  queue: RunMatch[];
  selectedKey?: string | null;
  onSelect(key: string): void;
  /** Keys of queue rows past their planned slot (floor running) — paints a
   *  right-aligned LATE badge in the board's run-late voice. */
  lateKeys?: ReadonlySet<string>;
  /** Quick "↵ send" affordance on eligible scheduled rows — sends the row's
   *  match to the first free court without opening the inspector. */
  onSend?: (key: string) => void;
}

// ── component ─────────────────────────────────────────────────────────────
export function RunQueue({ queue, selectedKey, onSelect, lateKeys, onSend }: RunQueueProps) {
  if (queue.length === 0) {
    return (
      <div className="flex items-center justify-center px-4 py-6 text-sm text-muted-foreground">
        Queue empty. Every match is on a court.
      </div>
    );
  }

  return (
    // `sw-stagger`: rows assemble top-down on the list's initial mount
    // (`--i` indexes each row's 40ms delay). Rows are keyed by the stable
    // match key, so poll updates reconcile in place and never re-animate;
    // only a genuinely new row (or a full list remount) floats in.
    <ul className="sw-stagger divide-y divide-border/60 border-t border-border">
      {queue.map((match, i) => {
        const isSelected = selectedKey === match.key;

        return (
          <li
            key={match.key}
            data-testid={`run-queue-row-${match.key}`}
            data-source={match.source}
            style={{ '--i': i } as CSSProperties}
            // `flex-wrap`: at 390px the fixed columns (#n, source, code) plus
            // the badges left the sides column ~91px, so `break-words` broke
            // names MID-WORD ("Winn/er"). The trailing columns now wrap to a
            // second line instead; the sides column keeps a 10rem floor.
            className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 hover:bg-muted/30 ${SELECTABLE_ROW_FOCUS} ${
              isSelected ? 'bg-muted/40' : ''
            }`}
            {...selectableRowProps(() => onSelect(match.key), isSelected)}
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
              {SOURCE_LABEL[match.source][0]}
            </span>

            {/* Match code — tabular */}
            <span className="w-16 flex-shrink-0 break-words text-2xs font-semibold sw-num text-ink-3">
              {match.label}
            </span>

            {/* Sides — wrap; the row grows. The court caller reads names off
                this queue, and a tooltip is not a thing you can hover on the
                tablet it runs on. */}
            <span className="min-w-[10rem] flex-1 break-words text-sm">
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
                className={`sw-late-nudge flex-shrink-0 ${EYEBROW_CLASS} text-status-warning`}
              >
                Late
              </span>
            )}

            {/* Behind-plan badge — same voice as the board's run-late marker */}
            {lateKeys?.has(match.key) && (
              <span
                data-testid={`queue-late-${match.key}`}
                aria-label="Late"
                className="sw-late-nudge flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide text-status-warning"
              >
                LATE
              </span>
            )}

            {/* Readiness — every row says which of the three it is. The send
                affordance used to be the only marker, so a row blocked on an
                earlier result and a row already called to a court both read as
                a plain, unexplained absence. */}
            {!match.eligible ? (
              <span
                data-testid={`queue-blocked-${match.key}`}
                title={WAITING_REASON[match.source]}
                className={`flex-shrink-0 ${EYEBROW_CLASS} text-ink-faint`}
              >
                Waiting
              </span>
            ) : match.status !== 'scheduled' ? (
              <span
                data-testid={`queue-state-${match.key}`}
                className={`flex-shrink-0 ${EYEBROW_CLASS} text-muted-foreground`}
              >
                {RUN_STATUS_LABEL[match.status]}
              </span>
            ) : onSend ? (
              <button
                type="button"
                data-testid={`queue-send-${match.key}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSend(match.key);
                }}
                className="flex-shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:border-accent hover:text-accent"
              >
                ↵ send
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
