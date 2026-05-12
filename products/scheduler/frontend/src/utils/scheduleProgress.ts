/**
 * Schedule Progress Utilities
 *
 * Calculates how far behind (or ahead) the tournament is running
 * compared to the original schedule.
 */
import type {
  MatchStateDTO,
  ScheduleDTO,
  TournamentConfig,
} from '../api/dto';

export interface ScheduleProgressInfo {
  /** How many slots behind schedule (negative = ahead) */
  behindBySlots: number;
  /** Human-readable description */
  description: string;
  /** Status: 'on_time' | 'ahead' | 'behind' | 'significantly_behind' */
  status: 'on_time' | 'ahead' | 'behind' | 'significantly_behind';
  /** Matches that should have finished by now but haven't */
  overdueCount: number;
  /** Matches currently in progress */
  inProgressCount: number;
}

/**
 * Calculate how far behind (or ahead) the tournament is running
 *
 * Logic:
 * - Look at all matches scheduled to end before current slot
 * - Count how many haven't finished yet
 * - Estimate slots behind based on unfinished scheduled matches
 */
export function calculateScheduleProgress(
  schedule: ScheduleDTO,
  matchStates: Record<string, MatchStateDTO>,
  config: TournamentConfig,
  currentSlot: number
): ScheduleProgressInfo {
  let overdueCount = 0;
  let inProgressCount = 0;
  let totalOverdueSlots = 0;

  for (const assignment of schedule.assignments) {
    const state = matchStates[assignment.matchId];
    const scheduledEnd = assignment.slotId + assignment.durationSlots;

    // Match should have finished by now (scheduled end is before current slot)
    if (scheduledEnd <= currentSlot) {
      if (!state || state.status === 'scheduled' || state.status === 'called') {
        // Match hasn't started but should have finished
        overdueCount++;
        totalOverdueSlots += assignment.durationSlots;
      } else if (state.status === 'started') {
        // Match is still in progress but should have finished
        overdueCount++;
        // Estimate how far behind: current slot - scheduled end
        totalOverdueSlots += Math.max(0, currentSlot - scheduledEnd);
      }
    }

    // Count in-progress matches
    if (state?.status === 'started') {
      inProgressCount++;
    }
  }

  // Calculate average behind (if there are overdue matches)
  const behindBySlots = overdueCount > 0 ? Math.ceil(totalOverdueSlots / Math.max(1, overdueCount)) : 0;

  // Determine status
  let status: ScheduleProgressInfo['status'];
  let description: string;

  if (overdueCount === 0) {
    status = 'on_time';
    description = 'On schedule';
  } else if (behindBySlots <= 1) {
    status = 'behind';
    description = `${overdueCount} match${overdueCount > 1 ? 'es' : ''} running late`;
  } else if (behindBySlots <= 3) {
    status = 'behind';
    const minutes = behindBySlots * config.intervalMinutes;
    description = `~${minutes} min behind (${overdueCount} overdue)`;
  } else {
    status = 'significantly_behind';
    const minutes = behindBySlots * config.intervalMinutes;
    description = `~${minutes} min behind (${overdueCount} overdue)`;
  }

  return {
    behindBySlots,
    description,
    status,
    overdueCount,
    inProgressCount,
  };
}
