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
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '../../store/appStore';
import type { PlayerDTO } from '../../api/dto';

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

  const schoolPlayers = useMemo(
    () => players.filter((p) => p.groupId === schoolId),
    [players, schoolId],
  );

  const school = groups.find((g) => g.id === schoolId);

  const events = useMemo(() => {
    const counts = config?.rankCounts ?? {};
    return EVENT_ORDER.filter((ev) => (counts[ev] ?? 0) > 0).map((ev) => ({
      prefix: ev,
      count: counts[ev] ?? 0,
    }));
  }, [config?.rankCounts]);

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
      <div className="rounded border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
        No events configured. Set <strong>Event Categories</strong> in the Setup tab to enable the roster grid.
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-card overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Position grid
          </span>
          <span className="text-[11px] text-muted-foreground">
            {school?.name ?? '—'} · click a cell or drag a player onto it
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {events.length} events · up to {maxRows} positions
        </span>
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
            {doubles && occupants.length === 2 ? (
              // Complete doubles pair — one chip, "Name1 & Name2" on one line
              // (wraps on very long names; never truncates).
              <span
                className="group inline-flex flex-wrap items-center gap-x-1 gap-y-0 rounded border border-blue-300 bg-card px-2 py-0.5 text-[11px] font-medium leading-tight shadow-sm dark:border-blue-500/30"
              >
                <NamePill player={occupants[0]} accent="blue"  onRemove={removeRank} rank={rank} />
                <span aria-hidden className="text-muted-foreground">&</span>
                <NamePill player={occupants[1]} accent="indigo" onRemove={removeRank} rank={rank} />
              </span>
            ) : (
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

/**
 * A single partner inside a combined "Name & Name" doubles chip. Each half
 * stays individually removable — hover to reveal the × right next to the
 * name it unassigns — while still reading as one visual unit.
 */
function NamePill({
  player,
  accent,
  onRemove,
  rank,
}: {
  player: PlayerDTO;
  accent: 'blue' | 'indigo';
  onRemove: (playerId: string) => void;
  rank: string;
}) {
  const text = accent === 'blue' ? 'text-blue-900 dark:text-blue-300' : 'text-indigo-900 dark:text-indigo-300';
  return (
    <span className={`inline-flex items-center gap-0.5 ${text}`}>
      <span className="break-words">{player.name || '(unnamed)'}</span>
      <span
        role="button"
        tabIndex={0}
        data-no-picker="true"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(player.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            onRemove(player.id);
          }
        }}
        aria-label={`Unassign ${player.name} from ${rank}`}
        className="cursor-pointer text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-300"
      >
        ×
      </span>
    </span>
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
      className="absolute left-1 right-1 top-full z-40 mt-1 rounded-md border border-border bg-card shadow-xl"
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
        'inline-flex w-full items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-left text-sm shadow-sm transition-all',
        isDragging
          ? 'z-30 shadow-lg ring-2 ring-blue-400 cursor-grabbing opacity-90 scale-[1.02]'
          : 'cursor-grab hover:border-blue-400',
      ].join(' ')}
    >
      <span aria-hidden className="text-muted-foreground/70">⠿</span>
      <span className="flex-1 truncate">{player.name || '(unnamed)'}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {(player.ranks ?? []).length}
      </span>
    </button>
  );
}
