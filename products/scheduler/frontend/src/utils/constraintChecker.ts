/**
 * Client-side constraint violation detection for visualization
 */
import type {
  ScheduleAssignment,
  MatchDTO,
  PlayerDTO,
  TournamentConfig,
  ConstraintViolation,
} from '../api/dto';
import { indexById } from '../lib/indexById';

/**
 * Compute constraint violations from current schedule assignments
 */
export function computeConstraintViolations(
  assignments: ScheduleAssignment[],
  matches: MatchDTO[],
  players: PlayerDTO[],
  config: TournamentConfig
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  const matchMap = indexById(matches);
  const playerMap = indexById(players);

  // Check 1: Player overlap (same player in overlapping time slots)
  violations.push(...checkPlayerOverlap(assignments, matchMap));

  // Check 2: Rest time violations
  violations.push(...checkRestViolations(assignments, matchMap, playerMap, config));

  // Check 3: Court capacity (multiple matches on same court/slot)
  violations.push(...checkCourtCapacity(assignments, matchMap));

  return violations;
}

/**
 * Get all player IDs from a match
 */
function getMatchPlayerIds(match: MatchDTO): string[] {
  const players: string[] = [];
  if (match.sideA) players.push(...match.sideA);
  if (match.sideB) players.push(...match.sideB);
  if (match.sideC) players.push(...match.sideC);
  return players;
}

/**
 * Get match display label (M1, M2, etc. or eventRank)
 */
function getMatchLabel(match: MatchDTO): string {
  if (match.matchNumber) {
    return `M${match.matchNumber}`;
  }
  if (match.eventRank) {
    return match.eventRank;
  }
  return match.id.slice(0, 6);
}

/**
 * Check for player overlap violations (hard constraint)
 */
function checkPlayerOverlap(
  assignments: ScheduleAssignment[],
  matchMap: Map<string, MatchDTO>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Build player slot occupancy
  const playerSlots = new Map<string, Array<{
    start: number;
    end: number;
    matchId: string;
  }>>();

  for (const assignment of assignments) {
    const match = matchMap.get(assignment.matchId);
    if (!match) continue;

    const playerIds = getMatchPlayerIds(match);
    for (const playerId of playerIds) {
      if (!playerSlots.has(playerId)) {
        playerSlots.set(playerId, []);
      }
      playerSlots.get(playerId)!.push({
        start: assignment.slotId,
        end: assignment.slotId + assignment.durationSlots,
        matchId: assignment.matchId,
      });
    }
  }

  // Check for overlaps per player
  for (const [playerId, slots] of playerSlots) {
    slots.sort((a, b) => a.start - b.start);

    for (let i = 0; i < slots.length - 1; i++) {
      if (slots[i].end > slots[i + 1].start) {
        const match1 = matchMap.get(slots[i].matchId);
        const match2 = matchMap.get(slots[i + 1].matchId);
        const label1 = match1 ? getMatchLabel(match1) : slots[i].matchId.slice(0, 6);
        const label2 = match2 ? getMatchLabel(match2) : slots[i + 1].matchId.slice(0, 6);
        violations.push({
          type: 'overlap',
          severity: 'hard',
          playerIds: [playerId],
          matchIds: [slots[i].matchId, slots[i + 1].matchId],
          description: `Player overlap in ${label1} and ${label2}`,
        });
      }
    }
  }

  return violations;
}

/**
 * Check for rest time violations (soft constraint)
 */
function checkRestViolations(
  assignments: ScheduleAssignment[],
  matchMap: Map<string, MatchDTO>,
  playerMap: Map<string, PlayerDTO>,
  config: TournamentConfig
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Default rest slots (convert minutes to slots)
  const defaultRestSlots = Math.ceil(config.defaultRestMinutes / config.intervalMinutes);

  // Build player match schedule
  const playerSchedule = new Map<string, Array<{
    start: number;
    end: number;
    matchId: string;
  }>>();

  for (const assignment of assignments) {
    const match = matchMap.get(assignment.matchId);
    if (!match) continue;

    const playerIds = getMatchPlayerIds(match);
    for (const playerId of playerIds) {
      if (!playerSchedule.has(playerId)) {
        playerSchedule.set(playerId, []);
      }
      playerSchedule.get(playerId)!.push({
        start: assignment.slotId,
        end: assignment.slotId + assignment.durationSlots,
        matchId: assignment.matchId,
      });
    }
  }

  // Check rest time between consecutive matches
  for (const [playerId, schedule] of playerSchedule) {
    schedule.sort((a, b) => a.start - b.start);

    const player = playerMap.get(playerId);
    const restSlots = player?.minRestMinutes
      ? Math.ceil(player.minRestMinutes / config.intervalMinutes)
      : defaultRestSlots;

    for (let i = 0; i < schedule.length - 1; i++) {
      const gap = schedule[i + 1].start - schedule[i].end;
      if (gap < restSlots && gap >= 0) {
        const match1 = matchMap.get(schedule[i].matchId);
        const match2 = matchMap.get(schedule[i + 1].matchId);
        const label1 = match1 ? getMatchLabel(match1) : schedule[i].matchId.slice(0, 6);
        const label2 = match2 ? getMatchLabel(match2) : schedule[i + 1].matchId.slice(0, 6);
        violations.push({
          type: 'rest',
          severity: 'soft',
          playerIds: [playerId],
          matchIds: [schedule[i].matchId, schedule[i + 1].matchId],
          description: `Rest violation: ${label1} to ${label2} (${gap}/${restSlots} slots)`,
        });
      }
    }
  }

  return violations;
}

/**
 * Check for court capacity violations (hard constraint)
 */
function checkCourtCapacity(
  assignments: ScheduleAssignment[],
  matchMap: Map<string, MatchDTO>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Build court-slot occupancy
  const courtSlots = new Map<string, string[]>(); // "court-slot" -> matchIds

  for (const assignment of assignments) {
    const match = matchMap.get(assignment.matchId);
    if (!match) continue;

    // Mark all slots this match occupies
    for (let s = assignment.slotId; s < assignment.slotId + assignment.durationSlots; s++) {
      const key = `${assignment.courtId}-${s}`;
      if (!courtSlots.has(key)) {
        courtSlots.set(key, []);
      }
      courtSlots.get(key)!.push(assignment.matchId);
    }
  }

  // Check for multiple matches on same court-slot
  for (const [key, matchIds] of courtSlots) {
    if (matchIds.length > 1) {
      const labels = matchIds.map(id => {
        const match = matchMap.get(id);
        return match ? getMatchLabel(match) : id.slice(0, 6);
      });
      const [courtId, slotId] = key.split('-');
      violations.push({
        type: 'court_capacity',
        severity: 'hard',
        playerIds: [],
        matchIds,
        description: `Court ${courtId} conflict: ${labels.join(', ')} at slot ${slotId}`,
      });
    }
  }

  return violations;
}
