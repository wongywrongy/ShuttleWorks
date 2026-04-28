import { useState, useEffect, useMemo } from 'react';
import { Menu } from '@headlessui/react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { MatchDTO } from '../../api/dto';
import { usePlayerNames } from '../../hooks/usePlayerNames';
import { useAppStore } from '../../store/appStore';
import { InlineSearch, type FilterChipGroup } from '../../components/InlineSearch';
import { useSearchParamState, useSearchParamSet } from '../../hooks/useSearchParamState';
import { buildGroupIndex, getPlayerSchoolAccent } from '../../lib/schoolAccent';
import { SchoolDot } from '../../components/SchoolDot';

interface MatchesListProps {
  matches: MatchDTO[];
  onEdit: (match: MatchDTO) => void;
  onDelete: (matchId: string) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  onAddMatch?: () => void;
  onVisualGeneratorDual?: () => void;
  onVisualGeneratorTri?: () => void;
}

export function MatchesList({
  matches,
  onEdit,
  onDelete,
  onSelectionChange,
  onAddMatch,
  onVisualGeneratorDual,
  onVisualGeneratorTri,
}: MatchesListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'eventRank' | 'type'>('eventRank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  // URL-backed search + filter state. ``q`` for free-text, ``event``
  // for the rank-prefix chip set (MS / WS / MD / WD / XD), ``school``
  // for school-id chip set, ``type`` for dual/tri.
  const [searchQuery, setSearchQuery] = useSearchParamState('q', '');
  const [eventFilter, , toggleEvent] = useSearchParamSet('event');
  const [schoolFilter, , toggleSchool] = useSearchParamSet('school');
  const [typeFilter, , toggleType] = useSearchParamSet('type');
  const { getPlayerNames } = usePlayerNames();
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);
  const groupIndex = useMemo(() => buildGroupIndex(groups), [groups]);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  // Map an array of player IDs → the dominant school accent for that
  // side (first matched player wins). Memoised by id-array reference;
  // for tournament-sized rosters this is cheap and re-renders fine.
  const accentForSide = (ids: string[] | undefined) => {
    if (!ids || ids.length === 0) return null;
    const p = playerById.get(ids[0]);
    return p ? getPlayerSchoolAccent(p, groupIndex) : null;
  };

  // Notify parent when selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(Array.from(selectedIds));
    }
  }, [selectedIds, onSelectionChange]);

  const toggleSelection = (matchId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === matches.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(matches.map(m => m.id)));
    }
  };

  const handleSort = (field: 'eventRank' | 'type') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort matches
  const sortedMatches = [...matches].sort((a, b) => {
    let aValue: string;
    let bValue: string;

    if (sortField === 'eventRank') {
      aValue = a.eventRank || '';
      bValue = b.eventRank || '';
    } else {
      aValue = a.matchType || '';
      bValue = b.matchType || '';
    }

    const comparison = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' });
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Filter matches: free-text query + event-rank + school + type chips.
  // Each chip group ANDs against the others; within a group the chips
  // OR (if ``MS`` and ``WS`` are both lit, show MS-* OR WS-*).
  const filteredMatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const eventActive = eventFilter.size > 0;
    const schoolActive = schoolFilter.size > 0;
    const typeActive = typeFilter.size > 0;

    const playerGroupId = (id: string): string | undefined =>
      playerById.get(id)?.groupId;

    return sortedMatches.filter((match) => {
      if (q) {
        const sideANames = getPlayerNames(match.sideA);
        const sideBNames = getPlayerNames(match.sideB);
        const sideCNames = match.sideC ? getPlayerNames(match.sideC) : [];
        const matchesQ =
          (match.eventRank?.toLowerCase().includes(q) ?? false) ||
          (match.matchType?.toLowerCase().includes(q) ?? false) ||
          sideANames.some((n) => n.toLowerCase().includes(q)) ||
          sideBNames.some((n) => n.toLowerCase().includes(q)) ||
          sideCNames.some((n) => n.toLowerCase().includes(q));
        if (!matchesQ) return false;
      }

      if (eventActive) {
        const prefix = (match.eventRank ?? '').match(/^[A-Z]+/)?.[0] ?? '';
        if (!eventFilter.has(prefix)) return false;
      }

      if (schoolActive) {
        const allIds = [...match.sideA, ...match.sideB, ...(match.sideC ?? [])];
        const groupIds = new Set(allIds.map(playerGroupId).filter(Boolean) as string[]);
        const intersects = Array.from(schoolFilter).some((id) => groupIds.has(id));
        if (!intersects) return false;
      }

      if (typeActive) {
        if (!typeFilter.has(match.matchType ?? 'dual')) return false;
      }

      return true;
    });
  }, [sortedMatches, searchQuery, eventFilter, schoolFilter, typeFilter, getPlayerNames, playerById]);

  // School + Type chips only — Event chips were dropped to keep the
  // search bar minimal (event prefix is also matched by the free-text
  // query, so the chip set was redundant). Court is N/A here.
  const schoolOptions = useMemo(
    () => groups.map((g) => ({ id: g.id, label: g.name })),
    [groups],
  );

  const filterGroups: FilterChipGroup[] = [];
  if (schoolOptions.length > 1) {
    filterGroups.push({
      label: 'School',
      options: schoolOptions,
      active: schoolFilter,
      onToggle: toggleSchool,
    });
  }
  filterGroups.push({
    label: 'Type',
    options: [
      { id: 'dual', label: 'Dual' },
      { id: 'tri', label: 'Tri' },
    ],
    active: typeFilter,
    onToggle: toggleType,
  });

  const clearAllFilters = () => {
    setSearchQuery('');
    eventFilter.forEach((id) => toggleEvent(id));
    schoolFilter.forEach((id) => toggleSchool(id));
    typeFilter.forEach((id) => toggleType(id));
  };

  const allSelected = matches.length > 0 && selectedIds.size === matches.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  if (matches.length === 0) {
    return (
      <div className="p-8 bg-card rounded border border-border text-center">
        <div className="text-muted-foreground mb-3">
          <svg className="mx-auto h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          No matches yet. Use the visual generator or add manually.
        </p>
        <div className="flex items-center justify-center gap-2">
          {onVisualGeneratorDual && (
            <button
              onClick={onVisualGeneratorDual}
              className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-sm"
            >
              Dual Generator
            </button>
          )}
          {onVisualGeneratorTri && (
            <button
              onClick={onVisualGeneratorTri}
              className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-sm"
            >
              Tri Generator
            </button>
          )}
          {onAddMatch && (
            <button
              onClick={onAddMatch}
              className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-sm"
            >
              Add Match
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded border border-border overflow-visible">
      {/* Inline search + filter row — same pattern as Roster + Schedule.
          No result-count chrome and no event/court chips per the
          minimal-bar directive: free-text matches event codes too, so
          the chip set was redundant. */}
      <div className="px-2 py-1.5 border-b border-border">
        <InlineSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Search event or player…"
          filters={filterGroups}
          showClear
          onClearAll={clearAllFilters}
        />
      </div>

      {/* No results state */}
      {filteredMatches.length === 0 && matches.length > 0 && (
        <div className="px-2 py-6 text-center text-xs text-muted-foreground">
          No matches match these filters.
        </div>
      )}

      {filteredMatches.length > 0 && (
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th className="px-2 py-1 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = someSelected;
                  }
                }}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 text-foreground border-border rounded focus:ring-gray-500"
                aria-label="Select all matches"
              />
            </th>
            <th className="px-2 py-1 text-left font-medium text-muted-foreground w-16">
              <button
                onClick={() => handleSort('eventRank')}
                className="flex items-center gap-0.5 hover:text-foreground focus:outline-none"
              >
                Event
                {sortField === 'eventRank' && (
                  sortDirection === 'asc' ? (
                    <ArrowUp aria-label="sorted ascending" className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ArrowDown aria-label="sorted descending" className="h-3 w-3 text-muted-foreground" />
                  )
                )}
              </button>
            </th>
            <th className="px-2 py-1 text-left font-medium text-muted-foreground w-12">
              <button
                onClick={() => handleSort('type')}
                className="flex items-center gap-0.5 hover:text-foreground focus:outline-none"
              >
                Type
                {sortField === 'type' && (
                  sortDirection === 'asc' ? (
                    <ArrowUp aria-label="sorted ascending" className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ArrowDown aria-label="sorted descending" className="h-3 w-3 text-muted-foreground" />
                  )
                )}
              </button>
            </th>
            <th className="px-2 py-1 text-left font-medium text-muted-foreground">
              Side A
            </th>
            <th className="px-2 py-1 text-left font-medium text-muted-foreground">
              Side B
            </th>
            <th className="px-2 py-1 text-left font-medium text-muted-foreground">
              Side C
            </th>
            <th className="px-2 py-1 text-right">
              <div className="flex items-center justify-end gap-1">
                {onVisualGeneratorDual && (
                  <button
                    onClick={onVisualGeneratorDual}
                    className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                  >
                    Dual
                  </button>
                )}
                {onVisualGeneratorTri && (
                  <button
                    onClick={onVisualGeneratorTri}
                    className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                  >
                    Tri
                  </button>
                )}
                {onAddMatch && (
                  <button
                    onClick={onAddMatch}
                    className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                  >
                    + Add
                  </button>
                )}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredMatches.map((match) => {
            const isSelected = selectedIds.has(match.id);
            return (
              <tr
                key={match.id}
                className={`border-t border-border/60 hover:bg-muted/40 ${isSelected ? 'bg-muted' : ''}`}
              >
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection(match.id)}
                    className="w-3.5 h-3.5 text-foreground border-border rounded focus:ring-gray-500"
                    aria-label={`Select match ${match.eventRank || match.id}`}
                  />
                </td>
                <td className="px-2 py-1 font-medium text-foreground">{match.eventRank || '-'}</td>
              <td className="px-2 py-1 text-muted-foreground">
                {match.matchType === 'tri' ? 'Tri' : 'Dual'}
              </td>
              {/* Sides A / B / C — each gets a single school dot
                  before the names. The dot reads as the side's school
                  identity; we don't repeat per-player because in a
                  dual/tri the whole side belongs to one school. */}
              <td className="px-2 py-1 text-muted-foreground truncate max-w-32" title={getPlayerNames(match.sideA).join(' & ')}>
                <span className="inline-flex items-center gap-1.5">
                  {accentForSide(match.sideA) && (
                    <SchoolDot accent={accentForSide(match.sideA)!} size="sm" />
                  )}
                  <span className="truncate">
                    {match.sideA.length > 0 ? getPlayerNames(match.sideA).join(' & ') : '-'}
                  </span>
                </span>
              </td>
              <td className="px-2 py-1 text-muted-foreground truncate max-w-32" title={getPlayerNames(match.sideB).join(' & ')}>
                <span className="inline-flex items-center gap-1.5">
                  {accentForSide(match.sideB) && (
                    <SchoolDot accent={accentForSide(match.sideB)!} size="sm" />
                  )}
                  <span className="truncate">
                    {match.sideB.length > 0 ? getPlayerNames(match.sideB).join(' & ') : '-'}
                  </span>
                </span>
              </td>
              <td className="px-2 py-1 text-muted-foreground truncate max-w-32" title={match.sideC ? getPlayerNames(match.sideC).join(' & ') : ''}>
                <span className="inline-flex items-center gap-1.5">
                  {match.sideC && accentForSide(match.sideC) && (
                    <SchoolDot accent={accentForSide(match.sideC)!} size="sm" />
                  )}
                  <span className="truncate">
                    {match.sideC && match.sideC.length > 0 ? getPlayerNames(match.sideC).join(' & ') : '-'}
                  </span>
                </span>
              </td>
              <td className="px-2 py-1 text-right">
                <Menu as="div" className="relative inline-block text-left">
                  <Menu.Button className="inline-flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded">
                    <span className="sr-only">Open menu</span>
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </Menu.Button>

                  <Menu.Items className="absolute right-0 z-10 mt-1 w-40 origin-top-right rounded bg-card shadow-sm ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="py-1">
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => onEdit(match)}
                            className={`${
                              active ? 'bg-muted text-foreground' : 'text-foreground'
                            } group flex w-full items-center px-4 py-2 text-sm`}
                          >
                            <svg
                              className="mr-3 h-4 w-4 text-muted-foreground"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                            Edit
                          </button>
                        )}
                      </Menu.Item>

                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => onDelete(match.id)}
                            className={`${
                              active ? 'bg-red-50 text-red-900' : 'text-red-700'
                            } group flex w-full items-center px-4 py-2 text-sm`}
                          >
                            <svg
                              className="mr-3 h-4 w-4 text-red-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                            Delete
                          </button>
                        )}
                      </Menu.Item>
                    </div>
                  </Menu.Items>
                </Menu>
              </td>
            </tr>
          );
          })}
        </tbody>
      </table>
      )}

      {/* Selection info - shown below table when matches are selected */}
      {selectedIds.size > 0 && (
        <div className="px-2 py-1 bg-muted/40 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>{selectedIds.size} selected{searchQuery && ` (${filteredMatches.length} shown)`}</span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
