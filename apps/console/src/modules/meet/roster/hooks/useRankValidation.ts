import { useMemo } from 'react';
import { useTournamentStore } from '../../../../store/tournamentStore';
import type { PlayerDTO } from '../../../../api/dto';
import { DISCIPLINE_NAMES } from '../../../../lib/disciplineNames';
import { configuredRankCount, rankCapacity } from '../positionGrid/helpers';

interface RankOption {
  value: string;
  label: string;
  disabled: boolean;
  assignedTo?: string; // Name of player who has this rank
}

interface RankCategory {
  label: string;
  ranks: RankOption[];
}

/**
 * A meet's events are ITS OWN vocabulary — Meet Setup validates and accepts
 * any code an operator defines (BS, U10, …), not just the five badminton
 * disciplines. This hook used to interpolate a hardcoded five-entry label map
 * straight into a user-visible string, so an operator-defined code rendered
 * the literal text "BS1 - undefined 1" (console-IA defect D1). The shared,
 * null-prototype-safe `DISCIPLINE_NAMES` was written for exactly this; an
 * unknown code has no full name, so the code IS the label.
 */
const disciplineName = (code: string): string | undefined =>
  DISCIPLINE_NAMES[code];

/**
 * useRankValidation Hook
 *
 * Provides rank validation logic for determining which ranks are available
 * for a player based on their school and what ranks are already assigned.
 *
 * Key rules:
 * - Singles ranks (MS, WS): Only 1 player per school can have each rank
 * - Doubles ranks (MD, WD, XD): Up to 2 players per school can have each rank
 *
 * Returns:
 * - availableRanks: Grouped ranks available for selection
 * - isRankAssigned: Function to check if a rank is assigned to another player
 * - getPlayersWithRank: Get all players who have a specific rank in a school
 * - isRankFull: Check if a rank has reached its player limit
 */
export function useRankValidation(schoolId: string | null, currentPlayerId?: string) {
  const players = useTournamentStore((s) => s.players);
  const config = useTournamentStore((s) => s.config);

  /**
   * Get all ranks currently assigned to other players in the same school
   * For doubles, can have up to 2 players; for singles, only 1 player
   */
  const assignedRanks = useMemo(() => {
    const ranks = new Map<string, PlayerDTO[]>(); // rank -> array of players

    if (!schoolId) return ranks;

    players.forEach((player) => {
      if (player.groupId === schoolId && player.id !== currentPlayerId) {
        (player.ranks || []).forEach((rank) => {
          const existing = ranks.get(rank) || [];
          ranks.set(rank, [...existing, player]);
        });
      }
    });

    return ranks;
  }, [players, schoolId, currentPlayerId]);

  /**
   * Group available ranks by category with availability status
   */
  const availableRanks = useMemo((): Record<string, RankCategory> => {
    const groups: Record<string, RankCategory> = {};

    if (!config?.rankCounts || !schoolId) {
      return groups;
    }

    const rankCounts = config.rankCounts;

    Object.keys(rankCounts).forEach((rankKey) => {
      const count = configuredRankCount(rankCounts, rankKey);
      if (count !== undefined) {
        const ranks: RankOption[] = [];
        const named = disciplineName(rankKey);

        for (let i = 1; i <= count; i++) {
          const rankValue = `${rankKey}${i}`;
          const assignedPlayers = assignedRanks.get(rankValue) || [];
          const maxPlayers = rankCapacity(rankValue);

          // Singles: disable if 1+ players assigned
          // Doubles: disable if 2+ players assigned
          const isFull = assignedPlayers.length >= maxPlayers;

          // Show assigned player names (or count for doubles)
          const assignedTo = assignedPlayers.length > 0
            ? assignedPlayers.map(p => p.name).join(', ')
            : undefined;

          ranks.push({
            value: rankValue,
            label: named ? `${rankValue} - ${named} ${i}` : rankValue,
            disabled: isFull,
            assignedTo,
          });
        }

        if (ranks.length > 0) {
          groups[rankKey] = {
            label: named ?? rankKey,
            ranks,
          };
        }
      }
    });

    return groups;
  }, [config, schoolId, assignedRanks]);

  /**
   * Check if a rank is assigned to at least one player
   */
  const isRankAssigned = (rank: string): boolean => {
    const players = assignedRanks.get(rank);
    return !!players && players.length > 0;
  };

  /**
   * Check if a rank has reached its player limit
   */
  const isRankFull = (rank: string): boolean => {
    const assignedPlayers = assignedRanks.get(rank) || [];
    return assignedPlayers.length >= rankCapacity(rank);
  };

  /**
   * Get all players who have a specific rank
   */
  const getPlayersWithRank = (rank: string): PlayerDTO[] => {
    return assignedRanks.get(rank) || [];
  };

  /**
   * Check if a doubles rank has an incomplete pair (only 1 player)
   */
  const hasIncompletePair = (rank: string): boolean => {
    if (rankCapacity(rank) !== 2) return false;
    const players = assignedRanks.get(rank) || [];
    // assignedRanks excludes current player, so length === 0 means only current player has this rank
    return players.length === 0;
  };

  /**
   * Get only the unassigned (available) ranks for a school
   */
  const getUnassignedRanks = (currentRanks: string[] = []): Record<string, RankCategory> => {
    const filtered: Record<string, RankCategory> = {};

    Object.entries(availableRanks).forEach(([categoryKey, category]) => {
      const availableInCategory = category.ranks.filter(
        rank => !rank.disabled || currentRanks.includes(rank.value)
      );

      if (availableInCategory.length > 0) {
        filtered[categoryKey] = {
          label: category.label,
          ranks: availableInCategory,
        };
      }
    });

    return filtered;
  };

  return {
    availableRanks,
    isRankAssigned,
    isRankFull,
    getPlayersWithRank,
    hasIncompletePair,
    getUnassignedRanks,
    assignedRanks,
  };
}
