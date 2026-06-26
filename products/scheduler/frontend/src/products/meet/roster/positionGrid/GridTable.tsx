/**
 * The position-grid `<table>` shell — composes GridHeader + GridBody.
 * Pure rendering: no store reads, no hooks. The `min-w-[780px]` +
 * `overflow-x-auto` parent and `border-collapse` are preserved here.
 */
import type { PlayerDTO } from '../../../../api/dto';
import { GridHeader, type GridEvent } from './GridHeader';
import { GridBody } from './GridBody';

export function GridTable({
  events,
  maxRows,
  schoolId,
  byRank,
  highlightedPlayerId,
}: {
  events: GridEvent[];
  maxRows: number;
  schoolId: string;
  byRank: Map<string, PlayerDTO[]>;
  highlightedPlayerId?: string | null;
}) {
  return (
    <div className="overflow-x-auto bg-card">
      {/* border-collapse so the per-cell borders merge into clean grid lines */}
      <table
        className="w-full min-w-[780px] border-collapse text-sm"
        data-testid="position-grid-table"
      >
        <GridHeader events={events} />
        <GridBody
          events={events}
          maxRows={maxRows}
          schoolId={schoolId}
          byRank={byRank}
          highlightedPlayerId={highlightedPlayerId}
        />
      </table>
    </div>
  );
}
