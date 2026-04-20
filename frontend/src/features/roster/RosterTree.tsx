import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RosterGroupDTO, PlayerDTO } from '../../api/dto';

interface RosterTreeProps {
  groups: RosterGroupDTO[];
  players: PlayerDTO[];
  expanded: Set<string>;
  onToggleExpand: (groupId: string) => void;
  onGroupClick?: (group: RosterGroupDTO) => void;
  onPlayerClick?: (player: PlayerDTO) => void;
  selectedGroupId?: string | null;
  selectedPlayerId?: string | null;
}

export function RosterTree({
  groups,
  players,
  expanded,
  onToggleExpand,
  onGroupClick,
  onPlayerClick,
  selectedGroupId,
  selectedPlayerId,
}: RosterTreeProps) {
  // Build tree structure
  const buildTree = (parentId: string | null = null): RosterGroupDTO[] => {
    return groups
      .filter(g => g.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const rootGroups = buildTree(null);

  // Get players for a group
  const getGroupPlayers = (groupId: string): PlayerDTO[] => {
    return players
      .filter(p => p.groupId === groupId)
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const renderGroup = (group: RosterGroupDTO, level: number = 0): React.ReactElement => {
    const children = buildTree(group.id);
    const groupPlayers = getGroupPlayers(group.id);
    const hasChildren = children.length > 0 || groupPlayers.length > 0;
    const isExpanded = expanded.has(group.id);
    const isSelected = selectedGroupId === group.id;
    const indent = level * 24;

    return (
      <div key={group.id}>
        <div
          className={`flex items-center py-1.5 px-2 rounded cursor-pointer hover:bg-muted/40 ${
            isSelected ? 'bg-blue-50 border border-blue-200' : ''
          }`}
          style={{ paddingLeft: `${indent + 8}px` }}
          onClick={() => onGroupClick?.(group)}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(group.id);
              }}
              aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
              aria-expanded={isExpanded}
              className="mr-2 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {!hasChildren && <span className="mr-2 w-5" />}
          <span
            className={`w-2 h-2 rounded-full mr-2 ${group.type === 'group' ? 'bg-muted-foreground/60' : 'bg-blue-400'}`}
            style={{ backgroundColor: group.metadata?.color || undefined }}
          />
          <span className={`text-sm flex-1 ${group.type === 'group' ? 'font-semibold' : ''}`}>
            {group.name}
          </span>
          {group.metadata?.description && (
            <span className="text-xs text-muted-foreground ml-2 truncate max-w-xs">
              {group.metadata.description}
            </span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>
            {/* Render child groups */}
            {children.map(child => renderGroup(child, level + 1))}
            {/* Render players in this group */}
            {groupPlayers.map(player => (
              <div
                key={player.id}
                className={`flex items-center py-1 px-2 rounded cursor-pointer hover:bg-muted/40 ${
                  selectedPlayerId === player.id ? 'bg-green-50 border border-green-200' : ''
                }`}
                style={{ paddingLeft: `${(level + 1) * 24 + 32}px` }}
                onClick={() => onPlayerClick?.(player)}
              >
                <span className="text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  {player.name}
                </span>
                {player.availability.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ({player.availability.length} availability window{player.availability.length > 1 ? 's' : ''})
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (rootGroups.length === 0 && players.filter(p => !p.groupId).length === 0) {
    return (
      <div className="p-8 bg-white rounded-lg shadow text-center text-muted-foreground">
        No groups or players. Create a group or add players to get started.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="divide-y divide-gray-200">
        {rootGroups.map(group => renderGroup(group))}
        {/* Show ungrouped players at root level */}
        {players.filter(p => !p.groupId).map(player => (
          <div
            key={player.id}
            className={`flex items-center py-1.5 px-2 rounded cursor-pointer hover:bg-muted/40 ${
              selectedPlayerId === player.id ? 'bg-green-50 border border-green-200' : ''
            }`}
            onClick={() => onPlayerClick?.(player)}
          >
            <span className="text-sm ml-8 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              {player.name} <span className="text-xs text-muted-foreground">(Ungrouped)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
