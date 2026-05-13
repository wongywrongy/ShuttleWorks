/**
 * Memoized lookup-map hooks built on top of ``useTournamentStore``.
 *
 * Every consumer that wrote ``new Map(players.map(p => [p.id, p]))`` inline
 * was paying that O(n) build cost on every render. These hooks build the
 * map once per source-array reference (Zustand keeps array refs stable
 * until something actually mutates them), so two components reading the
 * same map only pay the build once between updates.
 *
 * Pure helpers (``indexById``) live in ``lib/indexById`` so non-React
 * callers in ``utils/`` can use them without crossing the store boundary.
 */
import { useMemo } from 'react';

import type {
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  ScheduleAssignment,
} from '../api/dto';
import { indexById } from '../lib/indexById';
import { useTournamentStore } from './tournamentStore';

export function usePlayerMap(): Map<string, PlayerDTO> {
  const players = useTournamentStore((s) => s.players);
  return useMemo(() => indexById(players), [players]);
}

export function useMatchMap(): Map<string, MatchDTO> {
  const matches = useTournamentStore((s) => s.matches);
  return useMemo(() => indexById(matches), [matches]);
}

export function useGroupMap(): Map<string, RosterGroupDTO> {
  const groups = useTournamentStore((s) => s.groups);
  return useMemo(() => indexById(groups), [groups]);
}

/**
 * Build an assignment-by-matchId index. ``schedule.assignments`` is
 * kept in sync with the active candidate by ``setActiveCandidateIndex``,
 * so reading the array directly is correct.
 */
export function useAssignmentByMatchId(): Map<string, ScheduleAssignment> {
  const assignments = useTournamentStore((s) => s.schedule?.assignments);
  return useMemo(() => {
    const m = new Map<string, ScheduleAssignment>();
    if (!assignments) return m;
    for (const a of assignments) m.set(a.matchId, a);
    return m;
  }, [assignments]);
}
