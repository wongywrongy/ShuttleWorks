import { useAppStore } from '../../../store/appStore';
import type { PlayerDTO } from '../../../api/dto';

interface BulkOperationResult {
  success: number;
  skipped: number;
  errors: string[];
}

interface RankConflict {
  playerId: string;
  playerName: string;
  conflictingRanks: string[];
}

/**
 * useBulkOperations Hook
 *
 * Provides bulk operation logic for player management.
 *
 * Features:
 * - Bulk school assignment with conflict detection
 * - Bulk rank assignment with validation
 * - Conflict resolution logic
 * - Validation before applying changes
 */
export function useBulkOperations() {
  const { players, updatePlayer } = useAppStore();

  /**
   * Validate bulk school assignment and detect rank conflicts
   */
  const validateBulkSchoolAssignment = (
    playerIds: string[],
    targetSchoolId: string
  ): RankConflict[] => {
    const conflicts: RankConflict[] = [];

    // Get all ranks already assigned in the target school
    const targetSchoolRanks = new Set<string>();
    players.forEach((p) => {
      if (p.groupId === targetSchoolId && !playerIds.includes(p.id)) {
        (p.ranks || []).forEach(rank => targetSchoolRanks.add(rank));
      }
    });

    // Check each player for conflicts
    playerIds.forEach((playerId) => {
      const player = players.find(p => p.id === playerId);
      if (!player) return;

      const conflictingRanks = (player.ranks || []).filter(rank =>
        targetSchoolRanks.has(rank)
      );

      if (conflictingRanks.length > 0) {
        conflicts.push({
          playerId: player.id,
          playerName: player.name,
          conflictingRanks,
        });
      }
    });

    return conflicts;
  };

  /**
   * Assign school to multiple players
   *
   * @param clearConflictingRanks - If true, removes conflicting ranks from players
   */
  const bulkAssignSchool = (
    playerIds: string[],
    schoolId: string,
    clearConflictingRanks: boolean = false
  ): BulkOperationResult => {
    const result: BulkOperationResult = {
      success: 0,
      skipped: 0,
      errors: [],
    };

    const conflicts = validateBulkSchoolAssignment(playerIds, schoolId);

    playerIds.forEach((playerId) => {
      const player = players.find(p => p.id === playerId);
      if (!player) {
        result.errors.push(`Player ${playerId} not found`);
        result.skipped++;
        return;
      }

      const conflict = conflicts.find(c => c.playerId === playerId);

      if (conflict && !clearConflictingRanks) {
        result.skipped++;
        return;
      }

      const updates: Partial<PlayerDTO> = { groupId: schoolId };

      if (conflict && clearConflictingRanks) {
        // Remove conflicting ranks
        updates.ranks = (player.ranks || []).filter(
          rank => !conflict.conflictingRanks.includes(rank)
        );
      }

      updatePlayer(playerId, updates);
      result.success++;
    });

    return result;
  };

  /**
   * Validate bulk rank assignment
   */
  const validateBulkRankAssignment = (
    playerIds: string[],
    ranksToAssign: string[],
    mode: 'add' | 'set' | 'remove'
  ): RankConflict[] => {
    const conflicts: RankConflict[] = [];

    // Group players by school
    const playersBySchool: Record<string, PlayerDTO[]> = {};
    playerIds.forEach((id) => {
      const player = players.find(p => p.id === id);
      if (player && player.groupId) {
        if (!playersBySchool[player.groupId]) {
          playersBySchool[player.groupId] = [];
        }
        playersBySchool[player.groupId].push(player);
      }
    });

    // Check for conflicts in each school
    Object.entries(playersBySchool).forEach(([schoolId, schoolPlayers]) => {
      // Get ranks already assigned to other players in this school
      const assignedRanks = new Set<string>();
      players.forEach((p) => {
        if (p.groupId === schoolId && !playerIds.includes(p.id)) {
          (p.ranks || []).forEach(rank => assignedRanks.add(rank));
        }
      });

      // Check if any of the ranks to assign are already taken
      const conflictingRanks = ranksToAssign.filter(rank => assignedRanks.has(rank));

      if (conflictingRanks.length > 0 && mode !== 'remove') {
        schoolPlayers.forEach(player => {
          conflicts.push({
            playerId: player.id,
            playerName: player.name,
            conflictingRanks,
          });
        });
      }
    });

    return conflicts;
  };

  /**
   * Assign ranks to multiple players
   *
   * @param mode - 'add' (union), 'set' (replace), 'remove' (difference)
   * @param skipConflicts - If true, skips players with conflicts
   */
  const bulkAssignRanks = (
    playerIds: string[],
    ranksToAssign: string[],
    mode: 'add' | 'set' | 'remove' = 'add',
    skipConflicts: boolean = true
  ): BulkOperationResult => {
    const result: BulkOperationResult = {
      success: 0,
      skipped: 0,
      errors: [],
    };

    const conflicts = validateBulkRankAssignment(playerIds, ranksToAssign, mode);

    playerIds.forEach((playerId) => {
      const player = players.find(p => p.id === playerId);
      if (!player) {
        result.errors.push(`Player ${playerId} not found`);
        result.skipped++;
        return;
      }

      if (!player.groupId) {
        result.errors.push(`${player.name} has no school assigned`);
        result.skipped++;
        return;
      }

      const conflict = conflicts.find(c => c.playerId === playerId);
      if (conflict && skipConflicts) {
        result.skipped++;
        return;
      }

      const currentRanks = player.ranks || [];
      let newRanks: string[];

      switch (mode) {
        case 'add':
          // Union: add new ranks to existing
          const ranksToAdd = conflict && skipConflicts
            ? ranksToAssign.filter(r => !conflict.conflictingRanks.includes(r))
            : ranksToAssign;
          newRanks = [...new Set([...currentRanks, ...ranksToAdd])];
          break;
        case 'set':
          // Replace: set exactly these ranks
          newRanks = ranksToAssign;
          break;
        case 'remove':
          // Difference: remove these ranks from current
          newRanks = currentRanks.filter(r => !ranksToAssign.includes(r));
          break;
      }

      updatePlayer(playerId, { ranks: newRanks });
      result.success++;
    });

    return result;
  };

  /**
   * Delete multiple players
   */
  const bulkDeletePlayers = (playerIds: string[]): BulkOperationResult => {
    const { deletePlayer } = useAppStore.getState();
    const result: BulkOperationResult = {
      success: 0,
      skipped: 0,
      errors: [],
    };

    playerIds.forEach((playerId) => {
      try {
        deletePlayer(playerId);
        result.success++;
      } catch (error) {
        result.errors.push(`Failed to delete player ${playerId}: ${error}`);
        result.skipped++;
      }
    });

    return result;
  };

  return {
    validateBulkSchoolAssignment,
    validateBulkRankAssignment,
    bulkAssignSchool,
    bulkAssignRanks,
    bulkDeletePlayers,
  };
}
