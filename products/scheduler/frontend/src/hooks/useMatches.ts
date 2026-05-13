/**
 * Matches hook - uses Zustand store (no API calls)
 */
import { useTournamentStore } from '../store/tournamentStore';
import type { MatchDTO } from '../api/dto';

export function useMatches() {
  const matches = useTournamentStore((state) => state.matches);
  const addMatch = useTournamentStore((state) => state.addMatch);
  const updateMatchStore = useTournamentStore((state) => state.updateMatch);
  const deleteMatchStore = useTournamentStore((state) => state.deleteMatch);

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
