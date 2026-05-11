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
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CaretDown, Eye, EyeSlash, DotsSixVertical, GearSix } from '@phosphor-icons/react';
import { useAppStore } from '../../store/appStore';
import type { PlayerDTO } from '../../api/dto';
import { INTERACTIVE_BASE, INTERACTIVE_BASE_QUIET } from '../../lib/utils';

const EVENT_ORDER = ['MD', 'WD', 'XD', 'WS', 'MS'] as const;
const EVENT_LABEL: Record<string, { full: string; header: string; body: string }> = {
  MS: {
    full: "Men's Singles",
    header: 'bg-blue-200 text-blue-900 border-blue-400',
    body:   'bg-blue-50/40',
  },
  WS: {
    full: "Women's Singles",
    header: 'bg-purple-200 text-purple-900 border-purple-400',
    body:   'bg-purple-50/40',
  },
  MD: {
    full: "Men's Doubles",
    header: 'bg-rose-200 text-rose-900 border-rose-400',
    body:   'bg-rose-50/40',
  },
  WD: {
    full: "Women's Doubles",
    header: 'bg-teal-200 text-teal-900 border-teal-400',
    body:   'bg-teal-50/40',
  },
  XD: {
    full: "Mixed Doubles",
    header: 'bg-amber-200 text-amber-900 border-amber-400',
    body:   'bg-amber-50/40',
  },
};

function isDoubles(prefix: string): boolean {
  return prefix.endsWith('D');
}

export function PositionGrid({ schoolId }: { schoolId: string }) {
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);

  const schoolPlayers = useMemo(
    () => players.filter((p) => p.groupId === schoolId),
    [players, schoolId],
  );

  const school = groups.find((g) => g.id === schoolId);

  // Column ordering + visibility — both per-tournament settings on
  // ``config``. Falls back to the canonical MD/WD/XD/WS/MS sequence
  // when ``config.eventOrder`` is unset, and shows every configured
  // event when ``config.eventVisible`` is unset.
  const events = useMemo(() => {
    const counts = config?.rankCounts ?? {};
    const order = (config?.eventOrder?.length ? config.eventOrder : EVENT_ORDER).filter(
      (ev) => (counts[ev] ?? 0) > 0,
    );
    // Append any newly-introduced events that aren't yet in eventOrder
    // so the user never silently loses a column.
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
    <div className="flex min-w-0 flex-col bg-card">
      <div className="flex items-baseline justify-between border-b border-border/60 bg-muted/40 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Position grid
          </span>
          <span className="text-[11px] text-foreground">
            {school?.name ?? '—'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {events.length} of {allConfiguredEvents.length} events · up to {maxRows} positions
          </span>
          <ColumnManager
            order={allConfiguredEvents}
            visible={config?.eventVisible}
            onMove={moveColumn}
            onReorder={reorderColumns}
            onToggle={toggleVisible}
            onReset={resetColumns}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        {/* border-collapse so the per-cell borders merge into clean grid lines */}
        <table
          className="w-full min-w-[780px] border-collapse text-sm"
          data-testid="position-grid-table"
        >
          <thead>
            <tr>
              <th className="w-12 border-b-2 border-r border-border bg-muted py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                #
              </th>
              {events.map((ev) => {
                const label = EVENT_LABEL[ev.prefix];
                return (
                  <th
                    key={ev.prefix}
                    className={`border-b-2 border-r border-border px-3 py-2 text-left text-xs font-bold tracking-wide last:border-r-0 ${label?.header ?? 'bg-muted text-foreground'}`}
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
                <td className="w-12 border-b border-r border-border bg-muted/40 py-2 text-center text-xs font-semibold text-muted-foreground tabular-nums">
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
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PositionCell({
  schoolId,
  rank,
  eventPrefix,
  doubles,
  disabled,
  occupants,
}: {
  schoolId: string;
  rank: string;
  eventPrefix: string;
  doubles: boolean;
  disabled: boolean;
  occupants: PlayerDTO[];
}) {
  const players = useAppStore((s) => s.players);
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  const capacity = doubles ? 2 : 1;
  const isFull = occupants.length >= capacity;

  const [pickerOpen, setPickerOpen] = useState(false);

  const { setNodeRef, isOver, active } = useDroppable({
    id: `cell:${schoolId}:${rank}`,
    data: { schoolId, rank, doubles, capacity },
    disabled: disabled || isFull,
  });

  const removeRank = (playerId: string) => {
    const p = occupants.find((o) => o.id === playerId);
    if (!p) return;
    updatePlayer(p.id, {
      ranks: (p.ranks ?? []).filter((r) => r !== rank),
    });
  };

  const assignPlayer = (playerId: string) => {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    if ((p.ranks ?? []).includes(rank)) return;

    if (!doubles) {
      // Displace any existing singles occupant.
      for (const other of players) {
        if (
          other.id !== p.id &&
          other.groupId === schoolId &&
          (other.ranks ?? []).includes(rank)
        ) {
          updatePlayer(other.id, {
            ranks: (other.ranks ?? []).filter((r) => r !== rank),
          });
        }
      }
    } else if (occupants.length >= capacity) {
      return;
    }
    updatePlayer(p.id, { ranks: [...(p.ranks ?? []), rank] });
  };

  const dragIsEligible =
    active?.data.current?.schoolId === schoolId &&
    !isFull &&
    !disabled &&
    !occupants.some((o) => o.id === active?.data.current?.playerId);
  const dragHover = isOver && dragIsEligible;
  const dragReject = isOver && !dragIsEligible;
  const isDragging = active !== null;

  const bodyTint = EVENT_LABEL[eventPrefix]?.body ?? '';

  return (
    <td
      ref={setNodeRef}
      data-testid={`pos-cell-${schoolId}-${rank}`}
      className={[
        'relative align-top border-b border-r border-border last:border-r-0 transition-colors min-w-[160px]',
        disabled ? 'bg-muted/60 text-muted-foreground/70' : bodyTint,
        isDragging && !disabled
          ? 'ring-1 ring-inset ring-border'
          : '',
        dragHover
          ? 'bg-emerald-100 ring-[3px] ring-inset ring-emerald-500 shadow-inner'
          : '',
        dragReject
          ? 'bg-red-100 ring-[3px] ring-inset ring-red-500 shadow-inner'
          : '',
      ].join(' ')}
    >
      {disabled ? (
        <span className="block px-2 py-2 text-[10px] italic opacity-50">—</span>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            if ((e.target as HTMLElement).dataset.noPicker) return;
            setPickerOpen((v) => !v);
          }}
          data-testid={`pos-cell-btn-${schoolId}-${rank}`}
          className="block w-full rounded px-2 py-2 text-left hover:bg-card/70 focus:outline-none focus:bg-card"
        >
          <div className="flex flex-col gap-1">
            {/* Doubles cells render each occupant on its own line —
                one chip per player. Cleaner than joining names with
                "&" and works the same for 1- and 2-player states. */}
            {(
              occupants.map((p, i) => (
                <span
                  key={p.id}
                  className={[
                    'group inline-flex items-center justify-between gap-1 rounded border px-2 py-0.5 text-[11px] font-medium leading-tight shadow-sm',
                    doubles
                      ? i === 0
                        ? 'border-blue-300 bg-card text-blue-900 dark:border-blue-500/30 dark:text-blue-300'
                        : 'border-indigo-300 bg-card text-indigo-900 dark:border-indigo-500/30 dark:text-indigo-300'
                      : 'border-border bg-card text-foreground',
                  ].join(' ')}
                >
                  <span className="break-words">{p.name || '(unnamed)'}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    data-no-picker="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRank(p.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        e.preventDefault();
                        removeRank(p.id);
                      }
                    }}
                    aria-label={`Unassign ${p.name} from ${rank}`}
                    className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-red-600 dark:hover:text-red-300"
                  >
                    ×
                  </span>
                </span>
              ))
            )}
            {doubles && occupants.length === 1 ? (
              <span className="rounded border border-dashed border-border px-2 py-0.5 text-[10px] italic text-muted-foreground">
                ＋ add partner
              </span>
            ) : null}
            {occupants.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] italic text-muted-foreground">
                <span aria-hidden>＋</span>
                {doubles ? 'add pair' : 'add player'}
              </span>
            ) : null}
          </div>
        </button>
      )}

      {pickerOpen ? (
        <PlayerSearchPicker
          schoolId={schoolId}
          rank={rank}
          doubles={doubles}
          occupants={occupants}
          onAssign={assignPlayer}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </td>
  );
}

function PlayerSearchPicker({
  schoolId,
  rank,
  doubles,
  occupants,
  onAssign,
  onClose,
}: {
  schoolId: string;
  rank: string;
  doubles: boolean;
  occupants: PlayerDTO[];
  onAssign: (playerId: string) => void;
  onClose: () => void;
}) {
  const players = useAppStore((s) => s.players);
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // Focus the search input when opened.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    const mousedown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', mousedown);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', mousedown);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const occupantIds = new Set(occupants.map((o) => o.id));
    return players
      .filter((p) => p.groupId === schoolId && !occupantIds.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players, schoolId, occupants, query]);

  // Keep activeIndex in range as the filter narrows/widens.
  useEffect(() => {
    setActiveIndex((i) => Math.min(Math.max(i, 0), Math.max(candidates.length - 1, 0)));
  }, [candidates.length]);

  const pick = (p: PlayerDTO) => {
    onAssign(p.id);
    if (!doubles || occupants.length + 1 >= 2) onClose();
    else setQuery('');
  };

  return (
    <div
      ref={ref}
      data-testid={`picker-${schoolId}-${rank}`}
      className="absolute left-1 right-1 top-full z-overlay mt-1 rounded-md border border-border bg-card shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-b border-border/60 px-2 py-1.5">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, candidates.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const pick_ = candidates[activeIndex];
              if (pick_) pick(pick_);
            }
          }}
          placeholder={`Search players for ${rank}…`}
          data-testid="picker-search"
          className="w-full rounded border border-border px-2 py-1 text-sm outline-none focus:border-blue-400"
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {candidates.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs italic text-muted-foreground">
            {query
              ? 'No matching players.'
              : 'No more players available — add some to the pool.'}
          </div>
        ) : (
          candidates.map((p, i) => {
            const currentRanks = (p.ranks ?? []).filter((r) => r !== rank);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                onMouseEnter={() => setActiveIndex(i)}
                data-testid={`picker-option-${p.id}`}
                className={[
                  'flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm transition-colors',
                  i === activeIndex ? 'bg-blue-50 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300' : 'text-foreground hover:bg-muted/50',
                ].join(' ')}
              >
                <span className="truncate">{p.name || '(unnamed)'}</span>
                {currentRanks.length > 0 ? (
                  <span className="ml-2 truncate text-[10px] font-normal text-muted-foreground">
                    {currentRanks.slice(0, 3).join(', ')}
                    {currentRanks.length > 3 ? '…' : ''}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
        <span>Up/Down to navigate · Enter to pick · Esc to close</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1 hover:text-foreground"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/** Draggable chip for a player in the pool. */
export function DraggablePlayerChip({
  player,
  schoolId,
}: {
  player: PlayerDTO;
  schoolId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `player:${player.id}`,
    data: { schoolId, playerId: player.id },
  });
  const style = transform
    ? { transform: CSS.Translate.toString({ x: transform.x, y: transform.y, scaleX: 1, scaleY: 1 }) }
    : undefined;
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      data-testid={`pool-chip-${player.id}`}
      className={[
        'inline-flex w-full items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-left text-sm shadow-sm transition-[transform,box-shadow,border-color,opacity] duration-150 ease-brand',
        isDragging
          ? 'z-popover shadow-lg ring-2 ring-primary cursor-grabbing opacity-90 scale-[1.02]'
          : 'cursor-grab hover:border-primary',
      ].join(' ')}
    >
      <span aria-hidden className="text-muted-foreground/70">⠿</span>
      <span className="flex-1 truncate">{player.name || '(unnamed)'}</span>
      {(() => {
        const eventCount = (player.ranks ?? []).length;
        const heavy = eventCount >= 4;
        return (
          <span
            className={[
              'inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] tabular-nums',
              heavy
                ? 'bg-status-warning-bg text-status-warning ring-1 ring-status-warning/40'
                : 'text-muted-foreground',
            ].join(' ')}
            title={heavy ? `High event load — ${eventCount} events` : `${eventCount} event${eventCount === 1 ? '' : 's'}`}
            aria-label={heavy ? `High event load: ${eventCount} events` : undefined}
          >
            {eventCount}
          </span>
        );
      })()}
    </button>
  );
}

/**
 * Column manager popover — reorder + show/hide events on the position
 * grid. Settings persist on ``config.eventOrder`` and
 * ``config.eventVisible`` (per-tournament). Reset returns to the
 * canonical MD/WD/XD/WS/MS order with everything visible.
 */
function ColumnManager({
  order,
  visible,
  onMove,
  onReorder,
  onToggle,
  onReset,
}: {
  order: string[];
  visible: Record<string, boolean> | undefined;
  onMove: (prefix: string, direction: -1 | 1) => void;
  onReorder: (nextOrder: string[]) => void;
  onToggle: (prefix: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Nested DndContext: this one's onDragEnd reorders the column list.
  // The parent RosterTab has its own DndContext for player→cell drops;
  // nesting works because each context owns its own id namespace and
  // the popover's drags use ``id={prefix}`` which can't collide with
  // the parent's ``cell:..`` / ``player:..`` ids. A 4 px activation
  // distance prevents clicks from being misread as drag starts.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(order, from, to));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={[
          INTERACTIVE_BASE,
          'inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-2xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        ].join(' ')}
      >
        <GearSix aria-hidden="true" className="h-3 w-3" />
        Columns
        <CaretDown aria-hidden="true" className="h-3 w-3" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Manage columns"
          className="absolute right-0 top-full z-popover mt-1 w-72 rounded border border-border bg-popover p-2 text-xs text-popover-foreground shadow-lg"
        >
          <div className="mb-1.5 flex items-center justify-between border-b border-border/60 pb-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Drag to reorder · click <Eye aria-hidden="true" className="inline h-3 w-3 align-text-bottom" /> to hide
            </span>
            <button
              type="button"
              onClick={onReset}
              className={`${INTERACTIVE_BASE_QUIET} rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground`}
            >
              Reset
            </button>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5">
                {order.map((prefix, i) => (
                  <SortableEventRow
                    key={prefix}
                    prefix={prefix}
                    index={i}
                    total={order.length}
                    isVisible={visible?.[prefix] !== false}
                    label={EVENT_LABEL[prefix]?.full}
                    onMove={onMove}
                    onToggle={onToggle}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

/**
 * One sortable row inside the ColumnManager popover. Drag handle is
 * the DotsSixVertical glyph at the left; ▲/▼ remain as keyboard-friendly
 * fallbacks; eye toggle on the right hides/shows the column.
 */
function SortableEventRow({
  prefix,
  index,
  total,
  isVisible,
  label,
  onMove,
  onToggle,
}: {
  prefix: string;
  index: number;
  total: number;
  isVisible: boolean;
  label: string | undefined;
  onMove: (prefix: string, direction: -1 | 1) => void;
  onToggle: (prefix: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: prefix });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-1 rounded px-1 py-0.5',
        isDragging ? 'bg-accent shadow-md ring-1 ring-ring' : 'hover:bg-muted/50',
      ].join(' ')}
    >
      {/* Drag handle — only the grip is a drag source so the rest of
          the row's clicks (▲ / ▼ / eye) still work normally. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${prefix} to reorder`}
        className={`${INTERACTIVE_BASE_QUIET} cursor-grab active:cursor-grabbing rounded p-0.5 text-muted-foreground/70 hover:text-foreground`}
      >
        <DotsSixVertical aria-hidden="true" className="h-3 w-3" />
      </button>
      <span className="w-7 font-mono text-2xs">{prefix}</span>
      <span className="flex-1 truncate text-2xs text-muted-foreground">
        {label ?? prefix}
      </span>
      <button
        type="button"
        onClick={() => onMove(prefix, -1)}
        disabled={index === 0}
        aria-label={`Move ${prefix} up`}
        className={`${INTERACTIVE_BASE_QUIET} rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30`}
      >
        <span aria-hidden>▲</span>
      </button>
      <button
        type="button"
        onClick={() => onMove(prefix, 1)}
        disabled={index === total - 1}
        aria-label={`Move ${prefix} down`}
        className={`${INTERACTIVE_BASE_QUIET} rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30`}
      >
        <span aria-hidden>▼</span>
      </button>
      <button
        type="button"
        onClick={() => onToggle(prefix)}
        aria-label={isVisible ? `Hide ${prefix}` : `Show ${prefix}`}
        aria-pressed={!isVisible}
        className={`${INTERACTIVE_BASE_QUIET} rounded p-0.5 ${isVisible ? 'text-foreground' : 'text-muted-foreground/50'}`}
        title={isVisible ? 'Visible' : 'Hidden'}
      >
        {isVisible ? (
          <Eye aria-hidden="true" className="h-3 w-3" />
        ) : (
          <EyeSlash aria-hidden="true" className="h-3 w-3" />
        )}
      </button>
    </li>
  );
}
