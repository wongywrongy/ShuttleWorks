/**
 * Inline spreadsheet-style roster editor.
 *
 * Every player field the old PlayerFormDialog exposed is editable inline:
 *
 *   Name · School · Ranks · Availability · Rest · Notes · Delete
 *
 * Ranks and Availability open inline popovers on click. Everything else
 * commits on blur. No modals.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useAppStore } from '../../store/appStore';
import type { AvailabilityWindow, PlayerDTO, TournamentConfig } from '../../api/dto';

function expandRanks(rankCounts: TournamentConfig['rankCounts']): string[] {
  const out: string[] = [];
  for (const [prefix, count] of Object.entries(rankCounts || {})) {
    for (let i = 1; i <= count; i++) out.push(`${prefix}${i}`);
  }
  return out;
}

function formatWindows(windows: AvailabilityWindow[] | undefined): string {
  if (!windows || windows.length === 0) return '';
  return windows.map((w) => `${w.start}–${w.end}`).join(', ');
}

export function RosterSpreadsheet() {
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);
  const config = useAppStore((s) => s.config);
  const addPlayer = useAppStore((s) => s.addPlayer);
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  const deletePlayer = useAppStore((s) => s.deletePlayer);

  const availableRanks = useMemo(
    () => expandRanks(config?.rankCounts || {}),
    [config?.rankCounts],
  );

  const [newRowId, setNewRowId] = useState<string | null>(null);
  const newRowRef = useRef<HTMLInputElement | null>(null);

  const addEmptyRow = useCallback(() => {
    const id = uuid();
    const player: PlayerDTO = {
      id,
      name: '',
      groupId: groups[0]?.id ?? '',
      ranks: [],
      availability: [],
    };
    addPlayer(player);
    setNewRowId(id);
  }, [groups, addPlayer]);

  useEffect(() => {
    if (newRowId && newRowRef.current) {
      newRowRef.current.focus();
      newRowRef.current.select();
      setNewRowId(null);
    }
  }, [newRowId]);

  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Players <span className="text-gray-400">({players.length})</span>
        </span>
        <button
          type="button"
          onClick={addEmptyRow}
          disabled={groups.length === 0}
          title={groups.length === 0 ? 'Add a school first' : 'Add player row'}
          data-testid="add-player-row"
          className="rounded-full border border-dashed border-gray-300 px-3 py-0.5 text-xs text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ＋ Add player
        </button>
      </div>

      {players.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-gray-400">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 20c0-3 3-5 7-5s7 2 7 5M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <p>
            No players yet.{' '}
            {groups.length === 0 ? 'Add a school to begin.' : 'Click “Add player” to start.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-3 py-1.5 text-left font-medium">Name</th>
                <th className="px-3 py-1.5 text-left font-medium">School</th>
                <th className="px-3 py-1.5 text-left font-medium">Ranks</th>
                <th className="px-3 py-1.5 text-left font-medium">Availability</th>
                <th className="w-24 px-3 py-1.5 text-left font-medium">Rest (min)</th>
                <th className="px-3 py-1.5 text-left font-medium">Notes</th>
                <th className="w-10 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  index={i}
                  groups={groups}
                  availableRanks={availableRanks}
                  config={config}
                  onUpdate={updatePlayer}
                  onDelete={deletePlayer}
                  rowRef={newRowId === p.id ? newRowRef : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  index,
  groups,
  availableRanks,
  config,
  onUpdate,
  onDelete,
  rowRef,
}: {
  player: PlayerDTO;
  index: number;
  groups: { id: string; name: string }[];
  availableRanks: string[];
  config: TournamentConfig | null;
  onUpdate: (id: string, patch: Partial<PlayerDTO>) => void;
  onDelete: (id: string) => void;
  rowRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [nameDraft, setNameDraft] = useState(player.name);
  const [restDraft, setRestDraft] = useState(
    player.minRestMinutes !== undefined && player.minRestMinutes !== null
      ? String(player.minRestMinutes)
      : '',
  );
  const [notesDraft, setNotesDraft] = useState(player.notes ?? '');
  const [rankPickerOpen, setRankPickerOpen] = useState(false);
  const [availPickerOpen, setAvailPickerOpen] = useState(false);

  useEffect(() => setNameDraft(player.name), [player.name]);
  useEffect(
    () =>
      setRestDraft(
        player.minRestMinutes !== undefined && player.minRestMinutes !== null
          ? String(player.minRestMinutes)
          : '',
      ),
    [player.minRestMinutes],
  );
  useEffect(() => setNotesDraft(player.notes ?? ''), [player.notes]);

  const commitName = () => {
    if (nameDraft !== player.name) onUpdate(player.id, { name: nameDraft });
  };
  const commitRest = () => {
    const parsed = restDraft.trim() === '' ? undefined : Number(restDraft);
    if (parsed !== player.minRestMinutes) {
      onUpdate(player.id, {
        minRestMinutes: Number.isFinite(parsed) ? parsed : undefined,
      });
    }
  };
  const commitNotes = () => {
    if (notesDraft !== (player.notes ?? '')) {
      onUpdate(player.id, { notes: notesDraft || undefined });
    }
  };

  const toggleRank = (rank: string) => {
    const current = player.ranks ?? [];
    onUpdate(player.id, {
      ranks: current.includes(rank) ? current.filter((r) => r !== rank) : [...current, rank],
    });
  };

  const updateAvailability = (windows: AvailabilityWindow[]) => {
    onUpdate(player.id, { availability: windows });
  };

  return (
    <tr
      className={[
        'border-b border-gray-100 transition-colors hover:bg-gray-50/60',
        index % 2 === 0 ? '' : 'bg-gray-50/30',
      ].join(' ')}
      data-testid={`player-row-${player.id}`}
    >
      <td className="px-2 py-1">
        <input
          ref={rowRef}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="Player name"
          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors focus:border-blue-400 focus:bg-white"
        />
      </td>
      <td className="px-2 py-1">
        <select
          value={player.groupId}
          onChange={(e) => onUpdate(player.id, { groupId: e.target.value })}
          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors focus:border-blue-400 focus:bg-white"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </td>

      {/* Ranks — visible, clickable pill area */}
      <td className="relative px-2 py-1">
        <button
          type="button"
          onClick={() => setRankPickerOpen((v) => !v)}
          aria-expanded={rankPickerOpen}
          data-testid={`rank-picker-${player.id}`}
          className={[
            'flex min-h-[30px] w-full flex-wrap items-center gap-1 rounded border bg-white px-2 py-1 text-left text-sm transition-colors hover:border-blue-400',
            rankPickerOpen ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200',
          ].join(' ')}
        >
          {(player.ranks ?? []).length === 0 ? (
            <span className="text-xs italic text-gray-400">Click to assign ranks…</span>
          ) : (
            (player.ranks ?? []).map((r) => (
              <span
                key={r}
                className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0 text-[11px] font-medium text-blue-700"
              >
                {r}
              </span>
            ))
          )}
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-gray-400">
            {rankPickerOpen ? (
              <ChevronUp aria-hidden="true" className="h-3 w-3" />
            ) : (
              'edit'
            )}
          </span>
        </button>
        {rankPickerOpen ? (
          <RankPicker
            availableRanks={availableRanks}
            selected={player.ranks ?? []}
            onToggle={toggleRank}
            onClose={() => setRankPickerOpen(false)}
          />
        ) : null}
      </td>

      {/* Availability — same click-to-open pattern */}
      <td className="relative px-2 py-1">
        <button
          type="button"
          onClick={() => setAvailPickerOpen((v) => !v)}
          aria-expanded={availPickerOpen}
          data-testid={`avail-picker-${player.id}`}
          className={[
            'flex min-h-[30px] w-full items-center gap-1 rounded border bg-white px-2 py-1 text-left text-sm transition-colors hover:border-blue-400',
            availPickerOpen ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200',
          ].join(' ')}
        >
          {(player.availability ?? []).length === 0 ? (
            <span className="text-xs italic text-gray-400">All day (default)</span>
          ) : (
            <span className="truncate text-[11px] text-gray-700 tabular-nums">
              {formatWindows(player.availability)}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-gray-400">
            {availPickerOpen ? (
              <ChevronUp aria-hidden="true" className="h-3 w-3" />
            ) : (
              'edit'
            )}
          </span>
        </button>
        {availPickerOpen ? (
          <AvailabilityPicker
            config={config}
            windows={player.availability ?? []}
            onChange={updateAvailability}
            onClose={() => setAvailPickerOpen(false)}
          />
        ) : null}
      </td>

      <td className="px-2 py-1">
        <input
          type="number"
          min={0}
          step={5}
          value={restDraft}
          onChange={(e) => setRestDraft(e.target.value)}
          onBlur={commitRest}
          placeholder="default"
          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm tabular-nums outline-none transition-colors focus:border-blue-400 focus:bg-white"
        />
      </td>
      <td className="px-2 py-1">
        <input
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={commitNotes}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="—"
          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors focus:border-blue-400 focus:bg-white"
        />
      </td>
      <td className="px-2 py-1 text-right">
        <button
          type="button"
          onClick={() => onDelete(player.id)}
          className="rounded p-1 text-gray-300 opacity-60 transition-colors hover:bg-red-50 hover:text-red-600 hover:opacity-100"
          title="Delete player"
          aria-label={`Delete ${player.name || 'player'}`}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [ref, onClose]);
}

function RankPicker({
  availableRanks,
  selected,
  onToggle,
  onClose,
}: {
  availableRanks: string[];
  selected: string[];
  onToggle: (rank: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, onClose);

  if (availableRanks.length === 0) {
    return (
      <div
        ref={ref}
        className="absolute left-2 top-full z-40 mt-1 w-64 rounded border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-lg"
      >
        No event ranks configured. Set <strong>Event Categories</strong> in the Setup tab.
      </div>
    );
  }

  const byPrefix = new Map<string, string[]>();
  for (const r of availableRanks) {
    const prefix = r.replace(/\d+$/, '');
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push(r);
  }

  return (
    <div
      ref={ref}
      className="absolute left-2 top-full z-40 mt-1 w-64 rounded border border-gray-200 bg-white p-2 shadow-lg"
    >
      <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Assign ranks
      </div>
      {[...byPrefix.entries()].map(([prefix, ranks]) => (
        <div key={prefix} className="mb-1 last:mb-0">
          <div className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {prefix}
          </div>
          <div className="flex flex-wrap gap-1">
            {ranks.map((r) => {
              const isOn = selected.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => onToggle(r)}
                  data-testid={`rank-option-${r}`}
                  className={[
                    'rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                    isOn
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400',
                  ].join(' ')}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-2 border-t border-gray-100 pt-1.5 text-right">
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-gray-500 hover:text-gray-800"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function AvailabilityPicker({
  config,
  windows,
  onChange,
  onClose,
}: {
  config: TournamentConfig | null;
  windows: AvailabilityWindow[];
  onChange: (windows: AvailabilityWindow[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, onClose);

  const dayStart = config?.dayStart ?? '09:00';
  const dayEnd = config?.dayEnd ?? '17:00';

  const updateAt = (i: number, patch: Partial<AvailabilityWindow>) => {
    onChange(windows.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  };
  const removeAt = (i: number) => {
    onChange(windows.filter((_, idx) => idx !== i));
  };
  const addWindow = () => {
    onChange([...(windows ?? []), { start: dayStart, end: dayEnd }]);
  };

  return (
    <div
      ref={ref}
      className="absolute left-2 top-full z-40 mt-1 w-80 rounded border border-gray-200 bg-white p-3 shadow-lg"
    >
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Availability windows
        </span>
        <span className="text-[10px] text-gray-400">
          Day: {dayStart}–{dayEnd}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-gray-500">
        Leave empty for "available all day". Each window is an HH:mm range.
      </p>
      {windows.length === 0 ? (
        <div className="mb-2 rounded border border-dashed border-gray-200 px-2 py-3 text-center text-xs text-gray-400">
          All day (unconstrained)
        </div>
      ) : (
        <ul className="mb-2 space-y-1">
          {windows.map((w, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <input
                type="time"
                value={w.start}
                onChange={(e) => updateAt(i, { start: e.target.value })}
                className="w-24 rounded border border-gray-200 px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-blue-400"
              />
              <span className="text-xs text-gray-400" aria-hidden="true">to</span>
              <input
                type="time"
                value={w.end}
                onChange={(e) => updateAt(i, { end: e.target.value })}
                className="w-24 rounded border border-gray-200 px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-blue-400"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Remove window"
                className="ml-auto rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addWindow}
          data-testid="availability-add-window"
          className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
        >
          ＋ Add window
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-gray-500 hover:text-gray-800"
        >
          Done
        </button>
      </div>
    </div>
  );
}
