/**
 * UnifiedLiveView — the both-engines Operations "Live" surface.
 *
 * Mirrors `UnifiedCourtsView`'s interleaved, source-chipped list, but each
 * row carries operator actions. The actions route back to the originating
 * engine's API by `OperationalMatch.source` (see `routeOperationalAction`):
 * Meet rows start/finish through the command queue; Bracket rows record a
 * winner through the F3 bracket result queue. The parent owns the router;
 * this surface only emits `OperationalAction`s.
 */
import type { OperationalMatch } from '../../lib/operations/operationalMatch';
import { mergeOperational } from '../../lib/operations/operationalMatch';
import type { OperationalAction } from './operationalWriteback';
import { SourceChip } from './SourceChip';
import { CourtSlot, SideLabels, StatusPill } from './operationalRowParts';

interface Props {
  meet: OperationalMatch[];
  bracket: OperationalMatch[];
  onAction: (row: OperationalMatch, action: OperationalAction) => void;
}

const BTN =
  'inline-flex items-center rounded-sm border border-border px-2 py-0.5 text-2xs font-medium text-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-40';

function RowActions({
  row,
  onAction,
}: {
  row: OperationalMatch;
  onAction: (row: OperationalMatch, action: OperationalAction) => void;
}) {
  if (row.source === 'meet') {
    // Meet → command queue. Start while pending; finish while running.
    if (row.status === 'finished') {
      return <span className="text-2xs text-muted-foreground/70">Done</span>;
    }
    if (row.status === 'started') {
      return (
        <button type="button" className={BTN} onClick={() => onAction(row, { kind: 'finish' })}>
          Finish match
        </button>
      );
    }
    return (
      <button type="button" className={BTN} onClick={() => onAction(row, { kind: 'start' })}>
        Start match
      </button>
    );
  }

  // Bracket → F3 result queue. Record a winner once the match is on a court.
  if (row.status === 'finished') {
    return <span className="text-2xs text-muted-foreground/70">Done</span>;
  }
  const canRecord = row.courtLabel != null;
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        className={BTN}
        disabled={!canRecord}
        onClick={() => onAction(row, { kind: 'recordWinner', winnerSide: 'A' })}
      >
        Side A wins
      </button>
      <button
        type="button"
        className={BTN}
        disabled={!canRecord}
        onClick={() => onAction(row, { kind: 'recordWinner', winnerSide: 'B' })}
      >
        Side B wins
      </button>
    </span>
  );
}

export function UnifiedLiveView({ meet, bracket, onAction }: Props) {
  const rows = mergeOperational(meet, bracket);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="shrink-0 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Live
          </span>
          <span className="text-xs text-muted-foreground/70">
            Run Meet and Bracket matches from one queue
          </span>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-sm text-muted-foreground">
          No matches to run yet. Generate a schedule in Meet or draws in Bracket to populate the queue.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <ul className="divide-y divide-rule-soft">
            {rows.map((row) => (
              <li
                key={`${row.source}-${row.id}`}
                data-testid="ops-row"
                data-row-id={row.id}
                data-source={row.source}
                className="flex items-center gap-3 px-4 py-2"
              >
                <SourceChip source={row.source} className="shrink-0" />
                <span className="w-28 shrink-0">
                  <CourtSlot row={row} />
                </span>
                <span className="min-w-0 flex-1">
                  <SideLabels row={row} />
                </span>
                <StatusPill status={row.status} />
                <span className="shrink-0">
                  <RowActions row={row} onAction={onAction} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
