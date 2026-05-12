/**
 * Inline matches editor — spreadsheet-style rows replace the old MatchForm
 * dialog. Each row edits School A / School B / Side A players / Side B
 * players / event rank / duration inline.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CaretDown } from '@phosphor-icons/react';
import { v4 as uuid } from 'uuid';
import { useAppStore } from '../../store/appStore';
import { usePlayerMap } from '../../store/selectors';
import type { MatchDTO, PlayerDTO, RosterGroupDTO } from '../../api/dto';
import { InlineSearch, type FilterChipGroup } from '../../components/InlineSearch';
import { useSearchParamState, useSearchParamSet } from '../../hooks/useSearchParamState';
import { buildGroupIndex, getPlayerSchoolAccent } from '../../lib/schoolAccent';
import { SchoolDot } from '../../components/SchoolDot';
import { Hint } from '../../components/Hint';

function playerLabel(p: PlayerDTO, groups: RosterGroupDTO[]): string {
  const school = groups.find((g) => g.id === p.groupId)?.name ?? '?';
  return `${p.name || '(unnamed)'} · ${school}`;
}

export function MatchesSpreadsheet() {
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);
  const addMatch = useAppStore((s) => s.addMatch);
  const updateMatch = useAppStore((s) => s.updateMatch);
  const deleteMatch = useAppStore((s) => s.deleteMatch);
  const intervalMinutes = useAppStore((s) => s.config?.intervalMinutes ?? 15);
  const slotsHelp = `Number of consecutive time slots this match occupies on a court. 1 slot = ${intervalMinutes} min. Increase for matches expected to run long; the solver will reserve the extra slots and keep adjacent slots free on the same court.`;

  const [newId, setNewId] = useState<string | null>(null);
  const newRowRef = useRef<HTMLInputElement | null>(null);

  // URL-backed filter state — same trio as MatchesList so a Match-tab
  // filter survives a tab switch and back.
  const [searchQuery, setSearchQuery] = useSearchParamState('q', '');
  const [eventFilter, , toggleEvent] = useSearchParamSet('event');
  const [schoolFilter, , toggleSchool] = useSearchParamSet('school');
  const [typeFilter, , toggleType] = useSearchParamSet('type');

  const playerById = usePlayerMap();
  const groupIndex = useMemo(() => buildGroupIndex(groups), [groups]);

  const filteredMatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const eventActive = eventFilter.size > 0;
    const schoolActive = schoolFilter.size > 0;
    const typeActive = typeFilter.size > 0;
    if (!q && !eventActive && !schoolActive && !typeActive) return matches;

    const playerName = (id: string) => playerById.get(id)?.name?.toLowerCase() ?? '';
    const playerGroup = (id: string) => playerById.get(id)?.groupId;

    return matches.filter((m) => {
      if (q) {
        const hits =
          (m.eventRank?.toLowerCase().includes(q) ?? false) ||
          m.sideA.some((id) => playerName(id).includes(q)) ||
          m.sideB.some((id) => playerName(id).includes(q)) ||
          (m.sideC?.some((id) => playerName(id).includes(q)) ?? false);
        if (!hits) return false;
      }
      if (eventActive) {
        const prefix = (m.eventRank ?? '').match(/^[A-Z]+/)?.[0] ?? '';
        if (!eventFilter.has(prefix)) return false;
      }
      if (schoolActive) {
        const groupIds = new Set(
          [...m.sideA, ...m.sideB, ...(m.sideC ?? [])]
            .map(playerGroup)
            .filter(Boolean) as string[],
        );
        if (!Array.from(schoolFilter).some((id) => groupIds.has(id))) return false;
      }
      if (typeActive) {
        if (!typeFilter.has(m.matchType ?? 'dual')) return false;
      }
      return true;
    });
  }, [matches, searchQuery, eventFilter, schoolFilter, typeFilter, playerById]);

  // Search bar is text-only — Event / School / Type chips removed for
  // minimal chrome. Free-text matches event codes, player names, and
  // match types directly.
  const filterGroups: FilterChipGroup[] = [];

  const clearAllFilters = () => {
    setSearchQuery('');
    eventFilter.forEach((id) => toggleEvent(id));
    schoolFilter.forEach((id) => toggleSchool(id));
    typeFilter.forEach((id) => toggleType(id));
  };

  const addEmptyRow = () => {
    const id = uuid();
    addMatch({
      id,
      sideA: [],
      sideB: [],
      matchType: 'dual',
      eventRank: '',
      durationSlots: 1,
    });
    setNewId(id);
  };

  useEffect(() => {
    if (newId && newRowRef.current) {
      newRowRef.current.focus();
      setNewId(null);
    }
  }, [newId]);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Matches <span className="text-muted-foreground">({matches.length})</span>
        </span>
        <button
          type="button"
          onClick={addEmptyRow}
          disabled={players.length < 2}
          title={players.length < 2 ? 'Need at least 2 players' : 'Add match row'}
          data-testid="add-match-row"
          className="rounded-full border border-dashed border-border px-3 py-0.5 text-xs text-foreground hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ＋ Add match
        </button>
      </div>

      {matches.length > 0 && (
        <div className="border-b border-border/60 px-3 py-2">
          <InlineSearch
            query={searchQuery}
            onQueryChange={setSearchQuery}
            placeholder="Search event or player…"
            filters={filterGroups}
            showClear
            onClearAll={clearAllFilters}
          />
        </div>
      )}

      {matches.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No matches yet. Add one manually or use auto-generate above.
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No matches match these filters.
        </div>
      ) : (
        <>
          <div className="px-3 pt-2">
            <Hint id="matches.row-semantics" variant="subtle">
              <strong>Slots</strong> sets how many consecutive time slots a match holds on a
              court ({intervalMinutes} min each). Row order becomes the printed match #
              and is the solver's tie-breaker when other costs are equal.
            </Hint>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-2 py-1.5 text-left font-medium" title="Display order — printed as the match # in lists and exports.">#</th>
                  <th className="px-2 py-1.5 text-left font-medium">Event</th>
                  <th className="px-2 py-1.5 text-left font-medium">Side A</th>
                  <th className="px-2 py-1.5 text-left font-medium">Side B</th>
                  <th className="w-20 px-2 py-1.5 text-left font-medium" title={slotsHelp}>
                    <span className="inline-flex cursor-help items-center gap-1 underline decoration-dotted underline-offset-2">
                      Slots
                    </span>
                  </th>
                  <th className="w-10 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {filteredMatches.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    index={matches.indexOf(m)}
                    players={players}
                    groups={groups}
                    groupIndex={groupIndex}
                    onUpdate={updateMatch}
                    onDelete={deleteMatch}
                    firstInputRef={newId === m.id ? newRowRef : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function MatchRow({
  match,
  index,
  players,
  groups,
  groupIndex,
  onUpdate,
  onDelete,
  firstInputRef,
}: {
  match: MatchDTO;
  index: number;
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
  groupIndex: Map<string, RosterGroupDTO>;
  onUpdate: (id: string, patch: Partial<MatchDTO>) => void;
  onDelete: (id: string) => void;
  firstInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [eventDraft, setEventDraft] = useState(match.eventRank ?? '');
  const [durationDraft, setDurationDraft] = useState(String(match.durationSlots ?? 1));

  useEffect(() => setEventDraft(match.eventRank ?? ''), [match.eventRank]);
  useEffect(() => setDurationDraft(String(match.durationSlots ?? 1)), [match.durationSlots]);

  const commitEvent = () => {
    if (eventDraft !== (match.eventRank ?? '')) onUpdate(match.id, { eventRank: eventDraft });
  };
  const commitDuration = () => {
    const d = Math.max(1, Number(durationDraft) || 1);
    if (d !== match.durationSlots) onUpdate(match.id, { durationSlots: d });
  };

  return (
    <tr
      className={[
        'border-b border-border/60 align-top transition-colors hover:bg-muted/50',
        index % 2 === 0 ? '' : 'bg-muted/40',
      ].join(' ')}
      data-testid={`match-row-${match.id}`}
    >
      <td className="px-2 py-1 text-xs text-muted-foreground tabular-nums">
        {match.matchNumber ?? index + 1}
      </td>
      <td className="px-2 py-1">
        <input
          ref={firstInputRef}
          value={eventDraft}
          onChange={(e) => setEventDraft(e.target.value)}
          onBlur={commitEvent}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="MS1, WD2, …"
          className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors focus:border-blue-400 focus:bg-card"
        />
      </td>
      <td className="px-2 py-1">
        <PlayerMultiPicker
          label="Side A"
          selected={match.sideA ?? []}
          onChange={(ids) => onUpdate(match.id, { sideA: ids })}
          players={players}
          groups={groups}
          groupIndex={groupIndex}
        />
      </td>
      <td className="px-2 py-1">
        <PlayerMultiPicker
          label="Side B"
          selected={match.sideB ?? []}
          onChange={(ids) => onUpdate(match.id, { sideB: ids })}
          players={players}
          groups={groups}
          groupIndex={groupIndex}
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          min={1}
          value={durationDraft}
          onChange={(e) => setDurationDraft(e.target.value)}
          onBlur={commitDuration}
          className="w-16 rounded border border-transparent bg-transparent px-2 py-1 text-sm tabular-nums outline-none transition-colors focus:border-blue-400 focus:bg-card"
        />
      </td>
      <td className="px-2 py-1 text-right">
        <button
          type="button"
          onClick={() => onDelete(match.id)}
          className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-red-50 hover:text-red-600"
          title="Delete match"
          aria-label="Delete match"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function PlayerMultiPicker({
  label,
  selected,
  onChange,
  players,
  groups,
  groupIndex,
}: {
  label: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
  groupIndex: Map<string, RosterGroupDTO>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selectedPlayers = useMemo(
    () => selected.map((id) => players.find((p) => p.id === id)).filter(Boolean) as PlayerDTO[],
    [selected, players],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  const playersByGroup = useMemo(() => {
    const by = new Map<string, PlayerDTO[]>();
    for (const p of players) {
      if (!by.has(p.groupId)) by.set(p.groupId, []);
      by.get(p.groupId)!.push(p);
    }
    return by;
  }, [players]);

  return (
    <div ref={ref} className="relative">
      {/* Combobox container — div (not button) so we can nest remove buttons
       *  inside chips. Clicking the non-chip area toggles the picker. */}
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
        onClick={(e) => {
          // Only toggle when the click landed on the container itself, not
          // on a descendant interactive element (remove ×, etc.).
          if (e.target === e.currentTarget) setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="flex min-h-[28px] w-full flex-wrap items-center gap-1 rounded border border-transparent bg-transparent px-2 py-1 text-left text-sm transition-colors hover:border-border focus:border-blue-400 focus:bg-card"
      >
        {selectedPlayers.length === 0 ? (
          <span
            onClick={() => setOpen((v) => !v)}
            className="cursor-pointer text-xs italic text-muted-foreground"
          >
            {label}…
          </span>
        ) : (
          selectedPlayers.map((p) => {
            const accent = getPlayerSchoolAccent(p, groupIndex);
            return (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0 text-[11px]"
              >
                {accent.name && <SchoolDot accent={accent} size="sm" />}
                {p.name || '—'}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(p.id);
                  }}
                  className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                  aria-label={`Remove ${p.name}`}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-label={open ? 'Close picker' : 'Open picker'}
          className="ml-auto inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <CaretDown aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      {open ? (
        <div className="absolute left-0 top-full z-overlay mt-1 max-h-64 w-64 overflow-y-auto rounded border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          {[...playersByGroup.entries()].map(([groupId, list]) => {
            const g = groups.find((gr) => gr.id === groupId);
            return (
              <div key={groupId} className="mb-1 last:mb-0">
                <div className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g?.name ?? 'Unassigned'}
                </div>
                <div className="space-y-0.5">
                  {list.map((p) => {
                    const isOn = selected.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggle(p.id)}
                        className={[
                          'flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-xs transition-colors',
                          isOn ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200' : 'text-foreground hover:bg-muted/40 hover:text-foreground',
                        ].join(' ')}
                      >
                        <span>{playerLabel(p, groups)}</span>
                        {isOn ? (
                          <Check
                            aria-label="Selected"
                            className="h-3.5 w-3.5 text-blue-500"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {players.length === 0 ? (
            <div className="px-1 py-2 text-xs text-muted-foreground">No players. Add some in the Roster tab.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
