/**
 * Roster hook - uses Zustand store (no API calls)
 */
import { useAppStore } from '../store/appStore';
import type { PlayerDTO } from '../api/dto';

export function useRoster() {
  const players = useAppStore((state) => state.players);
  const addPlayer = useAppStore((state) => state.addPlayer);
  const updatePlayerStore = useAppStore((state) => state.updatePlayer);
  const deletePlayerStore = useAppStore((state) => state.deletePlayer);

  const createPlayer = async (player: PlayerDTO) => {
    addPlayer(player);
    return player;
  };

  const updatePlayer = async (playerId: string, updates: Partial<PlayerDTO>) => {
    updatePlayerStore(playerId, updates);
    const updatedPlayer = players.find(p => p.id === playerId);
    return updatedPlayer!;
  };

  const deletePlayer = async (playerId: string) => {
    deletePlayerStore(playerId);
  };

  return {
    players,
    loading: false,
    error: null,
    createPlayer,
    updatePlayer,
    deletePlayer,
    reloadRoster: () => {}, // No-op for local state
  };
}
