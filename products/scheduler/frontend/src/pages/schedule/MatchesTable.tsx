/**
 * Matches table for the SchedulePage right column. Toggles between
 * "By Time" (slot rows) and "By Court" (court rows). Inline search
 * narrows by event code, match number, or player name. Selection
 * fires `onSelectMatch` so the parent's details panel can update.
 *
 * Filter state is URL-backed (`?q=`, `?event=`, `?court=`) so the
 * Matches tab and the Schedule tab share the same search/filter when
 * the operator navigates between them.
 */
import { useMemo } from 'react';
import type {
  ScheduleAssignment,
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  TournamentConfig,
} from '../../api/dto';
import {
  useSearchParamState,
  useSearchParamSet,
} from '../../hooks/useSearchParamState';
import { InlineSearch, type FilterChipGroup } from '../../components/InlineSearch';
import { formatSlotTime } from '../../lib/time';
import { buildGroupIndex, getPlayerSchoolAccent } from '../../lib/schoolAccent';
import { SchoolDot } from '../../components/SchoolDot';

export type TableView = 'time' | 'court';

export function MatchesTable({
  assignments,
  matches,
  players,
  groups,
  config,
  view,
  onViewChange,
  selectedMatchId,
  onSelectMatch,
}: {
  assignments: ScheduleAssignment[];
  matches: MatchDTO[];
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
  config: TournamentConfig;
  view: TableView;
  onViewChange: (view: TableView) => void;
  selectedMatchId?: string | null;
  onSelectMatch?: (matchId: string) => void;
}) {
  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const groupIndex = useMemo(() => buildGroupIndex(groups), [groups]);

  const [searchQuery, setSearchQuery] = useSearchParamState('q', '');
  const [eventFilter, , toggleEvent] = useSearchParamSet('event');
  const [courtFilter, , toggleCourt] = useSearchParamSet('court');

  const filteredAssignments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const eventActive = eventFilter.size > 0;
    const courtActive = courtFilter.size > 0;
    if (!q && !eventActive && !courtActive) return assignments;
    return assignments.filter((a) => {
      const m = matchMap.get(a.matchId);
      if (q) {
        const sideA = (m?.sideA ?? []).map((id) => playerMap.get(id)?.name ?? '').join(' ');
        const sideB = (m?.sideB ?? []).map((id) => playerMap.get(id)?.name ?? '').join(' ');
        const event = m?.eventRank ?? '';
        const matchNum = m?.matchNumber ? `M${m.matchNumber}` : '';
        if (
          !event.toLowerCase().includes(q) &&
          !matchNum.toLowerCase().includes(q) &&
          !sideA.toLowerCase().includes(q) &&
          !sideB.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (eventActive) {
        const prefix = (m?.eventRank ?? '').match(/^[A-Z]+/)?.[0] ?? '';
        if (!eventFilter.has(prefix)) return false;
      }
      if (courtActive && !courtFilter.has(`c${a.courtId}`)) return false;
      return true;
    });
  }, [assignments, searchQuery, eventFilter, courtFilter, matchMap, playerMap]);

  const filterGroups: FilterChipGroup[] = [];

  const clearAll = () => {
    setSearchQuery('');
    eventFilter.forEach((id) => toggleEvent(id));
    courtFilter.forEach((id) => toggleCourt(id));
  };

  const renderSchoolDot = (matchId: string) => {
    const m = matchMap.get(matchId);
    if (!m || !m.sideA?.length) return null;
    const p = playerMap.get(m.sideA[0]);
    if (!p) return null;
    const accent = getPlayerSchoolAccent(p, groupIndex);
    return accent.name ? <SchoolDot accent={accent} size="sm" /> : null;
  };

  const getMatchLabel = (matchId: string): string => {
    const match = matchMap.get(matchId);
    if (!match) return matchId.slice(0, 6);
    if (match.matchNumber) return `M${match.matchNumber}`;
    if (match.eventRank) return match.eventRank;
    return matchId.slice(0, 6);
  };

  const getPlayerNames = (matchId: string): string => {
    const match = matchMap.get(matchId);
    if (!match) return '';
    const sideA = match.sideA?.map((id) => playerMap.get(id)?.name || '?').join('/') || '?';
    const sideB = match.sideB?.map((id) => playerMap.get(id)?.name || '?').join('/') || '?';
    return `${sideA} vs ${sideB}`;
  };

  const byTime = useMemo(() => {
    const groups = new Map<number, ScheduleAssignment[]>();
    for (const a of filteredAssignments) {
      const list = groups.get(a.slotId) || [];
      list.push(a);
      groups.set(a.slotId, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([_slotId, items]) => ({
        slotId: _slotId,
        time: formatSlotTime(_slotId, config),
        assignments: items.sort((a, b) => a.courtId - b.courtId),
      }));
  }, [filteredAssignments, config]);

  const byCourt = useMemo(() => {
    const groups = new Map<number, ScheduleAssignment[]>();
    for (const a of filteredAssignments) {
      const list = groups.get(a.courtId) || [];
      list.push(a);
      groups.set(a.courtId, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([courtId, items]) => ({
        courtId,
        assignments: items.sort((a, b) => a.slotId - b.slotId),
      }));
  }, [filteredAssignments]);

  if (assignments.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic p-2">
        No matches scheduled yet
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-2 flex flex-shrink-0 flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onViewChange('time')}
            className={`px-2 py-0.5 text-xs rounded ${
              view === 'time'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            }`}
          >
            By Time
          </button>
          <button
            onClick={() => onViewChange('court')}
            className={`px-2 py-0.5 text-xs rounded ${
              view === 'court'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            }`}
          >
            By Court
          </button>
        </div>
        <div className="flex-1 min-w-[16rem]">
          <InlineSearch
            query={searchQuery}
            onQueryChange={setSearchQuery}
            placeholder="Search event, player, court…"
            filters={filterGroups}
            showClear
            onClearAll={clearAll}
          />
        </div>
      </div>

      {filteredAssignments.length === 0 && (
        <div className="rounded border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
          No assignments match these filters.
        </div>
      )}

      <div
        className={`flex-1 overflow-auto ${filteredAssignments.length === 0 ? 'hidden' : ''}`}
      >
        {view === 'time' ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-14">Time</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-8">Ct</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-12">Match</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground">Players</th>
              </tr>
            </thead>
            <tbody>
              {byTime.flatMap(({ slotId: _slotId, time, assignments: slotAssignments }) =>
                slotAssignments.map((a, idx) => {
                  const isSelected = selectedMatchId === a.matchId;
                  return (
                    <tr
                      key={a.matchId}
                      onClick={() => onSelectMatch?.(a.matchId)}
                      className={`${onSelectMatch ? 'cursor-pointer' : ''} ${
                        isSelected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/50'
                      } ${idx === 0 ? 'border-t-2 border-border' : 'border-t border-border/60'}`}
                    >
                      <td className="px-2 py-1 text-muted-foreground font-mono whitespace-nowrap">
                        {idx === 0 ? time : ''}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">C{a.courtId}</td>
                      <td className="px-2 py-1 font-medium text-foreground">{getMatchLabel(a.matchId)}</td>
                      <td
                        className="px-2 py-1 text-foreground/80 truncate max-w-xs"
                        title={getPlayerNames(a.matchId)}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {renderSchoolDot(a.matchId)}
                          <span className="truncate">{getPlayerNames(a.matchId)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-12">Court</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-14">Time</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground w-12">Match</th>
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground">Players</th>
              </tr>
            </thead>
            <tbody>
              {byCourt.flatMap(({ courtId, assignments: courtAssignments }) =>
                courtAssignments.map((a, idx) => {
                  const isSelected = selectedMatchId === a.matchId;
                  return (
                    <tr
                      key={a.matchId}
                      onClick={() => onSelectMatch?.(a.matchId)}
                      className={`${onSelectMatch ? 'cursor-pointer' : ''} ${
                        isSelected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/50'
                      } ${idx === 0 ? 'border-t-2 border-border' : 'border-t border-border/60'}`}
                    >
                      <td className="px-2 py-1 text-foreground font-medium">
                        {idx === 0 ? `C${courtId}` : ''}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground font-mono">
                        {formatSlotTime(a.slotId, config)}
                      </td>
                      <td className="px-2 py-1 font-medium text-foreground">{getMatchLabel(a.matchId)}</td>
                      <td
                        className="px-2 py-1 text-foreground/80 truncate max-w-xs"
                        title={getPlayerNames(a.matchId)}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {renderSchoolDot(a.matchId)}
                          <span className="truncate">{getPlayerNames(a.matchId)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
