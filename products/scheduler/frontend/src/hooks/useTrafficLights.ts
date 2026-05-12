/**
 * React hook for computing traffic light status for all matches
 *
 * Memoizes computation and updates when match states change
 */
import { useMemo } from 'react';
import type {
  MatchDTO,
  MatchStateDTO,
  PlayerDTO,
  ScheduleDTO,
  TournamentConfig,
} from '../api/dto';
import { computeAllTrafficLights } from '../utils/trafficLight';
import type { TrafficLightResult } from '../utils/trafficLight';

/**
 * Hook to compute traffic lights for all matches
 *
 * @param schedule - Current schedule with assignments
 * @param matches - All match definitions
 * @param matchStates - Current state of each match (status, times, etc.)
 * @param players - All player definitions
 * @param config - Tournament configuration
 * @param currentSlot - Current time slot
 * @returns Map of matchId -> TrafficLightResult
 */
export function useTrafficLights(
  schedule: ScheduleDTO | null,
  matches: MatchDTO[],
  matchStates: Record<string, MatchStateDTO>,
  players: PlayerDTO[],
  config: TournamentConfig | null,
  currentSlot: number
): Map<string, TrafficLightResult> {
  return useMemo(() => {
    return computeAllTrafficLights(
      schedule,
      matches,
      matchStates,
      players,
      config,
      currentSlot
    );
  }, [schedule, matches, matchStates, players, config, currentSlot]);
}

export type { TrafficLightResult };
