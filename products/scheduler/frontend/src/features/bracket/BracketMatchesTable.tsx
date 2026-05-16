/**
 * Matches table below the bracket Schedule grid.
 *
 * Mirrors the meet's pages/schedule/MatchesTable shape, adapted for
 * bracket DTOs and stripped of meet-only affordances:
 *   - No URL-backed filter state (bracket doesn't have the multi-tab
 *     search-share affordance the meet has)
 *   - No event filter chips (single global event filter lives on
 *     BracketViewHeader, not here)
 *   - Two views: By Time (group by slot_id), By Court (group by court_id)
 *
 * Row click selects the play_unit; the parent threads selection back
 * to the grid and sidebar.
 */
import { useMemo, useState } from 'react';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { formatBracketSlot } from './formatBracketSlot';

type View = 'time' | 'court';

interface Props {
  data: BracketTournamentDTO;
  selectedId: string | null;
  onSelect: (playUnitId: string) => void;
}

export function BracketMatchesTable({ data, selectedId, onSelect }: Props) {
  const [view, setView] = useState<View>('time');
  const [query, setQuery] = useState('');

  const puById = useMemo(
    () => new Map(data.play_units.map((p) => [p.id, p])),
    [data.play_units],
  );
  const participantById = useMemo(
    () => new Map(data.participants.map((p) => [p.id, p])),
    [data.participants],
  );

  const totalCount = data.assignments.length;

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return data.assignments;
    return data.assignments.filter((a) => {
      const pu = puById.get(a.play_unit_id);
      if (!pu) return false;
      const haystackParts: string[] = [
        pu.id,
        pu.event_id,
        `c${a.court_id}`,
        ...(pu.side_a ?? []).map((id) => participantById.get(id)?.name ?? ''),
        ...(pu.side_b ?? []).map((id) => participantById.get(id)?.name ?? ''),
      ];
      return haystackParts.join(' ').toLowerCase().includes(q);
    });
  }, [data.assignments, query, puById, participantById]);

  const filteredCount = filtered.length;

  // Group assignments per the current view.
  const groups = useMemo(() => {
    const map = new Map<number, typeof data.assignments>();
    const key = (a: (typeof data.assignments)[number]) =>
      view === 'time' ? a.slot_id : a.court_id;
    for (const a of filtered) {
      const k = key(a);
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [filtered, view, data.assignments]);

  if (totalCount === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-auto px-4 py-6 text-sm text-muted-foreground">
        No matches yet — generate from the <strong>Events</strong> tab.
      </div>
    );
  }

  const resolveSide = (ids: string[] | null): string => {
    if (!ids || ids.length === 0) return 'TBD';
    return ids.map((id) => participantById.get(id)?.name ?? id).join(' / ');
  };

  const tabClasses = (active: boolean) =>
    `${active ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'} rounded-sm border border-border px-2 py-1 text-2xs`;

  return (
    <div className="flex-1 min-h-0 overflow-auto border-t border-border">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-4 py-2">
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Matches
        </div>
        <div className="text-2xs tabular-nums text-muted-foreground">
          {filteredCount} of {totalCount} scheduled
        </div>
        <div className="ml-2 flex items-center gap-1">
          <button type="button" className={tabClasses(view === 'time')} onClick={() => setView('time')}>By Time</button>
          <button type="button" className={tabClasses(view === 'court')} onClick={() => setView('court')}>By Court</button>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search event, player, court…"
          className="ml-auto w-56 rounded-sm border border-border bg-card px-2 py-1 text-2xs"
        />
      </div>
      <table className="w-full text-2xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-1 text-left">Time</th>
            <th className="px-4 py-1 text-left">Ct</th>
            <th className="px-4 py-1 text-left">Match</th>
            <th className="px-4 py-1 text-left">Players</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([groupKey, rows]) => (
            <ScopeGroupRows
              key={groupKey}
              view={view}
              groupKey={groupKey}
              rows={rows}
              data={data}
              puById={puById}
              selectedId={selectedId}
              onSelect={onSelect}
              resolveSide={resolveSide}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Inline sub-component: one group's header row + its match rows.
// Pulled out so the parent's JSX stays scannable.
function ScopeGroupRows({
  view,
  groupKey,
  rows,
  data,
  puById,
  selectedId,
  onSelect,
  resolveSide,
}: {
  view: View;
  groupKey: number;
  rows: BracketTournamentDTO['assignments'];
  data: BracketTournamentDTO;
  puById: Map<string, BracketTournamentDTO['play_units'][number]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  resolveSide: (ids: string[] | null) => string;
}) {
  const header =
    view === 'time'
      ? formatBracketSlot(groupKey, { start_time: data.start_time, interval_minutes: data.interval_minutes })
      : `Court C${groupKey}`;
  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={4} className="px-4 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {header}
        </td>
      </tr>
      {rows.map((a) => {
        const pu = puById.get(a.play_unit_id);
        if (!pu) return null;
        const sideA = resolveSide(pu.side_a);
        const sideB = resolveSide(pu.side_b);
        const isSelected = pu.id === selectedId;
        const time = formatBracketSlot(a.slot_id, {
          start_time: data.start_time,
          interval_minutes: data.interval_minutes,
        });
        return (
          <tr
            key={pu.id}
            onClick={() => onSelect(pu.id)}
            className={`cursor-pointer border-b border-border/40 hover:bg-muted/40 ${
              isSelected ? 'bg-accent/10 ring-1 ring-accent/30' : ''
            }`}
          >
            <td className="px-4 py-1 tabular-nums">{time}</td>
            <td className="px-4 py-1 tabular-nums">C{a.court_id}</td>
            <td className="px-4 py-1 font-mono">{pu.id}</td>
            <td className="px-4 py-1">
              {sideA} <span className="text-muted-foreground">vs</span> {sideB}
            </td>
          </tr>
        );
      })}
    </>
  );
}
