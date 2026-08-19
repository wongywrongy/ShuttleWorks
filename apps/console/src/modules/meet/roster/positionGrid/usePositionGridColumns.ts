/**
 * Column ordering + visibility for the position grid — both
 * per-tournament settings on `config`. Falls back to `defaultEventOrder`
 * (canonical disciplines first, then the meet's own events) when
 * `config.eventOrder` is unset, and shows every configured event when
 * `config.eventVisible` is unset.
 *
 * Plain derivations only — the React Compiler auto-memoizes. Do NOT
 * wrap these in `useMemo` with optional-chained deps; that was blocking
 * whole-component compilation.
 */
import { useTournamentStore } from '../../../../store/tournamentStore';
import { defaultEventOrder } from './helpers';

export function usePositionGridColumns() {
  const config = useTournamentStore((s) => s.config);
  const setConfig = useTournamentStore((s) => s.setConfig);

  const _counts = config?.rankCounts ?? {};
  const _defaultOrder = defaultEventOrder(_counts);
  const _orderedEvents = (
    config?.eventOrder?.length ? config.eventOrder : _defaultOrder
  ).filter((ev) => _defaultOrder.includes(ev));
  for (const ev of _defaultOrder) {
    if (!_orderedEvents.includes(ev)) _orderedEvents.push(ev);
  }
  const allConfiguredEvents = _orderedEvents;
  const _visible = config?.eventVisible;
  const events = allConfiguredEvents
    .filter((ev) => _visible?.[ev] !== false)
    .map((ev) => ({ prefix: ev, count: _counts[ev] ?? 0 }));

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
    /** Column order with no operator override — what `resetColumns` restores. */
    defaultOrder: _defaultOrder,
    eventVisible: config?.eventVisible,
    moveColumn,
    reorderColumns,
    toggleVisible,
    resetColumns,
  };
}
