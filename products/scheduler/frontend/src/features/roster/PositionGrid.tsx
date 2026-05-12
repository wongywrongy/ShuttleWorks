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
import { useAppStore } from '../../store/appStore';
import type { PlayerDTO } from '../../api/dto';
import { EVENT_ORDER, EVENT_LABEL, isDoubles } from './positionGrid/helpers';
import { PositionCell } from './positionGrid/PositionCell';
import { ColumnManager } from './positionGrid/ColumnManager';

// Re-export for existing call sites — RosterTab imports
// DraggablePlayerChip from './PositionGrid'. Keep the public surface
// stable while the implementation moves to a dedicated module.
export { DraggablePlayerChip } from './positionGrid/DraggablePlayerChip';

/**
 * Column ordering + visibility — both per-tournament settings on
 * `config`. Falls back to the canonical MD/WD/XD/WS/MS sequence
 * when `config.eventOrder` is unset, and shows every configured
 * event when `config.eventVisible` is unset.
 */
export function usePositionGridColumns() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);

  const events = useMemo(() => {
    const counts = config?.rankCounts ?? {};
    const order = (config?.eventOrder?.length ? config.eventOrder : EVENT_ORDER).filter(
      (ev) => (counts[ev] ?? 0) > 0,
    );
    for (const ev of EVENT_ORDER) {
      if ((counts[ev] ?? 0) > 0 && !order.includes(ev)) order.push(ev);
    }
    const visible = config?.eventVisible;
    return order
      .filter((ev) => visible?.[ev] !== false)
      .map((ev) => ({ prefix: ev, count: counts[ev] ?? 0 }));
  }, [config?.rankCounts, config?.eventOrder, config?.eventVisible]);

  const allConfiguredEvents = useMemo(() => {
    const counts = config?.rankCounts ?? {};
    const order = (config?.eventOrder?.length ? config.eventOrder : EVENT_ORDER).filter(
      (ev) => (counts[ev] ?? 0) > 0,
    );
    for (const ev of EVENT_ORDER) {
      if ((counts[ev] ?? 0) > 0 && !order.includes(ev)) order.push(ev);
    }
    return order;
  }, [config?.rankCounts, config?.eventOrder]);

  const moveColumn = (prefix: string, direction: -1 | 1) => {
    if (!config) return;
    const order = [...allConfiguredEvents];
    const idx = order.indexOf(prefix);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    setConfig({ ...config, eventOrder: order });
  };

  const reorderColumns = (nextOrder: string[]) => {
    if (!config) return;
    setConfig({ ...config, eventOrder: nextOrder });
  };

  const toggleVisible = (prefix: string) => {
    if (!config) return;
    const visible = { ...(config.eventVisible ?? {}) };
    visible[prefix] = visible[prefix] === false ? true : false;
    setConfig({ ...config, eventVisible: visible });
  };

  const resetColumns = () => {
    if (!config) return;
    setConfig({ ...config, eventOrder: undefined, eventVisible: undefined });
  };

  return {
    events,
    allConfiguredEvents,
    eventVisible: config?.eventVisible,
    moveColumn,
    reorderColumns,
    toggleVisible,
    resetColumns,
  };
}

/**
 * Standalone column-visibility/order control. Rendered by RosterTab
 * inside its `PositionGridHeader` so the grid itself can sit flush
 * against the page chrome with no internal header bar.
 */
export function PositionGridColumnControls() {
  const {
    allConfiguredEvents,
    eventVisible,
    moveColumn,
    reorderColumns,
    toggleVisible,
    resetColumns,
  } = usePositionGridColumns();
  return (
    <ColumnManager
      order={allConfiguredEvents}
      visible={eventVisible}
      onMove={moveColumn}
      onReorder={reorderColumns}
      onToggle={toggleVisible}
      onReset={resetColumns}
    />
  );
}

export function PositionGrid({
  schoolId,
  highlightedPlayerId,
}: {
  schoolId: string;
  highlightedPlayerId?: string | null;
}) {
  const players = useAppStore((s) => s.players);

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
    <div className="overflow-x-auto bg-card">
      {/* border-collapse so the per-cell borders merge into clean grid lines */}
      <table
        className="w-full min-w-[780px] border-collapse text-sm"
        data-testid="position-grid-table"
      >
        <thead>
          <tr>
            <th className="w-12 border-b-2 border-r border-border bg-muted py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              #
            </th>
            {events.map((ev) => {
              const label = EVENT_LABEL[ev.prefix];
              return (
                <th
                  key={ev.prefix}
                  className={`border-b-2 border-r border-border px-3 py-1.5 text-left text-xs font-bold tracking-wide last:border-r-0 ${label?.header ?? 'bg-muted text-foreground'}`}
                  title={label?.full}
                >
                  {ev.prefix}
                  <span className="ml-2 text-[10px] font-medium opacity-70">
                    {isDoubles(ev.prefix) ? 'doubles' : 'singles'}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
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
                    eventPrefix={ev.prefix}
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
      </table>
    </div>
  );
}
