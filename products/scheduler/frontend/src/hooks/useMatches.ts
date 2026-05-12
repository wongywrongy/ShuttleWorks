/**
 * Matches hook - uses Zustand store (no API calls)
 */
import { useAppStore } from '../store/appStore';
import type { MatchDTO } from '../api/dto';

export function useMatches() {
  const matches = useAppStore((state) => state.matches);
  const addMatch = useAppStore((state) => state.addMatch);
  const updateMatchStore = useAppStore((state) => state.updateMatch);
  const deleteMatchStore = useAppStore((state) => state.deleteMatch);

  const createMatch = async (match: MatchDTO) => {
    addMatch(match);
    return match;
  };

  const updateMatch = async (matchId: string, updates: Partial<MatchDTO>) => {
    updateMatchStore(matchId, updates);
    const updated = matches.find(m => m.id === matchId);
    return updated!;
  };

  const deleteMatch = async (matchId: string) => {
    deleteMatchStore(matchId);
  };

  return {
    matches,
    loading: false,
    error: null,
    createMatch,
    updateMatch,
    deleteMatch,
    reloadMatches: () => {}, // No-op for local state
  };
}
