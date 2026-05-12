import { useAppStore } from '../store/appStore';

/**
 * Hook to resolve player IDs to player names
 *
 * Returns utility functions to convert player IDs (UUIDs) to human-readable names.
 * Falls back to showing the ID if the player is not found in the store.
 */
export function usePlayerNames() {
  const players = useAppStore((state) => state.players);

  /**
   * Get a single player's name by ID
   * @param playerId - The player's UUID
   * @returns Player name, or the ID itself if player not found
   */
  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.id === playerId);
    return player?.name || playerId; // Fallback to ID if not found
  };

  /**
   * Get multiple player names from an array of IDs
   * @param playerIds - Array of player UUIDs
   * @returns Array of player names
   */
  const getPlayerNames = (playerIds: string[]): string[] => {
    return playerIds.map(getPlayerName);
  };

  return { getPlayerName, getPlayerNames };
}
