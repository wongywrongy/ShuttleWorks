/**
 * Traffic-light system for match calling.
 *
 * Determines whether a match can be called based on player availability:
 * - GREEN (callable): all players free and rested past minimum rest window.
 * - YELLOW (almost ready): a player is in an active match or still in
 *   the rest cooldown; the director can call anyway, with a warning.
 * - RED (blocked): a player is actively playing on another court and
 *   physically cannot be on this one — hard block.
 */
import type {
  MatchDTO,
  MatchStateDTO,
  PlayerDTO,
  ScheduleDTO,
  ScheduleAssignment,
  TournamentConfig,
} from '../api/dto';
import { timeToSlot } from '../lib/time';

export type TrafficLight = 'green' | 'yellow' | 'red';

export interface TrafficLightResult {
  status: TrafficLight;
  reason?: string; // Human-readable explanation
  blockedBy?: string[]; // Match IDs blocking this match
  playersBlocked?: string[]; // Player names blocked (red)
  playersResting?: string[]; // Player names resting (yellow)
  availableInSlots?: number; // Earliest slot when all players available
}

export interface PlayerStatus {
  playerId: string;
  playerName: string;
  status: 'available' | 'active' | 'resting';
  reason?: string;
  matchId?: string; // Match blocking/resting from
  availableAtSlot?: number;
}

/**
 * Get all player IDs from a match
 */
export function getMatchPlayerIds(match: MatchDTO): string[] {
  const playerIds: string[] = [];
  if (match.sideA) playerIds.push(...match.sideA);
  if (match.sideB) playerIds.push(...match.sideB);
  if (match.sideC) playerIds.push(...match.sideC);
  return playerIds;
}

// timeToSlot imported from timeUtils.ts

/**
 * Check if a player is actively playing or committed to another match
 * A player is considered "active" if they are in a match with status 'called' or 'started'
 * - 'called' = player has been called to the court, they're committed
 * - 'started' = match is actively in progress
 */
export function isPlayerActive(
  playerId: string,
  matchStates: Record<string, MatchStateDTO>,
  matches: MatchDTO[],
  excludeMatchId?: string
): { active: boolean; matchId?: string; matchLabel?: string; status?: 'called' | 'started' } {
  for (const match of matches) {
    if (excludeMatchId && match.id === excludeMatchId) continue;

    const state = matchStates[match.id];
    // Player is blocked if they're in a 'called' or 'started' match
    if (state?.status !== 'called' && state?.status !== 'started') continue;

    const playerIds = getMatchPlayerIds(match);
    if (playerIds.includes(playerId)) {
      return {
        active: true,
        matchId: match.id,
        matchLabel: match.eventRank || `M${match.matchNumber || '?'}`,
        status: state.status,
      };
    }
  }

  return { active: false };
}

/**
 * Find a player's most recently finished match
 */
function findLastFinishedMatch(
  playerId: string,
  matchStates: Record<string, MatchStateDTO>,
  matches: MatchDTO[],
  schedule: ScheduleDTO,
  config: TournamentConfig,
  excludeMatchId?: string
): { assignment: ScheduleAssignment; state: MatchStateDTO; match: MatchDTO } | null {
  let latestEnd = -1;
  let result: { assignment: ScheduleAssignment; state: MatchStateDTO; match: MatchDTO } | null = null;

  for (const match of matches) {
    if (excludeMatchId && match.id === excludeMatchId) continue;

    const state = matchStates[match.id];
    if (state?.status !== 'finished') continue;

    const playerIds = getMatchPlayerIds(match);
    if (!playerIds.includes(playerId)) continue;

    const assignment = schedule.assignments.find((a) => a.matchId === match.id);
    if (!assignment) continue;

    // Get actual end slot (prefer actual end time, fallback to scheduled)
    let endSlot: number;
    if (state.actualEndTime) {
      endSlot = timeToSlot(state.actualEndTime, config);
    } else {
      endSlot = assignment.slotId + assignment.durationSlots;
    }

    if (endSlot > latestEnd) {
      latestEnd = endSlot;
      result = { assignment, state, match };
    }
  }

  return result;
}

/**
 * Check if a player is in rest cooldown period
 */
export function isPlayerResting(
  playerId: string,
  matchStates: Record<string, MatchStateDTO>,
  matches: MatchDTO[],
  players: PlayerDTO[],
  schedule: ScheduleDTO,
  config: TournamentConfig,
  currentSlot: number,
  excludeMatchId?: string
): { resting: boolean; availableAtSlot?: number; matchId?: string; matchLabel?: string } {
  const lastFinished = findLastFinishedMatch(
    playerId,
    matchStates,
    matches,
    schedule,
    config,
    excludeMatchId
  );

  if (!lastFinished) {
    return { resting: false };
  }

  // Calculate rest requirement
  const player = players.find((p) => p.id === playerId);
  const playerRestMinutes = player?.minRestMinutes ?? config.defaultRestMinutes;
  const restSlots = Math.ceil(playerRestMinutes / config.intervalMinutes);

  // Get actual end slot
  let endSlot: number;
  if (lastFinished.state.actualEndTime) {
    endSlot = timeToSlot(lastFinished.state.actualEndTime, config);
  } else {
    endSlot = lastFinished.assignment.slotId + lastFinished.assignment.durationSlots;
  }

  const availableAtSlot = endSlot + restSlots;

  if (currentSlot < availableAtSlot) {
    return {
      resting: true,
      availableAtSlot,
      matchId: lastFinished.match.id,
      matchLabel: lastFinished.match.eventRank || `M${lastFinished.match.matchNumber || '?'}`,
    };
  }

  return { resting: false };
}

/**
 * Get detailed status for each player in a match
 */
export function getPlayerStatuses(
  matchId: string,
  schedule: ScheduleDTO,
  matches: MatchDTO[],
  matchStates: Record<string, MatchStateDTO>,
  players: PlayerDTO[],
  config: TournamentConfig,
  currentSlot: number
): PlayerStatus[] {
  const match = matches.find((m) => m.id === matchId);
  if (!match) return [];

  const playerIds = getMatchPlayerIds(match);
  const statuses: PlayerStatus[] = [];

  for (const playerId of playerIds) {
    const player = players.find((p) => p.id === playerId);
    const playerName = player?.name || playerId;

    // Check if actively playing or called to another match
    const activeCheck = isPlayerActive(playerId, matchStates, matches, matchId);
    if (activeCheck.active) {
      const reasonVerb = activeCheck.status === 'called' ? 'Called to' : 'Playing';
      statuses.push({
        playerId,
        playerName,
        status: 'active',
        reason: `${reasonVerb} ${activeCheck.matchLabel}`,
        matchId: activeCheck.matchId,
      });
      continue;
    }

    // Check if resting
    const restCheck = isPlayerResting(
      playerId,
      matchStates,
      matches,
      players,
      schedule,
      config,
      currentSlot,
      matchId
    );
    if (restCheck.resting) {
      const slotsRemaining = (restCheck.availableAtSlot ?? 0) - currentSlot;
      statuses.push({
        playerId,
        playerName,
        status: 'resting',
        reason: `Resting after ${restCheck.matchLabel} (${slotsRemaining} slot${slotsRemaining !== 1 ? 's' : ''} remaining)`,
        matchId: restCheck.matchId,
        availableAtSlot: restCheck.availableAtSlot,
      });
      continue;
    }

    // Player is available
    statuses.push({
      playerId,
      playerName,
      status: 'available',
    });
  }

  return statuses;
}

/**
 * Compute traffic light status for a match
 */
export function computeTrafficLight(
  matchId: string,
  schedule: ScheduleDTO,
  matches: MatchDTO[],
  matchStates: Record<string, MatchStateDTO>,
  players: PlayerDTO[],
  config: TournamentConfig,
  currentSlot: number
): TrafficLightResult {
  const matchState = matchStates[matchId];

  // Already started/finished matches are green (no action needed)
  if (matchState?.status === 'started' || matchState?.status === 'finished') {
    return { status: 'green' };
  }

  // Called matches are green (already called)
  if (matchState?.status === 'called') {
    return { status: 'green', reason: 'Already called' };
  }

  const playerStatuses = getPlayerStatuses(
    matchId,
    schedule,
    matches,
    matchStates,
    players,
    config,
    currentSlot
  );

  const activePlayers = playerStatuses.filter((p) => p.status === 'active');
  const restingPlayers = playerStatuses.filter((p) => p.status === 'resting');

  // Red: At least one player is actively playing or called
  if (activePlayers.length > 0) {
    const names = activePlayers.map((p) => p.playerName);
    const blockedBy = activePlayers.map((p) => p.matchId).filter(Boolean) as string[];

    let reason: string;
    if (activePlayers.length === 1) {
      reason = `${names[0]} is ${activePlayers[0].reason}`;
    } else {
      // For multiple players, list each one's status
      const statuses = activePlayers.map((p) => `${p.playerName}: ${p.reason}`);
      reason = statuses.join('; ');
    }

    return {
      status: 'red',
      reason,
      blockedBy,
      playersBlocked: names,
    };
  }

  // Yellow: Players are resting
  if (restingPlayers.length > 0) {
    const names = restingPlayers.map((p) => p.playerName);
    const earliestAvailable = Math.max(...restingPlayers.map((p) => p.availableAtSlot ?? 0));

    let reason: string;
    if (restingPlayers.length === 1) {
      reason = `${names[0]} is ${restingPlayers[0].reason}`;
    } else {
      const slotsRemaining = earliestAvailable - currentSlot;
      reason = `${names.join(' & ')} are resting (${slotsRemaining} slot${slotsRemaining !== 1 ? 's' : ''})`;
    }

    return {
      status: 'yellow',
      reason,
      playersResting: names,
      availableInSlots: earliestAvailable - currentSlot,
    };
  }

  // Green: All players available
  return {
    status: 'green',
    reason: 'Ready to call',
  };
}

/**
 * Compute traffic lights for all scheduled matches
 */
export function computeAllTrafficLights(
  schedule: ScheduleDTO | null,
  matches: MatchDTO[],
  matchStates: Record<string, MatchStateDTO>,
  players: PlayerDTO[],
  config: TournamentConfig | null,
  currentSlot: number
): Map<string, TrafficLightResult> {
  const results = new Map<string, TrafficLightResult>();

  if (!schedule || !config) {
    return results;
  }

  for (const assignment of schedule.assignments) {
    const result = computeTrafficLight(
      assignment.matchId,
      schedule,
      matches,
      matchStates,
      players,
      config,
      currentSlot
    );
    results.set(assignment.matchId, result);
  }

  return results;
}
