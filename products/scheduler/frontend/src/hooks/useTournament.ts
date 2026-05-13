/**
 * Tournament configuration hook - uses Zustand store (no API calls)
 */
import { useTournamentStore } from '../store/tournamentStore';
import type { TournamentConfig } from '../api/dto';

export function useTournament() {
  const config = useTournamentStore((state) => state.config);
  const setConfig = useTournamentStore((state) => state.setConfig);

  const updateConfig = async (newConfig: TournamentConfig) => {
    setConfig(newConfig);
  };

  return {
    config,
    loading: false,
    error: null as string | null,
    updateConfig,
    reloadConfig: () => {}, // No-op for local state
  };
}
