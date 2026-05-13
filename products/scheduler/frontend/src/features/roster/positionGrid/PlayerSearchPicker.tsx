/**
 * Inline search picker that opens inside a PositionCell when the cell
 * is clicked. Keyboard-driven (↑/↓ navigate, Enter pick, Esc close)
 * with mouse-hover sync for activeIndex. Closes on outside click.
 *
 * For doubles cells with one open seat, the picker stays open after a
 * pick so the operator can assign the partner without re-opening. For
 * singles or full doubles, it auto-closes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../../store/appStore';
import type { PlayerDTO } from '../../../api/dto';

export function PlayerSearchPicker({
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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
                  i === activeIndex
                    ? 'bg-blue-50 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'text-foreground hover:bg-muted/50',
                ].join(' ')}
              >
                <span className="truncate">{p.name || '(unnamed)'}</span>
                {currentRanks.length > 0 ? (
                  <span className="ml-2 truncate text-3xs font-normal text-muted-foreground">
                    {currentRanks.slice(0, 3).join(', ')}
                    {currentRanks.length > 3 ? '…' : ''}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 px-2 py-1 text-3xs text-muted-foreground">
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
