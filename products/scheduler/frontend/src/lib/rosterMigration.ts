import type { PlayerDTO, RosterGroupDTO } from '../api/dto';

/**
 * Migrates a flat roster structure to hierarchical structure
 * Creates a default "All Players" group and assigns all players to it
 */
export function migrateFlatRosterToHierarchical(players: PlayerDTO[]): {
  groups: RosterGroupDTO[];
  migratedPlayers: PlayerDTO[];
} {
  const defaultGroupId = 'all-players';
  const defaultGroup: RosterGroupDTO = {
    id: defaultGroupId,
    name: 'All Players',
    type: 'roster',
    parentId: null,
    children: [],
    playerIds: players.map(p => p.id),
    metadata: {
      description: 'Default group for all players (migrated from flat roster)',
    },
  };

  const migratedPlayers: PlayerDTO[] = players.map(player => ({
    ...player,
    groupId: player.groupId || defaultGroupId,
  }));

  return {
    groups: [defaultGroup],
    migratedPlayers,
  };
}

/**
 * Checks if migration is needed (players exist but no groups)
 */
export function needsMigration(players: PlayerDTO[], groups: RosterGroupDTO[]): boolean {
  return players.length > 0 && groups.length === 0;
}
