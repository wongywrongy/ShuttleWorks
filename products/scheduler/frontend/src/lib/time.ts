/**
 * Time + slot utilities.
 *
 * Slot math is config-aware: every conversion takes a TournamentConfig so
 * overnight schedules (e.g. 22:00 → 06:00) wrap correctly.
 */
import type { TournamentConfig, ScheduleAssignment, MatchStateDTO } from '../api/dto';

const MIN_PER_DAY = 24 * 60;
const pad2 = (n: number) => String(n).padStart(2, '0');

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const total = ((minutes % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export function isValidTime(time: string): boolean {
  return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

export function getCurrentTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isOvernightSchedule(config: TournamentConfig): boolean {
  return timeToMinutes(config.dayEnd) <= timeToMinutes(config.dayStart);
}

function getAdjustedEndMinutes(config: TournamentConfig): number {
  const start = timeToMinutes(config.dayStart);
  let end = timeToMinutes(config.dayEnd);
  if (end <= start) end += MIN_PER_DAY;
  return end;
}

export function calculateTotalSlots(config: TournamentConfig): number {
  const start = timeToMinutes(config.dayStart);
  const end = getAdjustedEndMinutes(config);
  return Math.ceil((end - start) / config.intervalMinutes);
}

export function slotToTime(slotId: number, config: TournamentConfig): string {
  const start = timeToMinutes(config.dayStart);
  return minutesToTime(start + slotId * config.intervalMinutes);
}

/** Alias kept for callers that read "format" more naturally than "slot to". */
export const formatSlotTime = slotToTime;

export function formatSlotRange(
  slotId: number,
  durationSlots: number,
  config: TournamentConfig,
): string {
  return `${slotToTime(slotId, config)} - ${slotToTime(slotId + durationSlots, config)}`;
}

export function timeToSlot(time: string, config: TournamentConfig): number {
  const start = timeToMinutes(config.dayStart);
  const end = timeToMinutes(config.dayEnd);
  let t = timeToMinutes(time);
  if (end <= start && t < start) t += MIN_PER_DAY;
  return Math.floor((t - start) / config.intervalMinutes);
}

/** Current real-world clock as a slot index, clamped at 0. */
export function getCurrentSlot(config: TournamentConfig | null): number {
  if (!config) return 0;
  const now = new Date();
  let mins = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(config.dayStart);
  if (isOvernightSchedule(config) && mins < start) mins += MIN_PER_DAY;
  return Math.max(0, Math.floor((mins - start) / config.intervalMinutes));
}

export function isMatchInProgress(
  assignment: ScheduleAssignment,
  matchState: MatchStateDTO | undefined,
  currentSlot: number,
): boolean {
  const status = matchState?.status;
  if (status === 'started') return true;
  if (status === 'finished' || status === 'called') return false;
  return currentSlot >= assignment.slotId && currentSlot < assignment.slotId + assignment.durationSlots;
}

export function getUpcomingMatches(
  schedule: { assignments: ScheduleAssignment[] } | null,
  currentSlot: number,
  limit = 5,
): ScheduleAssignment[] {
  if (!schedule) return [];
  return schedule.assignments
    .filter((a) => a.slotId >= currentSlot)
    .sort((a, b) => a.slotId - b.slotId)
    .slice(0, limit);
}

export function getRecentlyFinished(
  matchStates: Record<string, MatchStateDTO>,
  limit = 5,
): MatchStateDTO[] {
  return Object.values(matchStates)
    .filter((s) => s.status === 'finished')
    .sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, limit);
}

/**
 * Parse a match's actualStartTime / actualEndTime into an epoch ms value.
 * Canonical writer is ISO-8601 UTC; legacy HH:MM is tolerated with a
 * one-time console warning so the drift is visible.
 */
export function parseMatchStartMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const iso = Date.parse(value);
  if (!Number.isNaN(iso)) return iso;
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (m) {
    const hh = +m[1];
    const mm = +m[2];
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      // eslint-disable-next-line no-console
      console.warn('[parseMatchStartMs] legacy HH:MM (%s); upgrade writer to ISO', value);
      const d = new Date();
      d.setHours(hh, mm, 0, 0);
      return d.getTime();
    }
  }
  return null;
}

/** Slot index of an instant, UNCLAMPED — negative before the day start,
 *  past `calculateTotalSlots` after the day end. The signed value is what
 *  makes "this timestamp isn't from this day" detectable. */
function slotOfMs(ms: number, config: TournamentConfig): number {
  const d = new Date(ms);
  const minutesOfDay = d.getHours() * 60 + d.getMinutes();
  const start = timeToMinutes(config.dayStart);
  let effective = minutesOfDay;
  if (isOvernightSchedule(config) && effective < start) effective += MIN_PER_DAY;
  return Math.floor((effective - start) / config.intervalMinutes);
}

export function msToSlot(ms: number, config: TournamentConfig): number {
  return Math.max(0, slotOfMs(ms, config));
}

/**
 * How far past the configured day an actual timestamp is still believable.
 * A real day runs a couple of hours long; a timestamp from another day is
 * not a late match, it is stale data. Matches the Live Gantt's own axis
 * overrun allowance, so a credible actual always has an axis to land on.
 */
const ACTUAL_TIMING_GRACE_SLOTS = 8;

function isCredibleSlot(slot: number, config: TournamentConfig): boolean {
  return slot >= 0 && slot <= calculateTotalSlots(config) + ACTUAL_TIMING_GRACE_SLOTS;
}

/**
 * Where a match should render on the Gantt: paper slot until called/started,
 * actual play head once a CREDIBLE timestamp exists. Falls back safely on
 * missing data.
 *
 * "Credible" is load-bearing. Positioning is clock-relative, so an actual
 * timestamp whose wall-clock time isn't in the configured day — any past
 * tournament reopened on its Live tab, a restored backup, a seeded demo —
 * derives a slot tens or hundreds of columns off the axis. The chart then
 * stretched to absorb it and clamped every chip onto its last column, i.e.
 * a Gantt that looks unconfigured while all its matches sit off-screen right.
 * The plan slot is the honest fallback; `hasStaleActualTiming` lets the
 * surface say so rather than pass plan off as actual.
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
      const startSlot = slotOfMs(startMs, config);
      if (isCredibleSlot(startSlot, config)) {
        const minutes = (endMs - startMs) / 60_000;
        const duration = Math.max(1, Math.round(minutes / config.intervalMinutes));
        // A credible start with an end from a later day (Finish pressed the
        // next morning) is a real start and a dirty span — keep the start,
        // plan the duration, rather than throw both away.
        return {
          slotId: startSlot,
          durationSlots: isCredibleSlot(startSlot + duration, config)
            ? duration
            : assignment.durationSlots,
        };
      }
    }
  }

  if (status === 'started' && matchState?.actualStartTime) {
    const startMs = parseMatchStartMs(matchState.actualStartTime);
    if (startMs !== null) {
      const startSlot = slotOfMs(startMs, config);
      if (isCredibleSlot(startSlot, config)) {
        return { slotId: startSlot, durationSlots: assignment.durationSlots };
      }
    }
  }

  return { slotId: assignment.slotId, durationSlots: assignment.durationSlots };
}

/**
 * True when a match carries an actual start timestamp that `getRenderSlot`
 * REFUSED — it doesn't land in the configured day, so the surface is drawing
 * the match at its planned time, not where it really played.
 */
export function hasStaleActualTiming(
  matchState: MatchStateDTO | undefined | null,
  config: TournamentConfig,
): boolean {
  const status = matchState?.status;
  if (status !== 'started' && status !== 'finished') return false;
  const startMs = parseMatchStartMs(matchState?.actualStartTime);
  if (startMs === null) return false;
  return !isCredibleSlot(slotOfMs(startMs, config), config);
}

// Token-driven; hues match the board vocabulary (called=amber, playing=green,
// finished=neutral) instead of the old blue/green/purple stock trio.
const STATUS_BADGE: Record<MatchStateDTO['status'], string> = {
  scheduled: 'bg-muted text-foreground',
  called: 'bg-status-called-bg text-status-called',
  started: 'bg-status-live-bg text-status-live',
  finished: 'bg-status-done-bg text-status-done',
};

export function getStatusColor(status: MatchStateDTO['status']): string {
  return STATUS_BADGE[status] ?? 'bg-muted text-foreground';
}
