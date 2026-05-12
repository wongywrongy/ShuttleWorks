/**
 * Flat-row match editor. No <table>, no card wrapper — each match
 * renders as a flex row with `border-b` only. Column-label row sits
 * above the match rows with the same `px-5` rhythm.
 *
 * Player cells: comma-separated underlined names with a small × in
 * muted grey after each, no pills. An inline "＋ add" link opens the
 * picker dropdown for adding more players.
 *
 * Search/Add-match/Export live in the page-header row owned by
 * `MatchesTab` — those affordances do NOT render here. This component
 * subscribes to the same `?q=` search param as the page header so the
 * URL is the shared source of truth.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { useAppStore } from '../../store/appStore';
import { usePlayerMap } from '../../store/selectors';
import type { MatchDTO, PlayerDTO, RosterGroupDTO } from '../../api/dto';
import { useSearchParamState, useSearchParamSet } from '../../hooks/useSearchParamState';
import { EVENT_LABEL } from '../roster/positionGrid/helpers';

function eventTintForPrefix(rank: string | null | undefined): string {
  if (!rank) return '';
  const prefix = rank.match(/^[A-Z]+/)?.[0] ?? '';
  return EVENT_LABEL[prefix]?.body ?? '';
}

function playerLabel(p: PlayerDTO, groups: RosterGroupDTO[]): string {
  const school = groups.find((g) => g.id === p.groupId)?.name ?? '?';
  return `${p.name || '(unnamed)'} · ${school}`;
}

export function MatchesSpreadsheet() {
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);
  const updateMatch = useAppStore((s) => s.updateMatch);
  const deleteMatch = useAppStore((s) => s.deleteMatch);

  // Subscribes to the same URL-backed search the page header writes to.
  const [searchQuery] = useSearchParamState('q', '');
  // Legacy filter params kept for URL backward compatibility — not
  // currently surfaced in any UI; if the user lands with these set, the
  // matches list still respects them.
  const [eventFilter] = useSearchParamSet('event');
  const [schoolFilter] = useSearchParamSet('school');
  const [typeFilter] = useSearchParamSet('type');

  const playerById = usePlayerMap();

  const filteredMatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const eventActive = eventFilter.size > 0;
    const schoolActive = schoolFilter.size > 0;
    const typeActive = typeFilter.size > 0;
    if (!q && !eventActive && !schoolActive && !typeActive) return matches;

    const playerName = (id: string) =>
      playerById.get(id)?.name?.toLowerCase() ?? '';
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

  if (matches.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        No matches yet. Add one manually or use auto-generate above.
      </div>
    );
  }
  if (filteredMatches.length === 0) {
    return (
      <>
        <ColumnHeaderRow />
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          No matches match the current search.
        </div>
      </>
    );
  }

  return (
    <>
      <ColumnHeaderRow />
      {filteredMatches.map((m) => (
        <MatchRow
          key={m.id}
          match={m}
          index={matches.indexOf(m)}
          players={players}
          groups={groups}
          onUpdate={updateMatch}
          onDelete={deleteMatch}
        />
      ))}
    </>
  );
}

/* =========================================================================
 * ColumnHeaderRow — `padding: 6px 20px`, border-b only, no background.
 * ========================================================================= */
function ColumnHeaderRow() {
  return (
    <div className="flex items-center gap-3 border-b-2 border-border bg-muted/40 px-5 py-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      <span className="w-8">#</span>
      <span className="w-20">Event</span>
      <span className="min-w-0 flex-[3]">Side A</span>
      <span className="min-w-0 flex-[3]">Side B</span>
      <span className="w-14">Slots</span>
      <span className="w-8" aria-hidden />
    </div>
  );
}

/* =========================================================================
 * MatchRow — `padding: 0 20px`, `min-height: 44px`, border-b only.
 * ========================================================================= */
function MatchRow({
  match,
  index,
  players,
  groups,
  onUpdate,
  onDelete,
}: {
  match: MatchDTO;
  index: number;
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
  onUpdate: (id: string, patch: Partial<MatchDTO>) => void;
  onDelete: (id: string) => void;
}) {
  const [eventDraft, setEventDraft] = useState(match.eventRank ?? '');
  const [durationDraft, setDurationDraft] = useState(
    String(match.durationSlots ?? 1),
  );

  useEffect(() => setEventDraft(match.eventRank ?? ''), [match.eventRank]);
  useEffect(
    () => setDurationDraft(String(match.durationSlots ?? 1)),
    [match.durationSlots],
  );

  const commitEvent = () => {
    if (eventDraft !== (match.eventRank ?? '')) {
      onUpdate(match.id, { eventRank: eventDraft });
    }
  };
  const commitDuration = () => {
    const d = Math.max(1, Number(durationDraft) || 1);
    if (d !== match.durationSlots) onUpdate(match.id, { durationSlots: d });
  };

  return (
    <div
      data-testid={`match-row-${match.id}`}
      className="group flex min-h-[44px] items-center gap-3 border-b border-border px-5 transition-colors duration-fast ease-brand hover:bg-muted/30"
    >
      <span className="w-8 text-xs text-muted-foreground tabular-nums">
        {match.matchNumber ?? index + 1}
      </span>
      <input
        value={eventDraft}
        onChange={(e) => setEventDraft(e.target.value)}
        onBlur={commitEvent}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="MS1, WD2…"
        className={[
          'w-20 rounded-sm border border-transparent px-1.5 py-0.5 text-sm font-mono tabular-nums outline-none',
          'transition-colors duration-fast ease-brand',
          'hover:border-border/60 focus:border-accent focus:bg-card',
          eventTintForPrefix(match.eventRank),
        ].join(' ')}
      />
      <PlayerCellEditor
        side="Side A"
        selected={match.sideA ?? []}
        onChange={(ids) => onUpdate(match.id, { sideA: ids })}
        players={players}
        groups={groups}
      />
      <PlayerCellEditor
        side="Side B"
        selected={match.sideB ?? []}
        onChange={(ids) => onUpdate(match.id, { sideB: ids })}
        players={players}
        groups={groups}
      />
      <input
        type="number"
        min={1}
        value={durationDraft}
        onChange={(e) => setDurationDraft(e.target.value)}
        onBlur={commitDuration}
        className="w-14 rounded-sm border border-transparent bg-transparent px-1.5 py-0.5 text-sm tabular-nums outline-none transition-colors duration-fast ease-brand hover:border-border/60 focus:border-accent focus:bg-card"
      />
      <button
        type="button"
        onClick={() => onDelete(match.id)}
        className="w-8 rounded-sm p-1 text-muted-foreground/60 opacity-0 transition-opacity duration-fast ease-brand hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title="Delete match"
        aria-label="Delete match"
      >
        ×
      </button>
    </div>
  );
}

/* =========================================================================
 * PlayerCellEditor — comma-separated underlined names with inline × per
 * name. No pills, no wrapping element. "＋ add" link opens the picker
 * dropdown for adding more players.
 * ========================================================================= */
function PlayerCellEditor({
  side,
  selected,
  onChange,
  players,
  groups,
}: {
  side: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selectedPlayers = useMemo(
    () =>
      selected
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean) as PlayerDTO[],
    [selected, players],
  );

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id],
    );
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
    <div ref={ref} className="relative min-w-0 flex-[3]">
      <div className="flex flex-wrap items-baseline gap-x-1 text-sm leading-relaxed">
        {selectedPlayers.length === 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs italic text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {side}…
          </button>
        ) : (
          selectedPlayers.map((p, i) => (
            <span key={p.id} className="inline-flex items-baseline">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
                title={`Click to edit ${side}`}
              >
                {p.name || '—'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(p.id);
                }}
                aria-label={`Remove ${p.name}`}
                className="ml-0.5 text-muted-foreground/60 hover:text-destructive"
              >
                ×
              </button>
              {i < selectedPlayers.length - 1 ? (
                <span className="text-muted-foreground">,</span>
              ) : null}
            </span>
          ))
        )}
        {selectedPlayers.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={`Add player to ${side}`}
            className="text-xs text-muted-foreground/70 underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            ＋ add
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="motion-enter absolute left-0 top-full z-overlay mt-1 max-h-64 w-64 overflow-y-auto rounded border border-border bg-popover p-2 text-popover-foreground shadow-lg">
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
                          'flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-xs transition-colors duration-fast ease-brand',
                          isOn
                            ? 'bg-accent/10 text-accent'
                            : 'text-foreground hover:bg-muted/40',
                        ].join(' ')}
                      >
                        <span>{playerLabel(p, groups)}</span>
                        {isOn ? (
                          <Check
                            aria-label="Selected"
                            className="h-3.5 w-3.5 text-accent"
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
            <div className="px-1 py-2 text-xs text-muted-foreground">
              No players. Add some in the Roster tab.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
