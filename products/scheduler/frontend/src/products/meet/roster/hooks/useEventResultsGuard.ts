/**
 * useEventResultsGuard — per-(player, event) results signal for the
 * assignment picker (SP-CONSOLE-3A PICK-4, full form per owner ruling).
 *
 * There is no server-computed per-event has-results field on the wire (the
 * module catalog's `hasData` is per-module); this derives the same fact
 * from data already there: `matches[].eventRank` + side ids joined against
 * `matchStateStore`, with `RESULTS_AT_STAKE` (started + finished — the
 * `useMeetResultsLock` definition) deciding when a result is at stake.
 *
 * Same hydration caveat as `useMeetResultsLock`: the store only fills on
 * surfaces that mount `useMatchStateSync`/`useLiveTracking` (RosterTab and
 * MatchesTab both do). An empty store answers `false` — the guard fails
 * open, which on a surface that never loads live state is the pre-guard
 * behavior, not a regression.
 */
import { useCallback, useMemo } from 'react';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useMatchStateStore } from '../../../../store/matchStateStore';
import { RESULTS_AT_STAKE } from '../../../../hooks/useMeetResultsLock';

/** Returns `hasResults(playerId, rank)` — true when the player is on a
 *  match of that event whose recorded state says play has begun. */
export function useEventResultsGuard(): (
  playerId: string,
  rank: string,
) => boolean {
  const matches = useTournamentStore((s) => s.matches);
  const matchStates = useMatchStateStore((s) => s.matchStates);

  const byRank = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const match of matches) {
      const state = matchStates[match.id];
      if (!state || !RESULTS_AT_STAKE.has(state.status)) continue;
      const rank = match.eventRank?.trim();
      if (!rank) continue;
      let ids = map.get(rank);
      if (!ids) {
        ids = new Set();
        map.set(rank, ids);
      }
      for (const id of [
        ...(match.sideA ?? []),
        ...(match.sideB ?? []),
        ...(match.sideC ?? []),
      ]) {
        ids.add(id);
      }
    }
    return map;
  }, [matches, matchStates]);

  return useCallback(
    (playerId: string, rank: string) => byRank.get(rank)?.has(playerId) ?? false,
    [byRank],
  );
}
