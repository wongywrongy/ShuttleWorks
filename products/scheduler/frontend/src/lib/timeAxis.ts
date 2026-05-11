/**
 * Time-axis display helpers for director-aware wall-clock formatting.
 *
 * Director ``delay_start`` actions bump ``config.clockShiftMinutes``
 * without re-solving the schedule — the slot grid stays the same; only
 * the displayed wall-clock times shift. ``formatMatchTime`` is the
 * canonical helper that translates a slot index → displayed wall-clock,
 * applying the shift transparently.
 *
 * Use this everywhere a slot index is rendered as a time string:
 * GanttChart cells, Live workflow rows, score views, public TV
 * display, candidate cards. ``slotToTime`` from ``./time`` ignores
 * ``clockShiftMinutes`` and remains the right call when you need the
 * scheduled (un-shifted) time — e.g., "scheduled vs actual" deltas.
 */
import type { TournamentConfig } from '../api/dto';
import { minutesToTime, timeToMinutes } from './time';

/**
 * Wall-clock time at which `slotId` will display. Applies
 * `config.clockShiftMinutes` so a director-applied start delay shows
 * up to spectators in real time.
 *
 * Director actions cap `clockShiftMinutes` server-side at 24h, so the
 * mod here is a defensive guard — it kicks in only when something
 * upstream of validation set a pathological value, and the worst
 * outcome is a wrong-but-clearly-visible time (e.g., a 25h shift
 * renders as +1h, which the operator will notice).
 */
export function formatMatchTime(
  slotId: number,
  config: Pick<TournamentConfig, 'dayStart' | 'intervalMinutes' | 'clockShiftMinutes'> | null,
): string {
  if (!config) return `slot ${slotId}`;
  const startMin = timeToMinutes(config.dayStart);
  const shift = config.clockShiftMinutes ?? 0;
  const minutes = startMin + slotId * config.intervalMinutes + shift;
  const wrapped = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return minutesToTime(wrapped);
}

/** Whether a non-zero clock shift is currently active. Used to render
 *  a visual indicator next to displayed times. */
export function hasClockShift(
  config: Pick<TournamentConfig, 'clockShiftMinutes'> | null,
): boolean {
  return Boolean(config && config.clockShiftMinutes && config.clockShiftMinutes !== 0);
}
