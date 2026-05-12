/**
 * Tournament configuration hook - uses Zustand store (no API calls)
 */
import { useAppStore } from '../store/appStore';
import type { TournamentConfig } from '../api/dto';

export function useTournament() {
  const config = useAppStore((state) => state.config);
  const setConfig = useAppStore((state) => state.setConfig);

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
