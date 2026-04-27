import { useState } from 'react';
import { RosterTree } from './RosterTree';
import type { RosterGroupDTO, PlayerDTO } from '../../api/dto';

interface RosterGroupManagerProps {
  groups: RosterGroupDTO[];
  players: PlayerDTO[];
  onGroupClick: (group: RosterGroupDTO) => void;
  onPlayerClick: (player: PlayerDTO) => void;
  onGroupEdit: (group: RosterGroupDTO) => void;
  onGroupDelete: (groupId: string) => void;
  onPlayerEdit: (player: PlayerDTO) => void;
  onPlayerDelete: (playerId: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars

export function RosterGroupManager({
  groups,
  players,
  onGroupClick,
  onGroupEdit,
  onGroupDelete,
  onPlayerClick: onPlayerClickProp,
  onPlayerEdit,
  onPlayerDelete,
}: Omit<RosterGroupManagerProps, 'onPlayerClick'> & { onPlayerClick: (player: PlayerDTO) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    type: 'group' | 'player';
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const handleToggleExpand = (groupId: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpanded(newExpanded);
  };

  const handleGroupClick = (group: RosterGroupDTO) => {
    setSelectedGroupId(group.id);
    setSelectedPlayerId(null);
    onGroupClick(group);
  };

  const handlePlayerClick = (player: PlayerDTO) => {
    setSelectedPlayerId(player.id);
    setSelectedGroupId(null);
    onPlayerClickProp(player);
  };


  const handleDelete = () => {
    if (!contextMenu) return;
    
    if (contextMenu.type === 'group') {
      if (window.confirm('Are you sure you want to delete this group? This will also remove all players in it.')) {
        onGroupDelete(contextMenu.id);
      }
    } else {
      if (window.confirm('Are you sure you want to delete this player?')) {
        onPlayerDelete(contextMenu.id);
      }
    }
    setContextMenu(null);
  };

  const handleEdit = () => {
    if (!contextMenu) return;
    
    if (contextMenu.type === 'group') {
      const group = groups.find(g => g.id === contextMenu.id);
      if (group) {
        onGroupEdit(group);
      }
    } else {
      const player = players.find(p => p.id === contextMenu.id);
      if (player) {
        onPlayerEdit(player);
      }
    }
    setContextMenu(null);
  };

  // Expand all by default
  const expandAll = () => {
    const allGroupIds = new Set(groups.map(g => g.id));
    setExpanded(allGroupIds);
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  return (
    <div className="relative">
      <div className="mb-4 flex justify-between items-center">
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-1 text-sm bg-muted text-foreground rounded hover:bg-accent hover:text-accent-foreground"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1 text-sm bg-muted text-foreground rounded hover:bg-accent hover:text-accent-foreground"
          >
            Collapse All
          </button>
        </div>
        <div className="text-sm text-muted-foreground">
          {groups.length} group{groups.length !== 1 ? 's' : ''}, {players.length} player{players.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div
        onContextMenu={(e) => {
          // Prevent default context menu
          e.preventDefault();
        }}
      >
        <RosterTree
          groups={groups}
          players={players}
          expanded={expanded}
          onToggleExpand={handleToggleExpand}
          onGroupClick={handleGroupClick}
          onPlayerClick={handlePlayerClick}
          selectedGroupId={selectedGroupId}
          selectedPlayerId={selectedPlayerId}
        />
      </div>

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[150px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleEdit}
              className="w-full text-left px-4 py-2 text-sm hover:bg-muted"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-muted"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
