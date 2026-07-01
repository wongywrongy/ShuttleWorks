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

import type { PlayerDTO } from '../api/dto';
import { indexById } from '../lib/indexById';
import { useTournamentStore } from './tournamentStore';

export function usePlayerMap(): Map<string, PlayerDTO> {
  const players = useTournamentStore((s) => s.players);
  return useMemo(() => indexById(players), [players]);
}
