/**
 * Position-grid body — one row per position (1..maxRows). Each cell is a
 * PositionCell; cells beyond an event's configured count are `disabled`
 * (rendered as a dash, not droppable).
 */
import type { PlayerDTO } from '../../../../api/dto';
import { isDoubles } from './helpers';
import { PositionCell } from './PositionCell';
import type { GridEvent } from './GridHeader';

export function GridBody({
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
    <tbody>
      {Array.from({ length: maxRows }, (_, i) => i + 1).map((row) => (
        <tr key={row}>
          <td className="w-12 border-b border-r border-border bg-muted/40 py-1.5 text-center text-xs font-semibold text-muted-foreground tabular-nums">
            {row}
          </td>
          {events.map((ev) => {
            const rank = `${ev.prefix}${row}`;
            const occupants = row <= ev.count ? byRank.get(rank) ?? [] : null;
            return (
              <PositionCell
                key={ev.prefix}
                schoolId={schoolId}
                rank={rank}
                doubles={isDoubles(ev.prefix)}
                disabled={occupants === null}
                occupants={occupants ?? []}
                highlightedPlayerId={highlightedPlayerId}
              />
            );
          })}
        </tr>
      ))}
    </tbody>
  );
}
