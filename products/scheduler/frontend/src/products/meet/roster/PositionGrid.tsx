/**
 * Position-centric roster grid.
 *
 * Columns = events (MD, WD, XD, WS, MS derived from config.rankCounts).
 * Rows    = position numbers 1..N for that event.
 * Cell    = the player(s) whose `ranks[]` contain the rank `${prefix}${row}`.
 *           Singles events hold one player; doubles hold two.
 *
 * Interaction:
 *   - Drag a player chip from the PlayerPool onto a cell; OR
 *   - Click a cell: a searchable player picker opens inline.
 *   - Click × on a chip inside a cell to unassign.
 *
 * All state lives in Zustand — any assignment = `updatePlayer(id, { ranks })`.
 *
 * This file owns the top-level grid layout and the column-control hook;
 * the heavier per-cell rendering, picker, and column manager live in
 * the `positionGrid/` sub-folder.
 */
import { useMemo } from 'react';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { PlayerDTO } from '../../../api/dto';
import { usePositionGridColumns } from './positionGrid/usePositionGridColumns';
import { GridTable } from './positionGrid/GridTable';

// Re-export for existing call sites — RosterTab imports DraggablePlayerChip
// from './PositionGrid'. usePositionGridColumns now lives in its own module;
// re-export to keep the public surface stable. Column management (reorder /
// hide / reset) now lives in the grid header itself — no separate menu.
export { DraggablePlayerChip } from './positionGrid/DraggablePlayerChip';
export { usePositionGridColumns } from './positionGrid/usePositionGridColumns';

export function PositionGrid({
  schoolId,
  highlightedPlayerId,
}: {
  schoolId: string;
  highlightedPlayerId?: string | null;
}) {
  const players = useTournamentStore((s) => s.players);

  const schoolPlayers = useMemo(
    () => players.filter((p) => p.groupId === schoolId),
    [players, schoolId],
  );

  const { events } = usePositionGridColumns();

  const maxRows = Math.max(0, ...events.map((e) => e.count));

  const byRank = useMemo(() => {
    const map = new Map<string, PlayerDTO[]>();
    for (const p of schoolPlayers) {
      for (const r of p.ranks ?? []) {
        if (!map.has(r)) map.set(r, []);
        map.get(r)!.push(p);
      }
    }
    return map;
  }, [schoolPlayers]);

  if (events.length === 0) {
    return (
      <div className="bg-card px-6 py-10 text-center text-xs text-muted-foreground">
        No events configured. Set <strong>Event Categories</strong> in the Setup tab to enable the roster grid.
      </div>
    );
  }

  return (
    <GridTable
      events={events}
      maxRows={maxRows}
      schoolId={schoolId}
      byRank={byRank}
      highlightedPlayerId={highlightedPlayerId}
    />
  );
}
