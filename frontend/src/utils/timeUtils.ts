/**
 * Time utility functions for live tracking
 */
import type { TournamentConfig, ScheduleAssignment, MatchStateDTO } from '../api/dto';

/**
 * Get current time in HH:mm format
 */
export function getCurrentTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Calculate current slot based on tournament config and current time
 * Handles overnight schedules (e.g., 10pm to 6am)
 */
export function getCurrentSlot(config: TournamentConfig | null): number {
  if (!config) return 0;

  const now = new Date();
  let currentMinutes = now.getHours() * 60 + now.getMinutes();

  const startMinutes = timeToMinutes(config.dayStart);
  const endMinutes = timeToMinutes(config.dayEnd);
  const isOvernight = endMinutes <= startMinutes;

  // For overnight schedules, if current time is before start (e.g., 2am when start is 10pm),
  // add 24 hours to treat it as part of the overnight period
  if (isOvernight && currentMinutes < startMinutes) {
    currentMinutes += 24 * 60;
  }

  const elapsedMinutes = currentMinutes - startMinutes;
  const slot = Math.floor(elapsedMinutes / config.intervalMinutes);

  return Math.max(0, slot);
}

/**
 * Format slot ID to HH:mm time
 * Handles overnight schedules by wrapping hours past midnight
 */
export function formatSlotTime(slotId: number, config: TournamentConfig): string {
  const startMinutes = timeToMinutes(config.dayStart);

  const slotMinutes = startMinutes + (slotId * config.intervalMinutes);
  // Wrap around midnight (1440 minutes = 24 hours)
  const normalizedMinutes = slotMinutes % (24 * 60);
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Format slot range (start to end) as time range
 */
export function formatSlotRange(slotId: number, durationSlots: number, config: TournamentConfig): string {
  const startTime = formatSlotTime(slotId, config);
  const endTime = formatSlotTime(slotId + durationSlots, config);
  return `${startTime} - ${endTime}`;
}

/**
 * Check if a match is currently in progress
 */
export function isMatchInProgress(
  assignment: ScheduleAssignment,
  matchState: MatchStateDTO | undefined,
  currentSlot: number
): boolean {
  // If explicitly marked as started, it's in progress
  if (matchState?.status === 'started') {
    return true;
  }

  // If finished or called, not in progress
  if (matchState?.status === 'finished' || matchState?.status === 'called') {
    return false;
  }

  // Otherwise, check if current time is within the scheduled slot range
  const matchStartSlot = assignment.slotId;
  const matchEndSlot = assignment.slotId + assignment.durationSlots;

  return currentSlot >= matchStartSlot && currentSlot < matchEndSlot;
}

/**
 * Get upcoming matches (next N matches after current slot)
 */
export function getUpcomingMatches(
  schedule: { assignments: ScheduleAssignment[] } | null,
  currentSlot: number,
  limit: number = 5
): ScheduleAssignment[] {
  if (!schedule) return [];

  return schedule.assignments
    .filter(a => a.slotId >= currentSlot)
    .sort((a, b) => a.slotId - b.slotId)
    .slice(0, limit);
}

/**
 * Get recently finished matches (last N finished matches)
 */
export function getRecentlyFinished(
  matchStates: Record<string, MatchStateDTO>,
  limit: number = 5
): MatchStateDTO[] {
  return Object.values(matchStates)
    .filter(state => state.status === 'finished')
    .sort((a, b) => {
      // Sort by updated time, most recent first
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    })
    .slice(0, limit);
}

/**
 * Parse time string (HH:mm) to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Check if a schedule spans overnight (end time is before start time)
 */
export function isOvernightSchedule(config: TournamentConfig): boolean {
  const startMinutes = timeToMinutes(config.dayStart);
  const endMinutes = timeToMinutes(config.dayEnd);
  return endMinutes <= startMinutes;
}

/**
 * Calculate total slots for a tournament, handling overnight schedules
 */
export function calculateTotalSlots(config: TournamentConfig): number {
  const startMinutes = timeToMinutes(config.dayStart);
  let endMinutes = timeToMinutes(config.dayEnd);

  // If end time is before/equal to start time, it's overnight (add 24 hours)
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return Math.ceil((endMinutes - startMinutes) / config.intervalMinutes);
}

/**
 * Get adjusted end minutes for overnight schedules
 */
export function getAdjustedEndMinutes(config: TournamentConfig): number {
  const startMinutes = timeToMinutes(config.dayStart);
  let endMinutes = timeToMinutes(config.dayEnd);

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return endMinutes;
}

/**
 * Convert HH:mm time string to slot number
 * Handles overnight schedules (e.g., 10pm to 6am)
 */
export function timeToSlot(time: string, config: TournamentConfig): number {
  const startMinutes = timeToMinutes(config.dayStart);
  const endMinutes = timeToMinutes(config.dayEnd);
  let timeMinutes = timeToMinutes(time);

  // Check if this is an overnight schedule
  const isOvernight = endMinutes <= startMinutes;

  // If overnight and time is before start (e.g., 2am when start is 10pm),
  // add 24 hours to treat it as part of the overnight period
  if (isOvernight && timeMinutes < startMinutes) {
    timeMinutes += 24 * 60;
  }

  return Math.floor((timeMinutes - startMinutes) / config.intervalMinutes);
}

/**
 * Convert slot number to HH:mm time string
 * Alias for formatSlotTime for API consistency
 */
export const slotToTime = formatSlotTime;

/**
 * Parse a match's actualStartTime / actualEndTime into an epoch ms value.
 *
 * The canonical format written by useLiveTracking is ISO-8601 UTC
 * (e.g. ``2026-04-19T18:05:37.000Z``) so the primary path is
 * ``Date.parse``. A one-release fallback handles legacy ``HH:MM`` values
 * from pre-ISO tournaments: assume "today in the browser's local time
 * zone" and warn once so the drift is visible. The fallback can be
 * removed after a deploy cycle.
 */
export function parseMatchStartMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const asIso = Date.parse(value);
  if (!Number.isNaN(asIso)) return asIso;

  const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      // eslint-disable-next-line no-console
      console.warn(
        '[parseMatchStartMs] legacy HH:MM timestamp detected (%s); assuming today local — upgrade writer to ISO',
        value,
      );
      const d = new Date();
      d.setHours(hh, mm, 0, 0);
      return d.getTime();
    }
  }
  return null;
}

/**
 * Compute the slot + duration a match should be rendered at on the
 * Gantt grid, given its paper assignment and its live matchState.
 *
 * The paper slot (``assignment.slotId``) is what the solver scheduled.
 * That's the right render position for matches that have not yet been
 * called or started — the operator is looking at the plan. Once a
 * match starts, the right position is where it is actually being
 * played on the clock; and once it finishes, the right duration is
 * how long it actually ran. This is the "live play head" behaviour.
 *
 * Falls back to the paper assignment whenever the relevant timestamp
 * is missing or unparseable, so a corrupt field can never leave a
 * block without a position.
 */
export function getRenderSlot(
  assignment: { slotId: number; durationSlots: number },
  matchState: MatchStateDTO | undefined | null,
  config: TournamentConfig,
): { slotId: number; durationSlots: number } {
  const status = matchState?.status;

  if (status === 'finished' && matchState?.actualStartTime && matchState?.actualEndTime) {
    const startMs = parseMatchStartMs(matchState.actualStartTime);
    const endMs = parseMatchStartMs(matchState.actualEndTime);
    if (startMs !== null && endMs !== null && endMs >= startMs) {
      const startSlot = _msToSlot(startMs, config);
      const minutes = (endMs - startMs) / 60_000;
      const duration = Math.max(1, Math.round(minutes / config.intervalMinutes));
      return { slotId: startSlot, durationSlots: duration };
    }
  }

  if (status === 'started' && matchState?.actualStartTime) {
    const startMs = parseMatchStartMs(matchState.actualStartTime);
    if (startMs !== null) {
      return {
        slotId: _msToSlot(startMs, config),
        durationSlots: assignment.durationSlots,
      };
    }
  }

  return { slotId: assignment.slotId, durationSlots: assignment.durationSlots };
}

/** Convert an epoch-ms timestamp to a schedule slot index using the
 *  config's day start + interval. Handles overnight schedules. */
function _msToSlot(ms: number, config: TournamentConfig): number {
  const d = new Date(ms);
  const minutesOfDay = d.getHours() * 60 + d.getMinutes();
  const startMinutes = timeToMinutes(config.dayStart);
  const endMinutes = timeToMinutes(config.dayEnd);
  const isOvernight = endMinutes <= startMinutes;
  let effective = minutesOfDay;
  if (isOvernight && effective < startMinutes) effective += 24 * 60;
  return Math.max(0, Math.floor((effective - startMinutes) / config.intervalMinutes));
}

/**
 * Get status badge color
 */
export function getStatusColor(status: MatchStateDTO['status']): string {
  switch (status) {
    case 'scheduled':
      return 'bg-gray-200 text-gray-700';
    case 'called':
      return 'bg-blue-200 text-blue-800';
    case 'started':
      return 'bg-green-200 text-green-800';
    case 'finished':
      return 'bg-purple-200 text-purple-800';
    default:
      return 'bg-gray-200 text-gray-700';
  }
}
