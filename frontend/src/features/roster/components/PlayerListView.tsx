import { useEffect, useState, useMemo } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { PlayerListItem } from './PlayerListItem';
import { usePlayerSelection } from '../hooks/usePlayerSelection';
import type { PlayerDTO, RosterGroupDTO } from '../../../api/dto';

type SortField = 'name' | 'school' | 'none';
type SortDirection = 'asc' | 'desc';

interface PlayerListViewProps {
  players: PlayerDTO[];
  schools: RosterGroupDTO[];
  onSchoolChange: (playerId: string, schoolId: string) => void;
  onRanksChange: (playerId: string, ranks: string[]) => void;
  onRemoveRankFromPlayer?: (playerId: string, rank: string) => void;
  onEdit: (player: PlayerDTO) => void;
  onDelete: (playerId: string) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  onAddPlayer?: () => void;
  onAddSchool?: () => void;
  onImportCSV?: () => void;
}

/**
 * PlayerListView Component
 *
 * Main container for the player list with multi-select functionality.
 *
 * Features:
 * - Table-based layout (unified with MatchesList)
 * - Header with "Select All" checkbox
 * - Sortable columns (Name, School)
 * - Individual PlayerListItem rows
 * - Multi-select state management
 * - Empty state when no players
 *
 * Exposes selection state to parent for bulk actions.
 */
export function PlayerListView({
  players,
  schools,
  onSchoolChange,
  onRanksChange,
  onRemoveRankFromPlayer,
  onEdit,
  onDelete,
  onSelectionChange,
  onAddPlayer,
  onAddSchool,
  onImportCSV,
}: PlayerListViewProps) {
  const selection = usePlayerSelection();
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchQuery, setSearchQuery] = useState('');

  // Notify parent whenever selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selection.getSelectedIds());
    }
  }, [selection.selectedIds, onSelectionChange]);

  // Sort players
  const sortedPlayers = useMemo(() => {
    if (sortField === 'none') return players;

    return [...players].sort((a, b) => {
      let compareResult = 0;

      if (sortField === 'name') {
        compareResult = a.name.localeCompare(b.name);
      } else if (sortField === 'school') {
        const schoolA = schools.find(s => s.id === a.groupId)?.name || '';
        const schoolB = schools.find(s => s.id === b.groupId)?.name || '';
        compareResult = schoolA.localeCompare(schoolB);
      }

      return sortDirection === 'asc' ? compareResult : -compareResult;
    });
  }, [players, schools, sortField, sortDirection]);

  // Filter players by search query
  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return sortedPlayers;

    const query = searchQuery.toLowerCase().trim();
    return sortedPlayers.filter(player => {
      // Match by player name
      if (player.name.toLowerCase().includes(query)) return true;

      // Match by school name
      const school = schools.find(s => s.id === player.groupId);
      if (school?.name.toLowerCase().includes(query)) return true;

      // Match by ranks
      if (player.ranks?.some(rank => rank.toLowerCase().includes(query))) return true;

      return false;
    });
  }, [sortedPlayers, schools, searchQuery]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = () => {
    if (selection.selectedCount === players.length) {
      selection.clearSelection();
    } else {
      selection.selectAll(players.map(p => p.id));
    }
  };

  if (players.length === 0) {
    return (
      <div className="p-8 bg-white rounded border border-border text-center">
        <div className="text-muted-foreground mb-3">
          <svg className="mx-auto h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          No players yet. Add players or import from CSV.
        </p>
        <div className="flex items-center justify-center gap-2">
          {onImportCSV && (
            <button
              onClick={onImportCSV}
              className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-sm"
            >
              Import CSV
            </button>
          )}
          {onAddSchool && (
            <button
              onClick={onAddSchool}
              className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-sm"
            >
              Add School
            </button>
          )}
          {onAddPlayer && (
            <button
              onClick={onAddPlayer}
              className="px-3 py-1.5 text-muted-foreground hover:text-foreground text-sm"
            >
              Add Player
            </button>
          )}
        </div>
      </div>
    );
  }

  const allSelected = selection.selectedCount === players.length;
  const someSelected = selection.selectedCount > 0 && !allSelected;

  return (
    <div className="bg-white rounded border border-border overflow-visible">
      {/* Search Bar */}
      <div className="px-2 py-1.5 border-b border-border">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, school, event..."
            className="w-full px-2 py-1 pl-7 text-xs border border-border rounded focus:outline-none focus:border-muted-foreground/40"
          />
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* No results state */}
      {filteredPlayers.length === 0 && players.length > 0 && (
        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
          No players match "{searchQuery}"
        </div>
      )}

      {filteredPlayers.length > 0 && (
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
                onChange={handleSelectAll}
                className="w-3.5 h-3.5 text-foreground border-border rounded focus:ring-gray-500"
                aria-label="Select all players"
              />
            </th>
            <th className="px-2 py-1 text-left">
              <button
                onClick={() => handleSort('name')}
                className="font-medium text-muted-foreground flex items-center gap-0.5 hover:text-foreground"
              >
                Name
                {sortField === 'name' && (
                  sortDirection === 'asc' ? (
                    <ArrowUp aria-label="sorted ascending" className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ArrowDown aria-label="sorted descending" className="h-3 w-3 text-muted-foreground" />
                  )
                )}
              </button>
            </th>
            <th className="px-2 py-1 text-left">
              <button
                onClick={() => handleSort('school')}
                className="font-medium text-muted-foreground flex items-center gap-0.5 hover:text-foreground"
              >
                School
                {sortField === 'school' && (
                  sortDirection === 'asc' ? (
                    <ArrowUp aria-label="sorted ascending" className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ArrowDown aria-label="sorted descending" className="h-3 w-3 text-muted-foreground" />
                  )
                )}
              </button>
            </th>
            <th className="px-2 py-1 text-left font-medium text-muted-foreground">
              Events
            </th>
            <th className="px-2 py-1 text-right">
              <div className="flex items-center justify-end gap-1">
                {onImportCSV && (
                  <button
                    onClick={onImportCSV}
                    className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                  >
                    Import
                  </button>
                )}
                {onAddSchool && (
                  <button
                    onClick={onAddSchool}
                    className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                  >
                    + School
                  </button>
                )}
                {onAddPlayer && (
                  <button
                    onClick={onAddPlayer}
                    className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                  >
                    + Player
                  </button>
                )}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredPlayers.map((player) => (
            <PlayerListItem
              key={player.id}
              player={player}
              schools={schools}
              isSelected={selection.isSelected(player.id)}
              onToggleSelect={() => selection.togglePlayer(player.id)}
              onSchoolChange={(schoolId) => onSchoolChange(player.id, schoolId)}
              onRanksChange={(ranks) => onRanksChange(player.id, ranks)}
              onRemoveRankFromPlayer={onRemoveRankFromPlayer}
              onEdit={() => onEdit(player)}
              onDelete={() => onDelete(player.id)}
            />
          ))}
        </tbody>
      </table>
      )}

      {/* Selection info - shown below table when players are selected */}
      {selection.hasSelection && (
        <div className="px-2 py-1 bg-muted/40 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>{selection.selectedCount} selected{searchQuery && ` (${filteredPlayers.length} shown)`}</span>
          <button
            onClick={() => selection.clearSelection()}
            className="text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to access PlayerListView's selection from parent
 * Returns the selection hook for external use (e.g., bulk actions toolbar)
 */
export { usePlayerSelection };
